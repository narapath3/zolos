// Sound Manager — Procedural sound effects using Web Audio API
// No external audio files needed — all sounds generated programmatically

// Combat sound profiles keep gameplay-readable identities without external assets.
// Each event is layered as movement/whoosh, material/tonal identity, contact impact,
// and optional priority accents. Values are intentionally conservative for phone
// speakers; perceived intensity comes from contrast and timing, not raw loudness.
const COMBAT_WEAPON_PROFILES = Object.freeze({
    sword: { whooshLow: 1800, whooshHigh: 5200, whoosh: 0.28, body: 190, impact: 0.34, ring: 1180, ringGain: 0.18, tail: 0.14 },
    melee: { whooshLow: 1800, whooshHigh: 5200, whoosh: 0.28, body: 190, impact: 0.34, ring: 1180, ringGain: 0.18, tail: 0.14 },
    spear: { whooshLow: 1200, whooshHigh: 4300, whoosh: 0.25, body: 175, impact: 0.32, ring: 920, ringGain: 0.14, tail: 0.13 },
    blunt: { whooshLow: 480, whooshHigh: 1800, whoosh: 0.16, body: 115, impact: 0.55, ring: 460, ringGain: 0.08, tail: 0.18 },
    bow: { whooshLow: 900, whooshHigh: 3400, whoosh: 0.18, body: 210, impact: 0.26, ring: 760, ringGain: 0.12, tail: 0.12 },
    gun: { whooshLow: 2400, whooshHigh: 7600, whoosh: 0.30, body: 145, impact: 0.42, ring: 520, ringGain: 0.08, tail: 0.10 },
    staff: { whooshLow: 800, whooshHigh: 3600, whoosh: 0.19, body: 165, impact: 0.24, ring: 990, ringGain: 0.20, tail: 0.24 },
    unarmed: { whooshLow: 650, whooshHigh: 2200, whoosh: 0.16, body: 165, impact: 0.38, ring: 290, ringGain: 0.06, tail: 0.10 },
    lightning: { whooshLow: 1800, whooshHigh: 7800, whoosh: 0.30, body: 100, impact: 0.30, ring: 1850, ringGain: 0.16, tail: 0.30 },
    magic: { whooshLow: 1000, whooshHigh: 4600, whoosh: 0.22, body: 135, impact: 0.28, ring: 1220, ringGain: 0.20, tail: 0.28 },
    shadowslash: { whooshLow: 260, whooshHigh: 2600, whoosh: 0.29, body: 95, impact: 0.36, ring: 520, ringGain: 0.08, tail: 0.22 },
    thief: { whooshLow: 260, whooshHigh: 2600, whoosh: 0.29, body: 95, impact: 0.36, ring: 520, ringGain: 0.08, tail: 0.22 },
    holyorb: { whooshLow: 900, whooshHigh: 5200, whoosh: 0.18, body: 180, impact: 0.22, ring: 1480, ringGain: 0.24, tail: 0.34 },
    acolyte: { whooshLow: 900, whooshHigh: 5200, whoosh: 0.18, body: 180, impact: 0.22, ring: 1480, ringGain: 0.24, tail: 0.34 },
});

const COMBAT_SKILL_PROFILES = Object.freeze({
    bash: { weapon: 'sword', element: 'physical', cast: 'strike', impact: 1.18, priority: 1 },
    heal: { weapon: 'holyorb', element: 'holy', cast: 'heal', impact: 0, priority: 1 },
    magnumBreak: { weapon: 'blunt', element: 'fire', cast: 'burst', impact: 1.40, priority: 2 },
    endure: { weapon: 'blunt', element: 'guard', cast: 'guard', impact: 0, priority: 1 },
    fireBolt: { weapon: 'magic', element: 'fire', cast: 'projectile', impact: 1.08, priority: 1 },
    frostNova: { weapon: 'magic', element: 'ice', cast: 'nova', impact: 1.14, priority: 2 },
    energyCoat: { weapon: 'magic', element: 'arcane', cast: 'shield', impact: 0, priority: 1 },
    doubleStrafe: { weapon: 'bow', element: 'physical', cast: 'doubleShot', impact: 1.05, priority: 1 },
    arrowShower: { weapon: 'bow', element: 'wind', cast: 'shower', impact: 1.08, priority: 2 },
    concentration: { weapon: 'bow', element: 'focus', cast: 'focus', impact: 0, priority: 1 },
    holyLight: { weapon: 'holyorb', element: 'holy', cast: 'beam', impact: 1.10, priority: 1 },
    blessing: { weapon: 'holyorb', element: 'holy', cast: 'blessing', impact: 0, priority: 1 },
});

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

export class SoundManager {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        // Settings → "เสียงสกิล": skill casts can be muted on their own while
        // the rest of the SFX (hits, pickups, level-ups) keep playing.
        this.skillSoundsEnabled = true;
        this.masterVolume = 0.3;
        this.environmentVolume = 0.55;
        this._environmentNodes = { water: null, waterfall: null };
        this._environmentNextSplashAt = 0;
        this._lastFootstepAt = -Infinity;
        this._combatBuses = null;
        this._combatVoiceEnds = [];
        this._combatLastAt = new Map();
        this._combatSequence = 0;
        this.combatSoundsEnabled = true;
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

    _ensureCombatBuses(ctx) {
        if (!ctx) return null;
        if (this._combatBuses) return this._combatBuses;
        const normal = ctx.createGain();
        const priority = ctx.createGain();
        const master = ctx.createGain();
        normal.gain.value = 1;
        priority.gain.value = 1;
        master.gain.value = 1;
        normal.connect(master);
        priority.connect(master);
        master.connect(ctx.destination);
        this._combatBuses = { normal, priority, master };
        return this._combatBuses;
    }

    _combatOutput(ctx, priority = 0) {
        const buses = this._ensureCombatBuses(ctx);
        return priority >= 2 ? buses?.priority : buses?.normal;
    }

    _duckCombat(now, priority = 0) {
        const buses = this._combatBuses;
        if (!buses || priority < 2) return;
        buses.normal.gain.cancelScheduledValues(now);
        buses.normal.gain.setTargetAtTime(0.58, now, 0.012);
        buses.normal.gain.setTargetAtTime(1, now + 0.16, 0.11);
    }

    _combatCanPlay(category, now, cooldown = 0.045, duration = 0.22, priority = 0) {
        if (!this.combatSoundsEnabled || !this.enabled) return false;
        const last = this._combatLastAt.get(category) ?? -Infinity;
        if (now - last < cooldown && priority < 2) return false;
        this._combatLastAt.set(category, now);
        this._combatVoiceEnds = this._combatVoiceEnds.filter((end) => end > now);
        const voiceLimit = priority >= 2 ? 14 : 12;
        if (this._combatVoiceEnds.length >= voiceLimit && priority < 2) return false;
        this._combatVoiceEnds.push(now + duration);
        return true;
    }

    _connectCombat(node, ctx, priority = 0) {
        const output = this._combatOutput(ctx, priority);
        if (node && output) node.connect(output);
        return node;
    }

    _scheduleTone(ctx, { frequency, endFrequency = frequency, type = 'sine', start, duration = 0.16, volume = 0.1, priority = 0, detune = 0 } = {}) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(Math.max(20, frequency), start);
        if (endFrequency !== frequency) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
        if (detune) osc.detune.setValueAtTime(detune, start);
        gain.gain.setValueAtTime(Math.max(0.0001, volume), start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        this._connectCombat(gain, ctx, priority);
        osc.connect(gain);
        osc.start(start);
        osc.stop(start + duration + 0.015);
        return osc;
    }

    _playCombatNoise(ctx, start, duration, volume, lowFreq, highFreq, priority = 0, sweep = false) {
        const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            // Slightly correlated noise keeps procedural effects textured rather than hissy.
            data[i] = (Math.random() * 2 - 1) * (0.76 + Math.random() * 0.24);
        }
        const source = ctx.createBufferSource();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        source.buffer = buffer;
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(Math.max(40, (lowFreq + highFreq) * 0.5), start);
        filter.Q.setValueAtTime(1.1, start);
        if (sweep) filter.frequency.exponentialRampToValueAtTime(Math.max(40, highFreq), start + duration * 0.78);
        gain.gain.setValueAtTime(Math.max(0.0001, volume), start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        source.connect(filter).connect(gain);
        this._connectCombat(gain, ctx, priority);
        source.start(start);
        source.stop(start + duration + 0.015);
        return source;
    }

    _playElementAccent(ctx, start, element = 'physical', volume = 0.1, priority = 0) {
        const accents = {
            fire: { type: 'sawtooth', low: 90, high: 540, duration: 0.22 },
            ice: { type: 'sine', low: 1100, high: 2300, duration: 0.28 },
            holy: { type: 'sine', low: 880, high: 1760, duration: 0.34 },
            arcane: { type: 'triangle', low: 420, high: 1320, duration: 0.30 },
            wind: { type: 'triangle', low: 1500, high: 4200, duration: 0.18 },
            guard: { type: 'square', low: 240, high: 480, duration: 0.16 },
            focus: { type: 'sine', low: 520, high: 1040, duration: 0.26 },
            physical: { type: 'triangle', low: 260, high: 520, duration: 0.10 },
        };
        const a = accents[element] || accents.physical;
        this._playCombatNoise(ctx, start, Math.min(0.20, a.duration), volume * 0.34, a.low, a.high, priority, true);
        this._scheduleTone(ctx, {
            frequency: a.low,
            endFrequency: a.high,
            type: a.type,
            start: start + 0.012,
            duration: a.duration,
            volume: volume,
            priority,
        });
    }

    _playFinisherAccent(ctx, start, volume, priority = 2) {
        // Finisher is a short low body + rising confirmation, not a sustained blast.
        this._scheduleTone(ctx, { frequency: 92, endFrequency: 42, type: 'sine', start, duration: 0.34, volume: volume * 0.72, priority });
        this._scheduleTone(ctx, { frequency: 420, endFrequency: 840, type: 'triangle', start: start + 0.035, duration: 0.42, volume: volume * 0.30, priority });
        this._playCombatNoise(ctx, start, 0.16, volume * 0.22, 900, 3400, priority, true);
        this._scheduleTone(ctx, { frequency: 1260, endFrequency: 1880, type: 'sine', start: start + 0.10, duration: 0.32, volume: volume * 0.16, priority });
    }

    startEnvironmentAudio() {
        if (!this.enabled) return;
        const ctx = this._ensureCtx();
        this._ensureEnvironmentNodes(ctx);
    }

    setEnvironmentAudio({ waterDistance = Infinity, waterfallDistance = Infinity } = {}) {
        if (!this.ctx) return;
        const ctx = this.ctx;
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        this._ensureEnvironmentNodes(ctx);
        const waterGain = this._distanceGain(waterDistance, 18);
        const waterfallGain = this._distanceGain(waterfallDistance, 24);
        const enabledGain = this.enabled ? 1 : 0;
        const base = this.masterVolume * this.environmentVolume * enabledGain;
        const now = ctx.currentTime;
        const setTarget = (node, value) => {
            if (!node?.gain?.gain) return;
            node.gain.gain.setTargetAtTime(Math.max(0, value), now, 0.18);
        };
        setTarget(this._environmentNodes.water, base * waterGain * 0.72);
        setTarget(this._environmentNodes.waterfall, base * waterfallGain);

        // A sparse impact variation prevents the waterfall from sounding like
        // one perfectly static loop while keeping mobile CPU/audio work small.
        if (waterfallGain > 0.08 && now >= this._environmentNextSplashAt && enabledGain) {
            this.playWaterSplash({ volume: waterfallGain * 0.28 });
            this._environmentNextSplashAt = now + 2.8 + Math.random() * 2.6;
        }
    }

    stopEnvironmentAudio() {
        const ctx = this.ctx;
        if (!ctx) return;
        const now = ctx.currentTime;
        Object.values(this._environmentNodes).forEach((node) => {
            if (!node?.gain?.gain) return;
            node.gain.gain.cancelScheduledValues(now);
            node.gain.gain.setTargetAtTime(0, now, 0.12);
            try { node.source.stop(now + 0.5); } catch { /* already stopped */ }
        });
        this._environmentNodes = { water: null, waterfall: null };
    }

    _distanceGain(distance, maxDistance) {
        if (!Number.isFinite(distance) || distance >= maxDistance) return 0;
        return Math.max(0, 1 - distance / maxDistance) ** 1.35;
    }

    _ensureEnvironmentNodes(ctx) {
        if (!ctx) return;
        if (!this._environmentNodes.water) {
            this._environmentNodes.water = this._createEnvironmentLoop(ctx, {
                lowpass: 1350,
                highpass: 70,
                volume: 0,
                seed: 0.18,
            });
        }
        if (!this._environmentNodes.waterfall) {
            this._environmentNodes.waterfall = this._createEnvironmentLoop(ctx, {
                lowpass: 2800,
                highpass: 120,
                volume: 0,
                seed: 0.73,
            });
        }
    }

    _createEnvironmentLoop(ctx, { lowpass, highpass, volume = 0, seed = 0 } = {}) {
        const duration = 2.4;
        const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let smooth = seed * 2 - 1;
        for (let i = 0; i < length; i++) {
            // Smoothed noise has a natural water-bed texture and avoids a
            // harsh white-noise hiss on phone speakers.
            smooth = smooth * 0.985 + (Math.random() * 2 - 1) * 0.015;
            data[i] = smooth * 2.3 + (Math.random() * 2 - 1) * 0.16;
        }
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = highpass;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = lowpass;
        const gain = ctx.createGain();
        gain.gain.value = volume;
        source.connect(hp).connect(lp).connect(gain).connect(ctx.destination);
        source.start();
        return { source, gain, hp, lp };
    }

    playWaterSplash({ volume = 1 } = {}) {
        if (!this.enabled) return;
        const ctx = this._ensureCtx();
        const t = ctx.currentTime;
        const m = this.masterVolume * Math.max(0, Math.min(1, volume));
        this._playNoiseBurst(ctx, t, 0.18, m * 0.48, 260, 1800);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(240, t);
        osc.frequency.exponentialRampToValueAtTime(72, t + 0.24);
        gain.gain.setValueAtTime(m * 0.22, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.28);
    }

    playFootstep(surface = 'grass', { volume = 1 } = {}) {
        if (!this.enabled) return false;
        const ctx = this._ensureCtx();
        const now = ctx.currentTime;
        const cooldown = surface === 'bridge' ? 0.16 : 0.18;
        if (now - this._lastFootstepAt < cooldown) return false;
        this._lastFootstepAt = now;
        const m = this.masterVolume * Math.max(0, Math.min(1, volume));
        if (m <= 0.001) return false;

        if (surface === 'bridge') {
            // Two short wooden knocks with a muted body resonance.
            this._playNoiseBurst(ctx, now, 0.055, m * 0.20, 280, 900);
            [155, 225].forEach((frequency, index) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(frequency + Math.random() * 18, now);
                gain.gain.setValueAtTime(m * (index ? 0.15 : 0.20), now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
                osc.connect(gain).connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.13);
            });
        } else if (surface === 'water' || surface === 'wet') {
            // A soft splash for leaving the river or stepping on wet ground.
            this._playNoiseBurst(ctx, now, 0.09, m * 0.24, 380, 1500);
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(180, now);
            osc.frequency.exponentialRampToValueAtTime(85, now + 0.13);
            gain.gain.setValueAtTime(m * 0.16, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
            osc.connect(gain).connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.17);
        } else {
            // Grass/soil: a quiet low thump plus a short leaf/soil texture.
            this._playNoiseBurst(ctx, now, 0.045, m * 0.12, 500, 1700);
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(105 + Math.random() * 18, now);
            osc.frequency.exponentialRampToValueAtTime(62, now + 0.11);
            gain.gain.setValueAtTime(m * 0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
            osc.connect(gain).connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.14);
        }
        return true;
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
        return this.playCombatAction({
            weaponClass,
            phase: opts.phase || 'release',
            volume: opts.volume == null ? 1 : opts.volume,
            critical: !!opts.critical,
            finisher: !!opts.finisher,
            element: opts.element || 'physical',
            priority: opts.priority,
        });
    }

    // Professional combat event entry point. It is intentionally data-driven so
    // future skills can add metadata without creating another one-off method.
    playCombatAction({
        weaponClass = 'sword',
        skillId = null,
        phase = 'impact',
        volume = 1,
        critical = false,
        finisher = false,
        element = 'physical',
        priority = 0,
    } = {}) {
        if (!this.enabled || !this.combatSoundsEnabled) return false;
        const ctx = this._ensureCtx();
        this._ensureCombatBuses(ctx);
        const t = ctx.currentTime;
        const skill = skillId ? COMBAT_SKILL_PROFILES[skillId] : null;
        const profile = COMBAT_WEAPON_PROFILES[weaponClass] || COMBAT_WEAPON_PROFILES.sword;
        const vol = clamp01(volume);
        if (vol <= 0.015) return false;
        const resolvedElement = skill?.element || element || 'physical';
        const resolvedPriority = Math.max(priority || 0, skill?.priority || 0, critical || finisher ? 2 : 0);
        const category = `${skillId || weaponClass}:${phase}`;
        const cooldown = phase === 'release' ? 0.055 : phase === 'impact' ? 0.035 : 0.08;
        const duration = finisher ? 0.48 : phase === 'cast' ? 0.34 : 0.24;
        if (!this._combatCanPlay(category, t, cooldown, duration, resolvedPriority)) return false;
        this._duckCombat(t, resolvedPriority);
        this._combatSequence = (this._combatSequence + 1) & 0xffff;

        const master = this.masterVolume * vol;
        const isCast = phase === 'cast' || phase === 'release';
        const isImpact = phase === 'impact' || phase === 'finisher';

        // Layer 1 — movement/anticipation. A filtered noise sweep gives the
        // attack direction and timing without turning every hit into a loud blast.
        if (isCast || phase === 'whoosh') {
            this._playCombatNoise(ctx, t, 0.095, master * profile.whoosh, profile.whooshLow, profile.whooshHigh, resolvedPriority, true);
        }

        // Layer 2 — weapon/material identity. Short body tones distinguish sword,
        // blunt, bow, gun, staff and magical weapons even on small speakers.
        if (isImpact || phase === 'release') {
            const bodyGain = master * profile.impact * (critical ? 1.08 : 0.82) * (finisher ? 1.08 : 1);
            this._scheduleTone(ctx, {
                frequency: profile.body * (finisher ? 0.82 : 1),
                endFrequency: Math.max(28, profile.body * 0.42),
                type: weaponClass === 'blunt' || weaponClass === 'gun' ? 'sine' : 'triangle',
                start: t,
                duration: finisher ? 0.30 : profile.tail,
                volume: bodyGain,
                priority: resolvedPriority,
            });
            this._playCombatNoise(ctx, t, finisher ? 0.18 : 0.075, master * (critical ? 0.38 : 0.22), profile.whooshLow * 0.45, profile.whooshHigh, resolvedPriority, false);
            this._scheduleTone(ctx, {
                frequency: profile.ring * (critical ? 1.08 : 1),
                endFrequency: profile.ring * (finisher ? 0.72 : 0.60),
                type: weaponClass === 'gun' ? 'square' : 'triangle',
                start: t + (isImpact ? 0.012 : 0.028),
                duration: finisher ? 0.34 : 0.14,
                volume: master * profile.ringGain * (critical ? 1.35 : 1),
                priority: resolvedPriority,
            });
        }

        // Layer 3 — spell/element identity. Cast and impact both use the same
        // element palette but different emphasis, preventing generic spell spam.
        if (skillId || !['physical', ''].includes(resolvedElement)) {
            this._playElementAccent(ctx, isImpact ? t + 0.018 : t, resolvedElement, master * (skill ? 0.34 : 0.20), resolvedPriority);
        }

        // Layer 4 — readable priority accents for criticals and final blows.
        if (critical) {
            this._playCombatNoise(ctx, t + 0.018, 0.10, master * 0.26, 1200, 5200, 2, true);
            this._scheduleTone(ctx, { frequency: 1480, endFrequency: 980, type: 'square', start: t + 0.035, duration: 0.20, volume: master * 0.13, priority: 2 });
        }
        if (finisher || phase === 'finisher') this._playFinisherAccent(ctx, t + 0.012, master, 2);
        return true;
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

    // Shadow slash — a fast, deep slicing sound.
    _sfxShadowSlash(vol = 1) {
        const ctx = this._ensureCtx();
        const t = ctx.currentTime;
        const m = this.masterVolume * vol;
        this._playNoiseBurst(ctx, t, 0.12, m * 0.6, 100, 2000);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
        gain.gain.setValueAtTime(m * 0.4, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.18);
    }

    // Holy orb — a magical "shimmering" projectile sound.
    _sfxHolyOrb(vol = 1) {
        const ctx = this._ensureCtx();
        const t = ctx.currentTime;
        const m = this.masterVolume * vol;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, t);
        osc.frequency.exponentialRampToValueAtTime(440, t + 0.2);
        gain.gain.setValueAtTime(m * 0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.setValueAtTime(15, t);
        lfoGain.gain.setValueAtTime(100, t);
        lfo.connect(lfoGain).connect(osc.frequency);
        lfo.start(t); lfo.stop(t + 0.25);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.25);
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
    playSkillSound(skillId, opts = {}) {
        if (!this.enabled || !this.skillSoundsEnabled || !this.combatSoundsEnabled) return false;
        const profile = COMBAT_SKILL_PROFILES[skillId];
        if (!profile) return false;
        const phase = opts.phase || 'cast';
        const volume = opts.volume == null ? 0.86 : opts.volume;
        return this.playCombatAction({
            skillId,
            weaponClass: profile.weapon,
            phase,
            volume,
            critical: !!opts.critical,
            finisher: !!opts.finisher,
            element: profile.element,
            priority: opts.priority == null ? profile.priority : opts.priority,
        });
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
