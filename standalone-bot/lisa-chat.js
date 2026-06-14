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

// --- Persistent history ---
//
// persistent_history = [system(persona), then user/assistant dialogue ONLY].

export function createHistory(persona) {
  return [{ role: "system", content: persona }];
}

// --- Per-call assembly (the contract) ---
//
//   call = [system(persona)]
//        + ([context(retrieved_section)] if retrieved_section else [])
//        + persistent_history[1:]
//        + [user_turn]
//
// The context message is ephemeral: it lives only in the returned array.
export function assembleCall(history, userTurn, retrievedSection) {
  const persona = history[0];
  const dialogue = history.slice(1);
  return [
    persona,
    ...(retrievedSection ? [{ role: "system", content: contextMessage(retrievedSection) }] : []),
    ...dialogue,
    { role: "user", content: userTurn }
  ];
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
// retrieved section is used to build the call and then discarded.
export async function chatTurn({ history, userTurn, loadSection, chat, log = defaultLog }) {
  const retrieved = loadSection ? loadSection(userTurn) : null;
  const retrievedText = retrieved ? retrieved.text : null;

  const call = assembleCall(history, userTurn, retrievedText);
  const reply = await chat(call);

  // INVARIANT: never append retrievedText. Never duplicate the system message.
  history.push({ role: "user", content: userTurn });
  history.push({ role: "assistant", content: reply });

  log({
    retrievalFired: Boolean(retrieved),
    section: retrieved ? retrieved.keyword : null,
    ephemeralTokens: retrievedText ? estimateTokens(contextMessage(retrievedText)) : 0,
    historyLen: history.length
  });

  return reply;
}

function defaultLog(entry) {
  const parts = [
    `retrieval=${entry.retrievalFired ? "yes" : "no"}`,
    `section=${entry.section ?? "-"}`,
    `ephemeral_tokens=${entry.ephemeralTokens}`,
    `history_len=${entry.historyLen}`
  ];
  console.log(`[lisa] ${parts.join(" ")}`);
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
