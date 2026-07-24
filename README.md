# Node Web Radio

An MP3 streaming radio server built with **Node.js** and **Express.js**. It reads MP3 files from a configurable directory, re-encodes them in real time using **ffmpeg**, and broadcasts the stream to multiple concurrent HTTP clients. A **Vue.js 3** frontend (served via Caddy) provides the user interface. The application is fully containerized with Docker and supports Kubernetes deployment via Kustomize.

---

## Features

- **MP3 Streaming** – Streams audio over HTTP with `Content-Type: audio/mpeg` using chunked transfer encoding.
- **Playlist Management** – Recursively scans a music directory for `.mp3` files, shuffles them with the Fisher-Yates algorithm, and loops playback.
- **Metadata Display** – Reads ID3 tags (artist, title, album) via `node-id3` and exposes them through a `/now-playing` endpoint.
- **Playback Controls** – REST API endpoints for next track (`/forward`), previous track (`/backward`), pause (`/pause`), and resume (`/resume`).
- **Concurrent Clients** – Supports multiple listeners simultaneously; uses a broadcast pattern with back-pressure handling (pauses ffmpeg when a client cannot keep up).
- **Docker Support** – Multi-stage production and development Dockerfiles, orchestrated via Docker Compose.
- **Kubernetes Ready** – Base manifests plus Kustomize overlays for deploying to a Kubernetes cluster.
- **Graceful Shutdown** – Handles `SIGTERM` to cleanly stop ffmpeg and close the HTTP server.

---

## Architecture

```
┌──────────────┐     HTTP (audio/mpeg)     ┌───────────────┐
│              │ ◄─────────────────────── │               │
│   Clients    │                           │  Radio Server │
│  (browser/   │                           │  (Node.js +   │
│   app)       │ ────── REST API ────────► │   Express)    │
│              │   /forward, /pause, etc.   │               │
└──────────────┘                           └───────┬───────┘
                                                   │
                                                   │ spawns / pipes
                                                   ▼
                                           ┌───────────────┐
                                           │    ffmpeg      │
                                           │  (libmp3lame   │
                                           │   192k, -re)   │
                                           └───────────────┘
                                                   ▲
                                                   │ reads
                                           ┌───────────────┐
                                           │   Music Dir    │
                                           │  (.mp3 files)  │
                                           └───────────────┘

┌──────────────────────────────────────────────────────────┐
│                    Frontend (Vue.js 3)                    │
│              served by Caddy on port 3000                 │
└──────────────────────────────────────────────────────────┘
```

### Streaming Model

1. The server builds a shuffled playlist of all `.mp3` files found under `MUSIC_DIR`.
2. For each track, it spawns `ffmpeg` with the `-re` flag (real-time input rate), re-encodes to MP3 (`libmp3lame`, 192 kbps), and pipes the output to stdout.
3. Audio chunks received from ffmpeg's stdout are broadcast to every connected client via `response.write()`.
4. If a client's socket buffers are full (back-pressure), ffmpeg's stdout stream is paused until the client drains — this prevents unbounded memory growth.
5. When a track finishes, the server automatically advances to the next track and spawns a new ffmpeg process.

---

## Prerequisites

- **Node.js** 20 or later
- **npm** (ships with Node.js)
- **ffmpeg** installed and available in `PATH` (for local development)
- **Docker** and **Docker Compose** (for containerized deployment, optional)
- **kubectl** and **Kustomize** (for Kubernetes deployment, optional)

---

## Quick Start

### Using Docker Compose (recommended)

```bash
# Clone the repository
git clone <repo-url> /workspace
cd /workspace

# Edit docker-compose.yml to set your music directory volume
# (change the host path under radio-server > volumes)

# Build and start both the server and the UI
docker compose up --build -d

# The radio stream is available at:
#   http://localhost:8000
# The web UI is available at:
#   http://localhost:3000
```

### Local Development (without Docker)

```bash
# Install dependencies
npm install

# Ensure ffmpeg is installed
ffmpeg -version

# Set the music directory (defaults to ./music)
export MUSIC_DIR=/path/to/your/music
export PORT=8000

# Start the server
npm start
```

Then open `http://localhost:8000` in any media player (VLC, mpv, browser) to hear the stream.

---

## Configuration

The server is configured through environment variables:

| Variable     | Default       | Description                                |
|-------------|---------------|--------------------------------------------|
| `PORT`       | `8000`        | HTTP port the server listens on            |
| `MUSIC_DIR`  | `./music`     | Path to directory containing `.mp3` files  |

The music directory is scanned recursively for all files ending in `.mp3`. Symbolic links are not followed.

---

## API Reference

### `GET /`

Returns the live MP3 audio stream.

- **Content-Type:** `audio/mpeg`
- **Headers:** `icy-name: Node Web Radio`, `Transfer-Encoding: chunked`
- **Response:** Continuous binary audio data. Connect a media player to this endpoint.

### `GET /now-playing`

Returns metadata about the currently playing song, plus playlist context.

- **Content-Type:** `application/json`
- **Response:**

```json
{
  "currentSong": {
    "artist": "Artist Name",
    "title": "Song Title",
    "album": "Album Name",
    "file": "filename.mp3"
  },
  "previousSong": { "...": "..." },
  "nextSong": { "...": "..." },
  "paused": false,
  "listeners": 3
}
```

If there is no previous or next song, the value will be the string `"undefined"`.

### `GET /health`

Health check endpoint for Kubernetes liveness/readiness probes.

- **Response:** `healthy` (plain text, status 200)

### `POST /forward`

Skip to the next track in the playlist.

- **Response:** `204 No Content`

### `POST /backward`

Go back to the previous track in the playlist.

- **Response:** `204 No Content`

### `POST /pause`

Pause playback. Stops the current ffmpeg process. The stream endpoint will no longer receive audio data until resumed.

- **Response:** `204 No Content`

### `POST /resume`

Resume playback after a pause. Starts a new ffmpeg process for the current track.

- **Response:** `204 No Content`

> **Note:** Because the stream is a live broadcast, paused clients will miss audio. The `/pause` and `/resume` endpoints control the single server-wide playback state, affecting all listeners.

---

## Docker Deployment

### Production Build

```bash
# Build the server image
docker build -t radio-server -f Dockerfile .

# Build the frontend image
docker build -t radio-ui -f frontend/Dockerfile frontend/
```

### Docker Compose

The `docker-compose.yml` file defines two services:

| Service        | Container Name    | Port Mapping | Description                        |
|----------------|-------------------|-------------|------------------------------------|
| `radio-server` | `web-radio-server` | `8000:8000`  | Node.js radio server + ffmpeg      |
| `radio-ui`     | `web-radio-ui`    | `3000:8080`  | Caddy-hosted Vue.js frontend       |

**Important:** Before running, update the volume mount under `radio-server` to point to your local music directory:

```yaml
volumes:
  - /path/to/your/music:/app/music:ro
```

Then start the stack:

```bash
docker compose up -d
```

A healthcheck is configured for the server that pings `http://localhost:8000/health` every 10 seconds.

---

## Kubernetes Deployment

The repository includes Kubernetes manifests using **Kustomize**.

### Directory Structure

```
k8s/
├── base/
│   ├── kustomization.yaml
│   ├── namespace.yaml
│   ├── deployment.yaml      # radio-server & radio-ui deployments
│   ├── service.yaml         # ClusterIP services
│   └── ingress.yaml         # Ingress rules
└── overlays/
    └── shokohsc/
        ├── kustomization.yaml
        ├── deployment.yaml  # Patch: NFS volume, dev mode, resources
        ├── ingress.yaml     # Patch: TLS, annotations, custom domains
        └── browser-sync/    # Optional browser-sync sidecar
```

### Deploy the Base

```bash
kubectl apply -k k8s/base
```

This creates:
- The `radio` namespace
- Deployments for `radio-server` and `radio-ui`
- ClusterIP services for both
- An ingress with host `radio.cluster.local` (UI) and `api.radio.cluster.local` (API)

### Deploy an Overlay

```bash
kubectl apply -k k8s/overlays/shokohsc
```

The `shokohsc` overlay applies patches that:
- Set the environment to `development`
- Mount an NFS volume for the music directory
- Increase resource limits
- Configure TLS via cert-manager and custom ingress annotations
- Set hostnames to `dev.radio.shokohsc.home` / `api.dev.radio.shokohsc.home`

> Adjust the overlay to match your cluster's storage, ingress controller, and domain.

---

## Development

### Running in Dev Mode with Nodemon

The `package.json` includes a `dev` script that uses **nodemon** to automatically restart the server when files change:

```bash
npm run dev
```

### Development Dockerfile

A separate `Dockerfile.dev` is provided for development builds. It installs all dependencies (including devDependencies) and uses the same base image:

```bash
docker build -t radio-server-dev -f Dockerfile.dev .
```

### Frontend Development

The Vue.js 3 frontend lives in the `frontend/` directory and uses Vite 5:

```bash
cd frontend
npm install
npm run dev     # Starts Vite dev server with hot module replacement
npm run build   # Production build to dist/
```

The frontend Dockerfile uses a multi-stage build: the first stage compiles the Vue app with Vite, and the second stage serves the static files via Caddy.

### Project Layout

```
/
├── index.js              # Main server (Express.js + ffmpeg)
├── package.json          # Backend dependencies & scripts
├── Dockerfile            # Production container image
├── Dockerfile.dev        # Development container image
├── docker-compose.yml    # Docker Compose orchestration
├── k8s/                  # Kubernetes manifests (base + overlays)
└── frontend/             # Vue.js 3 web UI
    ├── Dockerfile
    ├── Dockerfile.dev
    ├── Caddyfile         # Caddy server configuration
    └── vite.config.js
```

---

## How It Works (Backend Deep Dive)

### Playlist Loading

On startup, `loadPlaylist()` recursively walks `MUSIC_DIR` collecting all `.mp3` file paths, then shuffles them in place using the Fisher-Yates algorithm. The playlist is stored as an in-memory array.

### Track Playback

`playCurrent()` spawns `ffmpeg` with:
- `-re` — reads input at native frame rate (real-time)
- `-i <trackPath>` — input file
- `-vn` — strip any video streams
- `-acodec libmp3lame -ab 192k` — re-encode to MP3 at 192 kbps
- `-f mp3 pipe:1` — output MP3 to stdout

The ffmpeg stdout `data` event feeds `broadcastChunk()`, which writes each chunk to every connected client response.

### Client Management

When a client connects to `GET /`:
1. A new response object is added to a `Set` of clients.
2. The response is kept open (chunked transfer encoding).
3. On `close` or `error`, the client is removed from the set.

### Back-pressure Handling

If `res.write(chunk)` returns `false` (the socket buffer is full):
- ffmpeg's stdout is paused via `ffmpeg.stdout.pause()`.
- A `drain` listener is registered on that response.
- When the client drains, ffmpeg's stdout is resumed via `ffmpeg.stdout.resume()`.
- Only one client needs to back up for the entire broadcast to pause — this keeps memory usage bounded.

### Graceful Shutdown

On `SIGTERM`:
1. The ffmpeg process is killed.
2. The HTTP server stops accepting new connections.
3. All existing connections are closed.
4. The process exits with code 0.

---

## License

This project is provided for educational and personal use. See the LICENSE file for details.
