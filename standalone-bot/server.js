import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");

const PORT = Number(process.env.PORT || 3320);
const HOST = process.env.HOST || "127.0.0.1";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen3:4b";
const SYSTEM_PROMPT =
  process.env.SYSTEM_PROMPT ||
  "You are a concise, practical assistant. Ask clarifying questions only when needed.";

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"]
]);

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

async function readRequestJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) {
      throw new Error("Request body is too large.");
    }
  }
  return raw ? JSON.parse(raw) : {};
}

function cleanMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((message) => message && typeof message.content === "string")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content.slice(0, 12_000)
    }))
    .slice(-20);
}

async function handleChat(req, res) {
  try {
    const body = await readRequestJson(req);
    const messages = cleanMessages(body.messages);

    if (messages.length === 0) {
      sendJson(res, 400, { error: "Send at least one message." });
      return;
    }

    const ollamaResponse = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: body.model || OLLAMA_MODEL,
        stream: false,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages]
      })
    });

    if (!ollamaResponse.ok) {
      const detail = await ollamaResponse.text();
      sendJson(res, 502, {
        error: "The local model server returned an error.",
        detail: detail.slice(0, 500)
      });
      return;
    }

    const data = await ollamaResponse.json();
    sendJson(res, 200, {
      reply: data?.message?.content || "",
      model: data?.model || body.model || OLLAMA_MODEL
    });
  } catch (error) {
    sendJson(res, 500, {
      error:
        error instanceof SyntaxError
          ? "Invalid JSON request."
          : "Could not reach the local model server.",
      detail: error.message
    });
  }
}

function handleConfig(res) {
  sendJson(res, 200, {
    model: OLLAMA_MODEL,
    ollamaUrl: OLLAMA_URL
  });
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

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/api/config") {
    handleConfig(res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/chat") {
    void handleChat(req, res);
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    void serveStatic(req, res);
    return;
  }

  res.writeHead(405, { allow: "GET, HEAD, POST" });
  res.end("Method not allowed");
});

server.listen(PORT, HOST, () => {
  console.log(`Standalone bot listening on http://${HOST}:${PORT}`);
  console.log(`Using Ollama model ${OLLAMA_MODEL} at ${OLLAMA_URL}`);
});
