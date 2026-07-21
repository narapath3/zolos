# Design Spec: Hybrid Spectacular Game Effects (Modern RPG / Anime Style)

## Goal

Overhaul the visual effects for all 12 skills and base attacks in the Zolos game using a Modern RPG / Anime fantasy style. This style features vibrant colors, multi-layered visual groups, and intense light emissions through Additive Blending without requiring external file assets.

## Proposed System Architecture

### 1. In-Memory Canvas Textures

To keep the game lightweight and zero-dependency, the `ParticleSystem` class will procedurally generate glow-based particle textures on start using HTML Canvas:
1. **`glowSpark`**: A soft radial gradient that fades out, creating bright particles, fire embers, or magic sparks.
2. **`magicCircle`**: A geometric pattern with a concentric rings and rune-like lines for magic circles.
3. **`slashBlade`**: A crescent-shaped trail texture for melee sword sweeps.

### 2. Additive Blending Material Helper

Implement a helper in `ParticleSystem.js`:
```javascript
_createGlowMaterial(colorVal, textureType, size = 0.5)
```
Returns a `THREE.PointsMaterial` or `THREE.MeshBasicMaterial` that has:
- `map`: The requested canvas texture
- `blending`: `THREE.AdditiveBlending`
- `transparent`: true
- `depthWrite`: false (crucial to prevent blocky square outlines around overlapping sparks)

### 3. Detailed Overhaul of the 12 Skills

- **Bash**: Radial orange/gold sparks emitting from the contact point, accompanied by 3 crescent-shaped blade trails tilted dynamically in 3D.
- **Magnum Break**: Rotates a large `magicCircle` on the ground. Emits a fire-vortex (a helical tower of red/orange particles spiraling upwards) and shoots 40 high-speed fire sparks horizontally.
- **Endure**: A glowing hexagonal force-field bubble dome around the player that pulses in opacity and slowly rotates.
- **Heal**: Green leaf-shaped particles swirl upward in a helical chimney from the feet, combined with a golden-green expanding light column and a ring ripple on the ground.
- **Holy Light**: An intense vertical pillar of white-yellow light striking from above, releasing glowing yellow feather sparks and radial shockwaves.
- **Blessing**: A rotating 3D golden cross mesh rising from the player's chest, leaving a trail of sparkles.
- **Fire Bolt**: Launches an animated fire comet with a dense trail of flaming orange particles. On impact, creates a firework-like cluster burst.
- **Frost Nova**: Rains a circle of diamond-cut ice geometries that expand horizontally, spin, and spawn cyan splash particles.
- **Energy Coat**: A swirling purple mana shield filled with tiny orbiting magic spheres.
- **Double Strafe**: Shoots two green arrow meshes with trailing lime-green spark trails and lightning sparks on hit.
- **Arrow Shower**: Generates a massive target marker on the ground. Rains dozens of neon-green light arrows vertical from the sky.
- **Concentration**: Swirls concentric particles *inward* toward the player, followed by an intense upward yellow flash.

## Verification Plan

### Manual Verification
- Check all skills in game to make sure three.js executes without errors.
- Inspect the visual beauty of the skills in action.
