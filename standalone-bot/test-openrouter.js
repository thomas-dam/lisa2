import assert from "node:assert/strict";
import { createOpenRouterChat } from "./lisa-chat.js";

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

console.log("OpenRouter provider: PASS");
