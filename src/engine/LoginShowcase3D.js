import * as THREE from 'three';
import { CharacterManager } from './CharacterManager.js';
import { Monster } from './MonsterManager.js';

const HERO_GEAR = {
  head: 'Celestial Sovereign Helm',
  body: 'Empyrean Plate',
  garment: 'Wings of Aeon',
  wrist: 'Titan Bracers',
  pants: 'Astral Legguards',
  feet: 'Worldwalker Greaves',
  ring: 'Eternity Ring',
  accessory: 'Heart of Cosmos',
};

/**
 * Login key art rendered from the exact runtime character and monster builders.
 * No painted stand-ins: equipment changes and monster remasters automatically
 * reach this scene because it imports the same classes as gameplay.
 */
export class LoginShowcase3D {
  constructor(canvasId = 'auth-bg-canvas') {
    this.canvas = document.getElementById(canvasId);
    this.isReady = false;
    this.isRunning = false;
    this.clock = new THREE.Clock();
    this.pointer = new THREE.Vector2();
    if (!this.canvas) return;

    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (error) {
      console.warn('[LoginShowcase3D] WebGL unavailable; keeping static fallback.', error);
      return;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.45));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x79b9da);
    this.scene.fog = new THREE.Fog(0x9bc7d8, 13, 34);
    this.camera = new THREE.PerspectiveCamera(37, 1, 0.1, 80);
    this._buildLighting();
    this._buildWorld();
    this._buildCast();

    this._onResize = this._onResize.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    window.addEventListener('resize', this._onResize);
    window.addEventListener('pointermove', this._onPointerMove, { passive: true });
    this._onResize();
    this.isReady = true;
    document.getElementById('auth-screen')?.classList.add('auth-has-live-game-art');
  }

  _buildLighting() {
    this.scene.add(new THREE.HemisphereLight(0xd8f2ff, 0x30452e, 1.7));
    const sun = new THREE.DirectionalLight(0xffe6ad, 3.2);
    sun.position.set(-8, 14, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -11; sun.shadow.camera.right = 11;
    sun.shadow.camera.top = 9; sun.shadow.camera.bottom = -5;
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x5deaff, 2.5);
    rim.position.set(7, 5, -7);
    this.scene.add(rim);
    const gold = new THREE.PointLight(0xffc64d, 9, 14, 2);
    gold.position.set(-2.4, 3.4, 1.5);
    this.scene.add(gold);
  }

  _buildWorld() {
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(24, 64),
      new THREE.MeshStandardMaterial({ color: 0x477a3d, roughness: 0.94, metalness: 0.02 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Low-poly terrain and crystal ruins use the same geometry/material language
    // as gameplay, while keeping the centre clear for the login card.
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x66727b, roughness: 0.92, flatShading: true });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = 9.5 + (i % 4) * 1.7;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7 + (i % 3) * 0.35, 0), rockMat);
      rock.position.set(Math.cos(a) * r, 0.45, Math.sin(a) * r - 2);
      rock.scale.y = 1.2 + (i % 5) * 0.38;
      rock.rotation.set(i * 0.3, i * 0.7, 0);
      rock.castShadow = rock.receiveShadow = true;
      this.scene.add(rock);
    }
    const crystalMat = new THREE.MeshStandardMaterial({ color: 0x65dcff, emissive: 0x116da0, emissiveIntensity: 1.5, roughness: 0.2, metalness: 0.25 });
    for (const [x, z, s] of [[-7, -3, 1.3], [7.5, -5, 1], [8.5, 1, 0.7], [-8, 2, 0.8]]) {
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.42 * s, 0), crystalMat);
      crystal.scale.y = 2.6;
      crystal.position.set(x, 0.9 * s, z);
      crystal.rotation.z = 0.16;
      this.scene.add(crystal);
    }

    const mountainMat = new THREE.MeshStandardMaterial({ color: 0x668b86, roughness: 1, flatShading: true });
    for (let i = 0; i < 11; i++) {
      const mountain = new THREE.Mesh(new THREE.ConeGeometry(3.8 + (i % 3), 8 + (i % 4) * 2, 5), mountainMat);
      mountain.position.set(-25 + i * 5, 2.8, -22 - (i % 2) * 4);
      this.scene.add(mountain);
    }
  }

  _buildCast() {
    this.hero = new CharacterManager(this.scene);
    this.hero.stats.job = 'swordsman';
    this.hero.applyAppearance({
      job: 'swordsman', gender: 'male', bodyColor: 0x174f9b, hairColor: 0xf2c14e, pantsColor: 0x172b59,
      weapon: 'Solaris Edge', shield: 'Aegis Prime', hat: 'Crown of the First Light',
      gear: HERO_GEAR, pet: 'ember_phoenix', petLevel: 40,
    });
    this.hero.mesh.position.set(-3.7, 0, 0.2);
    this.hero.mesh.rotation.y = 0.48;
    this.hero.mesh.scale.setScalar(1.38);
    if (this.hero.nameSprite) this.hero.nameSprite.visible = false;
    this.hero.state = 'attacking';
    this.hero.attackAnimStyle = 'melee';

    const lineup = [
      ['deviruchi', new THREE.Vector3(4.9, 0, -0.6), 1.08, -0.5],
      ['nine_tail', new THREE.Vector3(6.8, 0, -2.7), 0.88, -0.72],
      ['ghostring', new THREE.Vector3(2.8, 0.35, -3.7), 0.82, -0.2],
      ['savage', new THREE.Vector3(7.7, 0, 1.5), 0.72, -0.9],
      ['poring', new THREE.Vector3(1.9, 0, 2.1), 0.74, -0.3],
    ];
    this.monsters = lineup.map(([type, position, scale, facing]) => {
      const monster = new Monster(this.scene, type, position);
      monster.mesh.scale.multiplyScalar(scale);
      monster.mesh.rotation.y = facing;
      if (monster.nameSprite) monster.nameSprite.visible = false;
      if (monster.hpBarGroup) monster.hpBarGroup.visible = false;
      return monster;
    });
  }

  _onPointerMove(event) {
    this.pointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
    this.pointer.y = (event.clientY / window.innerHeight - 0.5) * 2;
  }

  _onResize() {
    if (!this.renderer) return;
    const width = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    const portrait = this.camera.aspect < 0.8;
    this.cameraBase = { x: portrait ? 0 : 0.4, y: portrait ? 5.2 : 4.5 };
    this.camera.position.set(this.cameraBase.x, this.cameraBase.y, portrait ? 17.5 : 15.5);
    this.camera.lookAt(portrait ? 0 : 0.3, 1.35, -1.1);
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (!this.isReady || this.isRunning) return;
    this.isRunning = true;
    this.clock.start();
    this._loop();
  }

  _loop = () => {
    if (!this.isRunning) return;
    const dt = Math.min(this.clock.getDelta(), 0.04);
    const t = this.clock.elapsedTime;
    this.hero.attackAnimElapsed = (t % 2.8) < 0.72 ? (t % 0.72) : 1;
    this.hero.update(dt);
    this.hero.mesh.position.set(-3.7, Math.sin(t * 1.4) * 0.025, 0.2);
    this.monsters.forEach((monster, index) => {
      monster.mesh.position.y = Math.max(0, Math.sin(t * (1.7 + index * 0.12) + index) * 0.06);
      monster.mesh.rotation.z = Math.sin(t * 1.5 + index) * 0.025;
    });
    this.camera.position.x += ((this.cameraBase.x + this.pointer.x * 0.22) - this.camera.position.x) * 0.025;
    this.camera.position.y += ((this.cameraBase.y - this.pointer.y * 0.1) - this.camera.position.y) * 0.025;
    this.camera.lookAt(0.3 + this.pointer.x * 0.08, 1.35, -1.1);
    this.renderer.render(this.scene, this.camera);
    this.animationFrameId = requestAnimationFrame(this._loop);
  };

  stop() {
    this.isRunning = false;
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('pointermove', this._onPointerMove);
    this.scene?.traverse((node) => {
      node.geometry?.dispose?.();
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => material?.dispose?.());
    });
    this.renderer?.dispose();
  }
}
