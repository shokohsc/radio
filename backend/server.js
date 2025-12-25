import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import { WebSocketServer } from "ws";
import cors from "cors";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MUSIC_DIR = process.env.MUSIC_DIR || "/music";
const PORT = 3000;

const app = express();
app.use(cors());

app.use(express.static(path.join(__dirname, "../frontend/dist")));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let playlist = [];
let index = 0;
let startedAt = Date.now();
let durationMs = 0;

/* ---------- Playlist ---------- */

function loadSongs() {
  playlist = fs
    .readdirSync(MUSIC_DIR)
    .filter((f) => /\.(mp3|ogg|wav)$/i.test(f))
    .map((f) => ({
      name: f,
      path: path.join(MUSIC_DIR, f),
    }));

  playlist.sort(() => Math.random() - 0.5);
}

function currentSong() {
  console.log(playlist[index]);
  return playlist[index];
}

function nextSong() {
  index = (index + 1) % playlist.length;
  startedAt = Date.now();
  durationMs = 0;
  broadcast();
}

function prevSong() {
  index = (index - 1 + playlist.length) % playlist.length;
  startedAt = Date.now();
  durationMs = 0;
  broadcast();
}

/* ---------- Streaming ---------- */

app.get("/stream", (req, res) => {
  const song = currentSong();
  const stat = fs.statSync(song.path);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (!range) {
    res.writeHead(200, {
      "Content-Type": "audio/mpeg",
      "Content-Length": fileSize,
    });
    fs.createReadStream(song.path).pipe(res);
    return;
  }

  const parts = range.replace(/bytes=/, "").split("-");
  const start = parseInt(parts[0], 10);
  const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

  const chunkSize = end - start + 1;

  res.writeHead(206, {
    "Content-Range": `bytes ${start}-${end}/${fileSize}`,
    "Accept-Ranges": "bytes",
    "Content-Length": chunkSize,
    "Content-Type": "audio/mpeg",
  });

  fs.createReadStream(song.path, { start, end }).pipe(res);
});

/* ---------- Controls ---------- */

app.post("/next", (_, res) => {
  nextSong();
  res.json({ ok: true });
});

app.post("/prev", (_, res) => {
  prevSong();
  res.json({ ok: true });
});

/* ---------- WebSocket Sync ---------- */

function broadcast() {
  const payload = JSON.stringify({
    song: currentSong().name,
    startedAt,
  });

  wss.clients.forEach((c) => c.readyState === 1 && c.send(payload));
}

wss.on("connection", (ws) => {
  ws.send(
    JSON.stringify({
      song: currentSong().name,
      startedAt,
    })
  );
});

/* ---------- Auto advance ---------- */

setInterval(() => {
  if (Date.now() - startedAt > durationMs && durationMs) {
    nextSong();
  }
}, 1000);

/* ---------- Boot ---------- */

loadSongs();

app.get("*", (_, res) => {
  res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
});

server.listen(PORT, () => console.log(`🎵 Radio running on :${PORT}`));
