const form = document.querySelector("#chatForm");
const input = document.querySelector("#messageInput");
const messagesEl = document.querySelector("#messages");
const sendButton = document.querySelector("#sendButton");
const newChatButton = document.querySelector("#newChatButton");
const saveChatButton = document.querySelector("#saveChatButton");
const imageButton = document.querySelector("#imageButton");
const imageInput = document.querySelector("#imageInput");
const attachmentTray = document.querySelector("#attachmentTray");
const statusText = document.querySelector("#statusText");
const modelInput = document.querySelector("#modelInput");
const apiKeyInput = document.querySelector("#apiKeyInput");
const saveSettingsButton = document.querySelector("#saveSettingsButton");
const apiKeyStatus = document.querySelector("#apiKeyStatus");
const micButton = document.querySelector("#micButton");
const speakToggle = document.querySelector("#speakToggle");
const voiceToggleRow = document.querySelector(".voice-toggle-row");
const voiceDebugPanel = document.querySelector("#voiceDebugPanel");
const debugRecording = document.querySelector("#debugRecording");
const debugTranscript = document.querySelector("#debugTranscript");
const debugAsr = document.querySelector("#debugAsr");
const debugChat = document.querySelector("#debugChat");
const debugTts = document.querySelector("#debugTts");
const debugAudioUrl = document.querySelector("#debugAudioUrl");

let busy = false;
let pendingAttachments = [];
let mediaRecorder = null;
let mediaStream = null;
let audioChunks = [];
let sidecarUrl = "";
let voiceEnabled = false;
let defaultVoice = "";
let ttsProvider = "";
let ttsEngine = "";
let speakResponses = true;
let audioCtx = null;
let nextPlaybackTime = 0;
let speechQueue = Promise.resolve();

function ensureAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    void audioCtx.resume();
  }
  return audioCtx;
}

function debugLog(label, value) {
  const el = { recording: debugRecording, transcript: debugTranscript, asr: debugAsr, chat: debugChat, tts: debugTts, audio_url: debugAudioUrl }[label];
  if (el) el.textContent = value;
}

function setStatus(text) {
  statusText.textContent = text;
}

function resizeInput() {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
}

function addMessage(role, content) {
  const article = document.createElement("article");
  article.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = role === "user" ? "You" : "AI";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = content;

  article.append(avatar, bubble);
  messagesEl.append(article);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return bubble;
}

function renderAttachments() {
  attachmentTray.innerHTML = "";

  if (pendingAttachments.length === 0) {
    attachmentTray.hidden = true;
    return;
  }

  attachmentTray.hidden = false;
  for (const attachment of pendingAttachments) {
    const item = document.createElement("div");
    item.className = "attachment";

    const preview = document.createElement("img");
    preview.alt = attachment.name;
    preview.src = attachment.previewUrl;

    const meta = document.createElement("div");
    meta.className = "attachment-meta";

    const name = document.createElement("span");
    name.className = "attachment-name";
    name.textContent = attachment.name;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "attachment-remove";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      URL.revokeObjectURL(attachment.previewUrl);
      pendingAttachments = pendingAttachments.filter((item) => item.id !== attachment.id);
      renderAttachments();
    });

    meta.append(name, remove);
    item.append(preview, meta);
    attachmentTray.append(item);
  }
}

function clearAttachments() {
  for (const attachment of pendingAttachments) {
    URL.revokeObjectURL(attachment.previewUrl);
  }
  pendingAttachments = [];
  renderAttachments();
}

function resetChat() {
  messagesEl.innerHTML = "";
  addMessage("assistant", "Send a message to start a local conversation.");
  setStatus("Ready");
  clearAttachments();
  input.focus();
  
  // Notify server to reset history
  void fetch("/api/new-chat", { method: "POST" }).catch(() => {
    console.error("Failed to reset chat on server");
  });
}

async function loadSettings() {
  const fallbackModel = "openai/gpt-4.1-mini";
  try {
    const response = await fetch("/api/settings");
    if (!response.ok) throw new Error("Could not load settings.");
    const settings = await response.json();
    modelInput.value = settings.model || fallbackModel;
    apiKeyStatus.textContent = settings.apiKeyConfigured ? "API key configured" : "No API key configured";
  } catch {
    modelInput.value = fallbackModel;
    apiKeyStatus.textContent = "Could not load settings";
  }
}

async function saveSettings() {
  saveSettingsButton.disabled = true;
  try {
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: modelInput.value.trim(), apiKey: apiKeyInput.value.trim() })
    });
    const settings = await response.json();
    if (!response.ok) throw new Error(settings.error || "Could not save settings.");
    apiKeyInput.value = "";
    apiKeyStatus.textContent = settings.apiKeyConfigured ? "API key configured" : "No API key configured";
    setStatus(`Ready (${settings.model})`);
  } catch (error) {
    setStatus(error.message);
  } finally {
    saveSettingsButton.disabled = false;
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInline(str) {
  return escapeHtml(str)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>");
}

function renderMarkdown(text) {
  const codeBlocks = [];
  const tokenized = text.replace(/```([^\n]*)\n?([\s\S]*?)```/g, (_m, _lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code>${escapeHtml(code.trimEnd())}</code></pre>`);
    return `\x00CODE${idx}\x00`;
  });

  const out = [];
  let paraLines = [];
  let listTag = "";

  function flushPara() {
    if (paraLines.length > 0) {
      out.push(`<p>${paraLines.join("<br>")}</p>`);
      paraLines = [];
    }
  }

  function closeList() {
    if (listTag) { out.push(`</${listTag}>`); listTag = ""; }
  }

  for (const line of tokenized.split("\n")) {
    const codeToken = line.match(/^\x00CODE(\d+)\x00$/);
    if (codeToken) { flushPara(); closeList(); out.push(codeBlocks[Number(codeToken[1])]); continue; }

    if (line.trim() === "") { flushPara(); closeList(); continue; }

    const heading = line.match(/^(#{1,3}) (.+)/);
    if (heading) {
      flushPara(); closeList();
      out.push(`<h${heading[1].length}>${renderInline(heading[2])}</h${heading[1].length}>`);
      continue;
    }

    const bullet = line.match(/^[-*+] (.+)/);
    if (bullet) {
      flushPara();
      if (listTag !== "ul") { closeList(); out.push("<ul>"); listTag = "ul"; }
      out.push(`<li>${renderInline(bullet[1])}</li>`);
      continue;
    }

    const numbered = line.match(/^\d+\. (.+)/);
    if (numbered) {
      flushPara();
      if (listTag !== "ol") { closeList(); out.push("<ol>"); listTag = "ol"; }
      out.push(`<li>${renderInline(numbered[1])}</li>`);
      continue;
    }

    closeList();
    paraLines.push(renderInline(line));
  }

  flushPara();
  closeList();
  return out.join("");
}

const IMAGE_MAX_EDGE = 768;
const IMAGE_MAX_PIXELS = 768 * 768;
const IMAGE_JPEG_QUALITY = 0.88;

async function resizeToBase64(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      try {
        URL.revokeObjectURL(objectUrl);
        const { width, height } = img;
        const scale = Math.min(
          1,
          IMAGE_MAX_EDGE / Math.max(width, height),
          Math.sqrt(IMAGE_MAX_PIXELS / (width * height))
        );
        const w = Math.max(1, Math.round(width * scale));
        const h = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", IMAGE_JPEG_QUALITY).split(",")[1] || "");
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not load image."));
    };
    img.src = objectUrl;
  });
}

async function fileToAttachment(file) {
  const base64 = await resizeToBase64(file);
  return {
    id: crypto.randomUUID(),
    name: file.name,
    type: "image/jpeg",
    base64,
    previewUrl: URL.createObjectURL(file)
  };
}

async function handleImageSelection(files) {
  const selected = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
  if (selected.length === 0) return;

  setStatus("Loading image...");
  try {
    const attachments = await Promise.all(selected.map(fileToAttachment));
    pendingAttachments = [...pendingAttachments, ...attachments];
    renderAttachments();
    setStatus("Ready");
  } catch (err) {
    setStatus(err.message || "Could not load image.");
  }
}

async function sendMessage(content, fromVoice) {
  busy = true;
  sendButton.disabled = true;
  imageButton.disabled = true;
  saveChatButton.disabled = true;
  micButton.disabled = true;
  setStatus("Thinking");

  const chatStart = performance.now();

  const reqId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  console.debug(`[DIAG-REQ] ${reqId} START time=${Date.now()} msg_len=${content.length}`);

  // Display user message
  addMessage("user", content);
  if (pendingAttachments.length > 0) {
    const imageSummary = document.createElement("div");
    imageSummary.className = "attachment-summary";
    imageSummary.textContent =
      pendingAttachments.length === 1
        ? `Attached image: ${pendingAttachments[0].name}`
        : `${pendingAttachments.length} attached images`;
    messagesEl.lastElementChild?.append(imageSummary);
  }
  const pendingBubble = addMessage("assistant", "...");

  try {
    const images = pendingAttachments.map((a) => a.base64).slice(0, 4);
    const response = await fetch("/api/chat/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, images: images.length > 0 ? images : undefined })
    });

    console.debug(`[DIAG-REQ] ${reqId} RESPONSE status=${response.status}`);

    if (!response.ok) {
      const payload = await response.json();
      throw new Error(payload.detail || payload.error || "Chat request failed.");
    }
    if (!response.body) throw new Error("Chat returned no response stream.");

    let reply = "";
    let donePayload = null;
    await readNdjson(response.body, (event) => {
      if (event.type === "delta") {
        reply += event.text || "";
        pendingBubble.innerHTML = renderMarkdown(reply);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      } else if (event.type === "speech" && speakResponses && voiceEnabled) {
        queueSpeech(event.text, reqId);
      } else if (event.type === "done") {
        donePayload = event;
        reply = event.reply || reply;
      } else if (event.type === "error") {
        throw new Error(event.detail || event.error || "Chat stream failed.");
      }
    });

    if (!donePayload) throw new Error("Chat stream ended before completion.");
    const chatTime = ((performance.now() - chatStart) / 1000).toFixed(2);
    debugLog("chat", `${chatTime}s`);
    pendingBubble.innerHTML = renderMarkdown(reply);
    setStatus(`Ready (${donePayload.model || modelInput.value.trim()})`);
    clearAttachments();
    console.debug(`[DIAG-REQ] ${reqId} OK reply_len=${reply.length}`);
  } catch (error) {
    console.error(`[DIAG-REQ] ${reqId} FAIL`, { error: error.message });
    pendingBubble.textContent = error.message;
    setStatus("Error");
  } finally {
    busy = false;
    sendButton.disabled = false;
    imageButton.disabled = false;
    saveChatButton.disabled = false;
    micButton.disabled = false;
    messagesEl.scrollTop = messagesEl.scrollHeight;
    input.focus();
  }
}

async function readNdjson(stream, onEvent) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  while (true) {
    const { value, done } = await reader.read();
    pending += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = pending.split("\n");
    pending = done ? "" : (lines.pop() || "");
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line));
    }
    if (done) {
      if (pending.trim()) onEvent(JSON.parse(pending));
      return;
    }
  }
}

async function saveChat() {
  saveChatButton.disabled = true;
  try {
    const response = await fetch("/api/save", {
      method: "POST",
      headers: { "content-type": "application/json" }
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.detail || payload.error || "Save failed.");
    }

    const lines = [`# ${payload.title}`, `Saved: ${payload.savedAt}`, ""];
    for (const message of payload.messages) {
      lines.push(`- ${message.role}: ${message.content}`);
      if (Array.isArray(message.images) && message.images.length > 0) {
        lines.push(`  images: ${message.images.length}`);
      }
    }

    const blob = new Blob([`${lines.join("\n")}\n`], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `standalone-bot-chat-${new Date().toISOString().replaceAll(":", "-")}.md`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus("Chat saved");
  } catch (error) {
    setStatus(error.message);
  } finally {
    saveChatButton.disabled = false;
  }
}

// --- Voice functions ---

async function ensureRecorder() {
  if (mediaRecorder) return mediaRecorder;
  mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeCandidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  const mimeType = mimeCandidates.find((c) => MediaRecorder.isTypeSupported(c)) || "";
  mediaRecorder = mimeType
    ? new MediaRecorder(mediaStream, { mimeType })
    : new MediaRecorder(mediaStream);
  mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) audioChunks.push(event.data);
  });
  mediaRecorder.addEventListener("stop", async () => {
    const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || "audio/webm" });
    audioChunks = [];
    await handleVoiceInput(blob);
  });
  return mediaRecorder;
}

async function startRecording() {
  if (busy) return;
  setStatus("Listening");
  micButton.classList.add("recording");
  micButton.textContent = "🔴";
  debugLog("recording", "started");
  const recorder = await ensureRecorder();
  audioChunks = [];
  recorder.start();
}

function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state !== "recording") return;
  micButton.classList.remove("recording");
  micButton.textContent = "🎤";
  mediaRecorder.stop();
  debugLog("recording", "stopped, sending");
}

async function handleVoiceInput(audioBlob) {
  if (!sidecarUrl) {
    setStatus("Voice sidecar not configured");
    return;
  }

  setStatus("Transcribing");
  const asrStart = performance.now();

  try {
    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.webm");
    formData.append("language", "en");

    let asrRes;
    try {
      asrRes = await fetch(`${sidecarUrl}/api/asr`, {
        method: "POST",
        body: formData,
      });
    } catch (fetchErr) {
      throw new Error("Voice sidecar offline — start with: npm run voice");
    }

    if (!asrRes.ok) {
      const errData = await asrRes.text();
      throw new Error(errData || "ASR failed");
    }
    const asrData = await asrRes.json();
    const transcript = asrData.transcript || "";
    const asrTime = ((performance.now() - asrStart) / 1000).toFixed(2);

    debugLog("asr", `${asrTime}s`);
    debugLog("transcript", transcript);

    if (!transcript.trim()) {
      setStatus("No speech detected");
      return;
    }

    await sendMessage(transcript, true);
  } catch (err) {
    console.error("Voice input failed:", err);
    setStatus(`Voice error: ${err.message}`);
    debugLog("asr", `error: ${err.message}`);
  }
}

function queueSpeech(text, reqId) {
  if (!text?.trim()) return;
  speechQueue = speechQueue
    .then(() => callTts(text, reqId))
    .catch((error) => {
      console.error("[VOICE] queued TTS failed:", error);
    });
}

function schedulePcm(pcmBytes, sampleRate, reqId) {
  if (pcmBytes.byteLength === 0) return;
  const ctx = ensureAudioCtx();
  const samples = new Float32Array(
    pcmBytes.buffer,
    pcmBytes.byteOffset,
    pcmBytes.byteLength / Float32Array.BYTES_PER_ELEMENT
  );
  const audioBuffer = ctx.createBuffer(1, samples.length, sampleRate);
  audioBuffer.copyToChannel(samples, 0);
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);
  const startAt = Math.max(ctx.currentTime + 0.025, nextPlaybackTime);
  source.start(startAt);
  nextPlaybackTime = startAt + audioBuffer.duration;
  source.onended = () => {
    console.debug(`[VOICE] audio chunk ended`, { reqId, duration: audioBuffer.duration });
  };
}

async function callTts(text, reqId) {
  console.debug(`[VOICE] callTts entered: engine="${ttsEngine}" speakResponses=${speakResponses} text_len=${text.length} req=${reqId}`);
  if (!speakResponses) {
    console.warn(`[VOICE] callTts aborted: speakResponses=${speakResponses}`);
    return;
  }
  const ttsStart = performance.now();
  const ttsReqId = reqId || `tts_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  try {
    // --- Stage 1: Build and send TTS request via same-origin proxy ---
    const ttsBody = JSON.stringify({
      text,
      voice: defaultVoice,
    });
    console.debug(`[VOICE] TTS request:`, {
      reqId: ttsReqId,
      url: "/api/voice/tts",
      method: "POST",
      contentType: "application/json",
      bodyPreview: ttsBody.slice(0, 200),
      bodyLength: ttsBody.length,
      textLength: text.length,
    });

    const ttsRes = await fetch("/api/voice/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: ttsBody,
    });

    // --- Stage 2: Schedule progressive float32 PCM chunks ---
    const ttsStatus = ttsRes.status;
    const ttsElapsed = ((performance.now() - ttsStart) / 1000).toFixed(3);

    if (!ttsRes.ok) {
      const errorText = await ttsRes.text();
      console.warn(`[VOICE] TTS request failed: status=${ttsStatus} body=${errorText.slice(0, 300)} elapsed=${ttsElapsed}s`);
      return;
    }
    if (!ttsRes.body) throw new Error("TTS returned no audio stream.");
    const audioFormat = ttsRes.headers.get("x-audio-format");
    if (audioFormat !== "f32le") {
      throw new Error(`Unsupported TTS audio format: ${audioFormat || "missing"}.`);
    }
    const sampleRate = Number(ttsRes.headers.get("x-audio-sample-rate") || 24_000);
    const reader = ttsRes.body.getReader();
    let pending = new Uint8Array();
    let bytesReceived = 0;
    const minimumChunkBytes = Math.round(sampleRate * 0.08) * Float32Array.BYTES_PER_ELEMENT;

    while (true) {
      const { value, done } = await reader.read();
      if (value?.byteLength) {
        const combined = new Uint8Array(pending.byteLength + value.byteLength);
        combined.set(pending);
        combined.set(value, pending.byteLength);
        pending = combined;
        bytesReceived += value.byteLength;
      }

      const alignedBytes = pending.byteLength - (pending.byteLength % 4);
      if (alignedBytes >= minimumChunkBytes || (done && alignedBytes > 0)) {
        const playable = pending.slice(0, alignedBytes);
        pending = pending.slice(alignedBytes);
        schedulePcm(playable, sampleRate, ttsReqId);
      }
      if (done) break;
    }

    if (bytesReceived === 0) throw new Error("TTS returned empty audio.");
    const totalElapsed = ((performance.now() - ttsStart) / 1000).toFixed(3);
    debugLog("tts", `${totalElapsed}s streaming`);
    debugLog("audio_url", `inline PCM (${bytesReceived} bytes)`);
    console.debug(`[VOICE] TTS stream complete`, {
      reqId: ttsReqId,
      bytes: bytesReceived,
      sampleRate,
      elapsedSec: totalElapsed
    });
  } catch (err) {
    console.error(`[VOICE] TTS unexpected error (text reply still shown):`, {
      reqId: ttsReqId,
      errorName: err.name,
      errorMessage: err.message,
      errorStack: err.stack,
    });
  }
}

input.addEventListener("input", resizeInput);

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (busy) {
    return;
  }

  const content = input.value.trim();
  if (!content) {
    return;
  }

  // Prime AudioContext on user gesture
  ensureAudioCtx();

  input.value = "";
  resizeInput();
  void sendMessage(content);
});

newChatButton.addEventListener("click", resetChat);
saveChatButton.addEventListener("click", () => {
  void saveChat();
});
imageButton.addEventListener("click", () => {
  imageInput.click();
});

imageInput.addEventListener("change", async () => {
  if (imageInput.files && imageInput.files.length > 0) {
    await handleImageSelection(imageInput.files);
    imageInput.value = "";
  }
});

// --- Voice event handlers ---

micButton.addEventListener("pointerdown", async (event) => {
  event.preventDefault();
  try {
    await startRecording();
  } catch (err) {
    setStatus(err.message || "Microphone access failed.");
  }
});

["pointerup", "pointerleave", "pointercancel"].forEach((name) => {
  micButton.addEventListener(name, (event) => {
    event.preventDefault();
    stopRecording();
  });
});

speakToggle.addEventListener("change", () => {
  speakResponses = speakToggle.checked;
});

async function loadVoiceConfig() {
  try {
    const res = await fetch("/api/voice-config");
    const cfg = await res.json();
    voiceEnabled = cfg.voice_enabled === true;
    sidecarUrl = cfg.sidecar_url || "";
    defaultVoice = cfg.default_voice || "";
    ttsProvider = cfg.tts_provider || "";
    ttsEngine = cfg.tts_engine || "";
    console.debug(`[VOICE] config loaded: enabled=${voiceEnabled} sidecar=${sidecarUrl} tts=${ttsProvider}/${ttsEngine} voice=${defaultVoice}`);
    if (voiceEnabled) {
      micButton.hidden = false;
      voiceToggleRow.hidden = false;
      voiceDebugPanel.hidden = false;
      debugLog("asr", "ready");
      debugLog("tts", "ready");
    } else {
      console.debug(`[VOICE] config incomplete: enabled=${voiceEnabled} url=${sidecarUrl} — voice UI hidden`);
    }
  } catch (err) {
    console.debug("[VOICE] config fetch failed:", err.message);
  }
}

saveSettingsButton.addEventListener("click", () => { void saveSettings(); });

await loadSettings();
await loadVoiceConfig();
resizeInput();
input.focus();
renderAttachments();
