// Monster Manager — Monster spawning, AI, and management
import * as THREE from 'three';
import { MONSTERS, pickRandomMonster, getSpawnTable, getAllMonsters, pickRandomWaterMonster, getWaterSpawnTable } from './GameData.js';

// Reference level used for the SHARED world spawn tables. Fixed (not the local
// player's level) so every player — whatever their level — builds the exact
// same monster layout for a map, i.e. the same types at the same spots.
const SHARED_SPAWN_LEVEL = 999;

// Stable 32-bit hash of a string, so each map gets its own deterministic layout
// while every player on that map still matches.
function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h | 0;
}

const MAX_MONSTERS = 12;
const MAX_WATER_MONSTERS = 4;
const SPAWN_RANGE = 12;
const RESPAWN_TIME = 3;

export function resolveMonsterDamage(amount, defense = 0, { ignoreDefense = false } = {}) {
    const incoming = Math.max(0, Number(amount) || 0);
    if (ignoreDefense) return incoming;
    return Math.max(1, incoming - Math.floor((Number(defense) || 0) * 0.3));
}

// Seeded PRNG (mulberry32) — ensures all clients spawn monsters at the same positions
function createSeededRng(seed) {
    let s = seed | 0;
    return function () {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Daily seed — same UTC date = same monster layout for all players
function getDailySeed() {
    const d = new Date();
    return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

class Monster {
    constructor(scene, type, position) {
        this.scene = scene;
        this.type = type;
        const allMonsters = getAllMonsters();
        this.data = allMonsters[type];
        this.hp = this.data.hp;
        this.maxHp = this.data.hp;
        this.alive = true;
        this.respawnTimer = 0;
        this.animTimer = Math.random() * Math.PI * 2;
        this.wanderTarget = null;
        this.wanderTimer = 0;
        this.hitFlash = 0;
        this.isMoving = false; // Flag to track movement for water splashing
        this.isWaterMonster = !!this.data.waterOnly;

        this._createModel(position);

        // Bigger, more imposing monsters — the tougher, the larger. Scales the
        // whole group uniformly (feet stay grounded); positions/centres are
        // unchanged so movement and hit-ranges keep working.
        let ms = 1.5;
        const hp0 = this.data.hp || 0;
        if (hp0 >= 800) ms = 1.7;
        if (hp0 >= 2500) ms = 1.85;
        if (hp0 >= 6000) ms = 2.05;
        this._scale = ms;
        this.mesh.scale.setScalar(ms);

        // Aggro state (chase + attack the player when provoked or approached).
        this._aggroUntil = 0;
        this._atkCd = 0;
    }

    _createModel(position) {
        this.mesh = new THREE.Group();

        const size = this.data.size;
        const color = this.data.color;

        // Custom material builder helper
        const createMat = (colorHex, roughness = 0.5, metalness = 0.1, transparent = false, opacity = 1.0) => {
            return new THREE.MeshStandardMaterial({
                color: colorHex,
                roughness: roughness,
                metalness: metalness,
                transparent: transparent,
                opacity: opacity,
                flatShading: false
            });
        };

        // Main body (smoothed slime-like shape)
        const bodyGeo = new THREE.SphereGeometry(size * 0.5, 24, 18);
        const bodyMat = createMat(
            color,
            this.type === 'ghostring' ? 0.2 : 0.5,
            this.type === 'ghostring' ? 0.4 : 0.1,
            this.type === 'ghostring',
            this.type === 'ghostring' ? 0.55 : 1.0
        );
        this.bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        this.bodyMesh.position.y = size * 0.4;
        this.bodyMesh.castShadow = true;
        this.bodyMesh.receiveShadow = true;
        this.mesh.add(this.bodyMesh);

        // ---- Shared builders for the humanoid / beast / dragon monsters below.
        // Positions are unit-relative (× size); bodyMesh sits at world y=size*0.4
        // so a part at y=-0.4 stands on the ground. hideBody() makes the default
        // sphere invisible while its children (custom parts) still render + flash.
        let ownEyes = false;
        const box = (w, h, d) => new THREE.BoxGeometry(w * size, h * size, d * size);
        const cyl = (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt * size, rb * size, h * size, s);
        const cone = (r, h, s = 8) => new THREE.ConeGeometry(r * size, h * size, s);
        const sph = (r, s = 10) => new THREE.SphereGeometry(r * size, s, s);
        const put = (geo, material, x, y, z, rot) => {
            const msh = new THREE.Mesh(geo, material);
            msh.position.set(x * size, y * size, z * size);
            if (rot) msh.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
            msh.castShadow = true;
            this.bodyMesh.add(msh);
            return msh;
        };
        const glowEyes = (c, y = 0.15, spread = 0.13, z = 0.34, r = 0.06) => {
            ownEyes = true;
            const g = sph(r, 8);
            put(g, new THREE.MeshBasicMaterial({ color: c }), -spread, y, z);
            put(g, new THREE.MeshBasicMaterial({ color: c }), spread, y, z);
        };
        const hideBody = () => { this.bodyMesh.material.transparent = true; this.bodyMesh.material.opacity = 0; };

        // Feature decorations
        if (this.type === 'poring') {
            // Cute pink rosy cheeks
            const cheekGeo = new THREE.SphereGeometry(0.04 * size, 8, 8);
            const cheekMat = createMat(0xff99bb, 0.4, 0.0);

            const cheekL = new THREE.Mesh(cheekGeo, cheekMat);
            cheekL.position.set(-0.25 * size, 0.05 * size, 0.3 * size);
            this.bodyMesh.add(cheekL);

            const cheekR = new THREE.Mesh(cheekGeo, cheekMat);
            cheekR.position.set(0.25 * size, 0.05 * size, 0.3 * size);
            this.bodyMesh.add(cheekR);
        } else if (this.type === 'poporing') {
            // A green leaf on top of its head
            const stemGeo = new THREE.CylinderGeometry(0.01 * size, 0.01 * size, 0.15 * size, 4);
            const stemMat = createMat(0x2a5e2a, 0.7, 0.0);
            const stem = new THREE.Mesh(stemGeo, stemMat);
            stem.position.set(0, 0.55 * size, 0);
            stem.rotation.z = 0.2;
            this.bodyMesh.add(stem);

            const leafGeo = new THREE.BoxGeometry(0.12 * size, 0.02 * size, 0.2 * size);
            const leafMat = createMat(0x40a040, 0.6, 0.0);
            const leaf = new THREE.Mesh(leafGeo, leafMat);
            leaf.position.set(0.06 * size, 0.62 * size, 0);
            leaf.rotation.z = -0.3;
            this.bodyMesh.add(leaf);
        } else if (this.type === 'drops') {
            // Orange drop shape/spire at the top
            const dropSpireGeo = new THREE.ConeGeometry(0.15 * size, 0.35 * size, 8);
            const dropSpireMat = createMat(color, 0.4, 0.1);
            const spire = new THREE.Mesh(dropSpireGeo, dropSpireMat);
            spire.position.set(0, 0.55 * size, 0);
            this.bodyMesh.add(spire);
        } else if (this.type === 'lunatic') {
            // rabbit ears
            const earGeo = new THREE.BoxGeometry(0.08 * size, 0.35 * size, 0.06 * size);
            const earInnerGeo = new THREE.BoxGeometry(0.04 * size, 0.25 * size, 0.07 * size);
            const earMat = createMat(color, 0.6, 0.0);
            const earInnerMat = createMat(0xffb0c0, 0.6, 0.0); // Pink inner ear

            const earL = new THREE.Mesh(earGeo, earMat);
            earL.position.set(-0.15 * size, 0.5 * size, 0);
            earL.rotation.z = 0.25;
            earL.rotation.y = 0.1;
            this.bodyMesh.add(earL);
            const earLInner = new THREE.Mesh(earInnerGeo, earInnerMat);
            earLInner.position.set(0, 0.02 * size, 0.01 * size);
            earL.add(earLInner);

            const earR = new THREE.Mesh(earGeo, earMat);
            earR.position.set(0.15 * size, 0.5 * size, 0);
            earR.rotation.z = -0.25;
            earR.rotation.y = -0.1;
            this.bodyMesh.add(earR);
            const earRInner = new THREE.Mesh(earInnerGeo, earInnerMat);
            earRInner.position.set(0, 0.02 * size, 0.01 * size);
            earR.add(earRInner);

            // Fluffy tail
            const tailGeo = new THREE.SphereGeometry(0.12 * size, 8, 8);
            const tail = new THREE.Mesh(tailGeo, earMat);
            tail.position.set(0, -0.1 * size, -0.45 * size);
            this.bodyMesh.add(tail);
        } else if (this.type === 'fabre') {
            // segmented caterpillar shape
            this.bodyMesh.scale.set(0.8, 0.8, 0.8);

            // Mid segment
            const seg1Geo = new THREE.SphereGeometry(size * 0.4, 16, 12);
            const seg1 = new THREE.Mesh(seg1Geo, bodyMat);
            seg1.position.set(0, 0, -size * 0.4);
            seg1.castShadow = true;
            this.bodyMesh.add(seg1);

            // Tail segment
            const seg2Geo = new THREE.SphereGeometry(size * 0.3, 16, 12);
            const seg2 = new THREE.Mesh(seg2Geo, bodyMat);
            seg2.position.set(0, -size * 0.05, -size * 0.75);
            seg2.castShadow = true;
            this.bodyMesh.add(seg2);

            // Little feelers
            const feelerGeo = new THREE.CylinderGeometry(0.01 * size, 0.01 * size, 0.18 * size, 4);
            const feelerMat = createMat(0xccaa44, 0.5, 0.0);
            const feelerL = new THREE.Mesh(feelerGeo, feelerMat);
            feelerL.position.set(-0.1 * size, size * 0.45, size * 0.2);
            feelerL.rotation.set(0.4, 0, -0.2);
            this.bodyMesh.add(feelerL);

            const feelerR = new THREE.Mesh(feelerGeo, feelerMat);
            feelerR.position.set(0.1 * size, size * 0.45, size * 0.2);
            feelerR.rotation.set(0.4, 0, 0.2);
            this.bodyMesh.add(feelerR);
        } else if (this.type === 'willow') {
            const branchGeo = new THREE.BoxGeometry(0.1 * size, 0.4 * size, 0.1 * size);
            const branchMat = createMat(0x6a4020, 0.9, 0.0);

            const branchL = new THREE.Mesh(branchGeo, branchMat);
            branchL.position.set(-0.25 * size, size * 0.4, 0);
            branchL.rotation.z = 0.5;
            this.bodyMesh.add(branchL);

            const branchR = new THREE.Mesh(branchGeo, branchMat);
            branchR.position.set(0.25 * size, size * 0.4, 0);
            branchR.rotation.z = -0.5;
            this.bodyMesh.add(branchR);

            // Green foliage block
            const foliageGeo = new THREE.SphereGeometry(size * 0.3, 12, 12);
            const foliageMat = createMat(0x3a7e3a, 0.8, 0.0);
            const foliage = new THREE.Mesh(foliageGeo, foliageMat);
            foliage.position.set(0, size * 0.55, 0);
            this.bodyMesh.add(foliage);
        } else if (this.type === 'deviruchi') {
            // devil horns
            const hornGeo = new THREE.ConeGeometry(0.08 * size, 0.3 * size, 8);
            const hornMat = createMat(0x200020, 0.3, 0.5);

            const hornL = new THREE.Mesh(hornGeo, hornMat);
            hornL.position.set(-0.2 * size, size * 0.45, 0);
            hornL.rotation.z = 0.35;
            this.bodyMesh.add(hornL);

            const hornR = new THREE.Mesh(hornGeo, hornMat);
            hornR.position.set(0.2 * size, size * 0.45, 0);
            hornR.rotation.z = -0.35;
            this.bodyMesh.add(hornR);

            // Devil wings
            const wingGeo = new THREE.BoxGeometry(0.4 * size, 0.2 * size, 0.02 * size);
            const wingMat = createMat(0x150015, 0.5, 0.2);

            const wingL = new THREE.Mesh(wingGeo, wingMat);
            wingL.position.set(-0.45 * size, size * 0.1, -0.2 * size);
            wingL.rotation.y = 0.4;
            wingL.rotation.z = 0.2;
            this.bodyMesh.add(wingL);

            const wingR = new THREE.Mesh(wingGeo, wingMat);
            wingR.position.set(0.45 * size, size * 0.1, -0.2 * size);
            wingR.rotation.y = -0.4;
            wingR.rotation.z = -0.2;
            this.bodyMesh.add(wingR);
        } else if (this.type === 'ghostring') {
            const skirtGeo = new THREE.CylinderGeometry(size * 0.5, size * 0.55, size * 0.3, 8, 1, true);
            const skirtMat = createMat(color, 0.2, 0.4, true, 0.5);
            const skirt = new THREE.Mesh(skirtGeo, skirtMat);
            skirt.position.set(0, -size * 0.2, 0);
            this.bodyMesh.add(skirt);

            // Little floating ghost wings
            const wingGeo = new THREE.ConeGeometry(0.12 * size, 0.3 * size, 4);
            const wingMat = createMat(0xffffff, 0.1, 0.5, true, 0.65);

            const gWingL = new THREE.Mesh(wingGeo, wingMat);
            gWingL.position.set(-0.4 * size, 0.1 * size, -0.1 * size);
            gWingL.rotation.z = 1.2;
            gWingL.rotation.y = 0.3;
            this.bodyMesh.add(gWingL);

            const gWingR = new THREE.Mesh(wingGeo, wingMat);
            gWingR.position.set(0.4 * size, 0.1 * size, -0.1 * size);
            gWingR.rotation.z = -1.2;
            gWingR.rotation.y = -0.3;
            this.bodyMesh.add(gWingR);
        } else if (this.type === 'spore') {
            // Mushroom stem and cap!
            this.bodyMesh.scale.set(0.2, 0.2, 0.2);

            // Stem
            const stemGeo = new THREE.CylinderGeometry(size * 0.18, size * 0.25, size * 0.6, 12);
            const stemMat = createMat(0xeae0cc, 0.9, 0.0);
            const stem = new THREE.Mesh(stemGeo, stemMat);
            stem.position.set(0, 0.1 * size, 0);
            stem.castShadow = true;
            stem.receiveShadow = true;
            this.bodyMesh.add(stem);

            // Cap
            const capGeo = new THREE.SphereGeometry(size * 0.5, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
            const capMat = createMat(color, 0.5, 0.0);
            const cap = new THREE.Mesh(capGeo, capMat);
            cap.position.set(0, 0.35 * size, 0);
            cap.castShadow = true;
            this.bodyMesh.add(cap);

            // Spore spots
            const spotGeo = new THREE.SphereGeometry(size * 0.06, 6, 6);
            const spotMat = createMat(0xffffff, 0.8, 0.0);
            const spotsCoords = [
                [-0.2, 0.65, 0.2],
                [0.2, 0.65, 0.2],
                [0.0, 0.75, 0.1],
                [-0.3, 0.5, 0.1],
                [0.3, 0.5, 0.1],
                [0, 0.55, -0.3]
            ];
            spotsCoords.forEach(([sx, sy, sz]) => {
                const spot = new THREE.Mesh(spotGeo, spotMat);
                spot.position.set(sx * size, sy * size, sz * size);
                this.bodyMesh.add(spot);
            });
        } else if (this.type === 'bigfoot') {
            // Bear ears and snout
            const earBearGeo = new THREE.SphereGeometry(size * 0.14, 12, 12);
            const earBearR = new THREE.Mesh(earBearGeo, bodyMat);
            earBearR.position.set(-0.35 * size, 0.35 * size, 0);
            this.bodyMesh.add(earBearR);

            const earBearL = new THREE.Mesh(earBearGeo, bodyMat);
            earBearL.position.set(0.35 * size, 0.35 * size, 0);
            this.bodyMesh.add(earBearL);

            // Snout
            const snoutGeo = new THREE.SphereGeometry(size * 0.16, 10, 10);
            const snoutMat = createMat(0xd7bb9c, 0.8, 0.0);
            const snout = new THREE.Mesh(snoutGeo, snoutMat);
            snout.position.set(0, 0.05 * size, 0.35 * size);
            snout.scale.set(1.0, 0.8, 1.2);
            this.bodyMesh.add(snout);

            // Nose tip
            const noseTipGeo = new THREE.SphereGeometry(size * 0.05, 6, 6);
            const noseTipMat = createMat(0x1a110b, 0.7, 0.1);
            const noseTip = new THREE.Mesh(noseTipGeo, noseTipMat);
            noseTip.position.set(0, 0.08 * size, 0.5 * size);
            this.bodyMesh.add(noseTip);
        } else if (this.type === 'nine_tail') {
            // Fox ears
            const fEarGeo = new THREE.ConeGeometry(0.1 * size, 0.28 * size, 4);
            const earF = createMat(color, 0.5, 0.0);
            const fEarL = new THREE.Mesh(fEarGeo, earF);
            fEarL.position.set(-0.2 * size, 0.45 * size, 0.1 * size);
            fEarL.rotation.set(-0.2, 0.2, 0.4);
            this.bodyMesh.add(fEarL);

            const fEarR = new THREE.Mesh(fEarGeo, earF);
            fEarR.position.set(0.2 * size, 0.45 * size, 0.1 * size);
            fEarR.rotation.set(-0.2, -0.2, -0.4);
            this.bodyMesh.add(fEarR);

            // Nine tails fanning out in back
            const tailFoxGeo = new THREE.ConeGeometry(0.08 * size, 0.55 * size, 8);
            const tailTipGeo = new THREE.ConeGeometry(0.06 * size, 0.15 * size, 8);
            const tailTipMat = createMat(0xffffff, 0.5, 0.0);

            for (let i = 0; i < 9; i++) {
                const angle = -1.2 + (i / 8) * 2.4;
                const tGroup = new THREE.Group();
                tGroup.position.set(0, -0.1 * size, -0.35 * size);
                tGroup.rotation.y = angle + Math.PI;
                tGroup.rotation.z = Math.sin(angle * 1.5) * 0.3;

                const mainTail = new THREE.Mesh(tailFoxGeo, bodyMat);
                mainTail.position.set(0, 0.2 * size, 0.2 * size);
                mainTail.rotation.x = 0.5;
                tGroup.add(mainTail);

                const tip = new THREE.Mesh(tailTipGeo, tailTipMat);
                tip.position.set(0, 0.45 * size, 0.3 * size);
                tip.rotation.x = 0.5;
                tGroup.add(tip);

                this.bodyMesh.add(tGroup);
            }
        } else if (this.type === 'rocker') {
            const lineMat = createMat(0x608020, 0.9, 0.0);

            // Antenna L
            const antGeo = new THREE.CylinderGeometry(0.008 * size, 0.008 * size, 0.4 * size, 4);
            const antL = new THREE.Mesh(antGeo, lineMat);
            antL.position.set(-0.15 * size, 0.55 * size, 0.2 * size);
            antL.rotation.set(0.6, 0.15, -0.3);
            this.bodyMesh.add(antL);

            // Antenna R
            const antR = new THREE.Mesh(antGeo, lineMat);
            antR.position.set(0.15 * size, 0.55 * size, 0.2 * size);
            antR.rotation.set(0.6, -0.15, 0.3);
            this.bodyMesh.add(antR);

            // Legs
            const legGeo = new THREE.BoxGeometry(0.06 * size, 0.35 * size, 0.06 * size);
            const jointL = new THREE.Mesh(legGeo, lineMat);
            jointL.position.set(-0.35 * size, 0.0, -0.1 * size);
            jointL.rotation.set(-0.2, 0.0, 0.6);
            this.bodyMesh.add(jointL);

            const jointR = new THREE.Mesh(legGeo, lineMat);
            jointR.position.set(0.35 * size, 0.0, -0.1 * size);
            jointR.rotation.set(-0.2, 0.0, -0.6);
            this.bodyMesh.add(jointR);
        } else if (this.type === 'horn') {
            const hornBGeo = new THREE.ConeGeometry(0.07 * size, 0.4 * size, 6);
            const hornBMat = createMat(0x351d11, 0.3, 0.5);
            const horn = new THREE.Mesh(hornBGeo, hornBMat);
            horn.position.set(0, 0.3 * size, 0.35 * size);
            horn.rotation.x = 0.7;
            this.bodyMesh.add(horn);
        } else if (this.type === 'crab') {
            const clawGeo = new THREE.BoxGeometry(0.18 * size, 0.12 * size, 0.14 * size);
            const clawMat = createMat(color, 0.4, 0.1);

            const clawL = new THREE.Mesh(clawGeo, clawMat);
            clawL.position.set(-0.32 * size, -0.05 * size, 0.28 * size);
            clawL.rotation.y = 0.3;
            this.bodyMesh.add(clawL);

            const clawR = new THREE.Mesh(clawGeo, clawMat);
            clawR.position.set(0.32 * size, -0.05 * size, 0.28 * size);
            clawR.rotation.y = -0.3;
            this.bodyMesh.add(clawR);

            // Crab legs
            const legCGeo = new THREE.BoxGeometry(0.04 * size, 0.22 * size, 0.04 * size);
            for (let i = -1; i <= 1; i++) {
                const legL = new THREE.Mesh(legCGeo, clawMat);
                legL.position.set(-0.32 * size, -0.2 * size, i * 0.14 * size);
                legL.rotation.z = -0.5;
                this.bodyMesh.add(legL);

                const legR = new THREE.Mesh(legCGeo, clawMat);
                legR.position.set(0.32 * size, -0.2 * size, i * 0.14 * size);
                legR.rotation.z = 0.5;
                this.bodyMesh.add(legR);
            }
        } else if (this.type === 'fish' || this.type === 'shrimp') {
            const finGeo = new THREE.ConeGeometry(0.15 * size, 0.38 * size, 4);
            const finMat = createMat(color, 0.5, 0.1);
            const fin = new THREE.Mesh(finGeo, finMat);
            fin.position.set(0, 0, -size * 0.48);
            fin.rotation.x = Math.PI / 2;
            fin.rotation.z = Math.PI / 4;
            this.bodyMesh.add(fin);
        } else if (this.type === 'marina') {
            // tentacles
            const tentacleGeo = new THREE.CylinderGeometry(0.04 * size, 0.02 * size, 0.35 * size, 6);
            const tentacleMat = createMat(0xffffff, 0.5, 0.0);
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2;
                const tentacle = new THREE.Mesh(tentacleGeo, tentacleMat);
                tentacle.position.set(Math.cos(angle) * 0.25 * size, -size * 0.45, Math.sin(angle) * 0.25 * size);
                tentacle.rotation.x = Math.sin(angle) * 0.3;
                tentacle.rotation.z = -Math.cos(angle) * 0.3;
                this.bodyMesh.add(tentacle);
            }
        } else if (this.type === 'clam') {
            // Open shell halves
            this.bodyMesh.scale.set(0.1, 0.1, 0.1);

            const shellMat = createMat(0xd8cca0, 0.6, 0.1);
            const pearlMat = createMat(0xffeaea, 0.1, 0.3);

            const botGeo = new THREE.BoxGeometry(0.55 * size, 0.15 * size, 0.55 * size);
            const bot = new THREE.Mesh(botGeo, shellMat);
            bot.position.set(0, -0.05 * size, 0);
            bot.castShadow = true;
            this.bodyMesh.add(bot);

            const topGeo = new THREE.BoxGeometry(0.55 * size, 0.12 * size, 0.55 * size);
            const top = new THREE.Mesh(topGeo, shellMat);
            top.position.set(0, 0.15 * size, -0.05 * size);
            top.rotation.x = -0.45;
            top.castShadow = true;
            this.bodyMesh.add(top);

            const pearlGeo = new THREE.SphereGeometry(0.12 * size, 12, 12);
            const pearl = new THREE.Mesh(pearlGeo, pearlMat);
            pearl.position.set(0, 0.05 * size, 0.05 * size);
            this.bodyMesh.add(pearl);
        } else if (this.type === 'boa') {
            // Snake body segments
            this.bodyMesh.scale.set(0.9, 0.9, 1.1);

            const bSegGeo = new THREE.SphereGeometry(size * 0.4, 16, 12);
            const seg1 = new THREE.Mesh(bSegGeo, bodyMat);
            seg1.position.set(0, -0.05 * size, -0.38 * size);
            this.bodyMesh.add(seg1);

            const seg2 = new THREE.Mesh(bSegGeo, bodyMat);
            seg2.position.set(0.15 * size, -0.1 * size, -0.76 * size);
            this.bodyMesh.add(seg2);

            const tailGeo = new THREE.ConeGeometry(0.15 * size, 0.4 * size, 8);
            const tail = new THREE.Mesh(tailGeo, bodyMat);
            tail.position.set(0.05 * size, -0.15 * size, -1.1 * size);
            tail.rotation.x = Math.PI / 2 + 0.3;
            this.bodyMesh.add(tail);
        } else if (this.type === 'savage') {
            // Boar snout, tusks, dorsal spikes
            const snoutGeo = new THREE.BoxGeometry(size * 0.25, size * 0.2, size * 0.35);
            const snout = new THREE.Mesh(snoutGeo, bodyMat);
            snout.position.set(0, 0, 0.35 * size);
            this.bodyMesh.add(snout);

            const tuskGeo = new THREE.ConeGeometry(0.04 * size, 0.22 * size, 4);
            const tuskMat = createMat(0xffffff, 0.4, 0.0);

            const tuskL = new THREE.Mesh(tuskGeo, tuskMat);
            tuskL.position.set(-0.16 * size, -0.05 * size, 0.45 * size);
            tuskL.rotation.set(0.8, 0, -0.4);
            this.bodyMesh.add(tuskL);

            const tuskR = new THREE.Mesh(tuskGeo, tuskMat);
            tuskR.position.set(0.16 * size, -0.05 * size, 0.45 * size);
            tuskR.rotation.set(0.8, 0, 0.4);
            this.bodyMesh.add(tuskR);

            const spikeGeo = new THREE.ConeGeometry(0.04 * size, 0.18 * size, 4);
            const spikeMat = createMat(0x302018, 0.8, 0.0);
            for (let i = 0; i < 4; i++) {
                const spike = new THREE.Mesh(spikeGeo, spikeMat);
                spike.position.set(0, 0.42 * size, -i * 0.15 * size);
                this.bodyMesh.add(spike);
            }
        }

        if (this.type === 'shrimp') {
            const legSGeo = new THREE.CylinderGeometry(0.01 * size, 0.005 * size, 0.15 * size, 4);
            const legSMat = createMat(color, 0.5, 0.0);
            for (let i = 0; i < 4; i++) {
                const legL = new THREE.Mesh(legSGeo, legSMat);
                legL.position.set(-0.15 * size, -0.3 * size, -i * 0.12 * size + 0.1 * size);
                legL.rotation.z = -0.4;
                this.bodyMesh.add(legL);

                const legR = new THREE.Mesh(legSGeo, legSMat);
                legR.position.set(0.15 * size, -0.3 * size, -i * 0.12 * size + 0.1 * size);
                legR.rotation.z = 0.4;
                this.bodyMesh.add(legR);
            }
        }

        // ===== Mid / high-tier monsters — real silhouettes, not plain blobs =====
        if (this.type === 'skeleton' || this.type === 'archer_skeleton') {
            hideBody();
            const bone = createMat(0xe8e4d6, 0.85, 0.0);
            const rib = createMat(0x2a2620, 0.9, 0);
            put(box(0.34, 0.44, 0.22), bone, 0, 0.06, 0);
            for (let i = 0; i < 3; i++) put(box(0.4, 0.03, 0.24), rib, 0, 0.18 - i * 0.12, 0.02);
            put(box(0.36, 0.34, 0.32), bone, 0, 0.45, 0);
            put(box(0.2, 0.1, 0.05), rib, 0, 0.34, 0.16);
            put(cyl(0.05, 0.05, 0.42), bone, -0.26, 0.02, 0, [0, 0, 0.15]);
            put(cyl(0.05, 0.05, 0.42), bone, 0.26, 0.02, 0, [0, 0, -0.15]);
            put(cyl(0.06, 0.06, 0.42), bone, -0.1, -0.35, 0);
            put(cyl(0.06, 0.06, 0.42), bone, 0.1, -0.35, 0);
            glowEyes(0xff3020, 0.47, 0.09, 0.17, 0.045);
            if (this.type === 'archer_skeleton') {
                const bow = put(cyl(0.03, 0.03, 0.7, 6), createMat(0x6a4020, 0.8, 0), 0.34, 0.1, 0.08);
                bow.scale.set(0.4, 1, 0.4);
            }
        } else if (this.type === 'zombie') {
            hideBody();
            const flesh = createMat(color || 0x5a7a4a, 0.9, 0.0);
            put(box(0.38, 0.5, 0.26), flesh, 0, 0.05, 0, [0.15, 0, 0]);
            put(box(0.34, 0.32, 0.32), flesh, 0, 0.44, 0.06);
            put(cyl(0.07, 0.06, 0.5), flesh, -0.26, 0.12, 0.16, [1.2, 0, 0.2]);
            put(cyl(0.07, 0.06, 0.5), flesh, 0.26, 0.12, 0.16, [1.2, 0, -0.2]);
            put(cyl(0.08, 0.07, 0.44), flesh, -0.1, -0.35, 0);
            put(cyl(0.08, 0.07, 0.44), flesh, 0.1, -0.35, 0);
            put(box(0.12, 0.16, 0.02), createMat(0x7a2020, 0.9, 0), 0.06, 0.06, 0.14);
            glowEyes(0xd8e020, 0.46, 0.09, 0.2, 0.04);
        } else if (this.type === 'raydric') {
            hideBody();
            const armor = createMat(0x2a2f45, 0.4, 0.6);
            put(box(0.42, 0.5, 0.28), armor, 0, 0.05, 0);
            put(box(0.5, 0.55, 0.02), createMat(0x5a1030, 0.85, 0.0), 0, 0.05, -0.16);
            put(box(0.34, 0.3, 0.32), armor, 0, 0.44, 0);
            put(box(0.22, 0.06, 0.34), createMat(0x101018, 0.5, 0.3), 0, 0.44, 0.03);
            put(cyl(0.07, 0.07, 0.44), armor, -0.28, 0.02, 0, [0, 0, 0.1]);
            put(cyl(0.07, 0.07, 0.44), armor, 0.28, 0.02, 0, [0, 0, -0.1]);
            put(cyl(0.08, 0.08, 0.44), armor, -0.11, -0.35, 0);
            put(cyl(0.08, 0.08, 0.44), armor, 0.11, -0.35, 0);
            put(box(0.06, 0.72, 0.03), createMat(0xc8ccd8, 0.3, 0.7), 0.36, 0.15, 0.12);
            glowEyes(0xff2020, 0.44, 0.08, 0.18, 0.04);
        } else if (this.type === 'hunter_fly') {
            hideBody();
            const chitin = createMat(color || 0x30303a, 0.4, 0.4);
            put(sph(0.28), chitin, 0, 0.1, 0);
            put(sph(0.22), chitin, 0, 0.12, -0.32);
            put(sph(0.24), chitin, 0, 0.2, 0.28);
            const ce = () => new THREE.MeshBasicMaterial({ color: 0xff3040 });
            put(sph(0.1, 8), ce(), -0.13, 0.24, 0.38);
            put(sph(0.1, 8), ce(), 0.13, 0.24, 0.38);
            ownEyes = true;
            const wing = createMat(0xbfe0ff, 0.1, 0.2); wing.transparent = true; wing.opacity = 0.5;
            [[-0.3, 0.35, -0.05, 0.4], [0.3, 0.35, -0.05, -0.4], [-0.28, 0.28, -0.3, 0.7], [0.28, 0.28, -0.3, -0.7]]
                .forEach(([x, y, z, ry]) => put(box(0.5, 0.02, 0.24), wing, x, y, z, [0, ry, 0]));
            for (let i = -1; i <= 1; i++) {
                put(cyl(0.02, 0.01, 0.3, 4), chitin, -0.2, -0.12, i * 0.14, [0, 0, -0.7]);
                put(cyl(0.02, 0.01, 0.3, 4), chitin, 0.2, -0.12, i * 0.14, [0, 0, 0.7]);
            }
        } else if (this.type === 'dullahan') {
            hideBody();
            const armor = createMat(0x23283c, 0.35, 0.7);
            put(box(0.6, 0.7, 0.4), armor, 0, 0.15, 0);
            put(box(0.72, 0.16, 0.44), createMat(0x9a7a30, 0.3, 0.8), 0, 0.5, 0);
            put(cone(0.14, 0.34, 6), armor, -0.4, 0.56, 0, [0, 0, 0.3]);
            put(cone(0.14, 0.34, 6), armor, 0.4, 0.56, 0, [0, 0, -0.3]);
            put(sph(0.22), createMat(0xe8e4d6, 0.8, 0), 0, 0.98, 0.1);
            put(sph(0.3, 8), new THREE.MeshBasicMaterial({ color: 0xff7020, transparent: true, opacity: 0.4 }), 0, 1.0, 0.1);
            glowEyes(0xffaa20, 1.0, 0.08, 0.3, 0.04);
            put(cyl(0.12, 0.12, 0.5), armor, -0.18, -0.32, 0);
            put(cyl(0.12, 0.12, 0.5), armor, 0.18, -0.32, 0);
            put(box(0.1, 1.1, 0.05), createMat(0xc8ccd8, 0.3, 0.7), 0.52, 0.2, 0.1);
        } else if (this.type === 'golem') {
            hideBody();
            const rock = createMat(color || 0x8a8478, 0.95, 0.0);
            put(new THREE.IcosahedronGeometry(0.42 * size, 0), rock, 0, 0.15, 0);
            put(new THREE.IcosahedronGeometry(0.24 * size, 0), rock, 0, 0.56, 0);
            put(new THREE.IcosahedronGeometry(0.2 * size, 0), rock, -0.44, 0.1, 0);
            put(new THREE.IcosahedronGeometry(0.2 * size, 0), rock, 0.44, 0.1, 0);
            put(cyl(0.16, 0.16, 0.3, 6), rock, -0.16, -0.32, 0);
            put(cyl(0.16, 0.16, 0.3, 6), rock, 0.16, -0.32, 0);
            glowEyes(0xffcf4a, 0.58, 0.09, 0.2, 0.05);
        } else if (this.type === 'stone_golem') {
            hideBody();
            const stone = createMat(color || 0x9a9488, 0.95, 0.0);
            put(box(0.5, 0.6, 0.4), stone, 0, 0.12, 0);
            put(box(0.36, 0.3, 0.34), stone, 0, 0.55, 0);
            put(box(0.52, 0.06, 0.42), createMat(0x3a6a30, 0.9, 0), 0, 0.36, 0);
            put(box(0.18, 0.5, 0.18), stone, -0.4, 0.1, 0);
            put(box(0.18, 0.5, 0.18), stone, 0.4, 0.1, 0);
            put(box(0.2, 0.34, 0.2), stone, -0.16, -0.34, 0);
            put(box(0.2, 0.34, 0.2), stone, 0.16, -0.34, 0);
            glowEyes(0x60c0ff, 0.57, 0.09, 0.2, 0.045);
        } else if (this.type === 'harpy') {
            hideBody();
            const feather = createMat(color || 0x9c6bd0, 0.6, 0.05);
            put(box(0.3, 0.5, 0.22), feather, 0, 0.05, 0);
            put(sph(0.2), createMat(0xe8c8a0, 0.7, 0), 0, 0.45, 0.02);
            put(cone(0.06, 0.18, 6), createMat(0xffcf4a, 0.4, 0.2), 0, 0.44, 0.2, [1.2, 0, 0]);
            put(cone(0.05, 0.3, 4), feather, 0, 0.7, -0.05);
            put(box(0.5, 0.5, 0.03), feather, -0.34, 0.15, -0.05, [0, 0.5, 0.3]);
            put(box(0.5, 0.5, 0.03), feather, 0.34, 0.15, -0.05, [0, -0.5, -0.3]);
            put(cyl(0.05, 0.03, 0.3, 5), createMat(0xd0a020, 0.5, 0.2), -0.1, -0.35, 0.05);
            put(cyl(0.05, 0.03, 0.3, 5), createMat(0xd0a020, 0.5, 0.2), 0.1, -0.35, 0.05);
            glowEyes(0xffe060, 0.46, 0.08, 0.18, 0.04);
        } else if (this.type === 'gargoyle') {
            hideBody();
            const stone = createMat(color || 0x6a6a70, 0.9, 0.05);
            put(box(0.34, 0.42, 0.26), stone, 0, 0.02, 0, [0.2, 0, 0]);
            put(sph(0.22), stone, 0, 0.4, 0.05);
            put(cone(0.05, 0.2, 5), stone, -0.12, 0.6, 0.02, [0, 0, 0.3]);
            put(cone(0.05, 0.2, 5), stone, 0.12, 0.6, 0.02, [0, 0, -0.3]);
            put(box(0.45, 0.4, 0.03), stone, -0.34, 0.2, -0.08, [0, 0.6, 0.4]);
            put(box(0.45, 0.4, 0.03), stone, 0.34, 0.2, -0.08, [0, -0.6, -0.4]);
            put(cyl(0.08, 0.06, 0.3), stone, -0.14, -0.32, 0.06, [0.3, 0, 0]);
            put(cyl(0.08, 0.06, 0.3), stone, 0.14, -0.32, 0.06, [0.3, 0, 0]);
            glowEyes(0xff5020, 0.42, 0.08, 0.2, 0.04);
        } else if (this.type === 'iron_golem') {
            hideBody();
            const iron = createMat(color || 0x60656e, 0.35, 0.85);
            const dark = createMat(0x2a2d33, 0.4, 0.7);
            put(box(0.5, 0.6, 0.4), iron, 0, 0.12, 0);
            put(box(0.28, 0.28, 0.3), iron, 0, 0.55, 0);
            put(sph(0.1, 10), new THREE.MeshBasicMaterial({ color: 0x40e0ff }), 0, 0.12, 0.22);
            put(box(0.16, 0.5, 0.16), dark, -0.4, 0.1, 0);
            put(box(0.16, 0.5, 0.16), dark, 0.4, 0.1, 0);
            put(box(0.22, 0.34, 0.22), iron, -0.16, -0.34, 0);
            put(box(0.22, 0.34, 0.22), iron, 0.16, -0.34, 0);
            glowEyes(0x40e0ff, 0.57, 0.08, 0.17, 0.045);
        } else if (this.type === 'storm_dragon') {
            hideBody();
            const scale = createMat(color || 0x3a6ea5, 0.5, 0.2);
            put(sph(0.4), scale, 0, 0.12, -0.05);
            put(cyl(0.16, 0.1, 0.6), scale, 0, 0.4, 0.28, [0.9, 0, 0]);
            put(box(0.24, 0.22, 0.4), scale, 0, 0.72, 0.5);
            put(cone(0.05, 0.24, 5), scale, -0.1, 0.9, 0.42, [-0.4, 0, 0.2]);
            put(cone(0.05, 0.24, 5), scale, 0.1, 0.9, 0.42, [-0.4, 0, -0.2]);
            put(box(0.7, 0.5, 0.03), scale, -0.45, 0.3, -0.15, [0, 0.7, 0.4]);
            put(box(0.7, 0.5, 0.03), scale, 0.45, 0.3, -0.15, [0, -0.7, -0.4]);
            put(cone(0.14, 0.7, 6), scale, 0, 0.0, -0.55, [-1.2, 0, 0]);
            put(cyl(0.1, 0.1, 0.34), scale, -0.2, -0.32, 0.05);
            put(cyl(0.1, 0.1, 0.34), scale, 0.2, -0.32, 0.05);
            glowEyes(0xfff060, 0.74, 0.1, 0.68, 0.045);
        } else if (this.type === 'dragon_egg') {
            hideBody();
            const egg = put(sph(0.45, 14), createMat(color || 0xb8d8c0, 0.7, 0.05), 0, 0.05, 0);
            egg.scale.set(1, 1.25, 1);
            put(box(0.03, 0.5, 0.02), createMat(0x2a2a2a, 0.9, 0), 0.1, 0.12, 0.42, [0, 0, 0.2]);
            put(box(0.03, 0.3, 0.02), createMat(0x2a2a2a, 0.9, 0), -0.08, 0.22, 0.42, [0, 0, -0.3]);
            put(sph(0.5, 10), new THREE.MeshBasicMaterial({ color: 0xff8020, transparent: true, opacity: 0.22 }), 0, 0.1, 0);
            put(sph(0.16), createMat(0x3a6ea5, 0.5, 0.2), 0, 0.56, 0.1);
            glowEyes(0xffe060, 0.59, 0.06, 0.22, 0.03);
        } else if (this.type === 'sea_dragon') {
            hideBody();
            const scale = createMat(color || 0x2a8aa0, 0.5, 0.25);
            const fin = createMat(0x60d0e0, 0.4, 0.2);
            for (let i = 0; i < 4; i++) put(sph(0.26 - i * 0.04), scale, 0, 0.15 - Math.sin(i / 3 * 3) * 0.05, -i * 0.34);
            put(box(0.26, 0.2, 0.36), scale, 0, 0.22, 0.3);
            put(cone(0.16, 0.3, 3), fin, 0, 0.45, 0.15, [0.3, 0, 0]);
            put(box(0.02, 0.28, 0.5), fin, 0, 0.15, -0.5);
            put(box(0.5, 0.02, 0.24), fin, 0, 0.1, -0.1);
            glowEyes(0xfff060, 0.26, 0.09, 0.44, 0.04);
        } else if (this.type === 'leib_olmai') {
            hideBody();
            const fur = createMat(color || 0x3a2f4a, 0.9, 0.0);
            put(sph(0.4), fur, 0, 0.1, 0);
            put(sph(0.26), fur, 0, 0.5, 0.05);
            put(sph(0.12), fur, -0.2, 0.68, 0);
            put(sph(0.12), fur, 0.2, 0.68, 0);
            put(sph(0.12), createMat(0x1a1420, 0.8, 0), 0, 0.44, 0.24);
            put(sph(0.16), fur, -0.34, 0.0, 0.1);
            put(sph(0.16), fur, 0.34, 0.0, 0.1);
            glowEyes(0xa060ff, 0.52, 0.1, 0.22, 0.045);
        } else if (this.type === 'dark_illusion') {
            hideBody();
            const shadow = createMat(color || 0x1a1428, 0.3, 0.1);
            put(cone(0.45, 1.0, 10), shadow, 0, 0.1, 0);
            put(sph(0.22), createMat(0x0a0812, 0.4, 0.1), 0, 0.5, 0.02);
            put(cone(0.28, 0.4, 8), shadow, 0, 0.62, 0);
            put(cone(0.06, 0.4, 5), shadow, -0.34, 0.2, 0.05, [0, 0, 0.5]);
            put(cone(0.06, 0.4, 5), shadow, 0.34, 0.2, 0.05, [0, 0, -0.5]);
            glowEyes(0x9020ff, 0.5, 0.08, 0.2, 0.05);
        } else if (this.type === 'abyss_knight') {
            hideBody();
            const armor = createMat(color || 0x1c2036, 0.35, 0.75);
            put(box(0.6, 0.72, 0.42), armor, 0, 0.16, 0);
            put(box(0.66, 0.78, 0.02), createMat(0x3a0a1a, 0.85, 0.0), 0, 0.16, -0.24);
            put(box(0.36, 0.34, 0.34), armor, 0, 0.6, 0);
            put(cone(0.06, 0.3, 5), armor, -0.16, 0.82, 0, [0, 0, 0.4]);
            put(cone(0.06, 0.3, 5), armor, 0.16, 0.82, 0, [0, 0, -0.4]);
            put(box(0.74, 0.16, 0.46), createMat(0x7a2a3a, 0.4, 0.5), 0, 0.52, 0);
            put(cyl(0.12, 0.12, 0.5), armor, -0.19, -0.3, 0);
            put(cyl(0.12, 0.12, 0.5), armor, 0.19, -0.3, 0);
            put(box(0.12, 1.3, 0.06), createMat(0x2a2f45, 0.3, 0.8), 0.52, 0.25, 0.12);
            put(box(0.16, 0.4, 0.5), new THREE.MeshBasicMaterial({ color: 0x9020ff, transparent: true, opacity: 0.3 }), 0.52, 0.7, 0.12);
            glowEyes(0xff2060, 0.6, 0.09, 0.19, 0.045);
        }

        // Eyes (attached to main bodyMesh so they squish/bounce with slimes)
        if (!ownEyes) {
            const eyeGeo = new THREE.SphereGeometry(0.05 * size, 8, 8);
            const eyeMat = new THREE.MeshBasicMaterial({ color: this.type === 'ghostring' ? 0xff2020 : 0x000000 });
            const eyeWhiteGeo = new THREE.SphereGeometry(0.08 * size, 8, 8);
            const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

            const eyeL = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
            eyeL.position.set(-0.15 * size, 0.12 * size, 0.38 * size);
            this.bodyMesh.add(eyeL);
            const pupilL = new THREE.Mesh(eyeGeo, eyeMat);
            pupilL.position.set(0, 0, 0.05 * size);
            eyeL.add(pupilL);

            const eyeR = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
            eyeR.position.set(0.15 * size, 0.12 * size, 0.38 * size);
            this.bodyMesh.add(eyeR);
            const pupilR = new THREE.Mesh(eyeGeo, eyeMat);
            pupilR.position.set(0, 0, 0.05 * size);
            eyeR.add(pupilR);
        }

        // HP bar above monster
        const hpBarBg = new THREE.Mesh(
            new THREE.PlaneGeometry(0.8, 0.08),
            new THREE.MeshBasicMaterial({ color: 0x400000 })
        );
        hpBarBg.position.y = size + 0.3;
        hpBarBg.rotation.x = 0;
        this.mesh.add(hpBarBg);

        this.hpBarFill = new THREE.Mesh(
            new THREE.PlaneGeometry(0.78, 0.06),
            new THREE.MeshBasicMaterial({ color: this.isWaterMonster ? 0x2080ff : 0xff2020 })
        );
        this.hpBarFill.position.y = size + 0.3;
        this.hpBarFill.position.z = 0.001;
        this.mesh.add(this.hpBarFill);

        // Name label sprite
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.font = 'bold 36px "Press Start 2P", monospace';
        ctx.fillStyle = this.isWaterMonster ? '#80c0ff' : '#ffffff';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 8;
        ctx.textAlign = 'center';
        ctx.strokeText(this.data.name, 256, 75);
        ctx.fillText(this.data.name, 256, 75);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const nameSprite = new THREE.Sprite(spriteMat);
        nameSprite.scale.set(1.8, 0.45, 1);
        nameSprite.position.y = size + 0.8;
        this.mesh.add(nameSprite);

        // Shadow
        const shadowGeo = new THREE.CircleGeometry(size * 0.5, 12);
        const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 });
        const shadow = new THREE.Mesh(shadowGeo, shadowMat);
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 0.02;
        this.mesh.add(shadow);

        this.mesh.position.copy(position);
        if (this.isWaterMonster) {
            this.mesh.position.y = -0.3;
        }
        this.scene.add(this.mesh);
    }

    takeDamage(amount, isCritical = false, options = {}) {
        const actualDmg = resolveMonsterDamage(amount, this.data.def, options);
        this.hp = Math.max(0, this.hp - actualDmg);
        // Getting hit provokes it — chase the attacker for a while.
        this._aggroUntil = (this.animTimer || 0) + 8;
        // Step 6: Enhanced monster impact flash durations
        this.hitFlash = isCritical ? 0.35 : 0.18;
        this.isCriticalHit = isCritical;

        // Update HP bar
        const ratio = this.hp / this.maxHp;
        this.hpBarFill.scale.x = Math.max(0.01, ratio);

        if (this.hp <= 0) {
            this.alive = false;
            this.mesh.visible = false;
        }

        return actualDmg;
    }

    // Damage relayed from another player (already post-defense). Drains the same
    // shared HP so everyone's copy dies together — but does NOT aggro toward the
    // local hero. Returns true if this hit killed it.
    applyRemoteDamage(amount) {
        if (!this.alive) return false;
        this.hp = Math.max(0, this.hp - Math.max(0, amount | 0));
        this.hitFlash = Math.max(this.hitFlash, 0.12);
        if (this.hpBarFill) this.hpBarFill.scale.x = Math.max(0.01, this.hp / this.maxHp);
        if (this.hp <= 0) {
            this.alive = false;
            this.mesh.visible = false;
            return true;
        }
        return false;
    }

    getPosition() {
        return this.mesh.position.clone();
    }

    distanceTo(pos) {
        return this.mesh.position.distanceTo(pos);
    }

    update(dt, camera, sceneManager, player, onAttackPlayer) {
        if (!this.alive) return;

        this.animTimer += dt;
        this.hitFlash = Math.max(0, this.hitFlash - dt);

        // Bounce animation
        const bounce = Math.abs(Math.sin(this.animTimer * 2.5)) * 0.1;
        if (this.isWaterMonster) {
            this.bodyMesh.position.y = this.data.size * 0.4 + bounce;
            this.mesh.position.y = -0.3 + Math.sin(this.animTimer * 1.5) * 0.05;
        } else {
            this.bodyMesh.position.y = this.data.size * 0.4 + bounce;
        }
        this.bodyMesh.scale.y = 1 + bounce * 0.5;
        this.bodyMesh.scale.x = 1 - bounce * 0.15;
        this.bodyMesh.scale.z = 1 - bounce * 0.15;

        // ===== Aggro: chase & attack the player when provoked or approached =====
        let aggroActive = false;
        if (player && player.mesh && this.alive && !this.isWaterMonster) {
            const adx = player.mesh.position.x - this.mesh.position.x;
            const adz = player.mesh.position.z - this.mesh.position.z;
            const pdist = Math.hypot(adx, adz) || 0.001;
            const t = this.animTimer;
            // Only provoked monsters hunt — never aggro on approach alone. The
            // aggro window is armed in takeDamage() when the player hits it.
            aggroActive = t < this._aggroUntil && pdist < 20;
            if (aggroActive) {
                const reach = 1.0 + this.data.size * (this._scale || 1) * 0.6;
                if (pdist > reach) {
                    const spd = (this.data.speed + 1.4) * 1.5 * dt;
                    const nx = this.mesh.position.x + (adx / pdist) * spd;
                    const nz = this.mesh.position.z + (adz / pdist) * spd;
                    let ok = true;
                    if (sceneManager) {
                        if (sceneManager.isInArena && sceneManager.isInArena(nx, nz)) ok = false;
                        else if (sceneManager.getEnvironmentAt(new THREE.Vector3(nx, 0, nz)) !== (this.data.environment || 'ground')) ok = false;
                    }
                    if (ok) { this.mesh.position.x = nx; this.mesh.position.z = nz; }
                    this.mesh.rotation.y = Math.atan2(adx, adz);
                    this.isMoving = true;
                } else {
                    // In range — strike on a cooldown.
                    this.isMoving = false;
                    this.mesh.rotation.y = Math.atan2(adx, adz);
                    this._atkCd -= dt;
                    if (this._atkCd <= 0) {
                        this._atkCd = 1.3;
                        if (onAttackPlayer) onAttackPlayer(this);
                    }
                }
                this.wanderTarget = null; // hunting overrides wandering
            }
        }

        // Recursive hit flash for all bodyMesh children
        const isFlashing = this.hitFlash > 0;
        const wasFlashing = this._wasFlashing || false;

        if (isFlashing || wasFlashing !== isFlashing) {
            this._wasFlashing = isFlashing;

            // Critical hit double pulse logic
            let currentFlashIntensity = 0;
            let currentFlashColor = 0x000000;

            if (isFlashing) {
                currentFlashColor = 0xffffff;
                if (this.isCriticalHit) {
                    // Double pulse for critical: first pulse 300-150ms, second pulse 150-0ms
                    const pulseTime = this.hitFlash > 0.15 ? this.hitFlash - 0.15 : this.hitFlash;
                    currentFlashIntensity = (pulseTime / 0.15);
                } else {
                    currentFlashIntensity = this.hitFlash / 0.18;
                }
            }

            this.bodyMesh.traverse(child => {
                if (child.isMesh && child.material) {
                    if (!child.userData.originalColor) {
                        child.userData.originalColor = child.material.color.clone();
                    }

                    if (isFlashing) {
                        child.material.color.setHex(0xffffff);
                        if (child.material.emissive) {
                            child.material.emissive.setHex(0xffffff);
                            child.material.emissiveIntensity = currentFlashIntensity;
                        }
                    } else {
                        child.material.color.copy(child.userData.originalColor);
                        if (child.material.emissive) {
                            child.material.emissive.setHex(0x000000);
                            child.material.emissiveIntensity = 0;
                        }
                    }
                }
            });
        }

        // Wander AI (idle roaming when not hunting the player)
        if (!aggroActive) this.wanderTimer -= dt;
        if (!aggroActive && this.wanderTimer <= 0) {
            this.wanderTimer = 1.2 + Math.random() * 2.5;
            const angle = Math.random() * Math.PI * 2;
            const dist = 1 + Math.random() * 2;
            const newX = this.mesh.position.x + Math.cos(angle) * dist;
            const newZ = this.mesh.position.z + Math.sin(angle) * dist;

            // Land monsters must not wander into water; water monsters must stay in water
            if (sceneManager) {
                const testPos = new THREE.Vector3(newX, 0, newZ);
                const targetEnv = sceneManager.getEnvironmentAt(testPos);
                const requiredEnv = this.data.environment || 'ground';

                if (sceneManager.isInArena && sceneManager.isInArena(newX, newZ)) {
                    // Steer away from the arena keep-out zone
                    this.wanderTarget = null;
                } else if (targetEnv === requiredEnv) {
                    this.wanderTarget = testPos;
                } else if (requiredEnv === 'water') {
                    // Pick new target toward river center
                    const riverZ = Math.sin(this.mesh.position.x * 0.08) * 10 - 2;
                    this.wanderTarget = new THREE.Vector3(
                        this.mesh.position.x + (Math.random() - 0.5) * 2,
                        0,
                        riverZ + (Math.random() - 0.5) * 4
                    );
                } else {
                    // For cave, mountain, ground: stay put or pick target again (skip wander cycle)
                    this.wanderTarget = null;
                }
            } else {
                this.wanderTarget = new THREE.Vector3(newX, 0, newZ);
            }

            // Keep in bounds
            if (this.wanderTarget) {
                this.wanderTarget.x = THREE.MathUtils.clamp(this.wanderTarget.x, -SPAWN_RANGE, SPAWN_RANGE);
                this.wanderTarget.z = THREE.MathUtils.clamp(this.wanderTarget.z, -SPAWN_RANGE, SPAWN_RANGE);
            }
        }

        if (!aggroActive && this.wanderTarget) {
            const dx = this.wanderTarget.x - this.mesh.position.x;
            const dz = this.wanderTarget.z - this.mesh.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist > 0.2) {
                const speed = Math.max(0.7, this.data.speed) * dt * 1.25;
                const nextX = this.mesh.position.x + (dx / dist) * speed;
                const nextZ = this.mesh.position.z + (dz / dist) * speed;

                // Final check: prevent monster from stepping out of its required environment
                if (sceneManager) {
                    // Hard block: never step into the PVP arena
                    if (sceneManager.isInArena && sceneManager.isInArena(nextX, nextZ)) {
                        this.wanderTarget = null;
                        this.isMoving = false;
                        return;
                    }
                    const nextPos = new THREE.Vector3(nextX, 0, nextZ);
                    const nextEnv = sceneManager.getEnvironmentAt(nextPos);
                    const requiredEnv = this.data.environment || 'ground';
                    if (nextEnv !== requiredEnv) {
                        this.wanderTarget = null;
                        this.isMoving = false;
                        return;
                    }
                }

                this.mesh.position.x = nextX;
                this.mesh.position.z = nextZ;
                this.mesh.rotation.y = Math.atan2(dx, dz);
                this.isMoving = true;
            } else {
                this.isMoving = false;
            }
        } else if (!aggroActive) {
            this.isMoving = false;
        }

        // Billboard HP bar to camera (throttled: update every 3rd frame)
        if (camera) {
            this._billboardFrame = ((this._billboardFrame || 0) + 1) % 3;
            if (this._billboardFrame === 0) {
                this.hpBarFill.lookAt(camera.position);
                this.hpBarFill.parent.children.forEach(child => {
                    if (child.geometry && child.geometry.type === 'PlaneGeometry') {
                        child.lookAt(camera.position);
                    }
                });
            }
        }
    }

    reset(position) {
        this.hp = this.maxHp;
        this.alive = true;
        this.mesh.visible = true;
        this.mesh.position.copy(position);
        if (this.isWaterMonster) {
            this.mesh.position.y = -0.3;
        }
        this.hpBarFill.scale.x = 1;
        this.hitFlash = 0;
        
        // BUGFIX: Reset aggro state when monster respawns
        // Prevents monster from immediately attacking player after respawn
        this._aggroUntil = 0;
        this._atkCd = 0;
        this.wanderTarget = null;
        this.wanderTimer = 0;
        this._localContributed = false; // fresh monster — no shared-damage credit yet
        this._cardDeathResolved = false;
    }

    destroy() {
        this.scene.remove(this.mesh);
    }
}

export class MonsterManager {
    constructor(scene, sceneManager) {
        this.scene = scene;
        this.sceneManager = sceneManager;
        this.monsters = [];
        this.waterMonsters = [];
        this.deadQueue = []; // { monster, timer, isWater }
        this.mapId = 'prontera';
    }

    clearAll() {
        // Remove all monster meshes from scene
        this.monsters.forEach(m => {
            if (m.mesh) this.scene.remove(m.mesh);
        });
        this.waterMonsters.forEach(m => {
            if (m.mesh) this.scene.remove(m.mesh);
        });

        // Reset arrays
        this.monsters = [];
        this.waterMonsters = [];
        this.deadQueue = [];
    }

    _getRandomPositionForMonster(type, rng) {
        const useRng = rng || Math.random;
        const allMonsters = getAllMonsters();
        const monsterData = allMonsters[type];
        const environment = monsterData ? monsterData.environment : 'ground';

        if (environment === 'water') {
            const rx = -20 + useRng() * 40;
            const riverZ = Math.sin(rx * 0.08) * 10 - 2;
            const rz = riverZ + (useRng() - 0.5) * 4;
            return new THREE.Vector3(rx, 0, rz);
        }

        let pos = new THREE.Vector3(0, 0, 0);

        for (let attempt = 0; attempt < 50; attempt++) {
            const angle = useRng() * Math.PI * 2;
            const dist = 4 + useRng() * (SPAWN_RANGE - 4);
            pos.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);

            if (this.sceneManager) {
                // Never spawn inside the PVP arena keep-out zone
                if (this.sceneManager.isInArena && this.sceneManager.isInArena(pos.x, pos.z)) {
                    continue;
                }
                const posEnv = this.sceneManager.getEnvironmentAt(pos);
                if (posEnv === environment) {
                    return pos;
                }
            } else {
                const distToRiver = Math.abs(pos.z - (Math.sin(pos.x * 0.08) * 10 - 2));
                const inWater = distToRiver < 5.5;
                if (!inWater) return pos;
            }
        }

        // Relax constraints if no exact match found
        for (let attempt = 0; attempt < 20; attempt++) {
            const angle = useRng() * Math.PI * 2;
            const dist = 4 + useRng() * (SPAWN_RANGE - 4);
            pos.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
            if (this.sceneManager) {
                if (!this.sceneManager.isInWater(pos)) return pos;
            } else {
                return pos;
            }
        }
        return pos;
    }

    findMonsterById(id) {
        return [...this.monsters, ...this.waterMonsters].find(m => m.id === id);
    }

    // Deterministic weighted pick from a spawn table using the seeded rng, so
    // every player consumes the rng identically and lands on the same type.
    _pickWeightedSeeded(table, rng) {
        const total = table.reduce((s, e) => s + e.weight, 0);
        if (total <= 0) return table[0] && table[0].type;
        let roll = rng() * total;
        for (const e of table) { roll -= e.weight; if (roll <= 0) return e.type; }
        return table[table.length - 1].type;
    }

    spawnInitial(playerLevel) {
        // Seed from the UTC date + this map → identical layout for EVERY player
        // on the map that day, regardless of their level. (playerLevel is
        // intentionally ignored here so no two players ever see different mobs.)
        const rng = createSeededRng((getDailySeed() ^ hashStr(this.mapId || 'prontera')) | 0);
        const count = MAX_MONSTERS; // fixed count for consistency across clients

        // Full, level-independent spawn table for this map.
        const spawnTable = getSpawnTable(SHARED_SPAWN_LEVEL, this.mapId);

        for (let i = 0; i < count; i++) {
            if (spawnTable.length === 0) continue;
            const type = this._pickWeightedSeeded(spawnTable, rng);
            const pos = this._getRandomPositionForMonster(type, rng);

            const monster = new Monster(this.scene, type, pos);
            monster.id = `land_${i}`;
            monster.spawnIndex = i;
            monster.spawnPosition = pos.clone();
            monster.isWaterMonster = false;
            this.monsters.push(monster);
        }

        // Spawn water monsters (most maps have a river). Svarrga (Heaven) is a
        // peaceful mining city — no monsters there.
        if (this.mapId !== 'svarrga') {
            this._spawnWaterMonsters(rng);
        }
    }

    _spawnWaterMonsters(rng) {
        const useRng = rng || Math.random;
        // Level-independent water table + seeded type pick → same for everyone.
        const table = getWaterSpawnTable(SHARED_SPAWN_LEVEL);
        for (let i = 0; i < MAX_WATER_MONSTERS; i++) {
            const type = this._pickWeightedSeeded(table, useRng);
            const pos = this._getRandomPositionForMonster(type, useRng);

            const monster = new Monster(this.scene, type, pos);
            monster.id = `water_${i}`;
            monster.spawnIndex = i;
            monster.spawnPosition = pos.clone();
            monster.isWaterMonster = true;
            this.waterMonsters.push(monster);
        }
    }

    _spawnOne(playerLevel) {
        const type = pickRandomMonster(playerLevel, this.mapId);
        const pos = this._getRandomPositionForMonster(type, Math.random);

        const monster = new Monster(this.scene, type, pos);
        this.monsters.push(monster);
        return monster;
    }

    _spawnOneWater(playerLevel) {
        const type = pickRandomWaterMonster(playerLevel);
        const pos = this._getRandomPositionForMonster(type, Math.random);

        const monster = new Monster(this.scene, type, pos);
        this.waterMonsters.push(monster);
        return monster;
    }

    update(dt, camera, player) {
        // Update alive land monsters
        for (const m of this.monsters) {
            m.update(dt, camera, this.sceneManager, player, this.onMonsterAttackPlayer);
        }

        // Update alive water monsters
        for (const m of this.waterMonsters) {
            m.update(dt, camera, this.sceneManager, player, this.onMonsterAttackPlayer);
        }

        // Handle respawns
        for (let i = this.deadQueue.length - 1; i >= 0; i--) {
            this.deadQueue[i].timer -= dt;
            if (this.deadQueue[i].timer <= 0) {
                const entry = this.deadQueue.splice(i, 1)[0];
                const monster = entry.monster;
                // Simply reset the same monster at its original spawnPosition and type!
                monster.reset(monster.spawnPosition);
            }
        }
    }

    // Queue a monster for respawn
    // Find a monster by its stable id (land_N / water_N) across both pools.
    getById(id) {
        if (!id) return null;
        return this.monsters.find(m => m.id === id) || this.waterMonsters.find(m => m.id === id) || null;
    }

    queueRespawn(monster) {
        if (!monster._cardDeathResolved) {
            monster._cardDeathResolved = true;
            if (typeof this.onMonsterDeath === 'function') {
                try {
                    this.onMonsterDeath(monster, {
                        eligible: monster._localContributed === true,
                    });
                } catch (error) {
                    console.warn('[Zolos] card drop resolution error:', error);
                }
            }
        }

        const isWater = monster.isWaterMonster;
        // Deterministic respawn timer based on spawn index
        const respawnDelay = RESPAWN_TIME + (monster.spawnIndex % 3);
        this.deadQueue.push({
            monster,
            timer: respawnDelay,
            isWater
        });
    }

    // Find nearest alive monster to a position
    // landOnly=true (default): only land monsters — prevents auto-farm chasing unreachable water monsters
    findNearest(position, maxRange = 20, landOnly = true) {
        let nearest = null;
        let nearestDist = maxRange;

        const pool = landOnly ? this.monsters : [...this.monsters, ...this.waterMonsters];
        for (const m of pool) {
            if (!m.alive) continue;
            const d = m.distanceTo(position);
            if (d < nearestDist) {
                nearestDist = d;
                nearest = m;
            }
        }

        return nearest;
    }

    // Get all alive monsters (land + water)
    getAlive() {
        return [...this.monsters, ...this.waterMonsters].filter(m => m.alive);
    }
}
