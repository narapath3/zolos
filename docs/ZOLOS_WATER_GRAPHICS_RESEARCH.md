# ZOLOS Water and Waterfall Graphics Research

## Question
ประเมินว่าควรใช้ Three.js Water Pro หรือแนวทางอื่นเพื่อทำผิวน้ำและน้ำตกแบบสมจริงอลังการ โดยต้องยังรองรับ Android/iOS

## Official Three.js findings

### Three.js Water
URL: https://threejs.org/docs/pages/Water.html

- Three.js `Water` is documented as a basic flat, reflective water effect.
- The documentation notes that this class is for `WebGLRenderer`; with `WebGPURenderer`, `WaterMesh` is the corresponding direction.
- It is an add-on and must be imported explicitly.
- The class is appropriate as a strong baseline for planar lakes, ponds, and ocean-like surfaces, but it is not by itself a complete physically based water system with shoreline foam, underwater refraction, volumetric depth, or waterfall motion.

### Three.js ocean shader example
URL: https://threejs.org/examples/webgl_shaders_ocean.html

- The official ocean example exposes controls for sky elevation/azimuth/exposure, water distortion scale/size, bloom, and procedural cloud parameters.
- The visual quality comes from combining the water shader with sky lighting and post-processing, not from a single water material alone.
- This is a useful PC/high-quality reference, but the same reflection/distortion/bloom combination should not be enabled at full resolution on every mobile device.

## Recommended visual decomposition for ZOLOS

### Surface water
Use a reflective/distorted planar surface for lakes and larger water bodies. Add animated normal detail, depth-based color, Fresnel response, sky/environment reflection, and selective shoreline foam. Reflection render targets should be reduced in resolution and updated at a throttled rate on mobile.

### Waterfall
Do not use the flat ocean material as the waterfall itself. Build the waterfall from a curved or vertical ribbon/strip with a scrolling flow texture or custom UV shader, layered translucent sheets, white foam at the lip and impact pool, spray particles, mist, and a small impact ripple. This produces the waterfall silhouette and motion at lower cost than simulating a full fluid volume.

### Foam and shoreline
Use a depth/shore mask or hand-authored foam mask around rocks and waterfall contact points. Restrict foam to local zones rather than applying it across the whole river. Use additive/alpha-blended particles sparingly because overdraw is expensive on mobile GPUs.

## Platform tiers

| Tier | Surface | Reflection | Foam/spray | Post-processing | Target |
|---|---|---|---|---|---|
| Ultra-low | scrolling normals + vertex ripple | none or cubemap only | small alpha strip, very few particles | none | low-end Android/iPhone |
| Mobile | animated normals + Fresnel + baked/cubemap environment | half-resolution planar reflection near camera, throttled | shoreline masks, waterfall sheets, pooled particles | limited bloom only | mid-range Android/iOS |
| High | Water/Water2-style reflection/refraction, higher normal detail, caustics | half/full resolution based on GPU budget | layered foam, spray, mist, impact ripples | bloom, color grading, selective SSR/SSR-like effects | high-end phone/tablet/PC |
| Cinematic | high-quality reflection/refraction + custom water shader, dynamic caustics, high particle density | adaptive render target and temporal updates | full layered waterfall and environment effects | full post stack | desktop showcase only |

## Key performance rules

- Never assume Water Pro/high-end shader can be enabled universally on iOS and Android; use a graphics tier selected by renderer capabilities and measured frame time.
- Keep reflection render target below the main viewport resolution on mobile and update it less frequently than the main scene.
- Avoid many transparent overlapping waterfall sheets and large particle systems; use a small number of carefully placed layers.
- Prefer baked/cubemap environment reflection for distant water and reserve planar reflection for hero water near the player.
- Use `devicePixelRatio` caps, shader LOD, particle count LOD, and dynamic quality downgrade when frame time rises.

## References

1. Three.js, “Water” — https://threejs.org/docs/pages/Water.html
2. Three.js, “webgl - shaders - ocean” — https://threejs.org/examples/webgl_shaders_ocean.html
