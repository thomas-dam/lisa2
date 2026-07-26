// Message assembly for Lisa with a persistent/ephemeral split.
//
// HARD INVARIANT: retrieved reference text NEVER enters persistent history.
// It is added to a single call's message list and dropped when that call
// returns. Resident technical text degrades the persona's register over a
// session — keeping it ephemeral is the entire point of this design.

import { readFile } from "node:fs/promises";

// Load Lisa's checked-in persona without making the runtime depend on a
// particular model's Modelfile. An explicit override remains available for
// controlled experiments.
export async function loadPersona({ override = "", path, log = console.log }) {
  if (override.trim()) {
    log(`[persona] using explicit SYSTEM_PROMPT override (${override.trim().length} chars)`);
    return override.trim();
  }

  try {
    const persona = (await readFile(path, "utf8")).trim();
    if (persona) {
      log(`[persona] loaded canonical repo persona (${persona.length} chars)`);
      return persona;
    }
    throw new Error("Canonical persona file is empty.");
  } catch (error) {
    throw new Error(`Could not load canonical repo persona: ${error.message}`, { cause: error });
  }
}

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
//        + persistent_history[1:]
//        + [user_turn]
//
// retrievedSections is a string, string[], or null.
// The context messages are ephemeral: they live only in the returned array.
export function assembleCall(history, userTurn, retrievedSections, images) {
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
// retrieved sections are used to build the call and then discarded.
export async function chatTurn({ history, userTurn, images, loadSection, chat, log = defaultLog }) {
  const retrieved = loadSection ? loadSection(userTurn) : null;
  const retrievedTexts = retrieved
    ? (Array.isArray(retrieved) ? retrieved.map((r) => r.text) : [retrieved.text])
    : [];

  const call = assembleCall(history, userTurn, retrievedTexts.length > 0 ? retrievedTexts : null, images);
  const reply = await chat(call);

  // INVARIANT: never append retrievedTexts. Never duplicate the system message.
  history.push({ role: "user", content: userTurn });
  history.push({ role: "assistant", content: reply });

  log({
    retrievalFired: retrievedTexts.length > 0,
    section: retrieved && !Array.isArray(retrieved) ? retrieved.keyword : null,
    sections: Array.isArray(retrieved) ? retrieved.map((r) => r.keyword).join(",") : null,
    ephemeralTokens: retrievedTexts.reduce((t, s) => t + estimateTokens(contextMessage(s)), 0),
    historyLen: history.length
  });

  return reply;
}

export async function chatTurnStream({
  history,
  userTurn,
  images,
  loadSection,
  chat,
  onDelta,
  log = defaultLog
}) {
  const retrieved = loadSection ? loadSection(userTurn) : null;
  const retrievedTexts = retrieved
    ? (Array.isArray(retrieved) ? retrieved.map((r) => r.text) : [retrieved.text])
    : [];
  const call = assembleCall(
    history,
    userTurn,
    retrievedTexts.length > 0 ? retrievedTexts : null,
    images
  );
  const reply = await chat(call, onDelta);

  history.push({ role: "user", content: userTurn });
  history.push({ role: "assistant", content: reply });

  log({
    retrievalFired: retrievedTexts.length > 0,
    section: retrieved && !Array.isArray(retrieved) ? retrieved.keyword : null,
    sections: Array.isArray(retrieved) ? retrieved.map((r) => r.keyword).join(",") : null,
    ephemeralTokens: retrievedTexts.reduce((t, s) => t + estimateTokens(contextMessage(s)), 0),
    historyLen: history.length
  });

  return reply;
}

export function createSpeechChunker({ maxCharacters = 240 } = {}) {
  let buffer = "";

  function takeReadyChunks({ flush = false } = {}) {
    const chunks = [];
    while (buffer) {
      const sentenceBoundary = findSentenceBoundary(buffer);
      let cut = sentenceBoundary;

      if (cut < 0 && buffer.length > maxCharacters) {
        cut = buffer.lastIndexOf(" ", maxCharacters);
        if (cut < 1) cut = maxCharacters;
      }
      if (cut < 0 && flush) cut = buffer.length;
      if (cut < 0) break;

      const chunk = normalizeSpeechText(buffer.slice(0, cut));
      buffer = buffer.slice(cut).trimStart();
      if (chunk) chunks.push(chunk);
    }
    return chunks;
  }

  return {
    push(text) {
      buffer += String(text || "");
      return takeReadyChunks();
    },
    flush() {
      return takeReadyChunks({ flush: true });
    }
  };
}

function findSentenceBoundary(text) {
  const match = /[.!?…](?:["')\]]*)\s+|\n+/.exec(text);
  return match ? match.index + match[0].length : -1;
}

function normalizeSpeechText(text) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_#>|~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function defaultLog(entry) {
  const parts = [
    `retrieval=${entry.retrievalFired ? "yes" : "no"}`,
    `section=${entry.section ?? entry.sections ?? "-"}`,
    `ephemeral_tokens=${entry.ephemeralTokens}`,
    `history_len=${entry.historyLen}`
  ];
  console.log(`[lisa] ${parts.join(" ")}`);
}

function openRouterMessages(messages) {
  return messages.map((message) => {
    if (message.role !== "user" || !Array.isArray(message.images) || message.images.length === 0) {
      return { role: message.role, content: message.content };
    }
    return {
      role: message.role,
      content: [
        { type: "text", text: message.content },
        ...message.images.map((base64) => ({
          type: "image_url",
          image_url: { url: `data:image/jpeg;base64,${base64}` }
        }))
      ]
    };
  });
}

export function createOpenRouterChat({ getSettings, fetchImpl = fetch }) {
  return async (messages) => {
    const { apiKey, model } = await getSettings();
    if (!apiKey) throw new Error("OpenRouter API key is not configured. Add it in Settings.");
    const response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "x-openrouter-title": "Lisa Companion"
      },
      body: JSON.stringify({ model, messages: openRouterMessages(messages), stream: false, temperature: 0.7, max_tokens: 900 })
    });
    let data;
    try { data = await response.json(); } catch {
      throw new Error(`OpenRouter returned an unreadable response (${response.status}).`);
    }
    if (!response.ok) {
      const detail = data?.error?.message ? `: ${data.error.message}` : "";
      throw new Error(`OpenRouter request failed (${response.status})${detail}`);
    }
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error(`OpenRouter returned empty content for ${data?.model || model}.`);
    }
    return content.trim();
  };
}

export function createOpenRouterChatStream({ getSettings, fetchImpl = fetch }) {
  return async (messages, onDelta = () => {}) => {
    const { apiKey, model } = await getSettings();
    if (!apiKey) throw new Error("OpenRouter API key is not configured. Add it in Settings.");
    const response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "x-openrouter-title": "Lisa Companion"
      },
      body: JSON.stringify({
        model,
        messages: openRouterMessages(messages),
        stream: true,
        temperature: 0.7,
        max_tokens: 900
      })
    });

    if (!response.ok) {
      let detail = "";
      try {
        const data = JSON.parse(await response.text());
        detail = data?.error?.message ? `: ${data.error.message}` : "";
      } catch {
        // Preserve the status-only error when the provider body is unreadable.
      }
      throw new Error(`OpenRouter request failed (${response.status})${detail}`);
    }
    if (!response.body) {
      throw new Error("OpenRouter returned no response stream.");
    }

    let content = "";
    let pending = "";
    const decoder = new TextDecoder();

    for await (const bytes of response.body) {
      pending += decoder.decode(bytes, { stream: true });
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() || "";
      for (const line of lines) {
        const delta = openRouterDelta(line);
        if (delta) {
          content += delta;
          onDelta(delta);
        }
      }
    }
    pending += decoder.decode();
    for (const line of pending.split(/\r?\n/)) {
      const delta = openRouterDelta(line);
      if (delta) {
        content += delta;
        onDelta(delta);
      }
    }

    if (!content.trim()) {
      throw new Error(`OpenRouter returned empty content for ${model}.`);
    }
    return content.trim();
  };
}

function openRouterDelta(line) {
  if (!line.startsWith("data:")) return "";
  const payload = line.slice(5).trim();
  if (!payload || payload === "[DONE]") return "";
  let data;
  try {
    data = JSON.parse(payload);
  } catch {
    return "";
  }
  const delta = data?.choices?.[0]?.delta?.content;
  return typeof delta === "string" ? delta : "";
}
