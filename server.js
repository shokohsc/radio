import express from 'express';
import { Station, PUBLIC_EVENTS, SHUFFLE_METHODS } from '@fridgefm/radio-core';

const PORT = process.env.APP_PORT || 8000;
const MUSIC_DIR = process.env.MUSIC_DIR || './music';

const clients = new Set()
const prebufferLength = 8;
// update currently playing track info
const state = {
  currentTrack: undefined,
  paused: false,
}
const station = new Station({
  verbose: true, 
  responseHeaders: { 
    'icy-genre': 'mixed',
  }, 
  prebufferLength
});
station.addFolder(MUSIC_DIR)
station.reorderPlaylist(SHUFFLE_METHODS.randomShuffle())
station.on(PUBLIC_EVENTS.ERROR, console.error)
station.on(PUBLIC_EVENTS.NEXT_TRACK, async (track) => {
  const result = await track.getMetaAsync();
  if (!state.currentTrack) {
    state.currentTrack = `${result.artist || '??'} - ${result.title || '??'}`;
  } else {
    // in order to compensate a lag between the server and client
    setTimeout(() => {
      state.currentTrack = `${result.artist || '??'} - ${result.title || '??'}`;
    }, prebufferLength * 1000);
  }
})

const app = express();
app.use(express.json());

/* ---------- HTTP Stream ---------- */
app.get('/', (req, res) => {
  station.connectListener(req, res)
  res.on('close', () => clients.delete(res));
  clients.add(res);
});

/* ---------- Metadata ---------- */
app.get('/now-playing', (_, res) => {
  res.json({
    track: state.currentTrack,
    paused: state.paused,
    listeners: clients.size
  });
});

/* ---------- Controls ---------- */
app.post('/skip', (_, res) => {
  station.next()
  res.sendStatus(204);
});

app.post('/pause', (_, res) => {
  const paused = station.togglePause(true);
  state.paused = paused;
  res.sendStatus(204);
});

app.post('/resume', (_, res) => {
  const paused = station.togglePause(false);
  state.paused = paused;
  res.sendStatus(204);
});

/* ---------- Kubernetes ---------- */
app.get('/health', (_, res) => res.send('healthy'));

const server = app.listen(PORT, () => {
  console.log(`🎵 Radio running on port ${PORT}`);
  station.start()
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down');
  server.close(() => process.exit(0));
});
