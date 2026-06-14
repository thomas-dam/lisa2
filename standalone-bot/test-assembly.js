// Acceptance test for the persistent/ephemeral split.
//
// Asserts the HARD INVARIANT: no retrieved reference text leaks into the
// persistent conversation history. Runs a scripted session with no Ollama
// dependency (the model call is stubbed).

import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadReference,
  createRetriever,
  createHistory,
  chatTurn
} from "./lisa-chat.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const PERSONA = "You are Lisa. Warm, dry, confident. Keep replies short.";

// Stub model: deterministic, and deliberately does NOT echo the call content,
// so any leak in history must come from the assembly logic, not the "model".
function stubChat(messages) {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  return Promise.resolve(`Noted: "${String(lastUser.content).slice(0, 30)}"`);
}

// >=10 turns, >=3 triggering retrieval (turns whose text hits a keyword).
const SCRIPT = [
  "Hi Lisa, how are you today?",
  "Tell me about comfyui workflows.", // retrieval: comfyui
  "Nice. What's your favorite color?",
  "How does ollama serve a model?", // retrieval: ollama
  "Cool, makes sense.",
  "Can you run a python script for me?", // retrieval: python
  "Thanks for that.",
  "What about tailscale serve?", // retrieval: tailscale
  "Got it.",
  "Anything else I should know?"
];

function fail(msg) {
  console.error(`\n✗ FAIL: ${msg}\n`);
  process.exit(1);
}

async function main() {
  const sections = await loadReference(join(__dirname, "reference.md"));
  const loadSection = createRetriever(sections);
  const history = createHistory(PERSONA);

  const firedSections = [];
  let retrievalCount = 0;

  for (const userTurn of SCRIPT) {
    const retrieved = loadSection(userTurn);
    if (retrieved) {
      retrievalCount += 1;
      firedSections.push(retrieved.text);
    }
    await chatTurn({ history, userTurn, loadSection, chat: stubChat });
  }

  // --- Preconditions for a meaningful test ---
  if (SCRIPT.length < 10) fail(`scripted session has ${SCRIPT.length} turns, need >=10`);
  if (retrievalCount < 3) fail(`retrieval fired ${retrievalCount} times, need >=3`);

  const historyBlob = JSON.stringify(history);

  // --- Assert 1: no retrieved section leaked into persistent history ---
  for (const section of firedSections) {
    if (historyBlob.includes(section)) {
      fail("a retrieved section appears verbatim in persistent_history");
    }
  }
  // Sentinel guard: no reference sentinel may appear anywhere in history.
  if (/SENTINEL-/.test(historyBlob)) {
    fail("a reference sentinel leaked into persistent_history");
  }

  // --- Assert 2: history holds only the persona system message + dialogue ---
  if (history[0].role !== "system" || history[0].content !== PERSONA) {
    fail("history[0] is not the persona system message");
  }
  for (let i = 1; i < history.length; i += 1) {
    const expected = i % 2 === 1 ? "user" : "assistant";
    if (history[i].role !== expected) {
      fail(`history[${i}] role is "${history[i].role}", expected "${expected}"`);
    }
    if (history[i].role === "system") {
      fail(`unexpected system message at history[${i}]`);
    }
  }
  const expectedLen = 1 + SCRIPT.length * 2;
  if (history.length !== expectedLen) {
    fail(`history length is ${history.length}, expected ${expectedLen}`);
  }

  console.log(`\n✓ PASS`);
  console.log(`  turns:            ${SCRIPT.length}`);
  console.log(`  retrievals fired: ${retrievalCount}`);
  console.log(`  history length:   ${history.length} (1 persona + ${SCRIPT.length * 2} dialogue)`);
  console.log(`  no retrieved section or sentinel present in persistent_history\n`);
}

main().catch((err) => fail(err.stack || err.message));
