import { createServer } from "node:http";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createHistory, chatTurn, createRetriever, createFullRetriever, loadReference, loadPersona, createOpenRouterChat } from "./lisa-chat.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const configDir = join(__dirname, "..", "config");
const VOICE_CONFIG_PATH = join(configDir, "voice.json");
const PERSONA_PATH = process.env.LISA_PERSONA_PATH || join(__dirname, "..", "spec", "lisa.md");
const OPENROUTER_SETTINGS_PATH = join(configDir, "openrouter.json");
const DEFAULT_OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini";

let voiceConfig = { voice_enabled: false };

async function loadVoiceConfig() {
  try {
    const raw = await readFile(VOICE_CONFIG_PATH, "utf8");
    voiceConfig = JSON.parse(raw);
    console.log(`[voice] config loaded: enabled=${voiceConfig.voice_enabled}`);
  } catch {
    console.log("[voice] config/voice.json not found, voice disabled");
  }
}

let reqCounter = 0;
function nextReqId() {
  reqCounter += 1;
  return `req_${String(reqCounter).padStart(3, "0")}`;
}

const PORT = Number(process.env.PORT || 3320);
const HOST = process.env.HOST || "127.0.0.1";
const SYSTEM_PROMPT_OVERRIDE = process.env.SYSTEM_PROMPT || "";

async function loadOpenRouterSettings() {
  const defaults = { apiKey: process.env.OPENROUTER_API_KEY || "", model: DEFAULT_OPENROUTER_MODEL };
  try {
    const saved = JSON.parse(await readFile(OPENROUTER_SETTINGS_PATH, "utf8"));
    return {
      apiKey: String(saved.apiKey || defaults.apiKey).trim(),
      model: String(saved.model || defaults.model).trim() || defaults.model
    };
  } catch {
    return defaults;
  }
}

async function saveOpenRouterSettings(settings) {
  await mkdir(configDir, { recursive: true });
  const temporaryPath = `${OPENROUTER_SETTINGS_PATH}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, OPENROUTER_SETTINGS_PATH);
}

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"]
]);

// Persistent server state: owned by lisa-chat.js
let history = null;
let personaText = "";
let visualRetriever = null;
let zImageRetriever = null;
let visualSections = null;
let zImageSections = null;
let modelChat = null;
let lastGeneratedPrompt = null;

async function tryLoadReference(path, label) {
  try {
    const sections = await loadReference(path);
    console.log(`[reference] ${label}: ${sections.length} sections loaded`);
    for (let i = 0; i < sections.length; i += 1) {
      console.log(`[reference]   keyword: ${sections[i].keywords.join(", ")}`);
    }
    return { retriever: createRetriever(sections), sections };
  } catch (error) {
    console.error(`[reference] ${label}: failed to load (${error.message})`);
    return { retriever: () => null, sections: [] };
  }
}

// Command routing: returns null for normal messages, or a descriptor for image commands
function parseCommand(text) {
  const lower = text.trim().toLowerCase();
  if (lower.startsWith("/create image")) {
    return { type: "create_image", text: text.slice("/create image".length).trim() };
  }
  if (lower.startsWith("/iterate image")) {
    return { type: "iterate_image", text: text.slice("/iterate image".length).trim() };
  }
  return null;
}

// Initialize on startup
async function initializeChat() {
  personaText = await loadPersona({
    override: SYSTEM_PROMPT_OVERRIDE,
    path: PERSONA_PATH
  });
  history = createHistory(personaText);
  const visualResult = await tryLoadReference(join(__dirname, "visual-reference.md"), "visual");
  visualRetriever = visualResult.retriever;
  visualSections = visualResult.sections;
  const zResult = await tryLoadReference(join(__dirname, "z-image-reference.md"), "z-image");
  zImageRetriever = zResult.retriever;
  zImageSections = zResult.sections;

  modelChat = createOpenRouterChat({ getSettings: loadOpenRouterSettings });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  const bytes = Buffer.byteLength(body);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": bytes
  });
  res.end(body);
  return bytes;
}

async function readRequestJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 5_000_000) {
      throw new Error("Request body is too large.");
    }
  }
  return raw ? JSON.parse(raw) : {};
}

async function handleChat(req, res, reqId) {
  try {
    const body = await readRequestJson(req);
    const userContent = body.content || "";
    const userImages = Array.isArray(body.images) ? body.images.slice(0, 4) : [];
    console.log(`[DIAG-REQ] ${reqId} BODY_LEN body_bytes=${Buffer.byteLength(JSON.stringify(body))} content_chars=${userContent.length}`);

    if (!userContent.trim()) {
      const bytes = sendJson(res, 400, { error: "Send at least one message." });
      console.log(`[DIAG-REQ] ${reqId} END status=400 bytes=${bytes}`);
      return;
    }

    const command = parseCommand(userContent);

    if (command) {
      // --- Slash command handling (ephemeral, full reference injection) ---
      let loadSection;

      if (command.type === "create_image") {
        const fullZ = createFullRetriever(zImageSections);
        const fullV = createFullRetriever(visualSections);
        loadSection = (text) => {
          const results = [];
          const zHit = fullZ(text);
          if (zHit) results.push(...(Array.isArray(zHit) ? zHit : [zHit]));
          const vHit = fullV(text);
          if (vHit) results.push(...(Array.isArray(vHit) ? vHit : [vHit]));
          return results.length > 0 ? results : null;
        };
      } else if (command.type === "iterate_image") {
        const includesLisa = lastGeneratedPrompt
          ? lastGeneratedPrompt.toLowerCase().includes("lisa") || command.text.toLowerCase().includes("lisa")
          : false;
        const fullZ = createFullRetriever(zImageSections);
        loadSection = (text) => {
          const results = [];
          const zHit = fullZ(text);
          if (zHit) results.push(...(Array.isArray(zHit) ? zHit : [zHit]));
          if (includesLisa) {
            const vHit = createFullRetriever(visualSections)(text);
            if (vHit) results.push(...(Array.isArray(vHit) ? vHit : [vHit]));
          }
          if (lastGeneratedPrompt) {
            results.push({ text: `Previous prompt:\n${lastGeneratedPrompt}`, keyword: "last-prompt" });
          }
          return results.length > 0 ? results : null;
        };
      }

      const reply = await chatTurn({
        history,
        userTurn: userContent,
        images: userImages,
        loadSection,
        chat: modelChat
      });

      lastGeneratedPrompt = reply;
      const settings = await loadOpenRouterSettings();
      const bytes = sendJson(res, 200, { reply, model: settings.model, historyLength: history.length });
      console.log(`[DIAG-REQ] ${reqId} END status=200 bytes=${bytes}`);
      return;
    }

    // --- Normal chat: visual retriever only ---
    const reply = await chatTurn({
      history,
      userTurn: userContent,
      images: userImages,
      loadSection: visualRetriever,
      chat: modelChat
    });

    const settings = await loadOpenRouterSettings();
    const bytes = sendJson(res, 200, {
      reply,
      model: settings.model,
      historyLength: history.length
    });
    console.log(`[DIAG-REQ] ${reqId} END status=200 bytes=${bytes}`);
  } catch (error) {
    const bytes = sendJson(res, 500, {
      error:
        error instanceof SyntaxError
          ? "Invalid JSON request."
          : "OpenRouter chat request failed.",
      detail: error.message
    });
    console.log(`[DIAG-REQ] ${reqId} CATCH status=500 bytes=${bytes} err=${error.message}`);
  }
}

async function handleSave(req, res) {
  try {
    sendJson(res, 200, {
      messages: history,
      title: "Standalone Bot Chat",
      savedAt: new Date().toISOString()
    });
  } catch (error) {
    sendJson(res, 500, {
      error: "Could not save the chat.",
      detail: error.message
    });
  }
}

async function handleSettingsGet(res) {
  const settings = await loadOpenRouterSettings();
  sendJson(res, 200, { apiKeyConfigured: Boolean(settings.apiKey), model: settings.model });
}

async function handleSettingsUpdate(req, res) {
  const body = await readRequestJson(req);
  const current = await loadOpenRouterSettings();
  const model = String(body.model || "").trim();
  if (!model || model.length > 200) {
    sendJson(res, 400, { error: "Enter a valid OpenRouter model slug." });
    return;
  }
  const settings = {
    apiKey: body.clearApiKey ? "" : (String(body.apiKey || "").trim() || current.apiKey),
    model
  };
  await saveOpenRouterSettings(settings);
  sendJson(res, 200, { apiKeyConfigured: Boolean(settings.apiKey), model: settings.model });
}

async function handleNewChat(req, res) {
  history = createHistory(personaText);
  lastGeneratedPrompt = null;
  sendJson(res, 200, { message: "Chat reset." });
}

function handleVoiceConfig(req, res) {
  const sidecarPort = voiceConfig.sidecar?.port || 3330;
  const sidecarUrl = `http://127.0.0.1:${sidecarPort}`;
  const tts = voiceConfig.tts || {};
  sendJson(res, 200, {
    voice_enabled: voiceConfig.voice_enabled === true,
    sidecar_url: sidecarUrl,
    default_voice: tts.voice || "rose",
    tts_provider: "mlx-audio",
  });
}

async function handleVoiceTtsProxy(req, res) {
  try {
    const body = await readRequestJson(req);
    const text = body.text || "";

    if (!text.trim()) {
      sendJson(res, 400, { error: "Text is required." });
      return;
    }

    const tts = voiceConfig.tts || {};
    const endpoint = String(tts.endpoint || "").trim();
    const voice = body.voice || tts.voice || "rose";
    if (!endpoint) {
      sendJson(res, 500, { error: "MLX Audio TTS endpoint is not configured." });
      return;
    }

    console.log(`[VOICE-PROXY] mlx-audio upstream=${endpoint} voice=${voice}`);
    const ttsRes = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: text, voice }),
    });
    const audioBuffer = await ttsRes.arrayBuffer();

    if (!ttsRes.ok) {
      const detail = Buffer.from(audioBuffer).toString("utf8").slice(0, 500);
      sendJson(res, ttsRes.status, { error: "MLX Audio TTS request failed.", detail });
      return;
    }

    if (audioBuffer.byteLength === 0) {
      sendJson(res, 502, { error: "MLX Audio TTS returned empty audio." });
      return;
    }

    res.writeHead(200, {
      "content-type": "audio/wav",
      "content-length": audioBuffer.byteLength,
      "cache-control": "no-store",
    });
    res.end(Buffer.from(audioBuffer));
  } catch (error) {
    sendJson(res, 502, { error: "MLX Audio TTS unreachable.", detail: error.message });
  }
}

async function serveStatic(req, res) {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host}`);
  const pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(filePath);
    const type = contentTypes.get(extname(filePath)) || "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    res.end(file);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

async function serveStaticFile(req, res, filename, contentType) {
  const filePath = join(publicDir, filename);
  try {
    const file = await readFile(filePath);
    res.writeHead(200, { "content-type": contentType });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/api/settings") {
    void handleSettingsGet(res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/settings") {
    void handleSettingsUpdate(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/chat") {
    const reqId = nextReqId();
    const startTime = Date.now();
    res.setHeader("X-Request-Id", reqId);
    console.log(`[DIAG-REQ] ${reqId} START method=POST url=/api/chat time=${startTime}`);

    req.on("close", () => {
      console.log(`[DIAG-REQ] ${reqId} REQ-CLOSE elapsed=${Date.now() - startTime}ms`);
    });
    res.on("finish", () => {
      console.log(`[DIAG-REQ] ${reqId} RES-FINISH status=${res.statusCode} elapsed=${Date.now() - startTime}ms`);
    });
    res.on("close", () => {
      console.log(`[DIAG-REQ] ${reqId} RES-CLOSE status=${res.statusCode} elapsed=${Date.now() - startTime}ms`);
    });
    res.on("error", (err) => {
      console.log(`[DIAG-REQ] ${reqId} RES-ERROR ${err.message}`);
    });

    void handleChat(req, res, reqId);
    return;
  }

  if (req.method === "POST" && req.url === "/api/save") {
    void handleSave(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/new-chat") {
    void handleNewChat(req, res);
    return;
  }

  if (req.method === "GET" && req.url === "/api/voice-config") {
    handleVoiceConfig(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/voice/tts") {
    void handleVoiceTtsProxy(req, res);
    return;
  }

  if (req.method === "GET" && req.url === "/favicon.ico") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    void serveStatic(req, res);
    return;
  }

  res.writeHead(405, { allow: "GET, HEAD, POST" });
  res.end("Method not allowed");
});

// Initialize chat system and start server
await initializeChat();
await loadVoiceConfig();

server.listen(PORT, HOST, () => {
  console.log(`Standalone bot listening on http://${HOST}:${PORT}`);
  console.log(`Using OpenRouter for chat (settings: ${OPENROUTER_SETTINGS_PATH})`);
});
