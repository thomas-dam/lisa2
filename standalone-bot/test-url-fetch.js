// Acceptance test for URL fetching with persistent/ephemeral split.
//
// Asserts the HARD INVARIANT: no fetched page content leaks into the
// persistent conversation history. Runs a scripted session with:
// - A stubbed Firecrawl fetch that returns page content with a unique sentinel
// - A stubbed model call that does NOT echo the fetched content
// - Verification that the sentinel appears in the call but NOT in history

import { createHistory, assembleCall, chatTurn } from "./lisa-chat.js";

const PERSONA = "You are Lisa. Warm, dry, confident. Keep replies short.";

// Unique sentinel to plant in fetched page content for assertion
const FETCH_SENTINEL = "SENTINEL-FETCH-9X7M2K";
const FETCH_URL = "https://example.com/test-page";

// Record of all message arrays sent to the model
const recordedCalls = [];

// Stub model: deterministic, deliberately does NOT echo the call content.
// Also records every call for positive-path assertions.
function stubChat(messages) {
  recordedCalls.push(messages);
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  return Promise.resolve(`Noted: "${String(lastUser.content).slice(0, 30)}"`);
}

// Stub Firecrawl fetch: returns mock page with sentinel
async function stubFetchUrl(userTurn) {
  // Only fetch if the user message contains the URL
  if (!userTurn.includes(FETCH_URL)) {
    return null;
  }

  return {
    url: FETCH_URL,
    markdown: `# Test Page\n\n${FETCH_SENTINEL}\n\nThis is page content.`,
    images: []
  };
}

// Test script: user messages, some with URLs
const SCRIPT = [
  "Hi Lisa, how are you today?",
  `I found this cool page at ${FETCH_URL} - can you summarize it?`, // FETCH
  "That's interesting. What's next?",
  `Check out ${FETCH_URL} again for more details.`, // FETCH
  "Anything else I should know?",
  "Thanks for the help!"
];

function fail(msg) {
  console.error(`\n✗ FAIL: ${msg}\n`);
  process.exit(1);
}

async function main() {
  const history = createHistory(PERSONA);

  const firedUrls = [];
  const fetchTurns = []; // Track which turn indices had URL fetches
  let fetchCount = 0;

  for (let i = 0; i < SCRIPT.length; i += 1) {
    const userTurn = SCRIPT[i];
    const fetchedPage = await stubFetchUrl(userTurn);
    if (fetchedPage) {
      fetchCount += 1;
      fetchTurns.push(i);
      firedUrls.push(fetchedPage);
    }

    await chatTurn({ history, userTurn, chat: stubChat, fetchUrl: stubFetchUrl });
  }

  // --- Preconditions for a meaningful test ---
  if (SCRIPT.length < 4) fail(`scripted session has ${SCRIPT.length} turns, need >=4`);
  if (fetchCount < 2) fail(`URL fetch fired ${fetchCount} times, need >=2`);

  const historyBlob = JSON.stringify(history);

  // --- Assert 1: no fetched page content leaked into persistent history ---
  for (const page of firedUrls) {
    if (historyBlob.includes(page.markdown)) {
      fail("fetched page markdown appears verbatim in persistent_history");
    }
  }

  // --- Assert 2: sentinel guard—no fetch sentinel in history ---
  if (historyBlob.includes(FETCH_SENTINEL)) {
    fail("fetch sentinel appears in persistent_history");
  }

  // --- Assert 3: history holds only the persona system message + dialogue ---
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

  // --- Assert 4: POSITIVE PATH — fetched content reached the model ---
  // Each call should have been recorded. Count must match number of turns.
  if (recordedCalls.length !== SCRIPT.length) {
    fail(`expected ${SCRIPT.length} recorded calls, got ${recordedCalls.length}`);
  }

  // For each URL-fetch turn, the sentinel MUST be in the call array
  for (const turnIdx of fetchTurns) {
    const callArray = recordedCalls[turnIdx];
    const callBlob = JSON.stringify(callArray);
    
    if (!callBlob.includes(FETCH_SENTINEL)) {
      fail(`fetch sentinel missing from call[${turnIdx}]: content not delivered to model`);
    }
  }

  // For non-fetch turns, no FETCH_SENTINEL should appear in the call
  for (let i = 0; i < SCRIPT.length; i += 1) {
    if (!fetchTurns.includes(i)) {
      const callArray = recordedCalls[i];
      const callBlob = JSON.stringify(callArray);
      if (callBlob.includes(FETCH_SENTINEL)) {
        fail(`unexpected fetch sentinel in non-fetch call[${i}]`);
      }
    }
  }

  console.log(`\n✓ PASS`);
  console.log(`  turns:          ${SCRIPT.length}`);
  console.log(`  url fetches:    ${fetchCount}`);
  console.log(`  calls recorded: ${recordedCalls.length}`);
  console.log(`  history len:    ${history.length} (1 persona + ${SCRIPT.length * 2} dialogue)`);
  console.log(`  no fetched content or sentinel present in persistent_history`);
  console.log(`  fetched content verified present in model calls\n`);
}

main().catch((err) => fail(err.stack || err.message));
