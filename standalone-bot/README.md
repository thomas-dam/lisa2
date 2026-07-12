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

The server calls OpenRouter for chat. On first use, enter an OpenRouter API key and model slug in the sidebar. The default model is `openai/gpt-4.1-mini`.

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
PORT=3320 OPENROUTER_API_KEY=sk-or-v1-example OPENROUTER_MODEL=openai/gpt-4.1-mini npm start
```

You can change the key and model slug from the app sidebar. Saved settings live in the gitignored `config/openrouter.json`; the API never returns the saved key.

The canonical persona is `spec/lisa.md` and is sent as the first system message. To deliberately override it for development, set `SYSTEM_PROMPT`:

```sh
SYSTEM_PROMPT="You are Lisa. Warm, dry, confident. Keep replies short." npm start
```

## Tests

```sh
npm test
```

Runs the provider, persona, routing, and message-assembly tests without making live OpenRouter calls. See `lisa-chat.js` for the persistent/ephemeral split: retrieved reference text is injected per call and never stored in conversation history.
