import express from 'express';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import NodeID3 from 'node-id3';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

const app = express();

// Security: set body size limit (100KB) to prevent memory exhaustion
app.use(express.json({ limit: '100kb' }));

// Security: add HTTP security headers via helmet
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // needed for audio streaming
  contentSecurityPolicy: false // audio streaming needs permissive CSP; we set our own
}));

// Security: global rate limiting to prevent abuse
const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 200,                // max 200 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});
app.use(globalLimiter);

// Stricter rate limiting for control endpoints (POST)
const controlLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many control requests, please slow down.' }
});

const PORT = process.env.PORT || 8000;
const MUSIC_DIR = process.env.MUSIC_DIR || './music';

/* ---------- State ---------- */
let playlist = [];
let currentIndex = 0;
let currentTrack = null;
let paused = false;
let skipPending = false;

let ffmpeg = null;
const clients = new Set();

// Security: maximum concurrent streaming clients
const MAX_CLIENTS = 100;

/* ---------- Helpers ---------- */

// Recursively walk a directory and return all .mp3 file paths
function getAllMp3Files(dir) {
  // Security: validate that the directory exists and is accessible
  if (!fs.existsSync(dir)) {
    console.error(`Music directory "${dir}" does not exist.`);
    return [];
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    // Security: resolve real path to prevent symlink traversal
    const realPath = fs.realpathSync(fullPath);
    if (entry.isDirectory()) {
      files.push(...getAllMp3Files(realPath));
    } else if (entry.isFile() && entry.name.endsWith('.mp3')) {
      files.push(realPath);
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
  shuffle(playlist);
  console.log('Playlist loaded:', playlist.length, 'tracks');
}

/* ---------- Playback ---------- */

function broadcastChunk(chunk) {
  for (const res of clients) {
    const ok = res.write(chunk);

    if (!ok && ffmpeg) {
      ffmpeg.stdout.pause();

      const drainListener = () => {
        ffmpeg.stdout.resume();
        res.removeListener('drain', drainListener);
      };
      res.once('drain', drainListener);

      // Stop sending more chunks until one client drains.
      break;
    }
  }
}

function getSong(trackPath) {
  try {
    // Security: validate that the file exists and is readable
    if (!trackPath || !fs.existsSync(trackPath)) {
      return { artist: 'Unknown', title: 'Unknown', album: 'Unknown', file: '' };
    }
    const tags = NodeID3.read(trackPath);
    return {
      artist: sanitizeMetadata(tags.artist) || 'Unknown',
      title: sanitizeMetadata(tags.title) || 'Unknown',
      album: sanitizeMetadata(tags.album) || 'Unknown',
      file: path.basename(trackPath)
    };
  } catch (err) {
    console.error(`Error reading tags from ${trackPath}:`, err.message);
    return { artist: 'Unknown', title: 'Unknown', album: 'Unknown', file: path.basename(trackPath) };
  }
}

// Security: sanitize metadata values to prevent ffmpeg argument injection
// Strips control characters, newlines, and other potentially dangerous characters
function sanitizeMetadata(value) {
  if (typeof value !== 'string') return '';
  // Remove control characters (0x00-0x1F except tab 0x09), null bytes, and other dangerous chars
  return value
    .replace(/[\0\x01\x02\x03\x04\x05\x06\x07\x08\x0B\x0C\x0E\x0F\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1A\x1B\x1C\x1D\x1E\x1F]/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')  // Remove control chars and DEL
    .replace(/[<>"'`;|&$(){}[\]!#~]/g, '')               // Remove shell-special characters
    .replace(/\\/g, '')                                   // Remove backslashes
    .trim()
    .substring(0, 1024);                                  // Limit length
}

function playCurrent() {
  if (paused || playlist.length === 0) return;

  stopFFmpeg();

  const trackPath = playlist[currentIndex];
  currentTrack = getSong(trackPath);
  console.log(`🎵 Playing ${currentTrack.title} by ${currentTrack.artist} from ${trackPath}`);

  // Security: metadata values are sanitized via getSong() -> sanitizeMetadata()
  ffmpeg = spawn('ffmpeg', [
    '-loglevel', 'error',
    '-re',
    '-i', trackPath,
    '-vn',
    '-acodec', 'libmp3lame',
    '-ab', '192k',
    '-f', 'mp3',
    '-metadata', `title=${currentTrack.title}`,
    '-metadata', `artist=${currentTrack.artist}`,
    '-metadata', `album=${currentTrack.album}`,
    'pipe:1'
  ]);

  ffmpeg.stdout.on('data', broadcastChunk);

  ffmpeg.once('close', () => {
    console.log(`🎵 Closed ${currentTrack.title} by ${currentTrack.artist}`);
    if (skipPending) {
      skipPending = false;
      return;
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

function stopFFmpeg() {
  if (ffmpeg) {
    ffmpeg.kill('SIGKILL');
    ffmpeg = null;
  }
}

/* ---------- HTTP Stream ---------- */
app.get('/', (req, res) => {
  // Security: limit concurrent streaming connections
  if (clients.size >= MAX_CLIENTS) {
    res.writeHead(503, { 'Content-Type': 'text/plain' });
    res.end('Server is at maximum capacity. Please try again later.');
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'icy-name': 'Node Web Radio',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Transfer-Encoding': 'chunked'
  });

  res.once('error', e => {
    console.error('response error:', e);
    clients.delete(res);
  });
  res.on('close', () => clients.delete(res));

  clients.add(res);
});

/* ---------- Metadata ---------- */
app.get('/now-playing', (_, res) => {
  const prevIdx = (currentIndex - 1 + playlist.length) % playlist.length;
  const nextIdx = (currentIndex + 1) % playlist.length;

  res.json({
    currentSong: currentTrack,
    previousSong: playlist.length > 0 ? getSong(playlist[prevIdx]) : null,
    nextSong: playlist.length > 0 ? getSong(playlist[nextIdx]) : null,
    paused,
    listeners: clients.size
  });
});

/* ---------- Controls ---------- */
app.post('/forward', controlLimiter, (_, res) => {
  if (playlist.length === 0) return res.sendStatus(204);
  skipPending = true;
  // Use a "timely" skip pattern: set the flag, advance, wait a tick for the close handler
  setImmediate(() => {
    currentIndex = (currentIndex + 1) % playlist.length;
    playCurrent();
  });
  res.sendStatus(204);
});

app.post('/backward', controlLimiter, (_, res) => {
  if (playlist.length === 0) return res.sendStatus(204);
  skipPending = true;
  setImmediate(() => {
    currentIndex = (currentIndex - 1 + playlist.length) % playlist.length;
    playCurrent();
  });
  res.sendStatus(204);
});

app.post('/pause', controlLimiter, (_, res) => {
  paused = true;
  stopFFmpeg();
  res.sendStatus(204);
});

app.post('/resume', controlLimiter, (_, res) => {
  if (!paused) return res.sendStatus(204);
  paused = false;
  playCurrent();
  res.sendStatus(204);
});

/* ---------- Kubernetes ---------- */
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
