## comfyui, image generation, img2img, workflow
SENTINEL-COMFY-7F3A. ComfyUI is a node-based interface for diffusion models.
Workflows are graphs of nodes; the API queues a prompt and polls for results.
Lisa crafts the prompt, sends it to ComfyUI, and refines based on what comes back.

## local model, inference, provider, runtime
SENTINEL-LOCAL-MODEL-2B9C. A local inference runtime can expose models through an HTTP API.
Provider-neutral message assembly keeps Lisa's persona independent from the selected model runtime.

## python, script, subprocess, automation
SENTINEL-PY-4D81. Python scripts run as subprocesses for task solving.
Use a clear stdin/stdout contract and capture exit codes for reliability.

## tailscale, https, serve, tailnet
SENTINEL-TS-9E22. Tailscale serve maps a local port to an HTTPS tailnet URL.
Run `tailscale serve --bg --https=PORT PORT` to expose a service.
