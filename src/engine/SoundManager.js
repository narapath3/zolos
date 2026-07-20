// Sound Manager — Procedural sound effects using Web Audio API
// No external audio files needed — all sounds generated programmatically

export class SoundManager {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        // Settings → "เสียงสกิล": skill casts can be muted on their own while
        // the rest of the SFX (hits, pickups, level-ups) keep playing.
        this.skillSoundsEnabled = true;
        this.masterVolume = 0.3;
        this._initOnInteraction();
    }

    _initOnInteraction() {
        const init = () => {
            if (!this.ctx) {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            }
            document.removeEventListener('click', init);
            document.removeEventListener('keydown', init);
            document.removeEventListener('touchstart', init);
        };
        document.addEventListener('click', init);
        document.addEventListener('keydown', init);
        document.addEventListener('touchstart', init);
    }

    _ensureCtx() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        return this.ctx;
    }

    // ============ Attack Hit Sound ============
    playHitSound() {
        if (!this.enabled) return;
        const ctx = this._ensureCtx();
        const t = ctx.currentTime;

        // Impact thud
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(60, t + 0.15);
        gain.gain.setValueAtTime(this.masterVolume * 0.6, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.15);

        // Slash whoosh (noise burst)
        this._playNoiseBurst(ctx, t, 0.08, this.masterVolume * 0.4, 2000, 4000);

        // Metallic ring
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(800 + Math.random() * 400, t);
        osc2.frequency.exponentialRampToValueAtTime(400, t + 0.1);
        gain2.gain.setValueAtTime(this.masterVolume * 0.25, t);
        gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc2.connect(gain2).connect(ctx.destination);
        osc2.start(t);
        osc2.stop(t + 0.12);
    }

    // ============ Weapon-specific Attack Sounds ============
    // Each weapon class gets a distinct signature so you can tell what someone
    // is swinging by ear (sword rings, gun bangs, bow twangs). `opts.volume`
    // (0..1) scales the whole sound — used to attenuate other players' attacks
    // by how far away they are.
    playWeaponAttack(weaponClass = 'sword', opts = {}) {
        if (!this.enabled) return;
        const vol = Math.max(0, Math.min(1, opts.volume == null ? 1 : opts.volume));
        if (vol <= 0.02) return;
        switch (weaponClass) {
            case 'gun': return this._sfxGun(vol);
            case 'bow': return this._sfxBow(vol);
            case 'blunt': return this._sfxBlunt(vol);
            case 'staff': return this._sfxStaff(vol);
            case 'unarmed': return this._sfxPunch(vol);
            case 'lightning': return this._sfxLightning(vol);
            case 'sword':
            case 'melee':
            default: return this._sfxSword(vol);
        }
    }

    // Metallic "ching" — a short slash whoosh plus two detuned rings sweeping down.
    _sfxSword(vol = 1) {
        const ctx = this._ensureCtx();
        const t = ctx.currentTime;
        const m = this.masterVolume * vol;
        this._playNoiseBurst(ctx, t, 0.07, m * 0.35, 2500, 6000);
        [1, 1.5].forEach((mult, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime((1400 + Math.random() * 300) * mult, t);
            osc.frequency.exponentialRampToValueAtTime(600 * mult, t + 0.14);
            gain.gain.setValueAtTime(m * (i === 0 ? 0.3 : 0.18), t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t); osc.stop(t + 0.16);
        });
    }

    // Gunshot "bang" — a sharp broadband crack over a low recoil thump.
    _sfxGun(vol = 1) {
        const ctx = this._ensureCtx();
        const t = ctx.currentTime;
        const m = this.masterVolume * vol;
        this._playNoiseBurst(ctx, t, 0.05, m * 0.9, 3000, 9000);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(180, t);
        osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
        gain.gain.setValueAtTime(m * 0.7, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.14);
    }

    // Bowstring release "thwip" — a woody pitch-drop pluck plus the arrow's air whoosh.
    _sfxBow(vol = 1) {
        const ctx = this._ensureCtx();
        const t = ctx.currentTime;
        const m = this.masterVolume * vol;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const lp = ctx.createBiquadFilter();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(420, t);
        osc.frequency.exponentialRampToValueAtTime(130, t + 0.09);
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(1800, t);
        gain.gain.setValueAtTime(m * 0.35, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.connect(lp).connect(gain).connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.1);
        this._playNoiseBurst(ctx, t + 0.01, 0.09, m * 0.22, 1200, 3500);
    }

    // Heavy blunt thud (warhammer).
    _sfxBlunt(vol = 1) {
        const ctx = this._ensureCtx();
        const t = ctx.currentTime;
        const m = this.masterVolume * vol;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(140, t);
        osc.frequency.exponentialRampToValueAtTime(38, t + 0.2);
        gain.gain.setValueAtTime(m * 0.8, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.22);
        this._playNoiseBurst(ctx, t, 0.06, m * 0.3, 200, 900);
    }

    // Lightning bolt — a sharp crack followed by an electric sizzle.
    _sfxLightning(vol = 1) {
        const ctx = this._ensureCtx();
        const t = ctx.currentTime;
        const m = this.masterVolume * vol;

        // Sharp crack (high-pass noise)
        this._playNoiseBurst(ctx, t, 0.05, m * 0.8, 2000, 8000);

        // Electric sizzle (sawtooth osc)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.3);
        
        gain.gain.setValueAtTime(m * 0.4, t);
        gain.gain.linearRampToValueAtTime(m * 0.6, t + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(4000, t);
        filter.frequency.exponentialRampToValueAtTime(500, t + 0.3);

        osc.connect(filter).connect(gain).connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.35);
    }

    // Magic staff — a soft rising bell shimmer.
    _sfxStaff(vol = 1) {
        const ctx = this._ensureCtx();
        const t = ctx.currentTime;
        const m = this.masterVolume * vol;
        [660, 990].forEach((f, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f, t);
            osc.frequency.linearRampToValueAtTime(f * 1.5, t + 0.18);
            gain.gain.setValueAtTime(m * (i === 0 ? 0.3 : 0.16), t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t); osc.stop(t + 0.28);
        });
    }

    // Bare-handed punch — a dull thud.
    _sfxPunch(vol = 1) {
        const ctx = this._ensureCtx();
        const t = ctx.currentTime;
        const m = this.masterVolume * vol;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(70, t + 0.1);
        gain.gain.setValueAtTime(m * 0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.11);
        this._playNoiseBurst(ctx, t, 0.04, m * 0.2, 800, 2000);
    }

    // ============ Critical Hit Sound ============
    playCriticalSound() {
        if (!this.enabled) return;
        const ctx = this._ensureCtx();
        const t = ctx.currentTime;

        // Big impact
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.3);
        gain.gain.setValueAtTime(this.masterVolume * 0.8, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.3);

        // Crunch noise
        this._playNoiseBurst(ctx, t, 0.12, this.masterVolume * 0.6, 1000, 6000);

        // High metallic ring
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(1200, t);
        osc2.frequency.exponentialRampToValueAtTime(600, t + 0.2);
        gain2.gain.setValueAtTime(this.masterVolume * 0.2, t);
        gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        osc2.connect(gain2).connect(ctx.destination);
        osc2.start(t);
        osc2.stop(t + 0.25);

        // Resonance shimmer
        const osc3 = ctx.createOscillator();
        const gain3 = ctx.createGain();
        osc3.type = 'sine';
        osc3.frequency.setValueAtTime(2000, t + 0.05);
        osc3.frequency.exponentialRampToValueAtTime(800, t + 0.4);
        gain3.gain.setValueAtTime(0.001, t);
        gain3.gain.linearRampToValueAtTime(this.masterVolume * 0.15, t + 0.05);
        gain3.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        osc3.connect(gain3).connect(ctx.destination);
        osc3.start(t);
        osc3.stop(t + 0.4);
    }

    // ============ Monster Death Sound ============
    playDeathSound() {
        if (!this.enabled) return;
        const ctx = this._ensureCtx();
        const t = ctx.currentTime;

        // Descending boom
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, t);
        osc.frequency.exponentialRampToValueAtTime(30, t + 0.5);
        gain.gain.setValueAtTime(this.masterVolume * 0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.5);

        // Pop burst
        this._playNoiseBurst(ctx, t, 0.15, this.masterVolume * 0.5, 500, 3000);

        // Sparkle tones
        for (let i = 0; i < 3; i++) {
            const delay = 0.08 * i;
            const freq = 600 + i * 200;
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'sine';
            o.frequency.setValueAtTime(freq, t + delay);
            g.gain.setValueAtTime(this.masterVolume * 0.15, t + delay);
            g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.2);
            o.connect(g).connect(ctx.destination);
            o.start(t + delay);
            o.stop(t + delay + 0.2);
        }
    }

    // ============ Level Up Sound ============
    playLevelUpSound() {
        if (!this.enabled) return;
        const ctx = this._ensureCtx();
        const t = ctx.currentTime;

        // Ascending arpeggio
        const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51]; // C5-E5-G5-C6-E6
        notes.forEach((freq, i) => {
            const delay = i * 0.12;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, t + delay);
            gain.gain.setValueAtTime(this.masterVolume * 0.35, t + delay);
            gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.4);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t + delay);
            osc.stop(t + delay + 0.4);

            // Harmonic overtone
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(freq * 2, t + delay);
            gain2.gain.setValueAtTime(this.masterVolume * 0.1, t + delay);
            gain2.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.3);
            osc2.connect(gain2).connect(ctx.destination);
            osc2.start(t + delay);
            osc2.stop(t + delay + 0.3);
        });

        // Final shimmer
        this._playNoiseBurst(ctx, t + 0.5, 0.3, this.masterVolume * 0.15, 3000, 8000);
    }

    // ============ Use Item (Potion) Sound ============
    playUseItemSound() {
        if (!this.enabled) return;
        const ctx = this._ensureCtx();
        const t = ctx.currentTime;

        // Liquidy bubble sound (ascending frequency)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.exponentialRampToValueAtTime(1000, t + 0.15);
        gain.gain.setValueAtTime(this.masterVolume * 0.4, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.15);

        // High sparkle ring
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1800, t + 0.05);
        osc2.frequency.exponentialRampToValueAtTime(2500, t + 0.2);
        gain2.gain.setValueAtTime(0.001, t);
        gain2.gain.linearRampToValueAtTime(this.masterVolume * 0.2, t + 0.05);
        gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc2.connect(gain2).connect(ctx.destination);
        osc2.start(t);
        osc2.stop(t + 0.2);
    }

    // ============ Helpers ============
    _playNoiseBurst(ctx, startTime, duration, volume, lowFreq, highFreq) {
        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1);
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;

        // Bandpass filter
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime((lowFreq + highFreq) / 2, startTime);
        filter.Q.setValueAtTime(1.5, startTime);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        source.connect(filter).connect(gain).connect(ctx.destination);
        source.start(startTime);
        source.stop(startTime + duration);
    }

    // ============ Buy / Sell Items Sound ============
    playBuySellSound() {
        if (!this.enabled) return;
        const ctx = this._ensureCtx();
        const t = ctx.currentTime;

        // Gold coin jingle
        const notes = [987.77, 1318.51, 1567.98]; // B5 - E6 - G6
        notes.forEach((freq, i) => {
            const delay = i * 0.05;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, t + delay);
            gain.gain.setValueAtTime(this.masterVolume * 0.25, t + delay);
            gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.15);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t + delay);
            osc.stop(t + delay + 0.15);
        });
    }

    // ============ Skill Cast/Hit Sounds ============
    playSkillSound(skillId) {
        if (!this.enabled || !this.skillSoundsEnabled) return;
        const ctx = this._ensureCtx();
        const t = ctx.currentTime;

        if (skillId === 'bash') {
            // Heavy metallic smash
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, t);
            osc.frequency.exponentialRampToValueAtTime(40, t + 0.25);
            gain.gain.setValueAtTime(this.masterVolume * 0.7, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.25);

            this._playNoiseBurst(ctx, t, 0.2, this.masterVolume * 0.5, 400, 3000);

            // metallic ring
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(900, t);
            gain2.gain.setValueAtTime(this.masterVolume * 0.3, t);
            gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
            osc2.connect(gain2).connect(ctx.destination);
            osc2.start(t);
            osc2.stop(t + 0.18);

        } else if (skillId === 'heal') {
            // Holy magic beam chirp
            const notes = [523.25, 659.25, 783.99, 1046.50]; // Divine arpeggio
            notes.forEach((freq, i) => {
                const delay = i * 0.08;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';

                // Frequency sweeps upwards
                osc.frequency.setValueAtTime(freq, t + delay);
                osc.frequency.exponentialRampToValueAtTime(freq * 1.5, t + delay + 0.3);

                gain.gain.setValueAtTime(0, t + delay);
                gain.gain.linearRampToValueAtTime(this.masterVolume * 0.3, t + delay + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.35);

                osc.connect(gain).connect(ctx.destination);
                osc.start(t + delay);
                osc.stop(t + delay + 0.35);
            });

            this._playNoiseBurst(ctx, t, 0.4, this.masterVolume * 0.15, 2000, 6000);

        } else if (skillId === 'magnumBreak') {
            // Giant shockwave fire explosion
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(100, t);
            osc.frequency.linearRampToValueAtTime(20, t + 0.5);
            gain.gain.setValueAtTime(this.masterVolume * 1.0, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.5);

            // Crackling fire noise
            this._playNoiseBurst(ctx, t, 0.45, this.masterVolume * 0.8, 100, 2500);

            // Shrill heat ring
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(600, t);
            osc2.frequency.exponentialRampToValueAtTime(300, t + 0.35);
            gain2.gain.setValueAtTime(this.masterVolume * 0.4, t);
            gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
            osc2.connect(gain2).connect(ctx.destination);
            osc2.start(t);
            osc2.stop(t + 0.35);
        }
    }

    // ============ Compatibility Aliases ============
    playAtkSound() {
        this.playHitSound();
    }

    playCastSound() {
        // Alias for skill sound or a generic magic sound
        this.playUseItemSound();
    }

    // ============ Portal Sound ============
    playPortalSound() {
        if (!this.enabled) return;
        const ctx = this._ensureCtx();
        const t = ctx.currentTime;

        // Whooshing rise-fall synthesizer sound
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, t);
        osc.frequency.exponentialRampToValueAtTime(1600, t + 0.6);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(400, t);
        filter.frequency.exponentialRampToValueAtTime(3000, t + 0.6);

        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(this.masterVolume * 0.35, t + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

        osc.connect(filter).connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.6);

        // Flanger/spacey chirp overlay
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(300, t);
        osc2.frequency.linearRampToValueAtTime(800, t + 0.55);

        gain2.gain.setValueAtTime(0.001, t);
        gain2.gain.linearRampToValueAtTime(this.masterVolume * 0.2, t + 0.2);
        gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.55);

        osc2.connect(gain2).connect(ctx.destination);
        osc2.start(t);
        osc2.stop(t + 0.55);
    }
}
