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
  assembleCall,
  chatTurn
} from "./lisa-chat.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const PERSONA = "You are Lisa. Warm, dry, confident. Keep replies short.";

// Record of all message arrays sent to the model
const recordedCalls = [];

// Stub model: deterministic, and deliberately does NOT echo the call content,
// so any leak in history must come from the assembly logic, not the "model".
// Also records every call for positive-path assertions.
function stubChat(messages) {
  recordedCalls.push(messages);
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
  const sections = await loadReference(join(__dirname, "test-reference.md"));
  console.log(`[test-reference] sections loaded: ${sections.length}`);
  for (let i = 0; i < sections.length; i += 1) {
    console.log(`[test-reference] section ${i + 1} keywords: ${sections[i].keywords.join(", ")}`);
  }
  const loadSection = createRetriever(sections);
  const history = createHistory(PERSONA);

  const firedSections = [];
  const retrievalTurns = []; // Track which turn indices had retrieval
  let retrievalCount = 0;

  for (let i = 0; i < SCRIPT.length; i += 1) {
    const userTurn = SCRIPT[i];
    const retrieved = loadSection(userTurn);
    if (retrieved) {
      retrievalCount += 1;
      retrievalTurns.push(i);
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

  // --- Assert 3: POSITIVE PATH — retrieved content reached the model ---
  // Each call should have been recorded. Count must match number of turns.
  if (recordedCalls.length !== SCRIPT.length) {
    fail(`expected ${SCRIPT.length} recorded calls, got ${recordedCalls.length}`);
  }

  // For each retrieval turn, the section content MUST be in the call array.
  // We check for sentinels which are guaranteed to be in reference sections.
  for (let idx = 0; idx < retrievalTurns.length; idx += 1) {
    const turnIdx = retrievalTurns[idx];
    const callArray = recordedCalls[turnIdx];
    const callBlob = JSON.stringify(callArray);
    const section = firedSections[idx];
    
    // Each reference section has a SENTINEL- marker. If we see it in the call, 
    // the section was delivered.
    const sentinelMatch = section.match(/SENTINEL-[\w-]+/);
    if (!sentinelMatch) {
      fail(`section at turn[${turnIdx}] has no sentinel marker: "${section.slice(0, 50)}"`);
    }
    
    const sentinel = sentinelMatch[0];
    if (!callBlob.includes(sentinel)) {
      fail(`sentinel "${sentinel}" missing from call[${turnIdx}]: content not delivered to model`);
    }
  }

  // For non-retrieval turns, no SENTINEL- should appear in the call
  for (let i = 0; i < SCRIPT.length; i += 1) {
    if (!retrievalTurns.includes(i)) {
      const callArray = recordedCalls[i];
      const callBlob = JSON.stringify(callArray);
      if (/SENTINEL-/.test(callBlob)) {
        fail(`unexpected sentinel in non-retrieval call[${i}]`);
      }
    }
  }

  // --- Assert 4: NO-SYSTEM-PROMPT mode produces no system message in payload ---
  const noSystemHistory = createHistory("");
  if (noSystemHistory.length !== 0) {
    fail("createHistory with empty persona should return empty array");
  }
  const noSystemCall = assembleCall(noSystemHistory, "test turn", null, null);
  const hasSystemMessage = noSystemCall.some((m) => m.role === "system");
  if (hasSystemMessage) {
    fail("assembleCall with empty history must not produce a system message");
  }
  // Also verify via chatTurn with a stub
  const noSysRecorded = [];
  const noSysHistory = createHistory("");
  await chatTurn({
    history: noSysHistory,
    userTurn: "hello",
    chat: (messages) => { noSysRecorded.push(messages); return Promise.resolve("hi"); }
  });
  const noSysCallBlob = JSON.stringify(noSysRecorded[0]);
  if (noSysCallBlob.includes('"role":"system"')) {
    fail("chatTurn with empty persona must not include system message in call");
  }
  if (noSysHistory.length !== 2) {
    fail(`no-system history length should be 2 (user + assistant), got ${noSysHistory.length}`);
  }
  console.log(`  no-system-prompt mode: no system message in payload ✓`);

  console.log(`\n✓ PASS`);
  console.log(`  turns:             ${SCRIPT.length}`);
  console.log(`  retrievals fired:  ${retrievalCount}`);
  console.log(`  calls recorded:    ${recordedCalls.length}`);
  console.log(`  history length:    ${history.length} (1 persona + ${SCRIPT.length * 2} dialogue)`);
  console.log(`  no retrieved section or sentinel present in persistent_history`);
  console.log(`  retrieved content verified present in model calls\n`);
}

main().catch((err) => fail(err.stack || err.message));
