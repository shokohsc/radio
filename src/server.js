// server.js
import express from 'express'
import { PassThrough } from 'stream'
import fs from 'fs'
import path from 'path'

import ffmpeg from 'fluent-ffmpeg'
import ffmpegPath from 'ffmpeg-static'

const app = express();
const PORT = 8000;

ffmpeg.setFfmpegPath(ffmpegPath);

const playlistDir = '/music';
const playlist = fs
  .readdirSync(playlistDir)
  .filter(f => f.endsWith('.mp3'))
  .map(f => path.join(playlistDir, f));

let clients = [];
let currentTrack = 0;

function startRadio() {
  const stream = new PassThrough();

  function playNext() {
    const track = playlist[currentTrack];
    currentTrack = (currentTrack + 1) % playlist.length;

    ffmpeg(track)
      .audioBitrate(128)
      .format('mp3')
      .on('end', playNext)
      .pipe(stream, { end: false });
  }

  playNext();

  stream.on('data', chunk => {
    clients.forEach(res => res.write(chunk));
  });
}

startRadio();

app.get('/', (req, res) => {
  res.writeHead(200);
  res.end()
});

app.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  clients.push(res);

  req.on('close', () => {
    clients = clients.filter(c => c !== res);
  });
});

app.get('/now-playing', (_, res) => {
  res.json({
    track: path.basename(playlist[currentTrack]),
  });
});

app.listen(PORT, () => {
  console.log(`🎵 Radio running on http://localhost:${PORT}/stream`);
});
