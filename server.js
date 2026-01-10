import express from 'express';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8000;
const MUSIC_DIR = process.env.MUSIC_DIR || './music';

/* ---------- State ---------- */
let playlist = [];
let currentIndex = 0;
let currentTrack = null;
let paused = false;
let skipPending = false; // New flag to track pending skips

let ffmpeg = null;
const clients = new Set();

/* ---------- Helpers ---------- */

// Recursively walk a directory and return all .mp3 file paths
function getAllMp3Files(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllMp3Files(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.mp3')) {
      files.push(fullPath);
    }
  }
  return files;
}

// Fisher‑Yates shuffle (in‑place)
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

/* ---------- Playlist ---------- */

function loadPlaylist() {
  playlist = getAllMp3Files(MUSIC_DIR);
  shuffle(playlist); // random order
  console.log('Playlist loaded:', playlist.length, 'tracks');
}

/* ---------- Playback ---------- */

// A tiny helper that pauses the ffmpeg stream when any client can’t keep
// up, and resumes when that client signals ‘drain’.
function broadcastChunk(chunk) {
  for (const res of clients) {
    // Write to the socket – it returns false if the internal buffer is full.
    const ok = res.write(chunk);

    res.on('error', () => clients.delete(res));
    if (!ok) {
      // Pause ffmpeg output until the socket drains.
      ffmpeg.stdout.pause();

      // Resume ffmpeg once the socket is ready again.
      res.once('drain', () => {
        ffmpeg.stdout.resume();
      });

      // Once we hit *any* back‑pressure, we only need to resume once.
      // The `once` above guarantees we resume only once per pause.
      break;
    }
  }
}

function playCurrent(signal = 'SIGKILL') {
  if (paused || playlist.length === 0) return;

  stopFFmpeg(signal);

  const trackPath = playlist[currentIndex];
  currentTrack = path.basename(trackPath);

  ffmpeg = spawn('ffmpeg', [
    '-loglevel', 'error',
    '-re',
    '-i', trackPath,
    '-vn',
    '-acodec', 'libmp3lame',
    '-ab', '128k',
    '-f', 'mp3',
    'pipe:1'
  ]);

  ffmpeg.stdout.on('data', broadcastChunk);

  ffmpeg.once('close', () => {
    if (skipPending) {        // Check flag
      skipPending = false;    // We already moved on
      return;                 // Exit early
    }

    if (!paused) {
      currentIndex = (currentIndex + 1) % playlist.length;
      playCurrent();
    }
  });

  ffmpeg.on('error', err => {
    console.error('ffmpeg spawn error:', err);
    if (!skipPending) {
      currentIndex = (currentIndex + 1) % playlist.length;
      playCurrent();
    }
});
}

function stopFFmpeg(signal = 'SIGKILL') {
  if (ffmpeg) {
    ffmpeg.kill(signal);
    ffmpeg = null;
  }
}

/* ---------- HTTP Stream ---------- */
app.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'icy-name': 'Node Web Radio',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  clients.add(res);

  req.on('close', () => {
    clients.delete(res);
  });
});

/* ---------- Metadata ---------- */
app.get('/now-playing', (_, res) => {
  res.json({
    track: currentTrack,
    paused,
    listeners: clients.size
  });
});

/* ---------- Controls ---------- */
app.post('/control/skip', (_, res) => {
  skipPending = true;                 // tell the handler to ignore its own close
  currentIndex = (currentIndex + 1) % playlist.length;
  playCurrent();
  res.sendStatus(204);
});

app.post('/control/pause', (_, res) => {
  paused = true;
  stopFFmpeg();
  res.sendStatus(204);
});

app.post('/control/resume', (_, res) => {
  if (!paused) return res.sendStatus(204);
  paused = false;
  playCurrent();
  res.sendStatus(204);
});

/* ---------- Kubernetes ---------- */
app.get('/', (_, res) => res.send('OK'));
app.get('/health', (_, res) => res.send('healthy'));

const server = app.listen(PORT, () => {
  console.log(`🎵 Radio running on port ${PORT}`);
  loadPlaylist();
  playCurrent();
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down');
  stopFFmpeg();
  server.close(() => process.exit(0));
});
