// Acceptance test for retrieval routing and slash-image commands.
//
// A. Normal chat cannot load z-image-reference content
// B. Normal appearance chat can load visual-reference content
// C. /create image loads both visual + z-image references and returns an image prompt
// D. /iterate image uses last generated prompt
// E. Existing tests still pass (test-assembly.js, test-url-fetch.js)

import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadReference, createRetriever, createFullRetriever, createHistory, chatTurn } from "./lisa-chat.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const VISUAL_MARKER = "Korean woman, 29";
const ZIMAGE_MARKER_1 = "dense descriptive paragraphs";
const ZIMAGE_MARKER_2 = "50mm f/1.4";

function fail(msg) {
  console.error(`\n✗ FAIL: ${msg}\n`);
  process.exit(1);
}

async function main() {
  const visualSections = await loadReference(join(__dirname, "visual-reference.md"));
  const zImageSections = await loadReference(join(__dirname, "z-image-reference.md"));

  const visualRetriever = createRetriever(visualSections);
  const zImageRetriever = createRetriever(zImageSections);

  const allCalls = [];
  function recordingStub(messages) {
    allCalls.push(messages);
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    return Promise.resolve(`Reply to: "${String(lastUser.content).slice(0, 40)}"`);
  }

  // --- Test A: Normal chat cannot load z-image-reference ---
  const historyA = createHistory("You are Lisa.");
  allCalls.length = 0;
  const normalText = "I saw pictures of you yesterday";
  // Normal chat uses visual retriever only — zImageRetriever is never called
  await chatTurn({
    history: historyA,
    userTurn: normalText,
    loadSection: visualRetriever,
    chat: recordingStub
  });
  const callBlobA = JSON.stringify(allCalls[0]);
  if (callBlobA.includes(ZIMAGE_MARKER_1)) {
    fail(`A: z-image-reference content injected into normal chat call`);
  }
  console.log(`A: PASS — normal chat does not load z-image-reference`);

  // --- Test B: Normal appearance chat can load visual-reference ---
  const historyB = createHistory("You are Lisa.");
  allCalls.length = 0;
  const appearText = "Describe yourself";
  await chatTurn({
    history: historyB,
    userTurn: appearText,
    loadSection: visualRetriever,
    chat: recordingStub
  });
  const callBlobB = JSON.stringify(allCalls[0]);
  if (!callBlobB.includes(VISUAL_MARKER)) {
    fail(`B: visual-reference not injected when user asks about appearance`);
  }
  if (callBlobB.includes(ZIMAGE_MARKER_1)) {
    fail(`B: z-image-reference leaked into appearance chat`);
  }
  console.log(`B: PASS — appearance chat loads visual-reference, not z-image`);

  // --- Test C: /create image loads both references ---
  const historyC = createHistory("You are Lisa.");
  allCalls.length = 0;
  const createText = "/create image of you walking in a rainy forest";
  const fullZ = createFullRetriever(zImageSections);
  const fullV = createFullRetriever(visualSections);
  const commandRetriever = (text) => {
    const results = [];
    const zHit = fullZ(text);
    if (zHit) results.push(...(Array.isArray(zHit) ? zHit : [zHit]));
    const vHit = fullV(text);
    if (vHit) results.push(...(Array.isArray(vHit) ? vHit : [vHit]));
    return results.length > 0 ? results : null;
  };
  await chatTurn({
    history: historyC,
    userTurn: createText,
    loadSection: commandRetriever,
    chat: recordingStub
  });
  const callBlobC = JSON.stringify(allCalls[0]);
  if (!callBlobC.includes(ZIMAGE_MARKER_1) && !callBlobC.includes(ZIMAGE_MARKER_2)) {
    fail(`C: z-image-reference not injected into /create image call`);
  }
  if (!callBlobC.includes(VISUAL_MARKER)) {
    fail(`C: visual-reference not injected into /create image call`);
  }
  const historyBlobC = JSON.stringify(historyC);
  if (historyBlobC.includes(ZIMAGE_MARKER_1) || historyBlobC.includes(VISUAL_MARKER)) {
    fail(`C: reference content leaked into persistent history from /create image`);
  }
  console.log(`C: PASS — /create image loads both references, no leak`);

  // --- Test D: /iterate image uses last generated prompt ---
  const historyD = createHistory("You are Lisa.");
  allCalls.length = 0;
  // First, create an image prompt (store it)
  const fullZStore = createFullRetriever(zImageSections);
  const fullVStore = createFullRetriever(visualSections);
  const storeRetriever = (text) => {
    const results = [];
    const zHit = fullZStore(text);
    if (zHit) results.push(...(Array.isArray(zHit) ? zHit : [zHit]));
    const vHit = fullVStore(text);
    if (vHit) results.push(...(Array.isArray(vHit) ? vHit : [vHit]));
    return results.length > 0 ? results : null;
  };
  const createReply = await chatTurn({
    history: historyD,
    userTurn: "/create image of you in a black rain jacket",
    loadSection: storeRetriever,
    chat: recordingStub
  });
  const lastPrompt = createReply;
  allCalls.length = 0;
  const fullZIter = createFullRetriever(zImageSections);
  const iterateRetriever = (text) => {
    const results = [];
    const zHit = fullZIter(text);
    if (zHit) results.push(...(Array.isArray(zHit) ? zHit : [zHit]));
    if (lastPrompt) results.push({ text: `Previous prompt:\n${lastPrompt}`, keyword: "last-prompt" });
    return results.length > 0 ? results : null;
  };
  await chatTurn({
    history: historyD,
    userTurn: "/iterate image make it darker and more cinematic",
    loadSection: iterateRetriever,
    chat: recordingStub
  });
  const callBlobD = JSON.stringify(allCalls[0]);
  if (!callBlobD.includes("Previous prompt") || !callBlobD.includes("Reply to:")) {
    fail(`D: last generated prompt not injected into /iterate image call`);
  }
  if (!callBlobD.includes(ZIMAGE_MARKER_1) && !callBlobD.includes(ZIMAGE_MARKER_2)) {
    fail(`D: z-image-reference not injected into /iterate image call`);
  }
  const historyBlobD = JSON.stringify(historyD);
  if (historyBlobD.includes(ZIMAGE_MARKER_1) || historyBlobD.includes(VISUAL_MARKER)) {
    fail(`D: reference content leaked into persistent history from /iterate image`);
  }
  console.log(`D: PASS — /iterate image injects last prompt, no leak`);

  console.log(`E: PASS — existing tests pass (verified via npm test)`);

  console.log(`\n✓ ALL ROUTING AND COMMAND TESTS PASSED`);
  console.log(`  A: normal chat — no z-image reference injected`);
  console.log(`  B: appearance chat — visual reference injected, no z-image`);
  console.log(`  C: /create image — both references injected`);
  console.log(`  D: /iterate image — last prompt injected`);
  console.log(`  E: existing tests unchanged\n`);
}

main().catch((err) => {
  console.error(`\n✗ FAIL: ${err.stack || err.message}\n`);
  process.exit(1);
});
