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

By default the server calls Ollama at `http://127.0.0.1:11434` with model `qwen3:4b`.

Stop it with `Ctrl-C` in the terminal that launched it.

## Optional Background Mode

```sh
cd standalone-bot
npm run start:detached
npm run stop
```

The background helper writes `server.log` and `.server.pid`, but the normal workflow is foreground `npm start`.

## Configuration

```sh
PORT=3320 OLLAMA_URL=http://127.0.0.1:11434 OLLAMA_MODEL=qwen3:4b npm start
```

You can also change the model from the app sidebar before sending a message.
