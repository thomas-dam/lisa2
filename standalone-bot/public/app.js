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
let speakResponses = true;

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

async function loadConfig() {
  const fallbackModel = "Lisa-The-Bot:latest";
  try {
    const [configRes, modelsRes] = await Promise.all([
      fetch("/api/config"),
      fetch("/api/models")
    ]);

    const config = configRes.ok ? await configRes.json() : {};
    const modelsData = modelsRes.ok ? await modelsRes.json() : {};

    const defaultModel = config.model || fallbackModel;
    const models = Array.isArray(modelsData.models) && modelsData.models.length > 0
      ? modelsData.models
      : [defaultModel];

    if (!models.includes(defaultModel)) models.unshift(defaultModel);

    modelInput.innerHTML = "";
    for (const name of models) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      if (name === defaultModel) opt.selected = true;
      modelInput.append(opt);
    }
  } catch {
    modelInput.innerHTML = `<option value="${fallbackModel}">${fallbackModel}</option>`;
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
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, images: images.length > 0 ? images : undefined })
    });

    console.debug(`[DIAG-REQ] ${reqId} RESPONSE status=${response.status}`);

    const rawText = await response.text();
    console.debug(`[DIAG-REQ] ${reqId} RAW_BODY length=${rawText.length}`);

    if (rawText.length === 0) {
      throw new Error("Empty response body received.");
    }

    let payload;
    try {
      payload = JSON.parse(rawText);
    } catch (jsonErr) {
      console.error(`[DIAG-REQ] ${reqId} JSON_PARSE_FAILED`, {
        error: jsonErr.message,
        bodyLength: rawText.length,
        status: response.status,
      });
      throw new Error(`JSON parse error: ${jsonErr.message}`);
    }

    if (!response.ok) {
      throw new Error(payload.detail || payload.error || "Chat request failed.");
    }

    const reply = payload.reply || "No response returned.";
    const chatTime = ((performance.now() - chatStart) / 1000).toFixed(2);
    debugLog("chat", `${chatTime}s`);
    pendingBubble.innerHTML = renderMarkdown(reply);
    setStatus(`Ready (${payload.model || modelInput.value.trim()})`);
    clearAttachments();
    console.debug(`[DIAG-REQ] ${reqId} OK reply_len=${reply.length}`);

    if (speakResponses) {
      await callTts(reply);
    }
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

async function callTts(text) {
  if (!sidecarUrl || !speakResponses) return;
  const ttsStart = performance.now();
  try {
    const formData = new FormData();
    formData.append("text", text);
    const ttsRes = await fetch(`${sidecarUrl}/api/tts`, {
      method: "POST",
      body: formData,
    });
    if (!ttsRes.ok) {
      const errData = await ttsRes.text();
      console.warn("TTS failed:", errData);
      return;
    }
    const ttsData = await ttsRes.json();
    const ttsTime = ((performance.now() - ttsStart) / 1000).toFixed(2);
    debugLog("tts", `${ttsTime}s`);
    debugLog("audio_url", ttsData.audio_url);

    const audioUrl = `${sidecarUrl}${ttsData.audio_url}`;
    const audio = new Audio(audioUrl);
    audio.play().catch((err) => console.warn("Audio playback failed:", err));
  } catch (err) {
    console.warn("TTS error (text reply still shown):", err);
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
    if (voiceEnabled && sidecarUrl) {
      micButton.hidden = false;
      voiceToggleRow.hidden = false;
      voiceDebugPanel.hidden = false;
      debugLog("asr", "ready");
      debugLog("tts", "ready");
    }
  } catch {
    console.log("Voice config not available");
  }
}

await loadConfig();
await loadVoiceConfig();
resizeInput();
input.focus();
renderAttachments();
