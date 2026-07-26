import assert from "node:assert/strict";
import {
  createOpenRouterChat,
  createOpenRouterChatStream,
  createSpeechChunker
} from "./lisa-chat.js";

let captured;
const chat = createOpenRouterChat({
  getSettings: async () => ({ apiKey: "secret-key", model: "openai/gpt-4.1-mini" }),
  fetchImpl: async (url, options) => {
    captured = { url, options };
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "  Hello from Lisa  "} }] }) };
  }
});

const reply = await chat([
  { role: "system", content: "persona" },
  { role: "user", content: "look", images: ["abc123"] }
]);
assert.equal(reply, "Hello from Lisa");
assert.equal(captured.url, "https://openrouter.ai/api/v1/chat/completions");
assert.equal(captured.options.headers.authorization, "Bearer secret-key");
const payload = JSON.parse(captured.options.body);
assert.equal(payload.model, "openai/gpt-4.1-mini");
assert.equal(payload.messages[1].content[1].image_url.url, "data:image/jpeg;base64,abc123");

const missingKeyChat = createOpenRouterChat({
  getSettings: async () => ({ apiKey: "", model: "test/model" }),
  fetchImpl: async () => { throw new Error("fetch should not run"); }
});
await assert.rejects(missingKeyChat([]), /API key is not configured/);

const streamPayloads = [
  'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n',
  'data: {"choices":[{"delta":{"content":"from Lisa."}}]}\n\n',
  "data: [DONE]\n\n"
];
const streamChat = createOpenRouterChatStream({
  getSettings: async () => ({ apiKey: "secret-key", model: "test/model" }),
  fetchImpl: async (_url, options) => {
    assert.equal(JSON.parse(options.body).stream, true);
    return {
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(controller) {
          for (const text of streamPayloads) {
            controller.enqueue(new TextEncoder().encode(text));
          }
          controller.close();
        }
      })
    };
  }
});
const deltas = [];
const streamedReply = await streamChat(
  [{ role: "user", content: "hello" }],
  (delta) => deltas.push(delta)
);
assert.equal(streamedReply, "Hello from Lisa.");
assert.deepEqual(deltas, ["Hello ", "from Lisa."]);

const speech = createSpeechChunker({ maxCharacters: 20 });
assert.deepEqual(speech.push("Hello there. Next"), ["Hello there."]);
assert.deepEqual(speech.push(" sentence!"), []);
assert.deepEqual(speech.flush(), ["Next sentence!"]);

console.log("OpenRouter provider: PASS");
