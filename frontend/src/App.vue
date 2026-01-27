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
        type='audio/mp3'
        @error="audioError"
        :src="STREAM_URI"
      />

      <div class="controls">
        <button class="btn" @click="createRipple($event); skip()">⏭ Skip</button>
        <button class="btn" @click="createRipple($event); pause()">⏸ Pause</button>
        <button class="btn primary" @click="createRipple($event); resume()">▶ Resume</button>
      </div>

      <div class="footer">
        <span>👥 {{ listeners }} listener(s)</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const API = `${window.location.protocol}//api.${window.location.hostname}`;
const STREAM_URI = `${API}/`;

const track = ref('');
const listeners = ref(0);

async function refresh() {
  const res = await fetch(`${API}/now-playing`);
  const data = await res.json();
  track.value = data.track;
  listeners.value = data.listeners;
}

async function skip() {
  await fetch(`${API}/skip`, { method: 'POST' });
}

async function pause() {
  await fetch(`${API}/pause`, { method: 'POST' });
}

async function resume() {
  await fetch(`${API}/resume`, { method: 'POST' });
}

async function audioError (err) {
    console.error(err)
    err.target.setAttribute('src', STREAM_URI)
    err.target.play().catch(console.error)
}

function createRipple(event) {
  const button = event.currentTarget;

  // Create ripple element
  const ripple = document.createElement('span');
  ripple.classList.add('ripple');

  // Position the ripple
  const rect = button.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const x = event.clientX - rect.left - size / 2;
  const y = event.clientY - rect.top - size / 2;

  ripple.style.width = ripple.style.height = `${size}px`;
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;

  // Add ripple to button
  button.appendChild(ripple);

  // Remove ripple after animation
  setTimeout(() => {
    ripple.remove();
  }, 600);
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
  --ripple-color: rgba(255, 255, 255, 0.4);
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
  padding: 1rem;
}

.card {
  width: 100%;
  max-width: 420px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 1rem;
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* Header */
.header {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.logo {
  font-size: 1.75rem;
}

.title h1 {
  margin: 0;
  font-size: 1.1rem;
}

.subtitle {
  font-size: 0.75rem;
  color: var(--muted);
}

/* Now playing */
.now-playing {
  background: #0d1117;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.6rem 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.label {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}

.track {
  font-size: 0.85rem;
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
  gap: 0.5rem;
}

.btn {
  background: #21262d;
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.5rem 0.6rem;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s ease;
  position: relative;
  overflow: hidden;
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

/* Ripple effect */
.ripple {
  position: absolute;
  border-radius: 50%;
  background-color: var(--ripple-color);
  transform: scale(0);
  animation: ripple 0.6s linear;
  pointer-events: none;
}

@keyframes ripple {
  to {
    transform: scale(4);
    opacity: 0;
  }
}

/* Footer */
.footer {
  font-size: 0.7rem;
  color: var(--muted);
  text-align: center;
}

/* Responsive adjustments */
@media (max-width: 480px) {
  .app {
    padding: 0.5rem;
  }

  .card {
    padding: 0.75rem;
    gap: 0.75rem;
  }

  .logo {
    font-size: 1.5rem;
  }

  .title h1 {
    font-size: 1rem;
  }

  .now-playing {
    padding: 0.5rem 0.75rem;
  }

  .label {
    font-size: 0.6rem;
  }

  .track {
    font-size: 0.8rem;
  }

  .controls {
    gap: 0.35rem;
  }

  .btn {
    padding: 0.4rem 0.5rem;
    font-size: 0.7rem;
  }

  .footer {
    font-size: 0.65rem;
  }
}
</style>
