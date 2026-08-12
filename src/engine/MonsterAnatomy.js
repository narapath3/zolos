// Procedural anatomy pass for the early-game monsters. The original models
// grew from one shared sphere, which made very different species read as the
// same blob at gameplay distance. This layer gives every family a purposeful
// silhouette, grounded limbs and small secondary motion while keeping the
// geometry cheap enough for the full multiplayer spawn count.

const SLIMES = new Set(['poring', 'poporing', 'drops']);
const HUMANOID_CUSTOM = new Set([
  'skeleton', 'archer_skeleton', 'zombie', 'raydric', 'hunter_fly', 'dullahan',
  'golem', 'stone_golem', 'harpy', 'gargoyle', 'iron_golem', 'storm_dragon',
  'dragon_egg', 'sea_dragon', 'leib_olmai', 'dark_illusion', 'abyss_knight',
]);

function blobGeometry(THREE, size, pointed = false) {
  const profile = [
    [0.02, -0.48], [0.34, -0.46], [0.50, -0.32], [0.55, -0.05],
    [0.49, 0.22], [0.34, 0.43], [pointed ? 0.12 : 0.20, 0.53], [0.02, pointed ? 0.72 : 0.58],
  ].map(([x, y]) => new THREE.Vector2(x * size, y * size));
  const geometry = new THREE.LatheGeometry(profile, 24);
  geometry.scale(1, 0.93, 0.88);
  return geometry;
}

function wingGeometry(THREE, size, swept = false) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0.48 * size, 0.25 * size);
  shape.lineTo((swept ? 0.62 : 0.42) * size, -0.08 * size);
  shape.lineTo(0.24 * size, -0.02 * size);
  shape.lineTo(0.12 * size, -0.30 * size);
  shape.lineTo(0, -0.12 * size);
  shape.closePath();
  return new THREE.ShapeGeometry(shape, 4);
}

export function upgradeMonsterAnatomy({ THREE, type, family, size, bodyMesh, bodyMat, createMat, put, hideBody }) {
  const rig = [];
  const track = (mesh, axis, amplitude, phase = 0, speed = 1) => {
    if (!mesh) return mesh;
    rig.push({ mesh, axis, amplitude, phase, speed, base: mesh.rotation[axis] });
    return mesh;
  };
  const capsule = (radius, length, radial = 8) => new THREE.CapsuleGeometry(radius * size, length * size, 4, radial);
  const sph = (r, detail = 1) => new THREE.IcosahedronGeometry(r * size, detail);
  const cone = (r, h, sides = 7) => new THREE.ConeGeometry(r * size, h * size, sides);
  const cyl = (top, bottom, h, sides = 8) => new THREE.CylinderGeometry(top * size, bottom * size, h * size, sides);
  const box = (w, h, d) => new THREE.BoxGeometry(w * size, h * size, d * size, 2, 2, 2);
  const dark = createMat(0x241b25, 0.72, 0.04);
  const accent = createMat(new THREE.Color(type === 'poporing' ? 0xb9ff72 : 0xffffff).lerp(new THREE.Color(bodyMat.color), 0.35), 0.6, 0.02);

  if (HUMANOID_CUSTOM.has(type)) return rig;

  if (SLIMES.has(type)) {
    bodyMesh.geometry.dispose();
    bodyMesh.geometry = blobGeometry(THREE, size, type === 'drops');
    // A dark underside and soft brow stop the face reading like eyes pasted on
    // a primitive. The crown ridge gives a strong profile from behind too.
    put(new THREE.TorusGeometry(0.32 * size, 0.025 * size, 5, 18), dark, 0, -0.35, 0, [Math.PI / 2, 0, 0]);
    put(box(0.13, 0.025, 0.025), dark, 0, -0.03, 0.49, [0, 0, -0.10]);
    put(cone(0.055, 0.18, 6), accent, -0.27, 0.35, -0.08, [0, 0, -0.7]);
    put(cone(0.055, 0.18, 6), accent, 0.27, 0.35, -0.08, [0, 0, 0.7]);
    return rig;
  }

  if (type === 'lunatic') {
    bodyMesh.geometry.scale(0.84, 0.94, 0.82);
    const fur = createMat(bodyMat.color, 0.9, 0.0);
    const paw = createMat(0xf4e9df, 0.92, 0.0);
    put(sph(0.27, 1), fur, 0, -0.24, -0.10);
    [-1, 1].forEach((side, i) => {
      track(put(capsule(0.075, 0.23), fur, side * 0.22, -0.35, 0.02, [0.22, 0, side * -0.12]), 'x', 0.24, i * Math.PI);
      put(sph(0.09, 1), paw, side * 0.23, -0.49, 0.13);
    });
    put(sph(0.13, 1), paw, 0, -0.02, 0.40);
    [-0.11, 0, 0.11].forEach(x => put(cone(0.045, 0.14, 5), paw, x, -0.12, 0.34, [Math.PI, 0, 0]));
  } else if (type === 'fabre' || type === 'rocker') {
    bodyMesh.geometry.scale(0.86, 0.84, 0.92);
    const chitin = createMat(type === 'rocker' ? 0x789c2d : bodyMat.color, 0.68, 0.08);
    const joint = createMat(0x40351c, 0.82, 0.03);
    // Six two-stage legs form a readable insect stance instead of two sticks.
    [-1, 0, 1].forEach((zBand, row) => [-1, 1].forEach((side, sideIndex) => {
      const upper = track(put(capsule(0.025, 0.22, 6), joint, side * 0.35, -0.17, zBand * 0.18,
        [0.15 + row * 0.08, 0, side * -0.82]), 'z', 0.22, row * 0.8 + sideIndex * Math.PI, 1.4);
      const foot = put(capsule(0.018, 0.19, 6), joint, side * 0.50, -0.32, zBand * 0.19,
        [0.1, 0, side * -0.36]);
      track(foot, 'z', 0.16, row * 0.8 + sideIndex * Math.PI, 1.4);
      return upper;
    }));
    put(new THREE.TorusGeometry(0.36 * size, 0.035 * size, 5, 16), chitin, 0, 0.0, -0.20, [Math.PI / 2, 0, 0]);
    put(cone(0.07, 0.20, 5), dark, -0.10, -0.12, 0.43, [1.15, 0, -0.35]);
    put(cone(0.07, 0.20, 5), dark, 0.10, -0.12, 0.43, [1.15, 0, 0.35]);
  } else if (type === 'willow') {
    bodyMesh.geometry.dispose();
    bodyMesh.geometry = cyl(0.30, 0.45, 0.90, 10);
    const bark = createMat(0x704420, 0.98, 0.0);
    [-1, 1].forEach(side => {
      put(cone(0.13, 0.42, 6), bark, side * 0.32, -0.43, 0.02, [0, 0, side * -0.82]);
      put(cone(0.10, 0.34, 6), bark, side * 0.18, -0.44, -0.24, [0.55, 0, side * -0.35]);
    });
    for (let i = 0; i < 4; i++) put(box(0.05, 0.22, 0.025), dark, -0.17 + i * 0.11, -0.02 + (i % 2) * 0.18, 0.315, [0, 0, i % 2 ? 0.25 : -0.2]);
  } else if (type === 'spore') {
    // The legacy .scale(.2) was overwritten by the bounce animation and made
    // the cap collapse unpredictably. Hide only the placeholder body instead.
    bodyMesh.scale.set(1, 1, 1);
    hideBody();
    const root = createMat(0xd8c9aa, 0.96, 0.0);
    [-1, 1].forEach((side, i) => {
      track(put(capsule(0.045, 0.22), root, side * 0.20, -0.35, 0.03, [0.05, 0, side * -0.42]), 'z', 0.18, i * Math.PI);
      put(sph(0.08, 0), root, side * 0.25, -0.49, 0.12);
    });
    put(new THREE.TorusGeometry(0.31 * size, 0.025 * size, 5, 18), dark, 0, 0.33, 0, [Math.PI / 2, 0, 0]);
  } else if (type === 'bigfoot' || type === 'nine_tail') {
    bodyMesh.geometry.scale(0.80, 0.78, 0.78);
    const fur = createMat(bodyMat.color, 0.94, 0.0);
    const chest = createMat(type === 'nine_tail' ? 0xffe7c0 : 0xcda984, 0.95, 0.0);
    put(sph(type === 'bigfoot' ? 0.40 : 0.32, 1), fur, 0, -0.28, -0.10);
    put(cone(0.18, 0.35, 7), chest, 0, -0.05, 0.27, [Math.PI, 0, 0]);
    [-1, 1].forEach((side, i) => {
      track(put(capsule(type === 'bigfoot' ? 0.10 : 0.075, 0.26), fur, side * 0.25, -0.39, 0.02,
        [0.2, 0, side * -0.16]), 'x', 0.28, i * Math.PI);
      const pawMesh = put(sph(type === 'bigfoot' ? 0.13 : 0.10, 1), dark, side * 0.26, -0.53, 0.16);
      pawMesh.scale.set(1.15, 0.65, 1.45);
    });
  } else if (type === 'horn') {
    bodyMesh.geometry.scale(0.78, 0.72, 0.88);
    const shell = createMat(0x3e2b20, 0.40, 0.45);
    const elytra = put(sph(0.38, 1), shell, 0, 0.02, -0.34);
    elytra.scale.set(0.92, 0.72, 1.35);
    put(box(0.025, 0.42, 0.025), dark, 0, 0.02, -0.63, [Math.PI / 2, 0, 0]);
    [-1, 0, 1].forEach((band, row) => [-1, 1].forEach((side, sideIndex) => {
      track(put(capsule(0.025, 0.30, 6), dark, side * 0.38, -0.19, band * 0.20,
        [0.1, 0, side * -0.86]), 'z', 0.20, row + sideIndex * Math.PI, 1.25);
    }));
  } else if (type === 'savage') {
    bodyMesh.geometry.scale(0.78, 0.74, 0.78);
    const fur = createMat(bodyMat.color, 0.96, 0.0);
    const torso = put(new THREE.CapsuleGeometry(0.34 * size, 0.48 * size, 5, 10), fur, 0, -0.17, -0.33, [Math.PI / 2, 0, 0]);
    torso.scale.set(1.08, 1, 0.92);
    [-1, 1].forEach(side => [-0.42, 0.02].forEach((z, row) => {
      track(put(capsule(0.075, 0.25), fur, side * 0.24, -0.40, z, [0, 0, side * -0.08]), 'x', 0.25, row * Math.PI + (side > 0 ? Math.PI : 0));
      put(box(0.15, 0.07, 0.21), dark, side * 0.24, -0.55, z + 0.08);
    }));
    [-1, 1].forEach(side => put(cone(0.08, 0.22, 5), fur, side * 0.22, 0.32, 0.03, [0, 0, side * -0.35]));
  } else if (type === 'boa') {
    bodyMesh.geometry.scale(0.78, 0.66, 0.86);
    const scaleMat = createMat(bodyMat.color, 0.64, 0.12);
    [-0.32, -0.68, -1.00].forEach((z, i) => {
      const segment = track(put(capsule(0.19 - i * 0.025, 0.30), scaleMat, Math.sin(i * 1.7) * 0.13,
        -0.16 - i * 0.025, z, [Math.PI / 2, 0, 0]), 'y', 0.16, i * 0.8, 0.75);
      segment.scale.set(1, 1, 0.82);
    });
    put(cone(0.035, 0.20, 4), new THREE.MeshBasicMaterial({ color: 0xe73545 }), -0.035, -0.06, 0.48, [Math.PI / 2, 0, 0.15]);
    put(cone(0.035, 0.20, 4), new THREE.MeshBasicMaterial({ color: 0xe73545 }), 0.035, -0.06, 0.48, [Math.PI / 2, 0, -0.15]);
  } else if (type === 'deviruchi') {
    bodyMesh.geometry.scale(0.82, 0.90, 0.76);
    const demon = createMat(bodyMat.color, 0.58, 0.16);
    const wingMat = createMat(0x24122e, 0.55, 0.18, true, 0.92);
    [-1, 1].forEach((side, i) => {
      track(put(capsule(0.055, 0.28), demon, side * 0.27, -0.24, 0.03, [0.1, 0, side * -0.42]), 'z', 0.22, i * Math.PI);
      put(cone(0.075, 0.16, 5), dark, side * 0.32, -0.43, 0.13, [Math.PI, 0, 0]);
      const wing = put(wingGeometry(THREE, size, true), wingMat, side * 0.30, 0.10, -0.28, [0, side > 0 ? Math.PI : 0, side * -0.18]);
      track(wing, 'z', 0.28, i * Math.PI, 1.8);
    });
    track(put(new THREE.TorusGeometry(0.30 * size, 0.025 * size, 5, 14, Math.PI * 1.25), demon,
      0, -0.16, -0.31, [Math.PI / 2, 0, 0.6]), 'y', 0.20, 0, 0.8);
    put(cone(0.07, 0.16, 4), demon, 0.27, -0.10, -0.36, [0, 0, -1.0]);
  } else if (type === 'ghostring') {
    bodyMesh.geometry.dispose();
    bodyMesh.geometry = blobGeometry(THREE, size, true);
    const spectral = createMat(0xd8efff, 0.2, 0.2, true, 0.68);
    [-1, 1].forEach((side, i) => track(put(cone(0.10, 0.34, 6), spectral, side * 0.38, -0.02, 0.0,
      [0, 0, side * -1.20]), 'z', 0.22, i * Math.PI, 0.8));
    put(new THREE.TorusGeometry(0.31 * size, 0.035 * size, 6, 20), spectral, 0, -0.37, 0, [Math.PI / 2, 0, 0]);
  } else if (type === 'crab') {
    bodyMesh.geometry.scale(1.15, 0.58, 0.82);
    const shell = createMat(bodyMat.color, 0.38, 0.26);
    put(new THREE.TorusGeometry(0.35 * size, 0.045 * size, 6, 18), shell, 0, 0.02, 0, [Math.PI / 2, 0, 0]);
    [-1, 1].forEach(side => {
      put(capsule(0.025, 0.16, 6), shell, side * 0.16, 0.31, 0.15, [0.7, 0, side * -0.1]);
      put(sph(0.055, 1), dark, side * 0.17, 0.40, 0.23);
    });
  } else if (type === 'fish') {
    bodyMesh.geometry.scale(0.68, 0.72, 1.35);
    const fin = createMat(new THREE.Color(bodyMat.color).offsetHSL(0.03, 0.05, 0.12), 0.48, 0.12, true, 0.92);
    const dorsal = track(put(wingGeometry(THREE, size), fin, 0, 0.39, -0.12, [0, Math.PI / 2, 0.25]), 'z', 0.12, 0, 0.7);
    dorsal.scale.set(0.7, 0.7, 0.7);
    [-1, 1].forEach((side, i) => track(put(cone(0.10, 0.28, 4), fin, side * 0.30, -0.05, -0.02,
      [0.15, 0, side * -1.10]), 'z', 0.18, i * Math.PI, 1.2));
  } else if (type === 'shrimp') {
    bodyMesh.geometry.scale(0.64, 0.62, 0.78);
    const shell = createMat(bodyMat.color, 0.42, 0.15);
    for (let i = 0; i < 5; i++) {
      const seg = track(put(sph(0.25 - i * 0.025, 1), shell, 0, -0.05 + i * 0.025, -0.25 - i * 0.25),
        'y', 0.12, i * 0.7, 0.9);
      seg.scale.set(0.86, 0.72, 1.1);
    }
    [-1, 1].forEach((side, i) => {
      track(put(capsule(0.025, 0.34, 6), shell, side * 0.28, -0.08, 0.25, [0.9, 0, side * -0.48]), 'z', 0.22, i * Math.PI);
      put(cone(0.10, 0.22, 5), shell, side * 0.39, -0.21, 0.40, [0, 0, side * -1.1]);
    });
  } else if (type === 'clam') {
    bodyMesh.scale.set(1, 1, 1);
    hideBody();
    const shell = createMat(0xd9c28e, 0.72, 0.16);
    [-1, 1].forEach(side => {
      for (let i = -2; i <= 2; i++) put(box(0.06, 0.05, 0.45), shell, i * 0.105, side > 0 ? 0.19 : -0.04, -0.04,
        [side > 0 ? -0.48 : 0.10, 0, 0]);
    });
  } else if (type === 'marina') {
    bodyMesh.geometry.dispose();
    bodyMesh.geometry = new THREE.SphereGeometry(0.50 * size, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62);
    bodyMesh.geometry.scale(0.90, 0.86, 0.90);
    const jelly = createMat(bodyMat.color, 0.18, 0.08, true, 0.74);
    put(new THREE.TorusGeometry(0.43 * size, 0.035 * size, 6, 20), jelly, 0, -0.07, 0, [Math.PI / 2, 0, 0]);
    bodyMesh.children.filter(child => child.geometry?.type === 'CylinderGeometry').forEach((tentacle, i) => {
      track(tentacle, i % 2 ? 'x' : 'z', 0.18, i * 0.8, 0.85);
    });
  }

  return rig;
}

export function animateMonsterRig(rig, time, moving, attacking = false) {
  if (!rig?.length) return;
  const motion = moving ? 1 : 0.28;
  rig.forEach(part => {
    if (!part.mesh?.rotation) return;
    const attackBoost = attacking ? 1.35 : 1;
    part.mesh.rotation[part.axis] = part.base
      + Math.sin(time * (3.2 * part.speed) + part.phase) * part.amplitude * motion * attackBoost;
  });
}

// Final art-direction pass shared by every monster, including the larger
// hand-built creatures in MonsterManager.  These small, high-contrast forms
// are intentionally readable from the normal isometric camera distance: a
// chest/face colour break, a family emblem and a simple mouth.  It gives the
// roster the illustrated MMORPG feel without outlines or extra texture files
// (both of which are expensive on mobile).
export function addSpeciesArtDetails({ THREE, type, size, bodyMesh, bodyMat, createMat, put }) {
  const parts = [];
  const color = bodyMat?.color || new THREE.Color(0xffffff);
  const light = new THREE.Color(color).offsetHSL(0.015, -0.04, 0.22);
  const dark = new THREE.Color(color).offsetHSL(-0.01, 0.02, -0.27);
  const lightMat = createMat(light, 0.82, 0.01);
  const darkMat = createMat(dark, 0.72, 0.03);
  const inkMat = new THREE.MeshBasicMaterial({ color: 0x251b2b });

  const add = (geometry, material, x, y, z, rotation) => {
    const mesh = put(geometry, material, x, y, z, rotation);
    mesh.userData.monsterPolish = true;
    parts.push(mesh);
    return mesh;
  };
  const sph = (radius, width = 9, height = 7) => new THREE.SphereGeometry(radius * size, width, height);
  const cone = (radius, height, sides = 6) => new THREE.ConeGeometry(radius * size, height * size, sides);
  const furClumps = (material, radius, centerY, centerZ, count = 18) => {
    for (let i = 0; i < count; i++) {
      const a = i / count * Math.PI * 2;
      const strand = add(cone(0.018, 0.14 + (i % 3) * 0.025, 5), material,
        Math.cos(a) * radius, centerY + Math.sin(a) * radius * .72, centerZ,
        [0, 0, -a + Math.PI / 2]);
      strand.userData.furStrand = true;
    }
  };

  // Every branch below is deliberately species-authored. There is no generic
  // family decoration or universal face decal: details describe anatomy and
  // behaviour, not merely rarity.
  if (type === 'poring' || type === 'poporing' || type === 'drops') {
    // Slimes are the only intentionally soft-bodied creatures. Layered lobes,
    // a translucent belly membrane and asymmetric crown keep them from reading
    // as plain spheres.
    const membrane = add(sph(0.31, 14, 9), createMat(light, 0.25, 0.02, true, 0.24), 0, -0.18, 0.08);
    membrane.scale.set(1.28, 0.52, 0.95);
    [-1, 1].forEach(side => {
      const lobe = add(sph(type === 'drops' ? 0.11 : 0.14, 10, 7), bodyMat, side * 0.31, -0.29, -0.02);
      lobe.scale.set(1.25, 0.58, 1.05);
    });
    add(sph(0.038, 7, 5), lightMat, -0.22, 0.25, 0.39);
    add(sph(0.021, 7, 5), lightMat, -0.15, 0.32, 0.405);
  } else if (type === 'lunatic') {
    furClumps(lightMat, .29, -.02, .34, 20);
    const muzzle = add(sph(0.16, 12, 8), lightMat, 0, -0.08, 0.39);
    muzzle.scale.set(1.12, 0.72, 0.62);
    add(sph(0.045, 8, 6), inkMat, 0, -0.04, 0.49);
    [-1, 1].forEach(side => {
      add(cone(0.028, 0.11, 5), createMat(0xf5eee5, 0.9, 0), side * 0.055, -0.17, 0.48, [Math.PI, 0, 0]);
      for (let i = -1; i <= 1; i++) add(new THREE.CylinderGeometry(0.004 * size, 0.004 * size, 0.30 * size, 4), inkMat,
        side * 0.16, -0.08 + i * 0.035, 0.45, [Math.PI / 2, 0, side * (1.18 + i * 0.05)]);
    });
  } else if (type === 'fabre' || type === 'rocker') {
    const chitin = createMat(type === 'rocker' ? 0x6d892d : dark, 0.62, 0.12);
    [-0.18, -0.48, -0.77].forEach((z, i) => {
      const plate = add(new THREE.TorusGeometry((0.29 - i * 0.035) * size, 0.026 * size, 5, 14), chitin, 0, -0.01, z, [Math.PI / 2, 0, 0]);
      plate.scale.y = 0.78;
    });
    [-1, 1].forEach(side => add(cone(0.065, 0.19, 5), darkMat, side * 0.10, -0.11, 0.44, [1.15, 0, side * 0.38]));
  } else if (type === 'willow') {
    // Carved bark face, broken roots and hanging vine strands sell an old tree,
    // rather than a cylinder with eyes.
    [-1, 1].forEach(side => add(cone(0.10, 0.36, 6), darkMat, side * 0.28, -0.39, -0.04, [0, 0, side * -0.72]));
    add(new THREE.TorusGeometry(0.15 * size, 0.027 * size, 5, 12, Math.PI * 1.35), inkMat, 0, -0.16, 0.32, [0, 0, -0.56]);
    [-1, 1].forEach(side => {
      const vine = add(new THREE.CylinderGeometry(0.012 * size, 0.018 * size, 0.50 * size, 5), createMat(0x416f31, 0.95, 0), side * 0.24, 0.18, -0.10, [0, 0, side * 0.18]);
      vine.scale.y = side > 0 ? 0.78 : 1;
    });
  } else if (type === 'spore') {
    // Visible gills and skirt under the cap are the mushroom's defining feature.
    const gillMat = createMat(0xb99a86, 0.96, 0);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      add(new THREE.BoxGeometry(0.025 * size, 0.025 * size, 0.30 * size), gillMat,
        Math.sin(a) * 0.13, 0.27, Math.cos(a) * 0.13, [0, a, 0]);
    }
    add(new THREE.TorusGeometry(0.34 * size, 0.025 * size, 5, 20), darkMat, 0, 0.30, 0, [Math.PI / 2, 0, 0]);
  } else if (type === 'bigfoot') {
    furClumps(lightMat, .35, -.04, .30, 22);
    const muzzle = add(sph(0.19, 12, 8), createMat(0xcba77f, 0.94, 0), 0, -0.09, 0.39);
    muzzle.scale.set(1.15, 0.78, 0.75);
    add(sph(0.065, 8, 6), inkMat, 0, -0.03, 0.52);
    [-1, 1].forEach(side => {
      add(new THREE.BoxGeometry(0.14 * size, 0.035 * size, 0.035 * size), darkMat, side * 0.16, 0.19, 0.42, [0, 0, side * -0.18]);
      for (let i = -1; i <= 1; i++) add(cone(0.025, 0.11, 5), createMat(0xeee0ca, 0.82, 0), side * (0.20 + i * 0.04), -0.52, 0.18, [Math.PI / 2, 0, 0]);
    });
  } else if (type === 'nine_tail') {
    furClumps(lightMat, .31, -.01, .34, 22);
    add(new THREE.OctahedronGeometry(0.075 * size, 0), new THREE.MeshStandardMaterial({ color: 0x78dfff, emissive: 0x2499dd, emissiveIntensity: 0.9 }), 0, 0.26, 0.43, [0, 0, Math.PI / 4]);
    [-1, 1].forEach(side => add(new THREE.BoxGeometry(0.17 * size, 0.025 * size, 0.025 * size), darkMat, side * 0.13, 0.14, 0.43, [0, 0, side * -0.18]));
  } else if (type === 'horn') {
    add(new THREE.BoxGeometry(0.025 * size, 0.025 * size, 0.68 * size), darkMat, 0, 0.08, -0.32, [0, 0, 0]);
    [-1, 1].forEach(side => add(cone(0.09, 0.24, 6), darkMat, side * 0.13, -0.12, 0.43, [1.12, 0, side * 0.40]));
  } else if (type === 'savage') {
    furClumps(darkMat, .34, -.01, .30, 20);
    const snout = add(new THREE.CapsuleGeometry(0.16 * size, 0.18 * size, 4, 8), darkMat, 0, -0.10, 0.42, [Math.PI / 2, 0, 0]);
    snout.scale.set(1.12, 1, 0.78);
    [-1, 1].forEach(side => {
      add(sph(0.026, 6, 5), inkMat, side * 0.07, -0.08, 0.57);
      add(cone(0.055, 0.22, 6), createMat(0xf2dfb6, 0.82, 0), side * 0.15, -0.17, 0.49, [Math.PI, 0, side * -0.26]);
    });
    for (let i = -2; i <= 2; i++) add(cone(0.055, 0.18 + Math.abs(i) * 0.02, 6), darkMat, i * 0.11, 0.28, -0.18, [0.25, 0, i * 0.08]);
  } else if (type === 'boa') {
    [-1, 1].forEach(side => {
      add(new THREE.BoxGeometry(0.15 * size, 0.028 * size, 0.03 * size), darkMat, side * 0.12, 0.17, 0.41, [0, 0, side * -0.22]);
      add(sph(0.018, 6, 5), inkMat, side * 0.10, -0.08, 0.48);
    });
    for (let i = 0; i < 3; i++) add(new THREE.TorusGeometry((0.23 - i * 0.025) * size, 0.018 * size, 4, 12, Math.PI), lightMat, 0, -0.10, 0.15 - i * 0.16, [Math.PI / 2, 0, 0]);
  } else if (type === 'deviruchi') {
    [-1, 1].forEach(side => {
      add(new THREE.BoxGeometry(0.15 * size, 0.028 * size, 0.028 * size), darkMat, side * 0.13, 0.18, 0.42, [0, 0, side * -0.28]);
      add(cone(0.032, 0.12, 5), createMat(0xf2e6dc, 0.75, 0), side * 0.055, -0.16, 0.49, [Math.PI, 0, 0]);
    });
  } else if (type === 'ghostring') {
    add(new THREE.TorusGeometry(0.12 * size, 0.018 * size, 5, 14, Math.PI), inkMat, 0, -0.14, 0.50, [0, 0, 0]);
    [-1, 1].forEach(side => add(cone(0.075, 0.32, 6), createMat(0xcfe8ff, 0.18, 0.08, true, 0.55), side * 0.26, -0.30, -0.02, [0, 0, side * -0.26]));
  } else if (type === 'crab') {
    [-1, 1].forEach(side => {
      add(cone(0.065, 0.20, 6), darkMat, side * 0.34, 0.02, 0.30, [Math.PI / 2, 0, side * -0.35]);
      add(sph(0.045, 7, 5), inkMat, side * 0.16, 0.39, 0.24);
    });
    for (let i = -2; i <= 2; i++) add(new THREE.BoxGeometry(0.035 * size, 0.02 * size, 0.34 * size), lightMat, i * 0.12, 0.18, -0.02, [0, i * 0.08, 0]);
  } else if (type === 'fish') {
    [-1, 0, 1].forEach(i => add(sph(0.035, 7, 5), lightMat, i * 0.13, 0.12 - Math.abs(i) * 0.03, 0.42));
    add(new THREE.TorusGeometry(0.07 * size, 0.014 * size, 4, 10), inkMat, 0, -0.12, 0.50, [0, 0, 0]);
  } else if (type === 'shrimp') {
    [-1, 1].forEach(side => add(new THREE.CylinderGeometry(0.006 * size, 0.012 * size, 0.55 * size, 4), darkMat, side * 0.10, 0.15, 0.36, [Math.PI / 2, 0, side * 0.30]));
  } else if (type === 'clam') {
    const pearl = add(sph(0.10, 10, 8), new THREE.MeshStandardMaterial({ color: 0xcff8ff, emissive: 0x58bccc, emissiveIntensity: 0.38, roughness: 0.16 }), 0, 0.10, 0.11);
    pearl.scale.y = 0.82;
  } else if (type === 'marina') {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      add(sph(0.026 + (i % 3) * 0.007, 6, 5), lightMat, Math.cos(a) * 0.32, 0.12 + (i % 2) * 0.08, Math.sin(a) * 0.32);
    }
  }

  return parts;
}
