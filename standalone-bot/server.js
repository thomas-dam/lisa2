import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");

const PORT = Number(process.env.PORT || 3320);
const HOST = process.env.HOST || "127.0.0.1";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "Lisa-The-Bot:latest";
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || "";
const EXA_API_KEY = process.env.EXA_API_KEY || "";

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
    if (raw.length > 5_000_000) {
      throw new Error("Request body is too large.");
    }
  }
  return raw ? JSON.parse(raw) : {};
}

function cleanImages(images) {
  if (!Array.isArray(images)) {
    return undefined;
  }

  const cleaned = images
    .filter((image) => typeof image === "string" && image.length > 0)
    .map((image) => image.slice(0, 5_000_000))
    .slice(0, 4);

  return cleaned.length > 0 ? cleaned : undefined;
}

function cleanMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((message) => message && typeof message.content === "string")
    .map((message) => {
      const cleaned = {
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content.slice(0, 12_000)
      };

      if (cleaned.role === "user") {
        const images = cleanImages(message.images);
        if (images) {
          cleaned.images = images;
        }
      }

      return cleaned;
    })
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
        messages: [
          ...(SYSTEM_PROMPT ? [{ role: "system", content: SYSTEM_PROMPT }] : []),
          ...messages
        ]
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

async function handleSave(req, res) {
  try {
    const body = await readRequestJson(req);
    const messages = cleanMessages(body.messages);

    if (messages.length === 0) {
      sendJson(res, 400, { error: "Send at least one message." });
      return;
    }

    sendJson(res, 200, {
      messages,
      title: typeof body.title === "string" ? body.title.slice(0, 120) : "Standalone Bot Chat",
      savedAt: new Date().toISOString()
    });
  } catch (error) {
    sendJson(res, 500, {
      error: "Could not save the chat.",
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

async function handleModels(res) {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!response.ok) {
      sendJson(res, 502, { error: "Could not fetch models from Ollama." });
      return;
    }
    const data = await response.json();
    const models = (data.models || []).map((m) => m.name).sort();
    sendJson(res, 200, { models });
  } catch {
    sendJson(res, 502, { error: "Could not reach Ollama." });
  }
}

async function handleSearch(req, res) {
  const { searchParams } = new URL(req.url, "http://localhost");
  const query = (searchParams.get("q") || "").trim();
  if (!query) {
    sendJson(res, 400, { error: "Missing search query." });
    return;
  }
  try {
    let results = [];
    if (EXA_API_KEY) {
      const r = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": EXA_API_KEY },
        body: JSON.stringify({ query, numResults: 5, contents: { text: { maxCharacters: 800 } } })
      });
      const data = await r.json();
      results = (data.results || []).map((item) => ({
        title: item.title,
        url: item.url,
        snippet: (item.text || "").trim()
      }));
    } else {
      const r = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
      );
      const data = await r.json();
      if (data.Answer) results.push({ snippet: data.Answer });
      if (data.AbstractText) results.push({ title: data.Heading, snippet: data.AbstractText, url: data.AbstractURL });
      for (const t of (data.RelatedTopics || []).slice(0, 4)) {
        if (t.Text) results.push({ snippet: t.Text, url: t.FirstURL });
      }
    }
    sendJson(res, 200, { query, results });
  } catch (err) {
    sendJson(res, 502, { error: "Search failed.", detail: err.message });
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

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/api/config") {
    handleConfig(res);
    return;
  }

  if (req.method === "GET" && req.url === "/api/models") {
    void handleModels(res);
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/search")) {
    void handleSearch(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/chat") {
    void handleChat(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/save") {
    void handleSave(req, res);
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
