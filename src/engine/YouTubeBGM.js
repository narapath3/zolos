// Local background music manager playing assets from /public/music/ using HTML5 Audio.
// Retains class name 'YouTubeBGM' and exports 'youtubeBGM' for seamless compatibility.
// Plays tracks continuously, shuffling randomly through all available songs.

const DEFAULT_TRACK = 'New Start - ZolosOnline.mp3';

// Full playlist of all tracks in /public/music/
const ALL_TRACKS = [
    'New Start - ZolosOnline.mp3',
    'Drift in Soft Light - ZolosOnline.mp3',
    'Maple Market Loop - ZolosOnline.mp3',
    'Moonlit Save Point - ZolosOnline.mp3',
    'Mossy Save Point - ZolosOnline.mp3',
    'Robox Drift - ZolosOnline.mp3',
    'The Day We Said Yes - ZolosOnline.mp3',
    'Worlds Box - ZolosOnline.mp3',
    'coco melody - ZolosOnline.mp3',
    'say good bye - ZolosOnline.mp3',
];

export class YouTubeBGM {
    constructor(trackName = DEFAULT_TRACK) {
        this.trackName = trackName;
        // Keep videoId property for backward compatibility with external code
        this.videoId = trackName;
        this.audio = typeof Audio !== 'undefined' ? new Audio() : null;
        this.enabled = true;      // follows the game's sound_enabled setting
        this.volume = 25;         // 0–100 range
        this.playing = false;
        this.listeners = [];

        // Playlist state — shuffled queue so every track plays before repeating
        this.playlist = [...ALL_TRACKS];
        this._shuffleQueue = [];

        if (this.audio) {
            // Do NOT loop — we advance to the next random track on 'ended'
            this.audio.loop = false;
            this.audio.volume = this.volume / 100;

            // When a track finishes, automatically play next random track
            this.audio.addEventListener('ended', () => {
                this._playNextRandom();
            });
        }

        this._retryHandler = null;
        this._isArmed = false;
    }

    start() {
        if (!this.audio) return;
        this._setupTrack();
        if (this.enabled) {
            this.play();
        }
    }

    _setupTrack() {
        if (!this.audio) return;
        // Static music folder under public/music/ is served at /music/
        this.audio.src = `/music/${encodeURIComponent(this.trackName)}`;
    }

    // Pick next random track (different from current), using a shuffle bag
    // so all tracks play once before any repeats.
    _playNextRandom() {
        if (!this.enabled || !this.playing) return;

        // Refill shuffle bag if empty
        if (this._shuffleQueue.length === 0) {
            this._shuffleQueue = this.playlist.filter(t => t !== this.trackName);
            // Fisher-Yates shuffle
            for (let i = this._shuffleQueue.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [this._shuffleQueue[i], this._shuffleQueue[j]] = [this._shuffleQueue[j], this._shuffleQueue[i]];
            }
        }

        // Pop next track from shuffled queue
        const nextTrack = this._shuffleQueue.pop() || this.playlist[0];

        // Switch to the next track
        this.trackName = nextTrack;
        this.videoId = nextTrack;
        this._setupTrack();
        this.audio.volume = this.volume / 100;
        this._notifyListeners();

        this.audio.play().then(() => {
            this._disarmRetry();
        }).catch((err) => {
            console.log('[YouTubeBGM] Autoplay blocked on next track, waiting for interaction', err);
            this._armRetryOnInteraction();
        });
    }

    nextTrack() {
        if (!this.enabled) return;
        this.playing = true;
        this._playNextRandom();
    }

    _armRetryOnInteraction() {
        if (this._isArmed) return;
        this._isArmed = true;
        this._retryHandler = () => {
            if (this.enabled && this.audio && this.audio.paused) {
                this.play();
            }
            this._disarmRetry();
        };
        document.addEventListener('click', this._retryHandler);
        document.addEventListener('keydown', this._retryHandler);
        document.addEventListener('touchstart', this._retryHandler);
    }

    _disarmRetry() {
        if (!this._isArmed) return;
        document.removeEventListener('click', this._retryHandler);
        document.removeEventListener('keydown', this._retryHandler);
        document.removeEventListener('touchstart', this._retryHandler);
        this._retryHandler = null;
        this._isArmed = false;
    }

    play() {
        if (!this.audio) return;
        this.playing = true;
        this.audio.play().then(() => {
            this._disarmRetry();
            this._notifyListeners();
        }).catch((err) => {
            console.log('[YouTubeBGM] Autoplay blocked, waiting for interaction', err);
            this._armRetryOnInteraction();
        });
    }

    switchTrack(trackName) {
        if (!trackName) return;
        if (this.trackName === trackName) return;

        this.trackName = trackName;
        this.videoId = trackName;
        // Reset shuffle queue so the new map's track starts fresh
        this._shuffleQueue = [];
        this._notifyListeners();

        if (!this.audio) return;
        const wasPlaying = !this.audio.paused || this.playing;
        this._disarmRetry();

        this.audio.pause();
        this._setupTrack();
        this.audio.volume = this.volume / 100;

        if (this.enabled && wasPlaying) {
            this.play();
        }
    }

    pause() {
        this.playing = false;
        if (this.audio) {
            this.audio.pause();
            this._notifyListeners();
        }
    }

    setEnabled(on) {
        this.enabled = !!on;
        if (!this.audio) return;
        if (this.enabled) {
            this.play();
        } else {
            this.pause();
        }
    }

    setVolume(v) {
        this.volume = Math.max(0, Math.min(100, v));
        if (this.audio) {
            this.audio.volume = this.volume / 100;
        }
        this._notifyListeners();
    }

    // Subscribe to track changes and play/pause status for the HUD UI
    subscribe(callback) {
        this.listeners.push(callback);
        // Expose state immediately on subscription
        callback({
            trackName: this.trackName,
            playing: this.playing && this.audio && !this.audio.paused,
            volume: this.volume,
            enabled: this.enabled
        });
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    _notifyListeners() {
        const state = {
            trackName: this.trackName,
            playing: this.playing && this.audio && !this.audio.paused,
            volume: this.volume,
            enabled: this.enabled
        };
        this.listeners.forEach(l => l(state));
    }
}

export const youtubeBGM = new YouTubeBGM();
