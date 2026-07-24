# Node Web Radio — Agent Guide

## Entrypoints

- **Backend:** `/workspace/index.js` — single Express.js server (ESM, `"type": "module"`)
- **Frontend:** `/workspace/frontend/src/App.vue` — Vue 3 SPA, built with Vite 5
- **K8s base:** `kubectl apply -k k8s/base` — deploys `radio` namespace, both deployments, services, ingress

## Commands

| Context | Command | Notes |
|---|---|---|
| Backend dev | `npm run dev` | nodemon auto-restart on file change |
| Backend prod | `npm start` | plain `node ./index.js` |
| Frontend dev | `cd frontend && npm run dev` | Vite HMR on port 80 (host: true) |
| Frontend build | `cd frontend && npm run build` | Outputs to `frontend/dist/` |
| Docker | `docker compose up --build -d` | Builds both server + UI |
| Kustomize base | `kubectl apply -k k8s/base` | Creates `radio` namespace |
| Kustomize overlay | `kubectl apply -k k8s/overlays/shokohsc` | Patches for NFS, TLS, dev settings |

## Critical Architecture Facts

- **Frontend constructs API URL from hostname:** `const API = \`\${window.location.protocol}//api.\${window.location.hostname}\`` — requires an `api.*` subdomain pointing at the backend. Local dev needs DNS/hosts entry.
- **No tests, linter, formatter, or typechecker configured** anywhere in the repo.
- **The backend is stateful (in-memory):** playlist, currentIndex, paused flag, client Set. Restarting resets everything.
- **Streaming model:** One ffmpeg process at a time; audio chunks broadcast to all connected clients. Back-pressure pauses ffmpeg stdout until the slowest client drains.

## Required External Deps

- `ffmpeg` must be in `PATH` for local dev. Docker images install it via `apk add ffmpeg`.
- `MUSIC_DIR` env var (default `./music`) — recursively scanned for `.mp3` files at startup.

## Security & Config Quirks

- Dependencies include `helmet` + `express-rate-limit`. Global: 200 req/min/IP. POST endpoints: 30 req/min/IP.
- Max 100 concurrent streaming clients (`MAX_CLIENTS = 100`).
- ID3 metadata is sanitized via `sanitizeMetadata()` before passing to ffmpeg `-metadata` args.
- Dockerfiles pin `node:20-alpine` with SHA256 digest, run as non-root `radio` user.
- Frontend Caddy config sets CSP that allows `connect-src 'self' https://api.*` — frontend expects to call an `api.*` subdomain.
- `start-caddy.sh` does runtime env injection (substitutes `// CONFIGURATIONS_PLACEHOLDER` in index.html).
- **skaffold.yaml prod profile** (`/workspace/skaffold.yaml:117`) contains a hardcoded Sentry auth token — treat as sensitive, do not commit to public repos.

## Docker Compose

- Two services: `radio-server` (port 8000) and `radio-ui` (port 3000 → 80).
- Radio server mounts `./music:/app/music:ro` — change the host path to your music directory.
- Both run as non-root (`user: radio` / `user: caddy`), `no-new-privileges:true`.

## K8s Details

- Base ingress routes `radio.cluster.local` → UI, `api.radio.cluster.local` → server.
- Overlay (`shokohsc`) patches to `dev.radio.shokohsc.home`, adds TLS via cert-manager, NFS volume, and security contexts (`runAsNonRoot`, `readOnlyRootFilesystem`, drop all capabilities).
- radio-server in overlay needs `NET_BIND_SERVICE` capability for privileged-port binding (none needed — service port 80 maps to container port 8000). Browser-sync sidecar also available.
- Radio-server overlay uses `args: ["npm", "run", "dev"]` (nodemon mode for dev overlay).
