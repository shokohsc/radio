<script setup>
import { ref, onMounted, onBeforeUnmount } from "vue";

const audio = ref(null);
const currentSong = ref("Connecting...");
let ws;

function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const wsPort = "443";

  ws = new WebSocket(`${proto}://${location.hostname}:${wsPort}`);

  ws.onmessage = (event) => {
    const { song, startedAt } = JSON.parse(event.data);
    currentSong.value = song;
    syncPlayback(startedAt);
  };

  ws.onclose = () => {
    setTimeout(connect, 2000);
  };
}


function syncPlayback(startedAt) {
  const offset = Math.max(0, (Date.now() - startedAt) / 1000);

  audio.value.src = "/stream";
  audio.value.load();

  audio.value.onloadedmetadata = () => {
    audio.value.currentTime = offset;
    audio.value.play().catch(() => {});
  };
}


async function next() {
    await fetch("/next", { method: "POST" });
}

async function prev() {
    await fetch("/prev", { method: "POST" });
}

onMounted(connect);
onBeforeUnmount(() => ws && ws.close());
</script>

<template>
    <div class="radio">
        <h1>📻 Live Radio</h1>
        <p class="song">{{ currentSong }}</p>

        <audio ref="audio" controls autoplay />

        <div class="controls">
            <button @click="prev">⏮ Previous</button>
            <button @click="next">⏭ Next</button>
        </div>
    </div>
</template>

<style>
body {
    margin: 0;
    background: #111;
    color: #eee;
    font-family: system-ui, sans-serif;
}

.radio {
    max-width: 420px;
    margin: 60px auto;
    text-align: center;
}

.song {
    opacity: 0.8;
    margin-bottom: 20px;
}

.controls button {
    margin: 10px;
    padding: 10px 16px;
    font-size: 16px;
    cursor: pointer;
}
</style>
