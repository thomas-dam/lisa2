const form = document.querySelector("#chatForm");
const input = document.querySelector("#messageInput");
const messagesEl = document.querySelector("#messages");
const sendButton = document.querySelector("#sendButton");
const newChatButton = document.querySelector("#newChatButton");
const saveChatButton = document.querySelector("#saveChatButton");
const imageButton = document.querySelector("#imageButton");
const imageInput = document.querySelector("#imageInput");
const searchButton = document.querySelector("#searchButton");
const attachmentTray = document.querySelector("#attachmentTray");
const statusText = document.querySelector("#statusText");
const modelInput = document.querySelector("#modelInput");

let messages = [];
let busy = false;
let pendingAttachments = [];

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
  messages = [];
  messagesEl.innerHTML = "";
  addMessage("assistant", "Send a message to start a local conversation.");
  setStatus("Ready");
  clearAttachments();
  input.focus();
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

async function sendMessage(content, context = "") {
  busy = true;
  sendButton.disabled = true;
  imageButton.disabled = true;
  searchButton.disabled = true;
  saveChatButton.disabled = true;
  setStatus("Thinking");

  const images = pendingAttachments.map((attachment) => attachment.base64);
  messages.push({
    role: "user",
    content,
    images: images.length > 0 ? images : undefined,
    attachments: pendingAttachments.map(({ name, type }) => ({ name, type }))
  });
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
    const apiMessages = context
      ? messages.map((m, i) =>
          i === messages.length - 1 ? { ...m, content: `${context}\n\n${m.content}` } : m
        )
      : messages;

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: modelInput.value.trim(),
        messages: apiMessages
      })
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.detail || payload.error || "Chat request failed.");
    }

    const reply = payload.reply || "No response returned.";
    messages.push({ role: "assistant", content: reply });
    pendingBubble.innerHTML = renderMarkdown(reply);
    setStatus(`Ready (${payload.model || modelInput.value.trim()})`);
    clearAttachments();
  } catch (error) {
    pendingBubble.textContent = error.message;
    setStatus("Error");
  } finally {
    busy = false;
    sendButton.disabled = false;
    imageButton.disabled = false;
    searchButton.disabled = false;
    saveChatButton.disabled = false;
    messagesEl.scrollTop = messagesEl.scrollHeight;
    input.focus();
  }
}

async function saveChat() {
  if (messages.length === 0) {
    setStatus("Nothing to save");
    return;
  }

  saveChatButton.disabled = true;
  try {
    const response = await fetch("/api/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Standalone Bot Chat",
        messages
      })
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

searchButton.addEventListener("click", async () => {
  const content = input.value.trim();
  if (!content || busy) return;

  searchButton.disabled = true;
  setStatus("Searching...");
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(content)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Search failed.");

    let context = "";
    if (data.results && data.results.length > 0) {
      const lines = data.results
        .map((r) => `- ${r.title ? `${r.title}: ` : ""}${r.snippet}${r.url ? ` (${r.url})` : ""}`)
        .join("\n");
      context = `Web search results for "${data.query}":\n${lines}`;
    } else {
      context = `Web search for "${data.query}" returned no results.`;
    }

    input.value = "";
    resizeInput();
    await sendMessage(content, context);
  } catch (err) {
    setStatus(err.message || "Search failed.");
    searchButton.disabled = false;
  }
});
imageInput.addEventListener("change", async () => {
  if (imageInput.files && imageInput.files.length > 0) {
    await handleImageSelection(imageInput.files);
    imageInput.value = "";
  }
});

await loadConfig();
resizeInput();
input.focus();
renderAttachments();
