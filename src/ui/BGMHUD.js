// BGMHUD.js — Compact, collapsible Music Player bar for ZolosOnline BGM control.
import { youtubeBGM } from '../engine/YouTubeBGM.js';

export function initBGMHUD() {
    // 1. Create and inject the compact music bar HTML
    const bgmHud = document.createElement('div');
    bgmHud.id = 'music-player-hud';
    bgmHud.classList.add('music-expanded'); // start expanded
    bgmHud.innerHTML = `
    <button id="btn-music-toggle" class="music-toggle-btn" title="ย่อ/ขยาย เพลง">🎵</button>
    <div class="music-bar-content">
      <div class="music-marquee">
        <span id="music-track-name">Loading...</span>
      </div>
      <div class="music-controls">
        <button id="btn-music-play-pause" title="Play/Pause">⏸</button>
        <button id="btn-music-next" title="Next Song">⏭</button>
        <button id="btn-music-mute" title="Mute/Unmute">🔊</button>
        <input type="range" id="slider-music-volume" min="0" max="100" value="25" title="Volume">
      </div>
    </div>
  `;

    const gameScreen = document.getElementById('game-screen');
    if (gameScreen) {
        gameScreen.appendChild(bgmHud);
    } else {
        document.body.appendChild(bgmHud);
    }

    // 2. Setup toggle (collapse/expand)
    const toggleBtn = document.getElementById('btn-music-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            bgmHud.classList.toggle('music-expanded');
            bgmHud.classList.toggle('music-collapsed');
        });
    }

    // 3. Setup listeners for the player elements
    const playBtn = document.getElementById('btn-music-play-pause');
    const nextBtn = document.getElementById('btn-music-next');
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

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            youtubeBGM.nextTrack();
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

    // 4. Connect to local BGM state
    youtubeBGM.subscribe((state) => {
        updateMusicPlayerUI(state);
    });
}

function updateMusicPlayerUI(state) {
    const playBtn = document.getElementById('btn-music-play-pause');
    const muteBtn = document.getElementById('btn-music-mute');
    const trackEl = document.getElementById('music-track-name');
    const volSlider = document.getElementById('slider-music-volume');
    const toggleBtn = document.getElementById('btn-music-toggle');

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
    // Update toggle icon based on playing state
    if (toggleBtn) {
        toggleBtn.textContent = state.playing ? '🎵' : '🎵';
    }
}
