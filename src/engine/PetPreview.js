// PetPreview — renders the REAL in-game pet models (from PetModels.js) to small
// transparent PNG thumbnails so shop/boutique surfaces show exactly what the
// player will get in the world, not a separate illustration. One shared
// offscreen WebGL renderer is reused for every pet and the result is cached per
// (key,size), so opening the boutique costs a handful of quick draws once.
import * as THREE from 'three';
import { buildPet } from './PetModels.js';

let renderer = null;
let scene = null;
let camera = null;
const cache = new Map();

function ensure() {
    if (renderer) return;
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0x000000, 0); // transparent — the card's own bg shows
    renderer.setPixelRatio(Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));
    scene = new THREE.Scene();
    // Soft, friendly lighting close to the world's look so colours read true.
    scene.add(new THREE.HemisphereLight(0xd7e6ff, 0x2a3550, 1.05));
    const key = new THREE.DirectionalLight(0xffffff, 1.15); key.position.set(3, 6, 4); scene.add(key);
    const rim = new THREE.DirectionalLight(0x9ec6ff, 0.55); rim.position.set(-4, 2, -3); scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffe6c0, 0.35); fill.position.set(0, 1, 6); scene.add(fill);
    camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
}

// Render `petKey` and return a PNG data URL (or null for an unknown pet).
// Cached, so repeated calls are free.
export function petThumbUrl(petKey, size = 320) {
    if (!petKey) return null;
    const ck = petKey + '@' + size;
    if (cache.has(ck)) return cache.get(ck);
    let url = null;
    try {
        ensure();
        const pet = buildPet(petKey);
        if (!pet) return null;
        pet.scale.setScalar(pet.userData.scale || 1.4);
        pet.rotation.y = -0.5; // three-quarter view toward the camera
        scene.add(pet);

        // Frame the model: fit its bounding sphere with a little margin.
        const box = new THREE.Box3().setFromObject(pet);
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        const c = sphere.center;
        const r = Math.max(0.001, sphere.radius);
        const vFov = THREE.MathUtils.degToRad(camera.fov);
        const dist = (r / Math.sin(vFov / 2)) * 1.15;
        camera.position.set(c.x, c.y + r * 0.16, c.z + dist);
        camera.lookAt(c.x, c.y, c.z);
        camera.updateProjectionMatrix();

        renderer.setSize(size, size, false);
        renderer.render(scene, camera);
        url = renderer.domElement.toDataURL('image/png');

        scene.remove(pet);
        pet.traverse(o => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) Array.isArray(o.material) ? o.material.forEach(m => m.dispose()) : o.material.dispose();
        });
    } catch (e) {
        console.warn('[PetPreview] render failed for', petKey, e);
        return null;
    }
    cache.set(ck, url);
    return url;
}

// Markup helper: an <img> of the real model, with the atlas as a graceful
// fallback if WebGL is unavailable.
export function petModelMarkup(petKey, size = 320, className = 'pet-model-shot') {
    const url = petThumbUrl(petKey, size);
    if (!url) return '';
    return `<img class="${className}" src="${url}" alt="" aria-hidden="true" draggable="false">`;
}

// A single live, animated 3D viewer for the boutique detail. Reuses one WebGL
// context: the selected model breathes, wags its tail, bobs its ears, flaps and
// blinks (same idle motions as in the world) and sways gently so it reads as a
// living creature — not a static picture. Cards keep cheap static thumbnails.
export class PetLiveViewer {
    constructor() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.setPixelRatio(Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));
        this.canvas = this.renderer.domElement;
        this.canvas.style.cssText = 'width:100%;height:100%;display:block';
        this.scene = new THREE.Scene();
        this.scene.add(new THREE.HemisphereLight(0xd7e6ff, 0x2a3550, 1.05));
        const key = new THREE.DirectionalLight(0xffffff, 1.15); key.position.set(3, 6, 4); this.scene.add(key);
        const rim = new THREE.DirectionalLight(0x9ec6ff, 0.55); rim.position.set(-4, 2, -3); this.scene.add(rim);
        const fill = new THREE.DirectionalLight(0xffe6c0, 0.35); fill.position.set(0, 1, 6); this.scene.add(fill);
        this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
        this.pet = null; this.parts = null; this.float = false;
        this.center = new THREE.Vector3(); this.dist = 4;
        this.t = 0; this.blink = { t: -1, next: 1.5 }; this.running = false;
        this._loop = this._loop.bind(this);
    }

    mount(container) {
        if (this.canvas.parentElement !== container) container.appendChild(this.canvas);
        this._resize();
    }

    show(petKey) {
        if (this.pet) { this.scene.remove(this.pet); this._dispose(this.pet); this.pet = null; }
        const pet = buildPet(petKey);
        if (!pet) return;
        pet.scale.setScalar(pet.userData.scale || 1.4);
        this.scene.add(pet); this.pet = pet; this.float = !!pet.userData.float;
        const P = { legs: [], arms: [], ears: [], tails: [], wings: [], eyes: [] };
        pet.traverse(c => { const r = c.userData && c.userData.role; if (r && P[r + 's']) P[r + 's'].push(c); });
        this.parts = P;
        const box = new THREE.Box3().setFromObject(pet);
        const sph = box.getBoundingSphere(new THREE.Sphere());
        this.center.copy(sph.center);
        const r = Math.max(0.001, sph.radius);
        this.dist = (r / Math.sin(THREE.MathUtils.degToRad(this.camera.fov) / 2)) * 1.22;
        this.rimR = r;
        this.t = 0; this.blink = { t: -1, next: 1.2 + Math.random() * 2 };
        this._renderOnce(); // show a first frame even while paused
    }

    resume() { if (!this.running && this.pet) { this.running = true; this._last = performance.now(); requestAnimationFrame(this._loop); } }
    pause() { this.running = false; }

    _resize() {
        const w = this.canvas.clientWidth || 300, h = this.canvas.clientHeight || 300;
        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.renderer.setSize(w, h, false);
            this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
        }
    }

    _place() {
        this.camera.position.set(this.center.x, this.center.y + this.rimR * 0.16, this.center.z + this.dist);
        this.camera.lookAt(this.center.x, this.center.y, this.center.z);
    }

    _renderOnce() { this._resize(); this._place(); this.renderer.render(this.scene, this.camera); }

    _loop(now) {
        if (!this.running) return;
        const dt = Math.min(0.05, (now - this._last) / 1000); this._last = now; this.t += dt;
        this._resize();
        this._animate(dt);
        this._place();
        this.renderer.render(this.scene, this.camera);
        requestAnimationFrame(this._loop);
    }

    _animate(dt) {
        const P = this.parts, t = this.t, floats = this.float;
        if (!this.pet || !P) return;
        // Gentle turntable sway + a soft idle bob.
        this.pet.rotation.y = -0.5 + Math.sin(t * 0.42) * 0.55;
        this.pet.position.y = floats ? Math.sin(t * 2.1) * 0.06 : Math.abs(Math.sin(t * 1.9)) * 0.02;
        for (const l of P.legs) l.rotation.x = Math.sin(t * 2.4) * 0.06;
        for (const a of P.arms) a.rotation.x = Math.sin(t * 2.0 + a.userData.phase) * 0.12 * (a.userData.side || 1);
        for (const e of P.ears) e.rotation.x = (e.userData.baseRotX || 0) + Math.sin(t * 3 + (e.userData.phase || 0)) * 0.1;
        for (const tl of P.tails) tl.rotation.y = Math.sin(t * 3.2) * 0.34;
        if (P.wings.length) { const flap = Math.sin(t * (floats ? 9 : 12)) * (floats ? 0.5 : 0.6); for (const w of P.wings) w.rotation.z = (w.userData.baseRotZ || 0) + flap * (w.userData.side || 1); }
        if (P.eyes.length) {
            const b = this.blink;
            if (b.t < 0) { b.next -= dt; if (b.next <= 0) b.t = 0; }
            else { b.t += dt; const sy = 1 - Math.sin(Math.min(1, b.t / 0.14) * Math.PI) * 0.9; for (const e of P.eyes) e.scale.y = sy; if (b.t >= 0.14) { b.t = -1; b.next = 1.8 + Math.random() * 3; for (const e of P.eyes) e.scale.y = 1; } }
        }
    }

    _dispose(obj) {
        obj.traverse(o => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) Array.isArray(o.material) ? o.material.forEach(m => m.dispose()) : o.material.dispose();
        });
    }
}
