const form = document.querySelector("#chatForm");
const input = document.querySelector("#messageInput");
const messagesEl = document.querySelector("#messages");
const sendButton = document.querySelector("#sendButton");
const newChatButton = document.querySelector("#newChatButton");
const statusText = document.querySelector("#statusText");
const modelInput = document.querySelector("#modelInput");

let messages = [];
let busy = false;

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

function resetChat() {
  messages = [];
  messagesEl.innerHTML = "";
  addMessage("assistant", "Send a message to start a local conversation.");
  setStatus("Ready");
  input.focus();
}

async function loadConfig() {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) {
      throw new Error("Config unavailable.");
    }

    const config = await response.json();
    modelInput.value = config.model || "qwen3:4b";
  } catch {
    modelInput.value = "qwen3:4b";
  }
}

async function sendMessage(content) {
  busy = true;
  sendButton.disabled = true;
  setStatus("Thinking");

  messages.push({ role: "user", content });
  addMessage("user", content);
  const pendingBubble = addMessage("assistant", "...");

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: modelInput.value.trim(),
        messages
      })
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.detail || payload.error || "Chat request failed.");
    }

    const reply = payload.reply || "No response returned.";
    messages.push({ role: "assistant", content: reply });
    pendingBubble.textContent = reply;
    setStatus(`Ready (${payload.model || modelInput.value.trim()})`);
  } catch (error) {
    pendingBubble.textContent = error.message;
    setStatus("Error");
  } finally {
    busy = false;
    sendButton.disabled = false;
    messagesEl.scrollTop = messagesEl.scrollHeight;
    input.focus();
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

await loadConfig();
resizeInput();
input.focus();
