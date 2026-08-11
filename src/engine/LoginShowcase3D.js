import * as THREE from 'three';
import { CharacterManager } from './CharacterManager.js';
import { Monster } from './MonsterManager.js';
import { animateMonsterRig } from './MonsterAnatomy.js';

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

export function getShowcaseAction(time, phase = 0, duration = 10) {
  const progress = ((time + phase) % duration) / duration;
  if (progress < 0.24) return { state: 'walking', travel: progress / 0.24 };
  if (progress < 0.48) return { state: 'running', travel: (progress - 0.24) / 0.24 };
  if (progress < 0.64) return { state: 'attacking', attack: (progress - 0.48) / 0.16 };
  if (progress < 0.76) return { state: 'idle', travel: 1 };
  return { state: 'walking', travel: 1 - (progress - 0.76) / 0.24 };
}

export function getLoginMvPhase(currentTime, duration) {
  const time = Math.max(0, Number(currentTime) || 0);
  const total = Number(duration);
  if (Number.isFinite(total) && total > 30 && time >= Math.max(91, total - 18)) return time >= total - 18 ? 'finale' : 'party';
  return time >= 91 ? 'party' : 'combat';
}

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
    this._buildFinaleTitle();

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
        colors: [0x174f9b, 0xf2c14e, 0x172b59], position: [-6.2, 0, 1.0], approach: [-2.6, 0, 0.1], scale: 1.38, style: 'melee', phase: 0, duration: 9.8, target: 0,
      },
      {
        job: 'archer', gender: 'female', weapon: 'Chronos Bow', hat: 'Ranger Hood',
        gear: { body: 'Valkyrie Armor', garment: 'Shadow Garment', wrist: 'Guardian Wristguard', pants: 'Leather Pants', feet: 'Dragon Greaves', ring: 'Glow Ring', accessory: 'Gold Earring' }, pet: 'moon_hare',
        colors: [0x256d4a, 0xc86b3c, 0x173e35], position: [-8.0, 0, -2.4], approach: [-5.8, 0, -3.2], scale: 1.08, style: 'bow', phase: 2.7, duration: 11.4, target: 5,
      },
      {
        job: 'mage', gender: 'female', weapon: 'Genesis Staff', hat: 'Wizard Hat', glasses: 'Oracle Lens',
        gear: { body: 'Dragon Scale Mail', garment: 'Odin Garment', wrist: 'Steel Bracer', pants: 'Astral Legguards', feet: 'Worldwalker Greaves', ring: 'Eternity Ring', accessory: 'Heart of Cosmos' }, pet: 'bloom_fairy',
        colors: [0x6d3ca8, 0xd9e5ff, 0x27184f], position: [6.4, 0, -2.0], approach: [4.0, 0, -3.7], scale: 1.16, style: 'magic', phase: 5.2, duration: 12.2, target: 2,
      },
      {
        job: 'priest', gender: 'male', weapon: 'Seraph Rod', shield: 'Golden Shield', hat: 'Crown',
        gear: { body: 'Empyrean Plate', garment: 'Odin Garment', wrist: 'Titan Bracers', pants: 'Plate Legguards', feet: 'Speed Boots', ring: 'Silver Ring', accessory: 'Gold Earring' }, pet: 'cloudling',
        colors: [0xf2e5bb, 0xc98b45, 0x66562d], position: [8.1, 0, 1.2], approach: [6.8, 0, 2.0], scale: 1.05, style: 'magic', phase: 7.4, duration: 10.8, target: 3,
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
      hero.showcaseHome = new THREE.Vector3(...config.position);
      hero.showcaseApproach = new THREE.Vector3(...config.approach);
      hero.showcaseMoveTarget = new THREE.Vector3();
      hero.mesh.position.fromArray(config.position);
      hero.mesh.rotation.y = 0;
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
    this.monsters = lineup.map(([type, position, scale, facing], index) => {
      const monster = new Monster(this.scene, type, position);
      monster.mesh.scale.multiplyScalar(scale);
      monster.mesh.rotation.y = facing;
      if (monster.nameSprite) monster.nameSprite.visible = false;
      if (monster.hpBarGroup) monster.hpBarGroup.visible = false;
      monster.showcaseHome = position.clone();
      monster.showcasePhase = index;
      return monster;
    });
  }

  setSoundtrack(audio) {
    this.soundtrack = audio || null;
  }

  _buildFinaleTitle() {
    const label = 'ZOLOS ONLINE';
    this.finaleTitle = new THREE.Group();
    this.finaleTitle.position.set(0, 3.45, -3.8);
    this.finaleLetters = [];
    const spacing = 0.58;
    const startX = -((label.length - 1) * spacing) / 2;
    [...label].forEach((letter, index) => {
      if (letter === ' ') return;
      const canvas = document.createElement('canvas');
      canvas.width = 128; canvas.height = 160;
      const ctx = canvas.getContext('2d');
      const gradient = ctx.createLinearGradient(0, 20, 0, 145);
      gradient.addColorStop(0, '#fffbd0');
      gradient.addColorStop(0.46, '#ffd34f');
      gradient.addColorStop(1, '#ff8a24');
      ctx.font = '900 106px Arial Black, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 14; ctx.strokeStyle = 'rgba(22,45,95,.92)';
      ctx.shadowColor = '#50e8ff'; ctx.shadowBlur = 18;
      ctx.strokeText(letter, 64, 84); ctx.fillStyle = gradient; ctx.fillText(letter, 64, 84);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
      const sprite = new THREE.Sprite(material);
      sprite.position.x = startX + index * spacing;
      sprite.scale.set(0.62, 0.78, 1);
      sprite.renderOrder = 50;
      sprite.userData.letterIndex = index;
      this.finaleTitle.add(sprite);
      this.finaleLetters.push(sprite);
    });
    this.scene.add(this.finaleTitle);
  }

  _setFinaleProgress(progress) {
    const written = THREE.MathUtils.clamp(progress, 0, 1) * 12;
    this.finaleLetters.forEach((sprite) => {
      const reveal = THREE.MathUtils.clamp(written - sprite.userData.letterIndex, 0, 1);
      sprite.material.opacity = reveal;
      const pop = 0.72 + reveal * 0.28;
      sprite.scale.set(0.62 * pop, 0.78 * pop, 1);
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
    const musicTime = this.soundtrack && !this.soundtrack.paused ? this.soundtrack.currentTime : 0;
    const mvPhase = getLoginMvPhase(musicTime, this.soundtrack?.duration);
    const finaleStart = Number.isFinite(this.soundtrack?.duration) ? Math.max(91, this.soundtrack.duration - 18) : Infinity;
    const finaleProgress = mvPhase === 'finale' ? (musicTime - finaleStart) / 12 : 0;
    this._setFinaleProgress(finaleProgress);
    this.monsters.forEach((monster, index) => {
      const home = monster.showcaseHome;
      const party = mvPhase !== 'combat';
      const speed = party ? 1.25 + index * 0.08 : 0.28 + index * 0.035;
      const x = home.x + Math.sin(t * speed + index * 1.7) * (party ? 0.72 : 0.34 + index % 2 * 0.16);
      const z = home.z + Math.cos(t * speed * 0.82 + index) * (party ? 0.48 : 0.22 + index % 3 * 0.08);
      const dx = x - monster.mesh.position.x;
      const dz = z - monster.mesh.position.z;
      monster.mesh.position.x = x;
      monster.mesh.position.z = z;
      monster.mesh.position.y = Math.max(home.y, home.y + Math.abs(Math.sin(t * (party ? 3.8 : 1.7 + index * 0.12) + index)) * (party ? 0.18 : 0.055));
      monster.mesh.rotation.y = Math.atan2(dx, dz);
      monster.mesh.rotation.z = Math.sin(t * 1.5 + index) * 0.025;
      monster.animTimer += dt;
      monster.isMoving = true;
      animateMonsterRig(monster._professionalRig, monster.animTimer, true, false);
    });
    this.heroes.forEach((hero, index) => {
      const config = hero.userData;
      if (mvPhase === 'party') {
        const beat = t * (2.1 + index * 0.08) + index * 1.4;
        hero.state = Math.sin(beat) > 0.25 ? 'running' : 'walking';
        hero.mesh.position.set(
          config.position[0] + Math.sin(beat * 0.52) * 1.05,
          config.position[1] + Math.abs(Math.sin(beat)) * 0.13,
          config.position[2] + Math.cos(beat * 0.44) * 0.65,
        );
        hero.mesh.rotation.y = beat + Math.sin(beat * 0.6) * 0.5;
        hero.attackAnimElapsed = hero.attackAnimDuration;
        hero.update(dt);
        return;
      }
      if (mvPhase === 'finale') {
        const p = THREE.MathUtils.clamp(finaleProgress, 0, 1);
        if (index === 0) {
          hero.state = 'running';
          hero.mesh.position.set(THREE.MathUtils.lerp(-3.45, 3.45, p), 0.15 + Math.sin(t * 8) * 0.04, -1.0);
          hero.mesh.rotation.y = Math.PI / 2;
        } else {
          const side = index === 1 ? -1 : 1;
          hero.state = 'walking';
          hero.mesh.position.set(side * (4.6 + (index - 1) * 0.55), 0.08 + Math.abs(Math.sin(t * 3.4 + index)) * 0.16, -0.5 + index * 0.35);
          hero.mesh.rotation.y = Math.sin(t * 2.1 + index) * 0.55;
        }
        hero.attackAnimElapsed = hero.attackAnimDuration;
        hero.update(dt);
        return;
      }
      const action = getShowcaseAction(t, config.phase, config.duration);
      const target = this.monsters[config.target];
      const home = hero.showcaseHome;
      const approach = hero.showcaseMoveTarget.copy(hero.showcaseApproach);
      if (target && (action.state === 'running' || action.state === 'attacking' || action.state === 'idle')) {
        const offset = config.job === 'archer' || config.job === 'mage' || config.job === 'priest' ? 2.0 : 0.9;
        const away = approach.clone().sub(target.mesh.position).setY(0).normalize().multiplyScalar(offset);
        approach.copy(target.mesh.position).add(away);
      }
      const travel = action.travel ?? 1;
      hero.mesh.position.lerpVectors(home, approach, THREE.MathUtils.smoothstep(travel, 0, 1));
      hero.mesh.position.y += Math.sin(t * 1.4 + index) * 0.018;
      const lookAt = action.state === 'walking' && travel < 0.1 ? approach : (target?.mesh.position || approach);
      hero.mesh.rotation.y = Math.atan2(lookAt.x - hero.mesh.position.x, lookAt.z - hero.mesh.position.z);
      hero.state = action.state;
      hero.attackAnimElapsed = action.state === 'attacking'
        ? Math.min(hero.attackAnimDuration, (action.attack || 0) * hero.attackAnimDuration)
        : hero.attackAnimDuration;
      hero.update(dt);
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
