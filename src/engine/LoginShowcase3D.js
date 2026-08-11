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
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
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
    this.scene.background = null;
    this.camera = new THREE.PerspectiveCamera(37, 1, 0.1, 80);
    this._buildLighting();
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

  _buildCast() {
    const cast = [
      {
        job: 'swordsman', gender: 'male', weapon: 'Solaris Edge', shield: 'Aegis Prime',
        hat: 'Crown of the First Light', gear: HERO_GEAR, pet: 'ember_phoenix',
        colors: [0x174f9b, 0xf2c14e, 0x172b59], position: [-4.7, 0, 0.5], facing: 0.52, scale: 1.38, style: 'melee', phase: 0,
      },
      {
        job: 'archer', gender: 'female', weapon: 'Chronos Bow', hat: 'Ranger Hood',
        gear: { body: 'Valkyrie Armor', garment: 'Shadow Garment', wrist: 'Guardian Wristguard', pants: 'Leather Pants', feet: 'Dragon Greaves', ring: 'Glow Ring', accessory: 'Gold Earring' }, pet: 'moon_hare',
        colors: [0x256d4a, 0xc86b3c, 0x173e35], position: [-7.0, 0, -2.1], facing: 0.72, scale: 1.08, style: 'bow', phase: 0.42,
      },
      {
        job: 'mage', gender: 'female', weapon: 'Genesis Staff', hat: 'Wizard Hat', glasses: 'Oracle Lens',
        gear: { body: 'Dragon Scale Mail', garment: 'Odin Garment', wrist: 'Steel Bracer', pants: 'Astral Legguards', feet: 'Worldwalker Greaves', ring: 'Eternity Ring', accessory: 'Heart of Cosmos' }, pet: 'bloom_fairy',
        colors: [0x6d3ca8, 0xd9e5ff, 0x27184f], position: [5.35, 0, -1.8], facing: -0.6, scale: 1.16, style: 'magic', phase: 0.8,
      },
      {
        job: 'priest', gender: 'male', weapon: 'Seraph Rod', shield: 'Golden Shield', hat: 'Crown',
        gear: { body: 'Empyrean Plate', garment: 'Odin Garment', wrist: 'Titan Bracers', pants: 'Plate Legguards', feet: 'Speed Boots', ring: 'Silver Ring', accessory: 'Gold Earring' }, pet: 'cloudling',
        colors: [0xf2e5bb, 0xc98b45, 0x66562d], position: [7.25, 0, 0.35], facing: -0.78, scale: 1.05, style: 'magic', phase: 1.2,
      },
    ];
    this.heroes = cast.map((config, index) => {
      const hero = new CharacterManager(this.scene);
      const [bodyColor, hairColor, pantsColor] = config.colors;
      hero.stats.job = config.job;
      hero.applyAppearance({
        job: config.job, gender: config.gender, bodyColor, hairColor, pantsColor,
        weapon: config.weapon, shield: config.shield || null, hat: config.hat,
        glasses: config.glasses || null, gear: config.gear,
        pet: config.pet, petLevel: 28 + index * 4,
      });
      hero.userData = config;
      hero.mesh.position.fromArray(config.position);
      hero.mesh.rotation.y = config.facing;
      hero.mesh.scale.setScalar(config.scale);
      if (hero.nameSprite) hero.nameSprite.visible = false;
      hero.state = 'attacking';
      hero.attackAnimStyle = config.style;
      return hero;
    });
    this.hero = this.heroes[0];

    const lineup = [
      ['deviruchi', new THREE.Vector3(2.9, 0, -0.4), 1.08, -0.5],
      ['nine_tail', new THREE.Vector3(7.8, 0, -4.2), 0.8, -0.72],
      ['ghostring', new THREE.Vector3(2.4, 0.35, -4.6), 0.82, -0.2],
      ['savage', new THREE.Vector3(8.8, 0, 2.4), 0.68, -0.9],
      ['poring', new THREE.Vector3(-1.8, 0, 2.5), 0.74, -0.3],
      ['bigfoot', new THREE.Vector3(-8.8, 0, -4.1), 0.72, 0.65],
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
    this.heroes.forEach((hero, index) => {
      const config = hero.userData;
      const cycle = (t + config.phase) % (2.35 + index * 0.18);
      hero.attackAnimElapsed = cycle < 0.72 ? cycle : 1;
      hero.update(dt);
      hero.mesh.position.set(config.position[0], config.position[1] + Math.sin(t * 1.4 + index) * 0.025, config.position[2]);
    });
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
