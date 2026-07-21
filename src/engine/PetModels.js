// PetModels — small, cheap voxel companion models. Each builder returns a
// THREE.Group centred at the origin (feet ~y=0). Deliberately low-poly and
// static (no particles) so many pets on screen stay perf-safe. The owner's
// CharacterManager places the group beside the hero and animates a gentle hop.
import * as THREE from 'three';

// Tiny mesh helpers.
const box = (w, h, d, color, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
};
const sph = (r, color, x = 0, y = 0, z = 0, seg = 10) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), new THREE.MeshLambertMaterial({ color }));
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
};
const cone = (r, h, color, x = 0, y = 0, z = 0, seg = 8) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), new THREE.MeshLambertMaterial({ color }));
    m.position.set(x, y, z);
    return m;
};
const eyes = (g, y, z, spread = 0.09, r = 0.035) => {
    [-spread, spread].forEach(x => { g.add(sph(r, 0x1a1a22, x, y, z, 6)); });
};

// The pet catalog metadata lives in GameData (name/price/emoji). Here we only
// map a pet key → its model builder + whether it floats.
export const PET_BUILDERS = {
    // Pink jelly slime that bounces.
    poring: () => {
        const g = new THREE.Group();
        const body = sph(0.26, 0xff8fb0, 0, 0.26, 0, 12);
        body.scale.set(1, 0.85, 1);
        g.add(body);
        eyes(g, 0.3, 0.24, 0.1, 0.045);
        g.add(box(0.12, 0.03, 0.02, 0x8a3050, 0, 0.22, 0.245)); // mouth
        g.userData.float = false;
        return g;
    },
    // Brown puppy.
    puppy: () => {
        const g = new THREE.Group();
        g.add(box(0.34, 0.22, 0.5, 0x9a6a3a, 0, 0.28, 0));       // body
        g.add(box(0.24, 0.24, 0.22, 0xa9773f, 0, 0.4, 0.28));    // head
        g.add(box(0.24, 0.16, 0.1, 0x7a5028, 0, 0.5, 0.24));     // ears block
        eyes(g, 0.44, 0.39, 0.06, 0.03);
        g.add(box(0.09, 0.07, 0.08, 0x3a2818, 0, 0.37, 0.4));    // snout
        [-0.11, 0.11].forEach(x => { g.add(box(0.08, 0.16, 0.08, 0x7a5028, x, 0.08, 0.16)); g.add(box(0.08, 0.16, 0.08, 0x7a5028, x, 0.08, -0.16)); });
        g.add(box(0.07, 0.07, 0.2, 0x9a6a3a, 0, 0.34, -0.3));    // tail
        g.userData.float = false;
        return g;
    },
    // Grey kitten.
    kitten: () => {
        const g = new THREE.Group();
        g.add(box(0.3, 0.2, 0.44, 0x9aa0aa, 0, 0.26, 0));
        g.add(box(0.24, 0.22, 0.2, 0xa8aeb8, 0, 0.38, 0.24));
        [-0.09, 0.09].forEach(x => g.add(cone(0.06, 0.14, 0xa8aeb8, x, 0.52, 0.24)));  // ears
        eyes(g, 0.42, 0.35, 0.06, 0.032);
        g.add(box(0.06, 0.2, 0.06, 0x9aa0aa, 0, 0.4, -0.26));    // upright tail
        g.userData.float = false;
        return g;
    },
    // Yellow chick.
    chick: () => {
        const g = new THREE.Group();
        const body = sph(0.22, 0xffd84a, 0, 0.24, 0, 12); body.scale.set(1, 1.1, 1); g.add(body);
        eyes(g, 0.3, 0.2, 0.07, 0.035);
        g.add(cone(0.05, 0.1, 0xff8a30, 0, 0.26, 0.24).rotateX(Math.PI / 2)); // beak
        [-0.16, 0.16].forEach(x => { const w = box(0.06, 0.16, 0.2, 0xf5c33a, x, 0.24, 0); g.add(w); });
        g.userData.float = false;
        return g;
    },
    // Little green dragon (floats).
    baby_dragon: () => {
        const g = new THREE.Group();
        g.add(box(0.3, 0.24, 0.4, 0x3fae6a, 0, 0.5, 0));         // body
        g.add(box(0.24, 0.24, 0.24, 0x46bd76, 0, 0.62, 0.26));   // head
        [-0.08, 0.08].forEach(x => g.add(cone(0.05, 0.13, 0xffe08a, x, 0.78, 0.26)));   // horns
        eyes(g, 0.66, 0.37, 0.07, 0.033);
        [-0.2, 0.2].forEach(x => { const w = box(0.05, 0.28, 0.34, 0x8fe0b0, x, 0.55, -0.05); w.rotation.z = x < 0 ? 0.5 : -0.5; g.add(w); }); // wings
        g.add(box(0.08, 0.08, 0.26, 0x3fae6a, 0, 0.48, -0.28));  // tail
        g.userData.float = true;
        return g;
    },
    // Brown owl (floats).
    owl: () => {
        const g = new THREE.Group();
        const body = sph(0.24, 0x8a6a44, 0, 0.5, 0, 12); body.scale.set(1, 1.15, 1); g.add(body);
        g.add(sph(0.14, 0xe8dcc0, 0, 0.46, 0.16, 8));            // belly
        [-0.1, 0.1].forEach(x => { g.add(sph(0.08, 0xf0e8d0, x, 0.6, 0.16, 8)); g.add(sph(0.04, 0x1a1a22, x, 0.6, 0.22, 6)); }); // big eyes
        g.add(cone(0.04, 0.08, 0xff9a30, 0, 0.55, 0.24).rotateX(Math.PI / 2)); // beak
        [-0.16, 0.16].forEach(x => g.add(cone(0.06, 0.12, 0x6a4a28, x, 0.72, 0)));  // ear tufts
        g.userData.float = true;
        return g;
    },
};

// Build a pet group for `key`, or null if unknown.
export function buildPet(key) {
    const fn = PET_BUILDERS[key];
    return fn ? fn() : null;
}
