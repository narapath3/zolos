// Monster Manager — Monster spawning, AI, and management
import * as THREE from 'three';
import { MONSTERS, pickRandomMonster, getSpawnTable, getAllMonsters, pickRandomWaterMonster } from './GameData.js';

const MAX_MONSTERS = 12;
const MAX_WATER_MONSTERS = 4;
const SPAWN_RANGE = 12;
const RESPAWN_TIME = 3;

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

        // Eyes (attached to main bodyMesh so they squish/bounce with slimes)
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
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.font = 'bold 24px "Press Start 2P", monospace';
        ctx.fillStyle = this.isWaterMonster ? '#80c0ff' : '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(this.data.name, 128, 40);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const nameSprite = new THREE.Sprite(spriteMat);
        nameSprite.scale.set(1.5, 0.4, 1);
        nameSprite.position.y = size + 0.6;
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

    takeDamage(amount) {
        const actualDmg = Math.max(1, amount - Math.floor(this.data.def * 0.3));
        this.hp = Math.max(0, this.hp - actualDmg);
        this.hitFlash = 0.15;

        // Update HP bar
        const ratio = this.hp / this.maxHp;
        this.hpBarFill.scale.x = Math.max(0.01, ratio);

        if (this.hp <= 0) {
            this.alive = false;
            this.mesh.visible = false;
        }

        return actualDmg;
    }

    getPosition() {
        return this.mesh.position.clone();
    }

    distanceTo(pos) {
        return this.mesh.position.distanceTo(pos);
    }

    update(dt, camera, sceneManager) {
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

        // Recursive hit flash for all bodyMesh children
        const flashIntensity = this.hitFlash > 0 ? this.hitFlash * 5 : 0;
        const flashColor = this.hitFlash > 0 ? 0xff4040 : 0x000000;
        this.bodyMesh.traverse(child => {
            if (child.isMesh && child.material && child.material.emissive) {
                child.material.emissive.setHex(flashColor);
                child.material.emissiveIntensity = flashIntensity;
            }
        });

        // Wander AI
        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0) {
            this.wanderTimer = 2 + Math.random() * 4;
            const angle = Math.random() * Math.PI * 2;
            const dist = 1 + Math.random() * 2;
            const newX = this.mesh.position.x + Math.cos(angle) * dist;
            const newZ = this.mesh.position.z + Math.sin(angle) * dist;

            // Land monsters must not wander into water; water monsters must stay in water
            if (sceneManager) {
                const testPos = new THREE.Vector3(newX, 0, newZ);
                const targetEnv = sceneManager.getEnvironmentAt(testPos);
                const requiredEnv = this.data.environment || 'ground';

                if (targetEnv === requiredEnv) {
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

        if (this.wanderTarget) {
            const dx = this.wanderTarget.x - this.mesh.position.x;
            const dz = this.wanderTarget.z - this.mesh.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist > 0.2) {
                const speed = this.data.speed * dt;
                const nextX = this.mesh.position.x + (dx / dist) * speed;
                const nextZ = this.mesh.position.z + (dz / dist) * speed;

                // Final check: prevent monster from stepping out of its required environment
                if (sceneManager) {
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
        } else {
            this.isMoving = false;
        }

        // Billboard HP bar to camera
        if (camera) {
            this.hpBarFill.lookAt(camera.position);
            this.hpBarFill.parent.children.forEach(child => {
                if (child.geometry && child.geometry.type === 'PlaneGeometry') {
                    child.lookAt(camera.position);
                }
            });
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

    spawnInitial(playerLevel) {
        const rng = createSeededRng(getDailySeed());
        const count = Math.min(MAX_MONSTERS, 6 + Math.floor(playerLevel / 2));

        // Spawn seeded land monsters using map-specific database
        const spawnTable = getSpawnTable(playerLevel, this.mapId);

        for (let i = 0; i < count; i++) {
            if (spawnTable.length === 0) continue;
            const entry = spawnTable[Math.floor(rng() * spawnTable.length)];
            const pos = this._getRandomPositionForMonster(entry.type, rng);

            const monster = new Monster(this.scene, entry.type, pos);
            this.monsters.push(monster);
        }

        // Spawn water monsters (both maps since both have river and config.waterColor)
        this._spawnWaterMonsters(playerLevel, rng);
    }

    _spawnWaterMonsters(playerLevel, rng) {
        const useRng = rng || Math.random;
        for (let i = 0; i < MAX_WATER_MONSTERS; i++) {
            const type = pickRandomWaterMonster(playerLevel);
            const pos = this._getRandomPositionForMonster(type, useRng);

            const monster = new Monster(this.scene, type, pos);
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

    update(dt, camera, playerLevel) {
        // Update alive land monsters
        for (const m of this.monsters) {
            m.update(dt, camera, this.sceneManager);
        }

        // Update alive water monsters
        for (const m of this.waterMonsters) {
            m.update(dt, camera, this.sceneManager);
        }

        // Handle respawns
        for (let i = this.deadQueue.length - 1; i >= 0; i--) {
            this.deadQueue[i].timer -= dt;
            if (this.deadQueue[i].timer <= 0) {
                const entry = this.deadQueue.splice(i, 1)[0];

                if (entry.isWater) {
                    // Respawn as water monster
                    const type = pickRandomWaterMonster(playerLevel);
                    const pos = this._getRandomPositionForMonster(type, Math.random);

                    entry.monster.type = type;
                    const allMonsters = getAllMonsters();
                    const monsterData = allMonsters[type];
                    if (monsterData) {
                        entry.monster.data = monsterData;
                        entry.monster.maxHp = monsterData.hp;
                        entry.monster.isWaterMonster = true;
                        if (entry.monster.bodyMesh && entry.monster.bodyMesh.material) {
                            entry.monster.bodyMesh.material.color.setHex(monsterData.color);
                        }
                        entry.monster.reset(pos);
                    }
                } else {
                    // Respawn as land monster
                    const type = pickRandomMonster(playerLevel, this.mapId);
                    const pos = this._getRandomPositionForMonster(type, Math.random);

                    entry.monster.type = type;
                    const allMonsters = getAllMonsters();
                    const monsterData = allMonsters[type];
                    if (monsterData) {
                        entry.monster.data = monsterData;
                        entry.monster.maxHp = monsterData.hp;
                        entry.monster.isWaterMonster = false;
                        if (entry.monster.bodyMesh && entry.monster.bodyMesh.material) {
                            entry.monster.bodyMesh.material.color.setHex(monsterData.color);
                        }
                        entry.monster.reset(pos);
                    }
                }
            }
        }

        // Ensure monster count
        const aliveCount = this.monsters.filter(m => m.alive).length + this.deadQueue.filter(d => !d.isWater).length;
        const targetCount = Math.min(MAX_MONSTERS, 6 + Math.floor(playerLevel / 2));
        while (aliveCount + this.monsters.length < targetCount && this.monsters.length < MAX_MONSTERS) {
            this._spawnOne(playerLevel);
        }
    }

    // Queue a monster for respawn
    queueRespawn(monster) {
        const isWater = monster.isWaterMonster;
        this.deadQueue.push({
            monster,
            timer: RESPAWN_TIME + Math.random() * 2,
            isWater
        });
    }

    // Find nearest alive monster to a position (searches both land and water)
    findNearest(position, maxRange = 20) {
        let nearest = null;
        let nearestDist = maxRange;

        const allMonsters = [...this.monsters, ...this.waterMonsters];
        for (const m of allMonsters) {
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
