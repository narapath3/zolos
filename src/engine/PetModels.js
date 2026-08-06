// PetModels — articulated, detailed companion models. Each builder returns a
// THREE.Group centred at the origin (feet ~y=0) whose limbs, ears, tail and eyes
// are tagged (userData.role) so CharacterManager drives a real walk cycle, tail
// wag, ear bounce and eye-blink. Still shadow-only (no particle systems here) so
// a crowd stays perf-safe — richness comes from layered geometry (fur fluff,
// feathers, scales, rim-glow) and motion, not textures.
//
// Roles the animator understands:
//   'leg'  — a hip pivot; swings on X (walk/trot). userData.phase sets gait.
//   'arm'  — a shoulder pivot; swings opposite the legs. userData.side, .phase.
//   'ear'  — a base pivot; gentle X bob. userData.baseRotX, .phase.
//   'tail' — a base pivot; wags on Y.
//   'wing' — flaps on Z. userData.side, .baseRotZ.
//   'eye'  — an eye group; squashed on Y to blink.
// userData.scale (optional) overrides the in-game size wrapper.
import * as THREE from 'three';

// ── Materials ────────────────────────────────────────────────────────────────
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({
    color,
    roughness: o.rough ?? 0.62,
    metalness: o.metal ?? 0.0,
    emissive: o.glow ?? 0x000000,
    emissiveIntensity: o.glowI ?? (o.glow ? 0.5 : 0),
    transparent: o.opacity != null,
    opacity: o.opacity ?? 1,
});

// ── Primitives ───────────────────────────────────────────────────────────────
const box = (w, h, d, color, x = 0, y = 0, z = 0, o = {}) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, o));
    m.position.set(x, y, z); m.castShadow = true; return m;
};
const sph = (r, color, x = 0, y = 0, z = 0, o = {}, seg = 14) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), mat(color, o));
    m.position.set(x, y, z); m.castShadow = true; return m;
};
const caps = (r, len, color, x = 0, y = 0, z = 0, o = {}) => {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat(color, o));
    m.position.set(x, y, z); m.castShadow = true; return m;
};
const cone = (r, h, color, x = 0, y = 0, z = 0, o = {}, seg = 8) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat(color, o));
    m.position.set(x, y, z); m.castShadow = true; return m;
};
// Squashed sphere — a rounded blob you can shape (bellies, cheeks, muzzles).
const blob = (r, sx, sy, sz, color, x, y, z, o = {}, seg = 14) => {
    const m = sph(r, color, x, y, z, o, seg); m.scale.set(sx, sy, sz); return m;
};

// ── Detail helpers (what kills the "blob" look) ──────────────────────────────
// A soft additive rim-glow shell that hugs a body sphere — the magical halo.
const rim = (r, color, x, y, z, opacity = 0.4) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 18),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set(x, y, z); return m;
};
// A ring of little spheres → fur ruff / mane collar / fluffy cheeks.
const fluffRing = (cx, cy, cz, radius, count, r, color, o = {}, flat = 0.55) => {
    const g = new THREE.Group(); g.position.set(cx, cy, cz);
    for (let i = 0; i < count; i++) { const a = (i / count) * Math.PI * 2; g.add(sph(r * (0.8 + 0.35 * (i % 2)), color, Math.cos(a) * radius, Math.sin(a) * radius * flat, 0, o, 8)); }
    return g;
};
// Fur/feather crest: a fan of tapered cones.
const crest = (cx, cy, cz, count, len, thick, color, spread, o = {}) => {
    const g = new THREE.Group(); g.position.set(cx, cy, cz);
    for (let i = 0; i < count; i++) { const t = (i / (count - 1) - 0.5) * 2; const c = cone(thick, len * (1 - Math.abs(t) * 0.3), color, t * spread, 0, 0, o, 6); c.rotation.z = -t * 0.5; g.add(c); }
    return g;
};
// A feathered/membraned wing on a shoulder pivot; flaps on Z.
const featherWing = (side, x, y, z, color, o = {}, feathers = 4, len = 0.42) => {
    const p = new THREE.Group(); p.position.set(x, y, z);
    for (let i = 0; i < feathers; i++) {
        const l = len * (1 - i * 0.14);
        const f = cone(0.075, l, color, side * i * 0.05, -i * 0.05, -i * 0.015, o, 6);
        f.scale.set(0.65, 1, 0.32); f.rotation.z = side * (0.55 - i * 0.14); p.add(f);
    }
    p.userData.role = 'wing'; p.userData.side = side; p.userData.baseRotZ = 0; return p;
};
// Two-segment leg (thigh + shin + paw + toes) on a hip pivot; swings on X.
const leg2 = (x, hipY, z, r, color, phase, o = {}) => {
    const p = new THREE.Group(); p.position.set(x, hipY, z);
    const half = hipY / 2;
    p.add(caps(r, half * 0.8, color, 0, -half * 0.5, 0, { rough: 0.8, ...o }));        // thigh
    p.add(caps(r * 0.82, half * 0.72, color, 0, -half * 1.25, 0.03, { rough: 0.8, ...o })); // shin
    p.add(blob(r * 1.25, 1, 0.7, 1.3, color, 0, -(hipY - 0.01), 0.05, { rough: 0.85, ...o }, 8)); // paw
    [-r * 0.55, 0, r * 0.55].forEach(tx => p.add(sph(r * 0.42, color, tx, -(hipY - 0.01), 0.13, { rough: 0.85, ...o }, 6))); // toes
    p.userData.role = 'leg'; p.userData.phase = phase; return p;
};
// Whisker.
const whisker = (x, y, z, len, ang) => { const b = box(len, 0.008, 0.008, 0xf2f2f2, x, y, z, { rough: 0.4, glow: 0xffffff, glowI: 0.15 }); b.rotation.y = ang; return b; };

// ── Eyes ─────────────────────────────────────────────────────────────────────
// Big glossy chibi eye: sclera + iris + pupil + two catchlights. Tagged 'eye';
// the animator squashes its Y to blink. Brows are added per-pet (outside the
// eye group) so blinks don't move them.
const makeEye = (x, y, z, r, iris = 0x141420) => {
    const e = new THREE.Group(); e.position.set(x, y, z);
    e.add(sph(r, 0xffffff, 0, 0, 0, { rough: 0.16 }, 14));
    e.add(sph(r * 0.72, iris, 0, 0, r * 0.48, { rough: 0.1 }, 12));
    e.add(sph(r * 0.36, 0x05050c, 0, 0, r * 0.72, { rough: 0.1 }, 8));
    e.add(sph(r * 0.22, 0xffffff, r * 0.3, r * 0.34, r * 0.85, { glow: 0xffffff, glowI: 1 }, 6));
    e.add(sph(r * 0.1, 0xffffff, -r * 0.26, -r * 0.22, r * 0.85, { glow: 0xffffff, glowI: 0.7 }, 6));
    e.userData.role = 'eye'; return e;
};
const eyePair = (g, y, z, spread, r, iris) => { [-spread, spread].forEach(x => g.add(makeEye(x, y, z, r, iris))); };
// Curved brow above an eye (thin torus arc feel via a squashed box).
const brow = (g, x, y, z, w, color, tilt) => { const b = box(w, 0.02, 0.03, color, x, y, z, { rough: 0.6 }); b.rotation.z = tilt; g.add(b); };

// ── The catalog ──────────────────────────────────────────────────────────────
export const PET_BUILDERS = {
    // Glossy pink jelly slime — legless, bounces. Rosy cheeks, bubbles, rim shine.
    poring: () => {
        const g = new THREE.Group();
        g.add(rim(0.32, 0xff6fa3, 0, 0.3, 0, 0.16));
        const body = blob(0.3, 1, 0.9, 1, 0xff8fb0, 0, 0.29, 0, { rough: 0.2, metal: 0.1, glow: 0xff5f95, glowI: 0.3 }, 20); g.add(body);
        g.add(blob(0.12, 1, 0.7, 0.8, 0xffc7dc, 0, 0.52, 0.03, { rough: 0.12, opacity: 0.7 }, 12)); // top glossy cap
        [[-0.2, 0.42, 0.05], [0.22, 0.36, -0.04], [0.16, 0.5, 0.02]].forEach(([x, y, z]) => g.add(sph(0.045, 0xffb9d2, x, y, z, { rough: 0.15, opacity: 0.75 }, 8))); // bubbles
        eyePair(g, 0.32, 0.25, 0.11, 0.062, 0x5a2a3a);
        [-0.15, 0.15].forEach(x => g.add(sph(0.045, 0xff7ab0, x, 0.26, 0.25, { rough: 0.4, opacity: 0.7 }, 8))); // cheeks
        const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 10, Math.PI), mat(0x8a3050, { rough: 0.5 })); mouth.position.set(0, 0.25, 0.27); mouth.rotation.x = Math.PI; g.add(mouth);
        g.userData.float = false; g.userData.scale = 1.5; return g;
    },

    // Fluffy yellow chick — biped. Fluff collar, feather crest, wing-arms, cheeks.
    chick: () => {
        const g = new THREE.Group();
        const body = blob(0.26, 1, 1.15, 1, 0xffd84a, 0, 0.36, 0, { rough: 0.65 }, 16); g.add(body);
        g.add(fluffRing(0, 0.32, 0.02, 0.26, 10, 0.06, 0xffe58a, { rough: 0.7 })); // downy body fluff
        g.add(sph(0.2, 0xffe36a, 0, 0.56, 0.03, { rough: 0.65 }, 16));
        g.add(crest(0, 0.72, 0.0, 3, 0.16, 0.035, 0xffcf3a, 0.05, { rough: 0.6 })); // head crest
        // beak (upper + lower)
        g.add(cone(0.05, 0.1, 0xff8a30, 0, 0.55, 0.2, {}, 8).rotateX(Math.PI / 2));
        g.add(cone(0.045, 0.07, 0xe8741f, 0, 0.5, 0.19, {}, 8).rotateX(Math.PI / 2));
        eyePair(g, 0.6, 0.14, 0.08, 0.048);
        [-0.13, 0.13].forEach(x => g.add(sph(0.04, 0xffb35a, x, 0.55, 0.16, { rough: 0.5, opacity: 0.7 }, 8))); // cheeks
        g.add(featherWing(-1, -0.22, 0.4, 0, 0xf5c33a, { rough: 0.6 }, 3, 0.26));
        g.add(featherWing(1, 0.22, 0.4, 0, 0xf5c33a, { rough: 0.6 }, 3, 0.26));
        g.add(crest(0, 0.24, -0.24, 3, 0.14, 0.03, 0xf5c33a, 0.05, { rough: 0.6 })); // tail feathers
        [[-0.09, 0], [0.09, Math.PI]].forEach(([x, ph]) => { const l = leg2(x, 0.17, 0.02, 0.032, 0xff8a30, ph); g.add(l); });
        g.userData.float = false; g.userData.scale = 1.5; return g;
    },

    // Grey kitten — quadruped. Muzzle, inner ears, whiskers, brows, cheek fluff,
    // stripes, long tufted tail.
    kitten: () => {
        const g = new THREE.Group();
        const body = blob(0.24, 1.05, 0.92, 1.4, 0x9aa0aa, 0, 0.32, 0, { rough: 0.72 }, 16); g.add(body);
        g.add(blob(0.19, 1, 0.95, 1, 0xa8aeb8, 0, 0.44, 0.3, { rough: 0.72 }, 16)); // head
        [-0.1, 0.1, -0.02].forEach((x, i) => g.add(box(0.03, 0.03, 0.28, 0x7f858f, x, 0.5 - i * 0.02, -0.05, { rough: 0.75 }))); // back stripes
        // ears with pink inner
        [-1, 1].forEach(s => { const e = new THREE.Group(); e.position.set(s * 0.1, 0.57, 0.28); e.add(cone(0.07, 0.15, 0xa8aeb8, 0, 0.07, 0)); e.add(cone(0.04, 0.1, 0xf0b8c4, 0, 0.06, 0.02)); e.rotation.x = 0; e.userData.role = 'ear'; e.userData.baseRotX = 0; e.userData.phase = s < 0 ? 0 : Math.PI; g.add(e); });
        eyePair(g, 0.46, 0.42, 0.075, 0.05, 0x6a4fb0);
        brow(g, -0.075, 0.53, 0.42, 0.07, 0x7f858f, 0.2); brow(g, 0.075, 0.53, 0.42, 0.07, 0x7f858f, -0.2);
        g.add(blob(0.08, 1.3, 0.8, 1, 0xb4bac4, 0, 0.4, 0.46, { rough: 0.7 }, 10)); // muzzle
        g.add(sph(0.032, 0xf0a8b4, 0, 0.42, 0.53, { rough: 0.5 }, 8)); // nose
        [-1, 1].forEach(s => { g.add(whisker(s * 0.1, 0.4, 0.5, 0.22, s * 0.5)); g.add(whisker(s * 0.1, 0.37, 0.5, 0.2, s * 0.7)); });
        [[-0.12, 0.18, 0], [0.12, Math.PI], [-0.12, -0.18, Math.PI], [0.12, 0]].forEach((v, i) => { const x = [-0.12, 0.12, -0.12, 0.12][i], z = [0.16, 0.16, -0.16, -0.16][i], ph = [0, Math.PI, Math.PI, 0][i]; g.add(leg2(x, 0.18, z, 0.05, 0x9aa0aa, ph)); });
        const tail = new THREE.Group(); tail.position.set(0, 0.36, -0.28); const t = caps(0.045, 0.26, 0x9aa0aa, 0, 0.03, -0.13, { rough: 0.72 }); t.rotation.x = 1.15; tail.add(t); tail.add(sph(0.06, 0xd8dce2, 0, 0.16, -0.24, { rough: 0.7 }, 8)); tail.userData.role = 'tail'; g.add(tail);
        g.userData.float = false; g.userData.scale = 1.5; return g;
    },

    // Brown puppy — quadruped. Floppy detailed ears, muzzle, tongue, brows, spots,
    // chest fluff, wagging tufted tail.
    puppy: () => {
        const g = new THREE.Group();
        const body = blob(0.25, 1.1, 0.95, 1.45, 0x9a6a3a, 0, 0.32, 0, { rough: 0.72 }, 16); g.add(body);
        g.add(fluffRing(0, 0.3, 0.16, 0.2, 8, 0.05, 0xb8905c, { rough: 0.75 }, 0.7)); // chest fluff
        [[-0.12, 0.4, -0.1], [0.14, 0.36, 0.05]].forEach(([x, y, z]) => g.add(blob(0.06, 1.2, 0.9, 1, 0x7a5028, x, y, z, { rough: 0.7 }, 8))); // spots
        g.add(blob(0.2, 1, 0.95, 1, 0xa9773f, 0, 0.46, 0.3, { rough: 0.72 }, 16)); // head
        g.add(blob(0.11, 1.1, 0.8, 1.1, 0x6e4a28, 0, 0.4, 0.5, { rough: 0.7 }, 12)); // snout
        g.add(sph(0.05, 0x2a1c12, 0, 0.44, 0.6, { rough: 0.35 }, 8)); // nose
        g.add(box(0.05, 0.02, 0.06, 0xd06a7a, 0, 0.35, 0.55, { rough: 0.5 })); // tongue
        // floppy ears (upper + lower flap)
        [-1, 1].forEach(s => { const e = new THREE.Group(); e.position.set(s * 0.18, 0.55, 0.28); const u = blob(0.08, 0.7, 1.4, 0.5, 0x7a5028, 0, -0.09, 0, { rough: 0.75 }, 10); e.add(u); e.add(blob(0.06, 0.6, 1.2, 0.4, 0x684626, 0, -0.2, 0.02, { rough: 0.75 }, 8)); e.rotation.x = 0.25; e.userData.role = 'ear'; e.userData.baseRotX = 0.25; e.userData.phase = s < 0 ? 0 : Math.PI; g.add(e); });
        eyePair(g, 0.48, 0.44, 0.075, 0.05, 0x3a2410);
        brow(g, -0.075, 0.55, 0.44, 0.08, 0x6e4a28, 0.15); brow(g, 0.075, 0.55, 0.44, 0.08, 0x6e4a28, -0.15);
        [[-0.12, 0.16, 0], [0.12, 0.16, Math.PI], [-0.12, -0.16, Math.PI], [0.12, -0.16, 0]].forEach(([x, z, ph]) => g.add(leg2(x, 0.19, z, 0.055, 0x8a5e34, ph)));
        const tail = new THREE.Group(); tail.position.set(0, 0.38, -0.28); const t = caps(0.04, 0.16, 0x9a6a3a, 0, 0.03, -0.09, { rough: 0.72 }); t.rotation.x = 0.6; tail.add(t); tail.add(sph(0.06, 0xb8905c, 0, 0.12, -0.18, { rough: 0.72 }, 8)); tail.userData.role = 'tail'; g.add(tail);
        g.userData.float = false; g.userData.scale = 1.5; return g;
    },

    // Sunfox — glowing gold quadruped with a flame mane and big layered flame tail.
    sunfox: () => {
        const g = new THREE.Group();
        const body = blob(0.24, 1, 0.92, 1.4, 0xf7a83e, 0, 0.32, 0, { rough: 0.4, glow: 0xff9a2e, glowI: 0.4 }, 16); g.add(body);
        g.add(blob(0.18, 1, 0.95, 1, 0xffb64e, 0, 0.46, 0.29, { rough: 0.4, glow: 0xff9a2e, glowI: 0.35 }, 16));
        g.add(fluffRing(0, 0.36, 0.14, 0.22, 12, 0.06, 0xffd06a, { rough: 0.35, glow: 0xffb84a, glowI: 0.4 })); // flame mane
        [-1, 1].forEach(s => { const e = new THREE.Group(); e.position.set(s * 0.1, 0.6, 0.28); e.add(cone(0.08, 0.24, 0xd96c2f, 0, 0.12, 0, { glow: 0xff7a1e, glowI: 0.35 })); e.add(cone(0.04, 0.14, 0xffe0a0, 0, 0.1, 0.02)); e.userData.role = 'ear'; e.userData.baseRotX = 0; e.userData.phase = s < 0 ? 0 : Math.PI; g.add(e); });
        eyePair(g, 0.48, 0.42, 0.075, 0.05, 0x7a3a10);
        brow(g, -0.075, 0.55, 0.42, 0.08, 0xd96c2f, 0.2); brow(g, 0.075, 0.55, 0.42, 0.08, 0xd96c2f, -0.2);
        g.add(blob(0.07, 1.2, 0.8, 1, 0xffe0a0, 0, 0.42, 0.45, { rough: 0.4 }, 8)); // snout
        [[-0.11, 0.16, 0], [0.11, 0.16, Math.PI], [-0.11, -0.16, Math.PI], [0.11, -0.16, 0]].forEach(([x, z, ph]) => g.add(leg2(x, 0.18, z, 0.05, 0xe98f34, ph, { glow: 0xff9a2e, glowI: 0.2 })));
        const tail = new THREE.Group(); tail.position.set(0, 0.36, -0.24);
        [[0.19, 0.06, -0.16, 0.7], [0.14, 0.14, -0.34, 0.6], [0.09, 0.22, -0.5, 0.5]].forEach(([r, y, z, gi]) => { const f = blob(r, 0.75, 0.75, 1.5, 0xffc76a, 0, y, z, { glow: 0xffae3a, glowI: gi, rough: 0.3 }, 12); tail.add(f); });
        tail.add(cone(0.09, 0.24, 0xfff1c2, 0, 0.28, -0.6, { glow: 0xffe08a, glowI: 0.8 }, 8).rotateX(-2.4));
        tail.userData.role = 'tail'; g.add(tail);
        g.userData.float = false; g.userData.scale = 1.55; return g;
    },

    // Moss turtle — quadruped with a plated mossy shell, sprout and flowers.
    moss_turtle: () => {
        const g = new THREE.Group();
        const shell = blob(0.3, 1.3, 0.78, 1.15, 0x4d8b50, 0, 0.3, 0, { rough: 0.8 }, 16); g.add(shell);
        // hex-ish plates on the shell
        [[0, 0.5, 0], [-0.16, 0.44, 0.06], [0.16, 0.44, 0.06], [-0.16, 0.44, -0.08], [0.16, 0.44, -0.08], [0, 0.46, 0.18], [0, 0.46, -0.16]].forEach(([x, y, z]) => { const p = cone(0.09, 0.06, 0x3f7343, x, y, z, { rough: 0.85 }, 6); p.rotation.x = Math.PI; g.add(p); });
        [[-0.1, 0.5, 0.04], [0.12, 0.48, -0.02]].forEach(([x, y, z]) => g.add(sph(0.07, 0x7ab061, x, y, z, { rough: 0.85 }, 8))); // moss lumps
        [[0.12, 0.52, 0.08], [-0.04, 0.53, 0.14], [0.02, 0.5, -0.1]].forEach(([x, y, z]) => { g.add(sph(0.035, 0xff9ec2, x, y, z, { rough: 0.55 }, 6)); g.add(sph(0.015, 0xffe36a, x, y + 0.005, z + 0.02, { glow: 0xffe36a, glowI: 0.3 }, 5)); }); // flowers
        g.add(cone(0.025, 0.14, 0x72c86a, 0.0, 0.6, -0.02, { glow: 0x72c86a, glowI: 0.15 }, 6)); g.add(blob(0.03, 1.4, 0.6, 0.4, 0x8ce07a, 0.03, 0.66, -0.02, {}, 6)); // sprout + leaf
        g.add(blob(0.15, 1, 0.9, 1.1, 0x9cc66d, 0, 0.24, 0.32, { rough: 0.75 }, 14)); // head
        eyePair(g, 0.28, 0.42, 0.055, 0.036, 0x3a2a10);
        brow(g, -0.055, 0.34, 0.42, 0.06, 0x6f9e58, 0.2); brow(g, 0.055, 0.34, 0.42, 0.06, 0x6f9e58, -0.2);
        g.add(box(0.06, 0.02, 0.02, 0x5a7a45, 0, 0.2, 0.46)); // mouth
        [[-0.2, 0.14, 0], [0.2, 0.14, Math.PI], [-0.2, -0.14, Math.PI], [0.2, -0.14, 0]].forEach(([x, z, ph]) => g.add(leg2(x, 0.14, z, 0.06, 0x6f9e58, ph)));
        const tail = new THREE.Group(); tail.position.set(0, 0.24, -0.3); tail.add(cone(0.05, 0.13, 0x6f9e58, 0, 0, -0.06, {}, 6).rotateX(-Math.PI / 2)); tail.userData.role = 'tail'; g.add(tail);
        g.userData.float = false; g.userData.scale = 1.5; return g;
    },

    // Owl — hovers. Layered feather chest, big eyes with feather brows, ear tufts,
    // feathered wings, talons.
    owl: () => {
        const g = new THREE.Group();
        const body = blob(0.27, 1, 1.2, 1, 0x7d5aa0, 0, 0.5, 0, { rough: 0.62 }, 16); g.add(body);
        // scalloped feather rows on the belly
        for (let row = 0; row < 3; row++) { const y = 0.4 + row * 0.11, w = 0.16 - row * 0.02; for (let i = -1; i <= 1; i++) g.add(blob(0.05, 1, 0.8, 0.6, row % 2 ? 0xe8dcc0 : 0xd8c8a8, i * w, y, 0.18, { rough: 0.6 }, 8)); }
        g.add(fluffRing(0, 0.66, 0.05, 0.24, 12, 0.05, 0x8a68ae, { rough: 0.6 })); // neck ruff
        eyePair(g, 0.62, 0.2, 0.12, 0.082, 0xffb84a);
        [-1, 1].forEach(s => g.add(cone(0.13, 0.05, 0x5d3f80, s * 0.12, 0.62, 0.19, { rough: 0.6 }, 10).rotateX(Math.PI / 2))); // eye discs rim
        eyePair(g, 0.62, 0.22, 0.12, 0.08, 0xffb84a);
        g.add(cone(0.05, 0.1, 0xff9a30, 0, 0.56, 0.25, {}, 8).rotateX(Math.PI / 2)); // beak
        [-1, 1].forEach(s => { const e = new THREE.Group(); e.position.set(s * 0.17, 0.68, 0); e.add(crest(0, 0.06, 0, 3, 0.14, 0.03, 0x5d3f80, 0.03, { rough: 0.6 })); e.userData.role = 'ear'; e.userData.baseRotX = 0; e.userData.phase = s < 0 ? 0 : Math.PI; g.add(e); });
        g.add(featherWing(-1, -0.24, 0.52, -0.02, 0x6a4a90, { rough: 0.6 }, 4, 0.34));
        g.add(featherWing(1, 0.24, 0.52, -0.02, 0x6a4a90, { rough: 0.6 }, 4, 0.34));
        [-0.09, 0.09].forEach(x => g.add(cone(0.03, 0.08, 0xffb84a, x, 0.25, 0.14, {}, 5))); // talons
        g.userData.float = true; g.userData.scale = 1.4; return g;
    },

    // Cloudling — floating cloud, fluffier silhouette, rosy cheeks, dangling stars.
    cloudling: () => {
        const g = new THREE.Group();
        g.add(rim(0.38, 0x9fd8ff, 0, 0.54, 0, 0.16));
        [[0, .5, 0, .24], [-.2, .48, 0, .18], [.2, .48, 0, .18], [0, .64, 0, .19], [0, .48, .15, .17], [-.12, .58, .06, .13], [.12, .58, .06, .13], [-.28, .44, -.02, .12], [.28, .44, -.02, .12]]
            .forEach(([x, y, z, r]) => g.add(sph(r, 0xeef8ff, x, y, z, { rough: 0.35, glow: 0xbfe3ff, glowI: 0.18 }, 12)));
        eyePair(g, 0.55, 0.2, 0.09, 0.05, 0x3a5a80);
        [-0.17, 0.17].forEach(x => g.add(sph(0.04, 0xff9ec2, x, 0.5, 0.18, { rough: 0.4, opacity: 0.7 }, 8))); // cheeks
        const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.01, 6, 8, Math.PI), mat(0x6a8ab0, { rough: 0.5 })); mouth.position.set(0, 0.49, 0.24); mouth.rotation.x = Math.PI; g.add(mouth);
        [[-0.2, 0.32, 0x67c8ff], [0.05, 0.28, 0xffd86a], [0.2, 0.34, 0xb279ff]].forEach(([x, y, c]) => { g.add(box(0.006, 0.12, 0.006, 0xffffff, x, y + 0.06, 0.02, { opacity: 0.5 })); const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.045), mat(c, { glow: c, glowI: 0.8 })); s.position.set(x, y, 0.02); g.add(s); }); // hanging stars on threads
        g.userData.float = true; g.userData.scale = 1.4; return g;
    },

    // Moon hare — legless bunny hop; long inner-lined ears, fluffy cheeks & tail,
    // star mark, shimmery blue with a soft glow.
    moon_hare: () => {
        const g = new THREE.Group();
        const body = blob(0.23, 1, 1.05, 1, 0xc9d4f2, 0, 0.32, 0, { rough: 0.5, glow: 0x8fa8e0, glowI: 0.28 }, 16); g.add(body);
        g.add(blob(0.17, 1, 0.95, 1, 0xe3e9ff, 0, 0.52, 0.16, { rough: 0.5, glow: 0x8fa8e0, glowI: 0.2 }, 16));
        g.add(fluffRing(0, 0.34, 0.14, 0.18, 8, 0.045, 0xeff2ff, { rough: 0.5 }, 0.7)); // chest fluff
        [-1, 1].forEach(s => { const e = new THREE.Group(); e.position.set(s * 0.08, 0.64, 0.14); const outer = caps(0.055, 0.28, 0xd7e0fa, 0, 0.16, 0, { rough: 0.55 }); e.add(outer); e.add(caps(0.03, 0.22, 0xf3c6dd, 0, 0.16, 0.035, { rough: 0.5 })); e.rotation.z = s * -0.12; e.userData.role = 'ear'; e.userData.baseRotX = -0.1; e.rotation.x = -0.1; e.userData.phase = s < 0 ? 0 : Math.PI; g.add(e); });
        g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.03), mat(0x9fc0ff, { glow: 0x9fc0ff, glowI: 0.7 })).translateY(0.62).translateZ(0.28)); // star on forehead
        eyePair(g, 0.53, 0.32, 0.075, 0.052, 0x3a4a80);
        g.add(sph(0.032, 0xf3a6c8, 0, 0.47, 0.34, { rough: 0.5 }, 6)); // nose
        [-1, 1].forEach(s => g.add(whisker(s * 0.07, 0.45, 0.32, 0.18, s * 0.6)));
        const tail = new THREE.Group(); tail.position.set(0, 0.3, -0.22); tail.add(sph(0.09, 0xffffff, 0, 0, -0.02, { rough: 0.6, glow: 0xcfe0ff, glowI: 0.3 }, 10)); tail.userData.role = 'tail'; g.add(tail);
        g.userData.float = false; g.userData.scale = 1.5; return g;
    },

    // Baby dragon — hovers. Scaled belly, dorsal spikes, horns, snout w/ nostrils,
    // membraned ribbed wings, spiked tail.
    baby_dragon: () => {
        const g = new THREE.Group();
        const body = blob(0.24, 1, 1.05, 1.25, 0x45c6b0, 0, 0.5, 0, { rough: 0.45 }, 16); g.add(body);
        for (let i = 0; i < 4; i++) g.add(blob(0.05, 1.2, 0.5, 0.9, 0xdff5ef, 0, 0.38 + i * 0.07, 0.18, { rough: 0.5 }, 8)); // belly scale rows
        g.add(blob(0.2, 1, 0.95, 1, 0x4fd0ba, 0, 0.64, 0.26, { rough: 0.45 }, 16)); // head
        g.add(blob(0.09, 1.2, 0.8, 1.1, 0x5cdcc6, 0, 0.6, 0.44, { rough: 0.45 }, 10)); // snout
        [-0.035, 0.035].forEach(x => g.add(sph(0.014, 0x2a5a52, x, 0.62, 0.52, { rough: 0.4 }, 5))); // nostrils
        [-1, 1].forEach(s => { const e = new THREE.Group(); e.position.set(s * 0.08, 0.82, 0.24); e.add(cone(0.05, 0.16, 0xffe08a, 0, 0.08, 0, { glow: 0xffcf5a, glowI: 0.25 })); e.rotation.x = -0.3; e.userData.role = 'ear'; e.userData.baseRotX = -0.3; e.userData.phase = s < 0 ? 0 : Math.PI; g.add(e); });
        [0.02, 0.1, 0.18, 0.26].forEach((z, i) => g.add(cone(0.05 - i * 0.006, 0.13 - i * 0.015, 0x2fae98, 0, 0.66 - i * 0.05, -0.14 - z, {}, 6))); // dorsal spikes
        eyePair(g, 0.68, 0.4, 0.08, 0.056, 0x2a5a80);
        brow(g, -0.08, 0.76, 0.4, 0.09, 0x2fae98, 0.25); brow(g, 0.08, 0.76, 0.4, 0.09, 0x2fae98, -0.25);
        // ribbed membrane wings
        [-1, 1].forEach(s => { const p = new THREE.Group(); p.position.set(s * 0.2, 0.58, -0.04); const mem = blob(0.2, 0.28, 1.15, 0.06, 0x9ceade, 0, 0.06, 0, { rough: 0.4, opacity: 0.9 }, 12); p.add(mem); for (let i = 0; i < 3; i++) { const rib = caps(0.012, 0.24, 0x2fae98, s * (0.04 + i * 0.05), 0.06, 0.005, { rough: 0.5 }); rib.rotation.z = s * (0.2 - i * 0.15); p.add(rib); } p.rotation.z = s * 0.5; p.userData.role = 'wing'; p.userData.side = s; p.userData.baseRotZ = s * 0.5; g.add(p); });
        const tail = new THREE.Group(); tail.position.set(0, 0.46, -0.26); const t = caps(0.05, 0.22, 0x45c6b0, 0, 0.03, -0.13, { rough: 0.45 }); t.rotation.x = 1.2; tail.add(t); [-0.02, -0.14, -0.26].forEach((z, i) => tail.add(cone(0.03, 0.08, 0x2fae98, 0, 0.06 + i * 0.02, z, {}, 6))); tail.add(cone(0.07, 0.14, 0x2fae98, 0, 0.05, -0.32, {}, 6).rotateX(-2.2)); tail.userData.role = 'tail'; g.add(tail);
        g.userData.float = true; g.userData.scale = 1.45; return g;
    },

    // Bloom fairy — hovers. Layered dress, flower crown, hair, arms w/ hands,
    // big veined translucent wings, glowing.
    bloom_fairy: () => {
        const g = new THREE.Group();
        g.add(rim(0.32, 0xffc0e0, 0, 0.45, 0, 0.14));
        g.add(cone(0.19, 0.28, 0xef6fa9, 0, 0.42, 0, { rough: 0.5 }, 12)); // dress lower
        g.add(cone(0.15, 0.18, 0xff9ec8, 0, 0.5, 0, { rough: 0.5 }, 12)); // dress upper layer
        g.add(blob(0.12, 1, 1, 1, 0xffd4bd, 0, 0.66, 0.06, { rough: 0.5 }, 14)); // head
        g.add(blob(0.14, 1.1, 1.2, 1, 0x8fe0c4, 0, 0.72, -0.06, { rough: 0.55 }, 12)); // hair back
        [-0.15, 0, 0.15, -0.08, 0.08].forEach((x, i) => { const c = 0.055 - (i > 2 ? 0.015 : 0); g.add(sph(c, [0xff8fc2, 0xffb3d6, 0xff8fc2, 0xffd86a, 0xffd86a][i], x, 0.78 - (i > 2 ? 0.02 : 0), 0.03, { glow: 0xff9ec8, glowI: 0.25 }, 8)); }); // flower crown
        eyePair(g, 0.67, 0.15, 0.05, 0.032, 0x4a7a60);
        [-1, 1].forEach(s => { const a = new THREE.Group(); a.position.set(s * 0.13, 0.52, 0.02); a.add(caps(0.028, 0.12, 0xffd4bd, 0, -0.08, 0, { rough: 0.5 })); a.add(sph(0.035, 0xffd4bd, 0, -0.16, 0, { rough: 0.5 }, 8)); a.userData.role = 'arm'; a.userData.side = s; a.userData.phase = s < 0 ? 0 : Math.PI; g.add(a); });
        // big translucent wings (upper + lower) with veins
        [-1, 1].forEach(s => { const p = new THREE.Group(); p.position.set(s * 0.06, 0.5, -0.05); const up = blob(0.16, 0.5, 1.3, 0.15, 0x9cf6dc, s * 0.1, 0.08, 0, { rough: 0.25, opacity: 0.55, glow: 0x8ff0d4, glowI: 0.4 }, 12); const lo = blob(0.11, 0.5, 1.1, 0.15, 0xbfa6ff, s * 0.08, -0.1, 0, { rough: 0.25, opacity: 0.5, glow: 0xa98fff, glowI: 0.35 }, 12); p.add(up); p.add(lo); p.userData.role = 'wing'; p.userData.side = s; p.userData.baseRotZ = 0; g.add(p); });
        g.userData.float = true; g.userData.scale = 1.5; return g;
    },

    // Ember phoenix — hovers. Layered fire-feather crest, big feathered wings,
    // long tail feathers, strong glow.
    ember_phoenix: () => {
        const g = new THREE.Group();
        g.add(rim(0.34, 0xff7a1e, 0, 0.56, 0, 0.24));
        const body = blob(0.19, 1, 1.12, 1, 0xff7b32, 0, 0.54, 0, { rough: 0.38, glow: 0xff6a1e, glowI: 0.65 }, 16); g.add(body);
        g.add(fluffRing(0, 0.5, 0.12, 0.17, 10, 0.05, 0xffb04a, { rough: 0.35, glow: 0xffae3a, glowI: 0.5 })); // chest flames
        g.add(blob(0.14, 1, 0.95, 1, 0xffc34c, 0, 0.69, 0.16, { rough: 0.38, glow: 0xffb02e, glowI: 0.6 }, 14)); // head
        g.add(cone(0.04, 0.08, 0xffe08a, 0, 0.69, 0.28, {}, 8).rotateX(Math.PI / 2)); // beak
        g.add(crest(0, 0.84, 0.02, 4, 0.18, 0.03, 0xffd45a, 0.05, { glow: 0xffcf5a, glowI: 0.6 })); // fire crest
        eyePair(g, 0.72, 0.28, 0.055, 0.038, 0x3a2a10);
        brow(g, -0.055, 0.78, 0.28, 0.06, 0xff9d32, 0.3); brow(g, 0.055, 0.78, 0.28, 0.06, 0xff9d32, -0.3);
        g.add(featherWing(-1, -0.22, 0.56, -0.02, 0xff9d32, { rough: 0.35, glow: 0xff7a1e, glowI: 0.55 }, 5, 0.46));
        g.add(featherWing(1, 0.22, 0.56, -0.02, 0xff9d32, { rough: 0.35, glow: 0xff7a1e, glowI: 0.55 }, 5, 0.46));
        const tail = new THREE.Group(); tail.position.set(0, 0.44, -0.12);
        [-0.12, -0.04, 0.04, 0.12].forEach((x, i) => { const c = cone(0.06, 0.44 - Math.abs(i - 1.5) * 0.06, i === 1 || i === 2 ? 0xffdc57 : 0xff6738, x, -0.18, -0.06, { glow: 0xff7a1e, glowI: 0.5 }, 7); c.rotation.x = Math.PI; c.rotation.z = (x) * 1.2; tail.add(c); });
        tail.userData.role = 'tail'; g.add(tail);
        g.userData.float = true; g.userData.scale = 1.5; return g;
    },
};

// Build a pet group for `key`, or null if unknown.
export function buildPet(key) {
    const fn = PET_BUILDERS[key];
    return fn ? fn() : null;
}
