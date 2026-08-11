import * as THREE from 'three';
import { Monster } from '../engine/MonsterManager.js';

const cache = new Map();
let renderer = null;
let queued = false;
const pending = new Map();

function getRenderer() {
  if (renderer) return renderer;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(1);
  renderer.setSize(192, 192, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  return renderer;
}

function disposeObject(root) {
  root.traverse(object => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    // Materials/geometries are unique to this preview. Textures include the
    // shared monster skin atlas, so keep them alive for later thumbnails.
    materials.filter(Boolean).forEach(material => material.dispose?.());
  });
}

export function renderMonsterPortrait(monsterKey) {
  if (cache.has(monsterKey)) return cache.get(monsterKey);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xd9efff, 0x31271f, 2.7));
  const key = new THREE.DirectionalLight(0xffe3b0, 4.0);
  key.position.set(-4, 7, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0x679dff, 2.2);
  rim.position.set(5, 4, -5); scene.add(rim);

  const monster = new Monster(scene, monsterKey, new THREE.Vector3());
  // The codex needs the real creature, not gameplay UI floating above it.
  if (monster.hpBarFill) monster.hpBarFill.visible = false;
  if (monster.nameSprite) monster.nameSprite.visible = false;
  monster.mesh.children.forEach(child => {
    if (child !== monster.bodyMesh && (child.type === 'Mesh' || child.type === 'Sprite')) child.visible = false;
  });
  monster.mesh.rotation.y = -0.16;
  scene.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(monster.bodyMesh);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z, 0.5);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
  camera.position.set(center.x + radius * 0.12, center.y + radius * 0.08, center.z + radius * 2.65);
  camera.lookAt(center.x, center.y, center.z);
  const r = getRenderer();
  r.setClearColor(0x000000, 0);
  r.render(scene, camera);
  const url = r.domElement.toDataURL('image/webp', 0.9);
  cache.set(monsterKey, url);
  disposeObject(scene);
  return url;
}

function flushQueue(deadline) {
  queued = false;
  const entries = [...pending.entries()];
  for (const [key, elements] of entries) {
    if (deadline && !deadline.didTimeout && deadline.timeRemaining() < 5) break;
    pending.delete(key);
    try {
      const src = renderMonsterPortrait(key);
      elements.forEach(img => { if (img.isConnected) { img.src = src; img.classList.add('ready'); } });
    } catch (error) {
      elements.forEach(img => img.classList.add('unavailable'));
      console.warn(`[Codex] Could not render ${key} portrait`, error);
    }
  }
  if (pending.size) scheduleFlush();
}

function scheduleFlush() {
  if (queued) return;
  queued = true;
  if ('requestIdleCallback' in window) window.requestIdleCallback(flushQueue, { timeout: 250 });
  else window.setTimeout(() => flushQueue(null), 16);
}

export function hydrateMonsterPortraits(root = document) {
  root.querySelectorAll('img[data-monster-model]:not([data-model-requested])').forEach(img => {
    const key = img.dataset.monsterModel;
    if (!key) return;
    img.dataset.modelRequested = '1';
    if (cache.has(key)) { img.src = cache.get(key); img.classList.add('ready'); return; }
    if (!pending.has(key)) pending.set(key, []);
    pending.get(key).push(img);
  });
  scheduleFlush();
}
