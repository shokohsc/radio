<template>
  <div class="app">
    <div class="card">
      <div class="header">
        <div class="logo">📻</div>
        <div class="title">
          <h1>Node Web Radio</h1>
          <span class="subtitle">Live broadcast</span>
        </div>
      </div>

      <div class="now-playing">
        <span class="label">Now playing</span>
        <span class="track" :title="track">{{ track || '—' }}</span>
      </div>

      <audio
        ref="player"
        controls
        autoplay
        :src="STREAM_URI"
      />

      <div class="controls">
        <button class="btn" @click="skip">⏭ Skip</button>
        <button class="btn" @click="pause">⏸ Pause</button>
        <button class="btn primary" @click="resume">▶ Resume</button>
      </div>

      <div class="footer">
        <span>👥 {{ listeners }} listener(s)</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const API = `${window.location.protocol}//${window.location.hostname}`;
const STREAM_URI = `${API}/stream`;

const track = ref('');
const listeners = ref(0);

async function refresh() {
  const res = await fetch(`${API}/now-playing`);
  const data = await res.json();
  track.value = data.track;
  listeners.value = data.listeners;
}

async function skip() {
  await fetch(`${API}/control/skip`, { method: 'POST' });
}

async function pause() {
  await fetch(`${API}/control/pause`, { method: 'POST' });
}

async function resume() {
  await fetch(`${API}/control/resume`, { method: 'POST' });
}

onMounted(() => {
  refresh();
  setInterval(refresh, 4000);
});
</script>

<style>
:root {
  --bg: #0e1117;
  --card: #161b22;
  --border: #30363d;
  --text: #e6edf3;
  --muted: #8b949e;
  --accent: #58a6ff;
  --accent-hover: #79c0ff;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: radial-gradient(circle at top, #161b22, #0e1117);
  color: var(--text);
  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
}

.app {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 1.5rem;
}

.card {
  width: 100%;
  max-width: 420px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 1.5rem;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* Header */
.header {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.logo {
  font-size: 2rem;
}

.title h1 {
  margin: 0;
  font-size: 1.25rem;
}

.subtitle {
  font-size: 0.85rem;
  color: var(--muted);
}

/* Now playing */
.now-playing {
  background: #0d1117;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}

.track {
  font-size: 0.95rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Audio */
audio {
  width: 100%;
  filter: invert(90%) hue-rotate(180deg);
}

/* Controls */
.controls {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
}

.btn {
  background: #21262d;
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.6rem 0.75rem;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn:hover {
  background: #30363d;
}

.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #000;
}

.btn.primary:hover {
  background: var(--accent-hover);
}

/* Footer */
.footer {
  font-size: 0.8rem;
  color: var(--muted);
  text-align: center;
}
</style>
