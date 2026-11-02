# Setting up the clinic PC

One PC in the clinic runs everything. Phones connect over the clinic Wi-Fi.

## Hardware
- NVIDIA RTX 3060 12 GB (or better), 32 GB RAM, 1 TB SSD, UPS
- A Wi-Fi router that the PC is wired to

## Software
1. Ubuntu 24.04 LTS, NVIDIA driver, Docker with the NVIDIA Container Toolkit
2. Clone this repository and build the phone app:
   ```bash
   pnpm install && pnpm bank:build && pnpm --filter @setu/pwa build
   ```
3. Download the LLM into `models/` (not in git): Qwen 3.5 9B Instruct, 4-bit GGUF (Q4_K_M), Apache-2.0.
   Set `SETU_LLM_FILE` if the file name differs from `qwen3.5-9b-instruct-q4_k_m.gguf`.
4. Generate the question audio into `content/audio/` (`services/speech/README.md`) and have a native
   speaker listen to every clip.
5. Start: `docker compose -f infra/docker-compose.yml up -d`

## HTTPS on the clinic network
Phones only allow the microphone and app install over HTTPS.
- Point `setu.local` at the PC (router DNS, or set `SETU_HOST` to the PC's name).
- Caddy issues its own certificate (`tls internal`). Install Caddy's root certificate on each clinic
  phone once: copy it out with
  `docker compose -f infra/docker-compose.yml cp web:/data/caddy/pki/authorities/local/root.crt .`
  and open it on the phone (Settings → Security → Install certificate).
- Alternatively use a real domain with a public certificate (DNS challenge), which needs no phone setup.

## Checks after start
- `https://setu.local/api/health` shows `"llm": true, "speech": true`
- On a phone: open `https://setu.local`, add to home screen, answer one test interview
- Doctor page: `https://setu.local/#/doctor`
