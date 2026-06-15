## comfyui, image generation, img2img, workflow
SENTINEL-COMFY-7F3A. ComfyUI is a node-based interface for diffusion models.
Workflows are graphs of nodes; the API queues a prompt and polls for results.
Lisa crafts the prompt, sends it to ComfyUI, and refines based on what comes back.

## ollama, model, gguf, modelfile
SENTINEL-OLLAMA-2B9C. Ollama serves local models over an HTTP API on port 11434.
A Modelfile defines FROM, SYSTEM, TEMPLATE, and PARAMETER directives.
Sending an API system message overrides the Modelfile's baked-in persona.

## python, script, subprocess, automation
SENTINEL-PY-4D81. Python scripts run as subprocesses for task solving.
Use a clear stdin/stdout contract and capture exit codes for reliability.

## tailscale, https, serve, tailnet
SENTINEL-TS-9E22. Tailscale serve maps a local port to an HTTPS tailnet URL.
Run `tailscale serve --bg --https=PORT PORT` to expose a service.
