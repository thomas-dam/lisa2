import { describe, it } from "node:test";
import assert from "node:assert/strict";

const BASE = "http://127.0.0.1:3320";

async function jsonPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

describe("Voice pipeline end-to-end", () => {
  it("chat → reply → MLX Audio TTS proxy → valid WAV", async () => {
    // Stage 1: Chat
    console.log("[E2E] Stage 1: sending chat message...");
    const chatRes = await jsonPost(`${BASE}/api/chat`, {
      content: "Say just the word 'hello' — nothing else.",
    });
    assert.equal(chatRes.status, 200, `Chat failed: ${JSON.stringify(chatRes.data)}`);
    const reply = chatRes.data.reply || "";
    assert(reply.length > 0, "Chat reply was empty");
    console.log(`[E2E] Chat reply: "${reply.slice(0, 100)}"`);

    // Stage 2: TTS proxy
    console.log("[E2E] Stage 2: calling TTS proxy...");
    const ttsRes = await fetch(`${BASE}/api/voice/tts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: reply, voice: "rose" }),
    });
    if (!ttsRes.ok) {
      const errorText = await ttsRes.text();
      assert.fail(`TTS proxy returned ${ttsRes.status}: ${errorText}`);
    }
    const contentType = ttsRes.headers.get("content-type") || "";
    assert(
      contentType.includes("wav") || contentType.includes("audio"),
      `Expected audio content type, got: ${contentType}`
    );
    console.log(`[E2E] Audio content-type: ${contentType}`);

    // Stage 3: Validate WAV header
    const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());
    assert(audioBuffer.length > 44, `WAV too small: ${audioBuffer.length} bytes`);

    // WAV header: "RIFF" at offset 0, "WAVE" at offset 8
    const riff = audioBuffer.toString("ascii", 0, 4);
    const wave = audioBuffer.toString("ascii", 8, 12);
    assert.equal(riff, "RIFF", `Missing RIFF header, got: ${riff}`);
    assert.equal(wave, "WAVE", `Missing WAVE header, got: ${wave}`);

    // Read audio format (should be 1 = PCM)
    const audioFormat = audioBuffer.readUInt16LE(20);
    assert.equal(audioFormat, 1, `Expected PCM format (1), got: ${audioFormat}`);

    const numChannels = audioBuffer.readUInt16LE(22);
    const sampleRate = audioBuffer.readUInt32LE(24);
    const bitsPerSample = audioBuffer.readUInt16LE(34);
    const dataSize = audioBuffer.readUInt32LE(40);

    console.log(`[E2E] WAV validated: ${numChannels}ch ${sampleRate}Hz ${bitsPerSample}bit data=${dataSize}bytes total=${audioBuffer.length}bytes`);
    console.log(`[E2E] ✅ FULL PIPELINE VERIFIED: chat → MLX Audio TTS proxy → valid WAV`);
  });
});
