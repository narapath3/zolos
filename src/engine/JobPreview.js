// JobPreview — a small self-contained 3D scene that shows a rotating hero with
// a chosen class's appearance + signature weapon, for the job-select screen.
import * as THREE from 'three';
import { CharacterManager } from './CharacterManager.js';
import { JOBS } from './GameData.js';

export class JobPreview {
    constructor(canvas) {
        this.canvas = canvas;
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

        this.scene = new THREE.Scene();
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.95));
        const key = new THREE.DirectionalLight(0xffffff, 0.95); key.position.set(3, 6, 5); this.scene.add(key);
        const rim = new THREE.DirectionalLight(0x88b0ff, 0.55); rim.position.set(-4, 3, -4); this.scene.add(rim);

        this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
        this.camera.position.set(0, 1.9, 7.2);
        this.camera.lookAt(0, 1.25, 0);

        // Glowing pedestal the hero stands on.
        const disc = new THREE.Mesh(
            new THREE.CylinderGeometry(1.15, 1.3, 0.12, 40),
            new THREE.MeshStandardMaterial({ color: 0x2a3350, metalness: 0.3, roughness: 0.6 }));
        disc.position.y = 0.0; this.scene.add(disc);
        this.ring = new THREE.Mesh(
            new THREE.RingGeometry(1.15, 1.35, 48),
            new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
        this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.08; this.scene.add(this.ring);

        this.char = new CharacterManager(this.scene);
        this.char.baseY = 0;            // stand on the pedestal (idle bob re-applies baseY)
        this.char.mesh.position.set(0, 0, 0);
        if (this.char.nameSprite) this.char.nameSprite.visible = false; // no floating name in preview

        this._rot = 0.4;
        this._raf = null;
        this._loop = this._loop.bind(this);
        this.resize();
    }

    // Switch the previewed class (updates silhouette, weapon and ring colour).
    setJob(jobId) {
        if (!this.char) return;
        this.char.stats.job = jobId || null;
        this.char._applyJobAppearance();
        const sig = (JOBS[jobId] && JOBS[jobId].signatureWeapon) || 'Novice Cutter';
        this.char.equipWeapon(sig);
        if (this.char.nameSprite) this.char.nameSprite.visible = false;
        const ringColor = { swordsman: 0xff6a6a, mage: 0xb080ff, archer: 0x7be08a, priest: 0xffe98a }[jobId] || 0xffd24a;
        this.ring.material.color.setHex(ringColor);
    }

    // Apply a full appearance (colours + job + weapon + hat + glasses + armor/
    // shield gear) so the preview mirrors a real hero — used by the player
    // profile popup to show that player's actual look, spinning on the pedestal.
    setAppearance(app) {
        if (!this.char || !app) return;
        const c = this.char;
        if (app.gender && c.setGender) c.setGender(app.gender);
        if (app.bodyColor != null && c.setBodyColor) c.setBodyColor(app.bodyColor);
        if (app.hairColor != null && c.setHairColor) c.setHairColor(app.hairColor);
        if (app.pantsColor != null && c.setPantsColor) c.setPantsColor(app.pantsColor);
        c.stats.job = app.job || null;
        c._applyJobAppearance();
        c.equipWeapon(app.weapon && app.weapon !== 'None' ? app.weapon : null);
        c.setHat(app.hat && app.hat !== 'None' ? app.hat : null);
        c.setGlasses(app.glasses && app.glasses !== 'None' ? app.glasses : null);
        if (app.gear && c.equippedGear) {
            for (const k of Object.keys(c.equippedGear)) c.equippedGear[k] = app.gear[k] || null;
        }
        c.equippedShield = app.shield || null;
        if (c.updateGearVisuals) c.updateGearVisuals();
        if (c.setPet) c.setPet(app.pet || null, app.petLevel || 1);
        if (c.nameSprite) c.nameSprite.visible = false;
        const ringColor = { swordsman: 0xff6a6a, mage: 0xb080ff, archer: 0x7be08a, priest: 0xffe98a }[app.job] || 0xffd24a;
        this.ring.material.color.setHex(ringColor);
    }

    resize() {
        const w = this.canvas.clientWidth || 260;
        const h = this.canvas.clientHeight || 300;
        if (w === this._w && h === this._h) return;
        this._w = w; this._h = h;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }

    start() {
        if (this._raf) return;
        this._last = performance.now();
        this._loop();
    }

    _loop() {
        this._raf = requestAnimationFrame(this._loop);
        const now = performance.now();
        const dt = Math.min(0.05, (now - this._last) / 1000);
        this._last = now;
        this.resize(); // self-correct once the canvas has real layout dimensions
        this._rot += dt * 0.9;
        if (this.char && this.char.mesh) this.char.mesh.rotation.y = this._rot;
        if (this.char && this.char.update) this.char.update(dt); // gentle idle bob
        this.ring.rotation.z += dt * 0.4;
        this.renderer.render(this.scene, this.camera);
    }

    stop() {
        if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    }

    dispose() {
        this.stop();
        try { this.renderer.dispose(); } catch (e) { /* ignore */ }
        this.scene = null; this.char = null;
    }
}
