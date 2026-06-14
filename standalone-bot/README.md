# Standalone Bot

A clean, standalone local chatbot. It does not use or depend on `chatbot-lisa`.

## Run

From the repo root, `npm start` is a convenience launcher that forwards to the bot:

```sh
npm start
```

Or run it directly from the bot directory:

```sh
cd standalone-bot
npm start
```

Open `http://127.0.0.1:3320`.

By default the server calls Ollama at `http://127.0.0.1:11434` with model `Lisa-The-Bot:latest` — a custom Modelfile personality built on `hf.co/llmfan46/Qwen3.6-35B-A3B-uncensored-heretic-GGUF:Q4_K_S` with vision capabilities.

Stop it with `Ctrl-C` in the terminal that launched it.

## HTTPS Access

While the bot is running, expose it on the tailnet with:

```sh
npm run serve:https
```

That maps `https://farm.typhon-kelvin.ts.net:3320/` to the local bot.

## Optional Background Mode

```sh
cd standalone-bot
npm run start:detached
npm run stop
```

The background helper writes `server.log` and `.server.pid`, but the normal workflow is foreground `npm start`.

## Configuration

```sh
PORT=3320 OLLAMA_URL=http://127.0.0.1:11434 OLLAMA_MODEL=Lisa-The-Bot:latest npm start
```

You can also change the model from the app sidebar dropdown (populated from your installed Ollama models) before sending a message.

The persona is defined entirely by the `Lisa-The-Bot` Modelfile. The server sends no system message by default; set `SYSTEM_PROMPT` only if you deliberately want to override the Modelfile.

## Web search

A "Search web" button runs the query, injects the results as ephemeral context into the message sent to Lisa, and discards them (they never enter chat history). Without a key it uses DuckDuckGo instant answers; for better results set an Exa key:

```sh
EXA_API_KEY=your_key npm start
```

## Tests

```sh
npm test
```

Runs the message-assembly acceptance test (no Ollama needed). See `lisa-chat.js` for the persistent/ephemeral split: retrieved reference text is injected per call and never stored in conversation history.
