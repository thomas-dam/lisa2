// Message assembly for Lisa with a persistent/ephemeral split.
//
// HARD INVARIANT: retrieved reference text NEVER enters persistent history.
// It is added to a single call's message list and dropped when that call
// returns. Resident technical text degrades the persona's register over a
// session — keeping it ephemeral is the entire point of this design.

import { readFile } from "node:fs/promises";

// --- Reference retrieval (v1: keyword -> section) ---
//
// Flat reference file. Each section starts with a header line listing its
// trigger keywords, comma-separated:
//
//   ## keyword1, keyword2, ...
//   <body until the next header or EOF>

export function parseReference(text) {
  const sections = [];
  let current = null;

  for (const line of text.split("\n")) {
    const header = line.match(/^##\s+(.+)$/);
    if (header) {
      if (current) sections.push(current);
      current = {
        keywords: header[1]
          .split(",")
          .map((k) => k.trim().toLowerCase())
          .filter(Boolean),
        body: []
      };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) sections.push(current);

  return sections.map((s) => ({ keywords: s.keywords, text: s.body.join("\n").trim() }));
}

export async function loadReference(path) {
  return parseReference(await readFile(path, "utf8"));
}

// Returns a loadSection(taskText) -> { text, keyword } | null bound to a
// loaded reference. Whole-file load is fine for v1; first keyword match wins.
export function createRetriever(sections) {
  return function loadSection(taskText) {
    const haystack = String(taskText).toLowerCase();
    for (const section of sections) {
      const hit = section.keywords.find((kw) => haystack.includes(kw));
      if (hit) return { text: section.text, keyword: hit };
    }
    return null;
  };
}

// Returns a loadSection that returns ALL sections unconditionally (no keyword matching).
// Used by image commands (/create, /iterate) to inject full skill knowledge.
export function createFullRetriever(sections) {
  const all = sections.map((s) => ({ text: s.text, keyword: s.keywords[0] }));
  return () => (all.length > 0 ? all : null);
}

// --- Persistent history ---
//
// persistent_history = [system(persona), then user/assistant dialogue ONLY].

export function createHistory(persona) {
  return persona ? [{ role: "system", content: persona }] : [];
}

// --- Per-call assembly (the contract) ---
//
//   call = [system(persona)]
//        + ([context(retrieved_section)] for each section in retrievedSections)
//        + ([context(fetched_page)] if fetched_page else [])
//        + persistent_history[1:]
//        + [user_turn]
//        + ([image_urls] if fetched_page.images else [])
//
// retrievedSections is a string, string[], or null.
// The context messages are ephemeral: they live only in the returned array.
export function assembleCall(history, userTurn, retrievedSections, fetchedPage, images) {
  const hasPersona = history.length > 0 && history[0].role === "system";
  const persona = hasPersona ? history[0] : null;
  const dialogue = hasPersona ? history.slice(1) : history;
  const sections = Array.isArray(retrievedSections)
    ? retrievedSections
    : (retrievedSections ? [retrievedSections] : []);
  const userMsg = { role: "user", content: userTurn };
  if (Array.isArray(images) && images.length > 0) {
    userMsg.images = images;
  }
  const messages = [
    ...(persona ? [persona] : []),
    ...sections.map((s) => ({ role: "system", content: contextMessage(s) })),
    ...(fetchedPage ? [{ role: "system", content: contextMessage(fetchedPage.markdown) }] : []),
    ...dialogue,
    userMsg
  ];

  return messages;
}

function contextMessage(section) {
  return `Reference for this reply only (do not treat as part of the conversation):\n${section}`;
}

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

// --- One conversational turn ---
//
// Mutates `history` by appending ONLY the user turn and the reply. The
// retrieved section and fetched page content are used to build the call and then discarded.
export async function chatTurn({ history, userTurn, images, loadSection, fetchUrl, chat, log = defaultLog }) {
  const retrieved = loadSection ? loadSection(userTurn) : null;
  const retrievedTexts = retrieved
    ? (Array.isArray(retrieved) ? retrieved.map((r) => r.text) : [retrieved.text])
    : [];

  const fetchedPage = fetchUrl ? await fetchUrl(userTurn) : null;
  const fetchedText = fetchedPage ? fetchedPage.markdown : null;

  const call = assembleCall(history, userTurn, retrievedTexts.length > 0 ? retrievedTexts : null, fetchedPage, images);
  const reply = await chat(call);

  // INVARIANT: never append retrievedTexts or fetchedText. Never duplicate the system message.
  history.push({ role: "user", content: userTurn });
  history.push({ role: "assistant", content: reply });

  log({
    retrievalFired: retrievedTexts.length > 0,
    section: retrieved && !Array.isArray(retrieved) ? retrieved.keyword : null,
    sections: Array.isArray(retrieved) ? retrieved.map((r) => r.keyword).join(",") : null,
    urlFetched: Boolean(fetchedPage),
    fetchedUrl: fetchedPage ? fetchedPage.url : null,
    ephemeralTokens: retrievedTexts.reduce((t, s) => t + estimateTokens(contextMessage(s)), 0) +
                      (fetchedText ? estimateTokens(contextMessage(fetchedText)) : 0),
    historyLen: history.length
  });

  return reply;
}

function defaultLog(entry) {
  const parts = [
    `retrieval=${entry.retrievalFired ? "yes" : "no"}`,
    `section=${entry.section ?? entry.sections ?? "-"}`,
    `url_fetched=${entry.urlFetched ? "yes" : "no"}`,
    `fetched_url=${entry.fetchedUrl ?? "-"}`,
    `ephemeral_tokens=${entry.ephemeralTokens}`,
    `history_len=${entry.historyLen}`
  ];
  console.log(`[lisa] ${parts.join(" ")}`);
}

// --- URL fetching with Firecrawl ---
//
// Detects URLs in user text and fetches their content with Firecrawl.
// Returns { url, markdown, images } if found; null if no URL or fetch fails.

function extractUrl(text) {
  // Match http:// or https:// URLs
  const urlPattern = /https?:\/\/[^\s)]+/;
  const match = String(text).match(urlPattern);
  return match ? match[0] : null;
}

export async function fetchUrlWithFirecrawl(url, apiKey) {
  if (!url || !apiKey) {
    return null;
  }

  try {
    const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        url,
        formats: ["markdown", "images"]
      })
    });

    if (!response.ok) {
      console.error(`[firecrawl] fetch failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (!data.success || !data.data) {
      console.error("[firecrawl] response missing data");
      return null;
    }

    return {
      url,
      markdown: data.data.markdown || "",
      images: data.data.images || []
    };
  } catch (error) {
    console.error("[firecrawl] error:", error.message);
    return null;
  }
}

export function extractUrlFromTurn(userTurn) {
  return extractUrl(userTurn);
}

// --- Real model call (used in production, not in the acceptance test) ---
export function createOllamaChat({ url, model }) {
  return async (messages) => {
    const r = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, stream: false, messages })
    });
    const data = await r.json();
    return data?.message?.content || "";
  };
}
