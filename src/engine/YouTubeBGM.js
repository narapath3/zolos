// In-game background music streamed via the official YouTube IFrame Player API.
// The video is NOT downloaded — a hidden embedded player streams it, which is
// the YouTube-ToS-compliant way to use a YouTube track as BGM.
//
// Autoplay policy: browsers may block unmuted autoplay even after the login
// click. If playback is blocked we retry on the next user interaction (same
// pattern as the login-screen BGM in AuthUI).

const DEFAULT_VIDEO_ID = '-3DEsh283ck';

export class YouTubeBGM {
    constructor(videoId = DEFAULT_VIDEO_ID) {
        this.videoId = videoId;
        this.player = null;
        this.ready = false;
        this.enabled = true;      // follows the game's sound_enabled setting
        this.volume = 25;         // 0–100, keep BGM under the SFX
        this._pendingPlay = false;
        this._retryHandler = null;
    }

    start() {
        if (this.player) { this.play(); return; }
        this._loadApi().then(() => this._createPlayer());
    }

    _loadApi() {
        return new Promise((resolve) => {
            if (window.YT && window.YT.Player) { resolve(); return; }
            const prev = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => {
                if (typeof prev === 'function') prev();
                resolve();
            };
            if (!document.getElementById('yt-iframe-api')) {
                const tag = document.createElement('script');
                tag.id = 'yt-iframe-api';
                tag.src = 'https://www.youtube.com/iframe_api';
                document.head.appendChild(tag);
            }
        });
    }

    _createPlayer() {
        let host = document.getElementById('yt-bgm-host');
        if (!host) {
            host = document.createElement('div');
            host.id = 'yt-bgm-host';
            // Keep it in the DOM but invisible & non-interactive
            host.style.cssText = 'position:fixed;width:1px;height:1px;left:-9999px;top:-9999px;pointer-events:none;';
            document.body.appendChild(host);
        }
        this.player = new window.YT.Player('yt-bgm-host', {
            width: 1,
            height: 1,
            videoId: this.videoId,
            playerVars: {
                autoplay: 1,
                loop: 1,
                playlist: this.videoId, // required for loop to work on a single video
                controls: 0,
                disablekb: 1,
                fs: 0,
                playsinline: 1,
            },
            events: {
                onReady: () => {
                    this.ready = true;
                    this.player.setVolume(this.volume);
                    if (this.enabled) this.play();
                },
                onStateChange: (e) => {
                    // If the browser blocked unmuted autoplay the player lands in
                    // an UNSTARTED/PAUSED state — retry on next user interaction.
                    if (this.enabled && (e.data === window.YT.PlayerState.UNSTARTED || e.data === window.YT.PlayerState.PAUSED)) {
                        this._armRetryOnInteraction();
                    }
                },
                onError: (e) => {
                    // 101/150 = embedding disabled by the video owner
                    console.warn('[YouTubeBGM] Player error', e?.data, '— BGM disabled for this session');
                },
            },
        });
    }

    _armRetryOnInteraction() {
        if (this._retryHandler) return;
        this._retryHandler = () => {
            if (this.enabled && this.ready) this.play();
            this._disarmRetry();
        };
        document.addEventListener('click', this._retryHandler);
        document.addEventListener('keydown', this._retryHandler);
        document.addEventListener('touchstart', this._retryHandler);
    }

    _disarmRetry() {
        if (!this._retryHandler) return;
        document.removeEventListener('click', this._retryHandler);
        document.removeEventListener('keydown', this._retryHandler);
        document.removeEventListener('touchstart', this._retryHandler);
        this._retryHandler = null;
    }

    play() {
        if (this.ready && this.player?.playVideo) this.player.playVideo();
    }

    switchTrack(videoId) {
        if (this.videoId === videoId) return;
        this.videoId = videoId;
        if (this.ready && this.player && this.player.loadVideoById) {
            this.player.loadVideoById({
                videoId: this.videoId,
                startSeconds: 0,
                suggestedQuality: 'small'
            });
            this.player.setVolume(this.volume);
            if (!this.enabled) this.pause();
        }
    }

    pause() {
        if (this.ready && this.player?.pauseVideo) this.player.pauseVideo();
    }

    setEnabled(on) {
        this.enabled = !!on;
        if (!this.ready) return;
        if (this.enabled) this.play();
        else this.pause();
    }

    setVolume(v) {
        this.volume = Math.max(0, Math.min(100, v));
        if (this.ready && this.player?.setVolume) this.player.setVolume(this.volume);
    }
}

export const youtubeBGM = new YouTubeBGM();
