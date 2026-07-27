// BGMHUD.js — Floating Music Player HUD overlay for ZolosOnline BGM control.
import { youtubeBGM } from '../engine/YouTubeBGM.js';

export function initBGMHUD() {
    // 1. Create and inject the floating music player HTML
    const bgmHud = document.createElement('div');
    bgmHud.id = 'music-player-hud';
    bgmHud.innerHTML = `
    <div class="music-track-info">
      <span class="music-icon">🎵</span>
      <div class="music-marquee">
        <span id="music-track-name">Loading...</span>
      </div>
    </div>
    <div class="music-controls">
      <button id="btn-music-play-pause" title="Play/Pause">⏸</button>
      <button id="btn-music-mute" title="Mute/Unmute">🔊</button>
      <input type="range" id="slider-music-volume" min="0" max="100" value="25" title="Volume">
    </div>
  `;

    const gameScreen = document.getElementById('game-screen');
    if (gameScreen) {
        gameScreen.appendChild(bgmHud);
    } else {
        document.body.appendChild(bgmHud);
    }

    // 2. Setup listeners for the player elements
    const playBtn = document.getElementById('btn-music-play-pause');
    const muteBtn = document.getElementById('btn-music-mute');
    const volSlider = document.getElementById('slider-music-volume');

    if (playBtn) {
        playBtn.addEventListener('click', () => {
            if (youtubeBGM.playing) {
                youtubeBGM.pause();
            } else {
                youtubeBGM.play();
            }
        });
    }

    if (muteBtn) {
        muteBtn.addEventListener('click', () => {
            youtubeBGM.setEnabled(!youtubeBGM.enabled);
        });
    }

    if (volSlider) {
        volSlider.addEventListener('input', (e) => {
            youtubeBGM.setVolume(parseInt(e.target.value, 10));
        });
    }

    // 3. Connect to local BGM state
    youtubeBGM.subscribe((state) => {
        updateMusicPlayerUI(state);
    });
}

function updateMusicPlayerUI(state) {
    const playBtn = document.getElementById('btn-music-play-pause');
    const muteBtn = document.getElementById('btn-music-mute');
    const trackEl = document.getElementById('music-track-name');
    const volSlider = document.getElementById('slider-music-volume');

    if (playBtn) {
        playBtn.textContent = state.playing ? '⏸' : '▶';
        playBtn.title = state.playing ? 'Pause' : 'Play';
    }
    if (muteBtn) {
        muteBtn.textContent = state.enabled ? '🔊' : '🔇';
        muteBtn.title = state.enabled ? 'Mute' : 'Unmute';
    }
    if (trackEl) {
        // Clean names like "Drift in Soft Light - ZolosOnline.mp3" to "Drift in Soft Light"
        const cleanTrackName = state.trackName.replace(' - ZolosOnline.mp3', '').replace('.mp3', '');
        if (trackEl.textContent !== cleanTrackName) {
            trackEl.textContent = cleanTrackName;
            // Reset marquee scroll
            trackEl.style.animation = 'none';
            void trackEl.offsetWidth; // force reflow
            trackEl.style.animation = '';
        }
    }
    if (volSlider) {
        volSlider.value = state.volume;
    }
}
