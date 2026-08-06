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
