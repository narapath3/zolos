# Spectacular Game Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the visual effects for all 12 skills in the Zolos game to create a highly spectacular Modern RPG / Anime style featuring vibrant glow effects, rotating magic circles, and spark emitters using dynamically generated canvas textures.

**Architecture:** We will create reusable in-memory procedural textures (radial glow spark, magic runic circle, and sword slash swoosh) inside `ParticleSystem.js`. We will implement an additive blending material constructor helper and use it to rewrite the visual layout of all 12 spells inside `spawnSkillEffect` without creating external resource loading overhead.

**Tech Stack:** HTML5 Canvas, Three.js (WebGL), Sprite / Points / Torus / Cone / Cylinder geometries

## Global Constraints

- Implement using vanilla Three.js APIs matching the current version used in `package.json` (`^0.185.0`).
- Ensure all additive blending materials set `depthWrite: false` and `transparent: true` to avoid black borders and overlay glitches.
- All particle counts must scale dynamically via `this.perfMonitor.getParticleCount()` to support performance scaling.

---

### Task 1: Procedural Textures & Core Emitters Helper

**Files:**
- Modify: `c:\Users\Admin\Desktop\zolos\src\engine\ParticleSystem.js`

**Interfaces:**
- Consumes: None (Core library infrastructure)
- Produces: `this.textures` (Object caching three compiled textures), `this._createGlowMaterial(colorVal, type, size)` (helper returning custom additive glow material)

- [ ] **Step 1: Setup texture generator in constructor**
Modify `ParticleSystem.js` constructor to call a texture initialization helper:
```javascript
        // Setup procedural textures
        this.textures = this._initProceduralTextures();
```

- [ ] **Step 2: Implement `_initProceduralTextures`**
Create canvas textures programmatically for `glowSpark`, `magicCircle`, and `slashBlade`:
```javascript
    _initProceduralTextures() {
        const textures = {};
        
        // 1. Glow Spark (radial gradient)
        const c1 = document.createElement('canvas');
        c1.width = c1.height = 32;
        const ctx1 = c1.getContext('2d');
        const grad1 = ctx1.createRadialGradient(16, 16, 0, 16, 16, 16);
        grad1.addColorStop(0, 'rgba(255,255,255,1)');
        grad1.addColorStop(0.3, 'rgba(255,255,255,0.8)');
        grad1.addColorStop(1, 'rgba(255,255,255,0)');
        ctx1.fillStyle = grad1;
        ctx1.fillRect(0, 0, 32, 32);
        textures.glowSpark = new THREE.CanvasTexture(c1);

        // 2. Magic Circle (geometric runes)
        const c2 = document.createElement('canvas');
        c2.width = c2.height = 256;
        const ctx2 = c2.getContext('2d');
        ctx2.strokeStyle = 'white';
        ctx2.lineWidth = 4;
        ctx2.shadowColor = 'white';
        ctx2.shadowBlur = 10;
        
        // Outer rings
        ctx2.beginPath(); ctx2.arc(128, 128, 110, 0, Math.PI*2); ctx2.stroke();
        ctx2.beginPath(); ctx2.arc(128, 128, 95, 0, Math.PI*2); ctx2.stroke();
        
        // Inner triangle / star
        ctx2.lineWidth = 2;
        ctx2.beginPath();
        for (let i = 0; i < 3; i++) {
            const angle = (i * Math.PI * 2 / 3) - Math.PI / 2;
            const x = 128 + Math.cos(angle) * 90;
            const y = 128 + Math.sin(angle) * 90;
            if (i === 0) ctx2.moveTo(x, y); else ctx2.lineTo(x, y);
        }
        ctx2.closePath(); ctx2.stroke();
        
        // Inner circles
        ctx2.beginPath(); ctx2.arc(128, 128, 30, 0, Math.PI*2); ctx2.stroke();
        textures.magicCircle = new THREE.CanvasTexture(c2);

        // 3. Melee Slash Blade (curved blade swoosh)
        const c3 = document.createElement('canvas');
        c3.width = 120; c3.height = 120;
        const ctx3 = c3.getContext('2d');
        const grad3 = ctx3.createRadialGradient(60, 60, 20, 60, 60, 50);
        grad3.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        grad3.addColorStop(0.5, 'rgba(255, 255, 255, 0.4)');
        grad3.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx3.fillStyle = grad3;
        ctx3.beginPath();
        ctx3.arc(60, 60, 45, -Math.PI / 6, Math.PI / 6);
        ctx3.lineWidth = 12;
        ctx3.strokeStyle = grad3;
        ctx3.stroke();
        textures.slashBlade = new THREE.CanvasTexture(c3);

        return textures;
    }
```

- [ ] **Step 3: Implement helper `_createGlowMaterial`**
Add the helper under procedural textures matching this behavior:
```javascript
    _createGlowMaterial(colorVal, textureType, size = 0.5) {
        return new THREE.PointsMaterial({
            size: size,
            color: colorVal,
            map: this.textures[textureType] || this.textures.glowSpark,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false
        });
    }
```

- [ ] **Step 4: Verify Compilation**
Run the compiler check by running: `npm run build`
Expected: Passes with no typescript or vite errors.

---

### Task 2: Overhauling Melee & Novice Skills (Bash, Heal, Magnum Break)

**Files:**
- Modify: `c:\Users\Admin\Desktop\zolos\src\engine\ParticleSystem.js`

**Interfaces:**
- Consumes: `this.textures` and `_createGlowMaterial` from Task 1
- Produces: Enhanced visual implementations inside `spawnSkillEffect` switch cases for `'bash'`, `'heal'`, and `'magnumBreak'`.

- [ ] **Step 1: Implementing Bash case**
Overhaul `spawnSkillEffect` for case `'bash'` by creating three-dimensional slashing crescent trails:
```javascript
            case 'bash': {
                // Crescent blade trail
                const trailGeo = new THREE.RingGeometry(0.3, 1.0, 18, 1, 0, Math.PI * 0.9);
                const trailMat = new THREE.MeshBasicMaterial({
                    color: 0xffaa40,
                    map: this.textures.slashBlade,
                    transparent: true,
                    opacity: 0.95,
                    blending: THREE.AdditiveBlending,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                const mesh = new THREE.Mesh(trailGeo, trailMat);
                mesh.position.copy(at);
                mesh.position.y += 0.8;
                mesh.rotation.y = Math.random() * Math.PI * 2;
                mesh.rotation.x = (Math.random() - 0.5) * 0.4;
                this.scene.add(mesh);
                this.slashes.push({ mesh, life: 0.25, maxLife: 0.25 });
                
                // Additive sparks
                this._fxBurst(at, 0xff7a30, 25, 7, { life: 0.7, size: 0.15, useGlow: true });
                break;
            }
```

- [ ] **Step 2: Implementing Heal case**
Overhaul `spawnSkillEffect` for case `'heal'`:
Spawn a slow-rotating `magicCircle` on the ground. Rises green helical particles using sine wave math in the update loop or by launching particles from bottom with vertical speed, orbital radius and fading size.
```javascript
            case 'heal': {
                // Ground magic circle
                const cGeo = new THREE.PlaneGeometry(1.6, 1.6);
                const cMat = new THREE.MeshBasicMaterial({
                    color: 0x40ff60,
                    map: this.textures.magicCircle,
                    transparent: true,
                    opacity: 0.9,
                    blending: THREE.AdditiveBlending,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                const circle = new THREE.Mesh(cGeo, cMat);
                circle.position.copy(origin);
                circle.position.y = 0.05;
                circle.rotation.x = -Math.PI / 2;
                this.scene.add(circle);
                this.shockwaves.push({ mesh: circle, life: 1.2, maxLife: 1.2, type: 'magic-ring' });

                // Swirling particles
                const count = Math.floor(30 * this.perfMonitor.getParticleCount());
                for (let i = 0; i < count; i++) {
                    const progress = i / count;
                    const angle = progress * Math.PI * 8;
                    const r = 0.6;
                    const p = new THREE.Mesh(
                        new THREE.SphereGeometry(0.08, 4, 4),
                        new THREE.MeshBasicMaterial({ color: 0x66ff88, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
                    );
                    p.position.set(
                        origin.x + Math.cos(angle) * r,
                        origin.y + 0.1 + progress * 2.0,
                        origin.z + Math.sin(angle) * r
                    );
                    this.scene.add(p);
                    this.hitEffects.push({
                        mesh: p,
                        velocity: new THREE.Vector3(-Math.sin(angle)*0.5, 1.4, Math.cos(angle)*0.5),
                        life: 1.2,
                        gravity: -0.4
                    });
                }
                
                // Rising pillar
                this._fxPillar(origin, 0x66ff88, 1.0, 3.0, 0.8);
                break;
            }
```

- [ ] **Step 3: Implementing Magnum Break case**
Overhaul case `'magnumBreak'`:
```javascript
            case 'magnumBreak': {
                // Expanding fire magic circle
                const cGeo = new THREE.PlaneGeometry(2.5, 2.5);
                const cMat = new THREE.MeshBasicMaterial({
                    color: 0xff5010,
                    map: this.textures.magicCircle,
                    transparent: true,
                    opacity: 0.95,
                    blending: THREE.AdditiveBlending,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                const circle = new THREE.Mesh(cGeo, cMat);
                circle.position.copy(origin);
                circle.position.y = 0.05;
                circle.rotation.x = -Math.PI / 2;
                this.scene.add(circle);
                this.shockwaves.push({ mesh: circle, life: 1.5, maxLife: 1.5, type: 'magic-ring-expand' });

                // Massive radial spark explosion
                this._fxBurst(origin, 0xff3b00, 50, 11, { rise: 3, life: 1.0, size: 0.22 });
                this._fxRing(origin, 0xffaa00, 0.8, 0.06, 0.5, 6.0);
                this._fxPillar(origin, 0xff3a00, 1.2, 4.0, 1.5);
                break;
            }
```

- [ ] **Step 4: Launch local client and verify**
Command: `npm run dev`
Expected: Server starts on localhost:5173. Login as Guest and verify no combat actions throw WebGL rendering exceptions.

---

### Task 3: Overhauling Swordsman & Priest Skills (Endure, Holy Light, Blessing)

**Files:**
- Modify: `c:\Users\Admin\Desktop\zolos\src\engine\ParticleSystem.js`

**Interfaces:**
- Consumes: Core textures and materials
- Produces: Enhanced case `'endure'`, `'holyLight'`, and `'blessing'` inside `spawnSkillEffect`.

- [ ] **Step 1: Implementing Endure case**
Hexagonal shield dome:
```javascript
            case 'endure': {
                // Custom wireframe shield dome
                const domeGeo = new THREE.SphereGeometry(1.0, 12, 12, 0, Math.PI*2, 0, Math.PI/2);
                const domeMat = new THREE.MeshBasicMaterial({
                    color: 0x80c0ff,
                    wireframe: true,
                    transparent: true,
                    opacity: 0.45,
                    blending: THREE.AdditiveBlending,
                    side: THREE.DoubleSide
                });
                const dome = new THREE.Mesh(domeGeo, domeMat);
                dome.position.copy(origin);
                dome.position.y += 0.1;
                this.scene.add(dome);
                this.shockwaves.push({ mesh: dome, life: 1.5, maxLife: 1.5, type: 'endure-dome' });

                // Ring and sparkles
                this._fxRing(origin, 0xb0e0ff, 1.0, 0.06, 0.5, 1.8);
                this._fxBurst(origin, 0xd0f0ff, 20, 4, { rise: 2, gravity: -0.6, life: 1.2, size: 0.12 });
                break;
            }
```

- [ ] **Step 2: Implementing Holy Light case**
Holy ray, glowing feathers:
```javascript
            case 'holyLight': {
                // Sacred sky light strike
                const rayGeo = new THREE.CylinderGeometry(0.1, 0.6, 15, 8, 1, true);
                const rayMat = new THREE.MeshBasicMaterial({
                    color: 0xfffca0,
                    transparent: true,
                    opacity: 0.8,
                    blending: THREE.AdditiveBlending,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                const ray = new THREE.Mesh(rayGeo, rayMat);
                ray.position.copy(at);
                ray.position.y += 7.5;
                this.scene.add(ray);
                this.shockwaves.push({ mesh: ray, life: 0.6, maxLife: 0.6, type: 'pillar' });

                // Holy ground flash
                this._fxRing(at, 0xfff0aa, 0.6, 0.05, 0.4, 3.0);
                this._fxBurst(at, 0xffffff, 30, 6, { rise: 2, gravity: 0.5, life: 0.9, size: 0.15 });
                break;
            }
```

- [ ] **Step 3: Implementing Blessing case**
Holy cross ascending:
```javascript
            case 'blessing': {
                // Glowing golden cross
                const group = new THREE.Group();
                const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 0.2), new THREE.MeshBasicMaterial({ color: 0xffdf60, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
                const hBar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.2), new THREE.MeshBasicMaterial({ color: 0xffdf60, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
                hBar.position.y = 0.2;
                group.add(vBar); group.add(hBar);
                group.position.copy(origin);
                group.position.y += 1.0;
                this.scene.add(group);
                this.hitEffects.push({ mesh: group, velocity: new THREE.Vector3(0, 1.2, 0), gravity: -0.2, life: 1.4, maxLife: 1.4 });

                // Holy halos
                this._fxRing(origin, 0xffea70, 0.9, 0.05, 0.3, 1.6);
                this._fxPillar(origin, 0xfff590, 1.2, 4.0, 1.0);
                break;
            }
```

---

### Task 4: Overhauling Mage Skills (Fire Bolt, Frost Nova, Energy Coat)

**Files:**
- Modify: `c:\Users\Admin\Desktop\zolos\src\engine\ParticleSystem.js`

**Interfaces:**
- Consumes: Core textures and materials
- Produces: Enhanced case `'fireBolt'`, `'frostNova'`, and `'energyCoat'` inside `spawnSkillEffect`.

- [ ] **Step 1: Implementing Fire Bolt case**
Fire comet, exploding particle cloud:
```javascript
            case 'fireBolt': {
                // Explosive burst
                this._fxBurst(at, 0xff4f00, 45, 9, { life: 1.0, rise: 2, size: 0.25 });
                this._fxRing(at, 0xffaa00, 0.8, 0.06, 0.4, 2.5);
                this._fxPillar(at, 0xff5511, 1.0, 3.5, 0.8);
                break;
            }
```

- [ ] **Step 2: Implementing Frost Nova case**
Diamond frost spikes exploding:
```javascript
            case 'frostNova': {
                // Ground frost circle
                this._fxRing(origin, 0x4aa0ff, 1.0, 0.05, 0.5, 5.0);
                this._fxRing(origin, 0xaaddff, 0.8, 0.05, 0.3, 3.5);

                // Exploding crystal shards
                const count = Math.floor(25 * this.perfMonitor.getParticleCount());
                for (let i = 0; i < count; i++) {
                    const size = 0.08 + Math.random() * 0.12;
                    const geo = new THREE.OctahedronGeometry(size); // diamond geometry
                    const mat = new THREE.MeshBasicMaterial({
                        color: 0x88ccff,
                        transparent: true,
                        opacity: 0.9,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false
                    });
                    const mesh = new THREE.Mesh(geo, mat);
                    mesh.position.copy(origin);
                    mesh.position.y += 0.5;

                    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.3;
                    const speed = 4 + Math.random() * 5;
                    const velocity = new THREE.Vector3(Math.cos(angle) * speed, 0.5, Math.sin(angle) * speed);
                    this.scene.add(mesh);
                    this.hitEffects.push({ mesh, velocity, life: 0.9, gravity: 0.5 });
                }
                break;
            }
```

- [ ] **Step 3: Implementing Energy Coat case**
Mana shield, orbiting purple energy particles:
```javascript
            case 'energyCoat': {
                // Purple force shield
                const geom = new THREE.SphereGeometry(1.0, 16, 16);
                const mate = new THREE.MeshBasicMaterial({
                    color: 0xa040ff,
                    wireframe: true,
                    transparent: true,
                    opacity: 0.35,
                    blending: THREE.AdditiveBlending,
                    side: THREE.DoubleSide
                });
                const dome = new THREE.Mesh(geom, mate);
                dome.position.copy(origin);
                dome.position.y += 1.0;
                this.scene.add(dome);
                this.shockwaves.push({ mesh: dome, life: 1.5, maxLife: 1.5, type: 'endure-dome' });

                // Orbiting sparks
                const count = Math.floor(18 * this.perfMonitor.getParticleCount());
                for (let i = 0; i < count; i++) {
                    const p = new THREE.Mesh(
                        new THREE.SphereGeometry(0.08, 4, 4),
                        new THREE.MeshBasicMaterial({ color: 0xd066ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
                    );
                    const angle = Math.random() * Math.PI * 2;
                    p.position.set(origin.x + Math.cos(angle)*1.0, origin.y + 1.0 + (Math.random() - 0.5)*0.8, origin.z + Math.sin(angle)*1.0);
                    this.scene.add(p);
                    this.hitEffects.push({
                        mesh: p,
                        velocity: new THREE.Vector3(-Math.sin(angle)*1.5, 0, Math.cos(angle)*1.5),
                        life: 1.2,
                        gravity: 0
                    });
                }
                break;
            }
```

---

### Task 5: Overhauling Archer Skills (Double Strafe, Arrow Shower, Concentration)

**Files:**
- Modify: `c:\Users\Admin\Desktop\zolos\src\engine\ParticleSystem.js`

**Interfaces:**
- Consumes: Core textures and materials
- Produces: Enhanced case `'doubleStrafe'`, `'arrowShower'`, and `'concentration'` inside `spawnSkillEffect`.

- [ ] **Step 1: Implementing Double Strafe case**
Lime wind streaks + dual hit spark explosions:
```javascript
            case 'doubleStrafe': {
                this._fxBurst(at, 0xbfff40, 20, 8, { life: 0.6, size: 0.16 });
                this._fxBurst(at, 0xe0ff70, 20, 9, { life: 0.6, yOff: 0.9, size: 0.14 });
                this._fxRing(at, 0x88ff30, 0.5, 0.4, 0.2, 1.2);
                break;
            }
```

- [ ] **Step 2: Implementing Arrow Shower case**
Sky rain arrow visual:
```javascript
            case 'arrowShower': {
                // Highlighting target circle
                this._fxRing(origin, 0x76ff60, 1.5, 0.05, 0.3, 5.0);

                // Rain arrows vertical
                const count = Math.floor(40 * this.perfMonitor.getParticleCount());
                for (let i = 0; i < count; i++) {
                    const arrow = new THREE.Mesh(
                        new THREE.CylinderGeometry(0.015, 0.015, 0.6, 4),
                        new THREE.MeshBasicMaterial({ color: 0xaaff50, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })
                    );
                    const aAngle = Math.random() * Math.PI * 2;
                    const rDist = Math.random() * 4.5;
                    arrow.position.set(origin.x + Math.cos(aAngle)*rDist, origin.y + 6.0 + Math.random()*3.5, origin.z + Math.sin(aAngle)*rDist);
                    arrow.rotation.x = Math.PI; // point down
                    this.scene.add(arrow);
                    this.hitEffects.push({
                        mesh: arrow,
                        velocity: new THREE.Vector3(0, -(12 + Math.random()*6), 0),
                        life: 0.8,
                        gravity: -4
                    });
                }
                break;
            }
```

- [ ] **Step 3: Implementing Concentration case**
Swirl/implode particles inward:
```javascript
            case 'concentration': {
                // Converging ring at character
                this._fxRing(origin, 0xffd24a, 0.8, 0.05, 2.0, 0.4); 

                // Imploding/converging sparks
                const count = Math.floor(25 * this.perfMonitor.getParticleCount());
                for (let i = 0; i < count; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const r = 2.2;
                    const p = new THREE.Mesh(
                        new THREE.SphereGeometry(0.08, 4, 4),
                        new THREE.MeshBasicMaterial({ color: 0xffcc33, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending })
                    );
                    p.position.set(origin.x + Math.cos(angle)*r, origin.y + 0.1 + Math.random()*1.8, origin.z + Math.sin(angle)*r);
                    this.scene.add(p);
                    
                    // Directing velocity towards character center
                    this.hitEffects.push({
                        mesh: p,
                        velocity: new THREE.Vector3(-Math.cos(angle)*2.2, 0.2, -Math.sin(angle)*2.2),
                        life: 1.0,
                        gravity: 0
                    });
                }

                this._fxPillar(origin, 0xffd24a, 1.0, 3.2, 0.8);
                break;
            }
```

- [ ] **Step 4: Comprehensive visual verify**
Run client, test all Archer skills. Make sure the visual timing aligns perfectly and particle fade-outs operate smoothly.

---

### Task 6: Customizing shockwaves update logic for endure dome rotation

**Files:**
- Modify: `c:\Users\Admin\Desktop\zolos\src\engine\ParticleSystem.js`

**Interfaces:**
- Consumes: Endure dome visual mesh scale/animation logic inside the update loop
- Produces: Rotating shield animation for Endure and Energy Coat dome meshes.

- [ ] **Step 1: Adding custom rotation check in update loop**
Modify `c:\Users\Admin\Desktop\zolos\src\engine\ParticleSystem.js` in the `update()` loop around line 915:
```javascript
            } else if (wave.type === 'endure-dome') {
                // Bubble remains same size, rotates and fades out
                wave.mesh.rotation.y += deltaTime * 2.0;
                wave.mesh.material.opacity = 0.35 * (1 - progress);
```

- [ ] **Step 2: Adding magic-ring rotation check in update loop**
Modify update loop around line 915:
```javascript
            } else if (wave.type === 'magic-ring') {
                // Rotates the plane circle
                wave.mesh.rotation.z += deltaTime * 1.5;
                wave.mesh.material.opacity = 0.9 * (1 - progress);
            } else if (wave.type === 'magic-ring-expand') {
                // Rotates and scales up
                wave.mesh.rotation.z -= deltaTime * 1.0;
                wave.mesh.scale.set(1 + progress * 2, 1 + progress * 2, 1);
                wave.mesh.material.opacity = 0.9 * (1 - progress);
```

- [ ] **Step 3: Verification of Animation**
Verify that domes rotate smoothly during `Endure` / `Energy Coat` buff and that `Heal / Magnum Break` circles rotate as they expand/fade.
