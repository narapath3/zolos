// Scene Manager — Three.js Scene, Camera, Renderer, Environment
// Upgraded: Lush world with water, varied trees, sky dome, portals, NPC
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ITEMS } from './GameData.js';

// PVP arena location on the main field (server duel spawns are center ± 3 on x)
const PVP_ARENA_POS = { x: -14, z: 14 };

// ============ Map Configs ============
const MAP_CONFIGS = {
    prontera: {
        name: 'Prontera Field',
        groundColor: 0x3a7a3a,
        groundColor2: 0x2d6d2d,
        pathColor: 0x9a8a6a,
        fogColor: 0x7ab8d8,
        skyTop: new THREE.Color(0x4a90d9),
        skyBottom: new THREE.Color(0xd4e8f7),
        skyHorizon: new THREE.Color(0xfce4b8),
        ambientColor: 0x607090,
        sunColor: 0xffe8c0,
        sunIntensity: 1.4,
        waterColor: 0x3a8abf,
        treeTypes: ['oak', 'cherry', 'willow', 'bush'],
        decorDensity: 1.0,
    },
    payon: {
        name: 'Payon Forest',
        groundColor: 0x5a4a2a,
        groundColor2: 0x4a3a1a,
        pathColor: 0x6a5a3a,
        fogColor: 0x3a4a3a,
        skyTop: new THREE.Color(0x2a4a3a),
        skyBottom: new THREE.Color(0x6a8a6a),
        skyHorizon: new THREE.Color(0xc8a060),
        ambientColor: 0x405030,
        sunColor: 0xffd080,
        sunIntensity: 0.9,
        waterColor: 0x2a5a4a,
        treeTypes: ['autumn', 'dead', 'pine', 'bush'],
        decorDensity: 1.3,
    },
    glast_heim: {
        name: 'Glast Heim',
        // Eerie purple-ruins mood, but lifted so the path reads clearly.
        groundColor: 0x3b3254,
        groundColor2: 0x2b2444,
        pathColor: 0x6d5d88,
        fogColor: 0x2a2148,
        skyTop: new THREE.Color(0x140f28),
        skyBottom: new THREE.Color(0x33204a),
        skyHorizon: new THREE.Color(0x64307a),
        ambientColor: 0x483862,
        sunColor: 0xa585c5,
        sunIntensity: 0.85,
        waterColor: 0x241242,
        treeTypes: ['dead', 'dead', 'dead'],
        decorDensity: 0.6,
    },
    mjolnir: {
        name: 'Mjolnir Mountains',
        groundColor: 0x7a7060,
        groundColor2: 0x5a5248,
        pathColor: 0x8a8070,
        fogColor: 0x8090a0,
        skyTop: new THREE.Color(0x4a6080),
        skyBottom: new THREE.Color(0xc0d0e0),
        skyHorizon: new THREE.Color(0xe8eef5),
        ambientColor: 0x607080,
        sunColor: 0xfff0e0,
        sunIntensity: 1.2,
        waterColor: 0x5080a0,
        treeTypes: ['pine', 'dead', 'pine'],
        decorDensity: 0.5,
    },
    abyss_lake: {
        name: 'Abyss Lake',
        // Kept a deep-blue abyss mood but lifted off pure black so the ground
        // and path are actually visible (players couldn't see where to walk).
        groundColor: 0x24324f,
        groundColor2: 0x18233d,
        pathColor: 0x4a659a,
        fogColor: 0x12233f,
        skyTop: new THREE.Color(0x0a1526),
        skyBottom: new THREE.Color(0x16293f),
        skyHorizon: new THREE.Color(0x1e3c60),
        ambientColor: 0x33486e,
        sunColor: 0x6a90d0,
        sunIntensity: 0.85,
        waterColor: 0x143257,
        treeTypes: ['dead', 'dead'],
        decorDensity: 0.3,
    },
    svarrga: {
        name: 'Svarrga สรวงสวรรค์',
        groundColor: 0xdfe8ff,
        groundColor2: 0xc8d6f5,
        pathColor: 0xf0e0a0,
        fogColor: 0xdcecff,
        skyTop: new THREE.Color(0x6fa8ff),
        skyBottom: new THREE.Color(0xeaf4ff),
        skyHorizon: new THREE.Color(0xfff2c8),
        ambientColor: 0xbcd0f0,
        sunColor: 0xfff4d8,
        sunIntensity: 1.5,
        waterColor: 0x9fd0ff,
        treeTypes: [],
        decorDensity: 1.0,
    }
};

export class SceneManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.currentMap = 'prontera';
        this.envObjects = [];

        // Setup leaf texture cache
        this._leafTextureCache = new Map();

        // Setup procedural ground & roof textures
        this._detailTexture = this._createDetailTexture();
        this._roofTileTexture = this._createRoofTileTexture();

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(MAP_CONFIGS.prontera.fogColor);
        this.scene.fog = new THREE.FogExp2(MAP_CONFIGS.prontera.fogColor, 0.012);

        // Camera (isometric-style)
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 250);
        this.camera.position.set(0, 18, 18);
        this.camera.lookAt(0, 0, 0);

        // Player-controlled camera yaw (right-drag to rotate). 0 = default
        // behind-the-shoulder angle, so nothing changes until the player rotates.
        this.cameraYaw = 0;
        
        // Roblox-style camera zoom (scroll to zoom). 1.0 = default distance.
        // The actual distance is (defaultDist * zoom).
        this.cameraZoom = 1.0;
        this.minZoom = 0.35;  // Max zoom in (closer)
        this.maxZoom = 2.5;   // Max zoom out (further)

        // Detect initial quality level
        const savedQuality = localStorage.getItem('zolos_graphics_quality');
        let initialQuality = savedQuality;
        if (!initialQuality) {
            const ua = navigator.userAgent;
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
            const cores = navigator.hardwareConcurrency || 4;
            const memory = navigator.deviceMemory || 8;
            const isLowEnd = isMobile && (cores <= 2 || memory <= 2);
            const isMidRange = isMobile && cores >= 4 && memory >= 4;
            initialQuality = isLowEnd ? 'ultra-low' : (isMidRange ? 'medium' : 'high');
            localStorage.setItem('zolos_graphics_quality', initialQuality);
        }

        // Renderer
        const useAntialias = (initialQuality !== 'ultra-low' && initialQuality !== 'low');
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: useAntialias,
            powerPreference: 'high-performance', // prefer the discrete/faster GPU
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        let initialPixelRatio = 1.0;
        if (initialQuality === 'ultra-low' || initialQuality === 'low') {
            initialPixelRatio = 0.85;
        } else if (initialQuality === 'medium') {
            initialPixelRatio = 1.0;
        } else {
            initialPixelRatio = Math.max(Math.min(window.devicePixelRatio, 2), 1.0);
        }
        this.renderer.setPixelRatio(initialPixelRatio);

        // Keep shadow map enabled so that Three.js allocates shadow buffers.
        // We will toggle light.castShadow dynamically to turn shadows on/off.
        this.renderer.shadowMap.enabled = true;
        if (initialQuality === 'low') {
            this.renderer.shadowMap.type = THREE.BasicShadowMap;
        } else if (initialQuality === 'medium') {
            this.renderer.shadowMap.type = THREE.PCFShadowMap;
        } else {
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.3;

        // Clock
        this.clock = new THREE.Clock();

        // Animation time
        this.time = 0;
        this.waterMesh = null;
        this.cloudSprites = [];
        this.portalMeshes = [];
        this.oreNodes = [];
        this.npcMesh = null;

        // Lights
        this._setupLights();

        // Build world
        this.loadMap('prontera');

        // Resize handling
        window.addEventListener('resize', () => this._onResize());
    }

    _setupLights() {
        // Hemisphere light (sky/ground color bleed)
        this.hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x3a5a2a, 0.5);
        this.scene.add(this.hemiLight);

        // Ambient
        this.ambientLight = new THREE.AmbientLight(0x607090, 0.4);
        this.scene.add(this.ambientLight);

        // Directional (sun)
        this.sunLight = new THREE.DirectionalLight(0xffe8c0, 1.4);
        this.sunLight.position.set(12, 25, 10);
        const savedQuality = localStorage.getItem('zolos_graphics_quality') || 'high';
        this.sunLight.castShadow = (savedQuality !== 'ultra-low');
        this.sunLight.shadow.mapSize.set(1024, 1024); // Reduced from 2048 for performance
        this.sunLight.shadow.camera.near = 0.5;
        this.sunLight.shadow.camera.far = 80;
        this.sunLight.shadow.camera.left = -25;
        this.sunLight.shadow.camera.right = 25;
        this.sunLight.shadow.camera.top = 25;
        this.sunLight.shadow.camera.bottom = -25;
        this.sunLight.shadow.bias = -0.001;
        this.scene.add(this.sunLight);

        // Warm atmosphere point lights
        const warmLight = new THREE.PointLight(0xff9040, 0.3, 30);
        warmLight.position.set(8, 3, 6);
        this.scene.add(warmLight);

        const coolLight = new THREE.PointLight(0x4080ff, 0.3, 30);
        coolLight.position.set(-8, 4, -8);
        this.scene.add(coolLight);
    }

    // ============ Map Loading ============
    loadMap(mapId) {
        const config = MAP_CONFIGS[mapId];
        if (!config) return;

        // Clear previous environment objects
        this.envObjects.forEach(obj => this.scene.remove(obj));
        this.envObjects = [];
        this.portalMeshes = [];
        this.oreNodes = [];
        this.waterMesh = null;
        this.cloudSprites = [];
        this.npcMesh = null;
        this.npcSellMesh = null;
        this.npcWeaponMesh = null;
        this.npcHeavenMesh = null;
        this.clearVendingStalls();
        this.swayingObjects = [];
        this.birds = [];

        this.cherryTreePositions = [];
        this.sakuraPetals = null;
        this.fishes = [];

        // World boss lives only on the field it spawned in; drop it on map change
        // (the client's boss manager re-spawns the mesh if we return mid-fight).
        this.removeWorldBoss();

        this.currentMap = mapId;

        // Update scene colors
        this.scene.background = new THREE.Color(config.fogColor);
        this.scene.fog.color.set(config.fogColor);
        this.ambientLight.color.set(config.ambientColor);
        this.sunLight.color.set(config.sunColor);
        this.sunLight.intensity = config.sunIntensity;
        this.hemiLight.color.set(config.skyTop);
        this.hemiLight.groundColor.set(config.groundColor);

        // Build world
        this._createSkyDome(config);
        this._createGround(config);
        this._createWater(config);

        // Map-specific environment
        if (mapId === 'glast_heim') {
            this._createGlastHeimEnvironment(config);
        } else if (mapId === 'mjolnir') {
            this._createMjolnirEnvironment(config);
        } else if (mapId === 'abyss_lake') {
            this._createAbyssLakeEnvironment(config);
        } else if (mapId === 'svarrga') {
            this._createSvarrgaEnvironment(config);
        } else {
            this._createEnvironment(config);
        }

        // Ambient life: sakura petals from cherry trees, fish in the river
        this._createSakuraPetals();
        this._createFish(config);

        // PVP arena on the main field
        this.arenaAnimParts = null;
        this.arenaBoard = null;
        this._arenaGroup = null;
        if (mapId === 'prontera') {
            this._createGrassDecor(config);
            this._createPvpArena();
            this._createArenaLeaderboard();
        }

        this._createPortals(mapId);
        this._createBirds();
        this._createBirdFlock();
        this.weather = null;
        if (mapId === 'prontera') this._initWeather();
        else if (this._weatherEl) this._weatherEl.style.display = 'none';

        if (mapId === 'prontera') {
            this._createNPC();
            this._createSellNPC();
            this._createWeaponSmithNPC();
        }

        // Perf: point lights must never cast shadows — each would trigger a
        // 6-face cubemap re-render of the whole scene every frame. Only the
        // sun (directional) casts shadows.
        this.scene.traverse(o => { if (o.isPointLight && o.castShadow) o.castShadow = false; });

        // Perf: batch static environment meshes into far fewer draw calls
        this._mergeStaticEnvironment();

        // Update UI
        if (window.gameUI) {
            window.gameUI.setMapName(this.getCurrentMapName(), mapId);
        }
    }

    // ============ Static Draw-Call Batching ============
    // Merges non-animated environment meshes that share a material into single
    // meshes (one draw call each). Pixel-identical: same triangles in world
    // space, same material. Anything animated or pickable is excluded, and any
    // group that fails to merge is left untouched (safe fallback).
    _mergeStaticEnvironment() {
        try {
            this.scene.updateMatrixWorld(true);

            // Build the exclusion set (animated / pickable / instanced roots)
            const exclude = new Set();
            const addTree = (o) => { if (o) o.traverse(c => exclude.add(c)); };
            (this.swayingObjects || []).forEach(addTree);  // trees sway
            (this.portalMeshes || []).forEach(addTree);    // portals pulse + pickable
            (this.fishes || []).forEach(addTree);          // fish swim
            (this.birds || []).forEach(addTree);           // circling birds
            addTree(this.birdFlock && this.birdFlock.group); // passing flock
            addTree(this.waterMesh);                       // water texture scrolls
            addTree(this._arenaGroup);                     // arena has flames/banners
            if (this.arenaBoard) addTree(this.arenaBoard.group);
            addTree(this.npcMesh);
            addTree(this.npcSellMesh);

            // Visual signature so only pixel-equivalent materials merge together
            const matKey = (m) => [
                m.type, m.color?.getHexString?.(), m.emissive?.getHexString?.(),
                m.emissiveIntensity, m.map?.uuid || 0, !!m.transparent, m.opacity,
                m.side, !!m.vertexColors, !!m.flatShading, m.roughness, m.metalness,
            ].join('|');

            // Bucket clones of every mergeable leaf mesh by material signature
            const buckets = new Map();
            for (const root of this.envObjects) {
                if (exclude.has(root)) continue;
                root.traverse((o) => {
                    if (exclude.has(o)) return;
                    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh) return;
                    if (o.isPoints || o.isLine || o.isSprite) return;
                    if (!o.geometry || !o.geometry.isBufferGeometry) return;
                    if (Array.isArray(o.material)) return;
                    if (o.material.transparent) return; // avoid transparency sort issues

                    const key = matKey(o.material) + '|' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0);
                    if (!buckets.has(key)) {
                        buckets.set(key, { material: o.material, cast: o.castShadow, receive: o.receiveShadow, geos: [], sources: [] });
                    }
                    const b = buckets.get(key);
                    const g = o.geometry.clone();
                    g.applyMatrix4(o.matrixWorld);              // bake world transform
                    // Keep only the attributes needed to merge cleanly
                    for (const name of Object.keys(g.attributes)) {
                        if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
                    }
                    b.geos.push(g);
                    b.sources.push(o);
                });
            }

            let mergedMeshes = 0, savedCalls = 0;
            for (const b of buckets.values()) {
                if (b.geos.length < 2) continue; // no benefit merging a single mesh
                // Ensure consistent attribute sets across the group
                const attrsFirst = Object.keys(b.geos[0].attributes).sort().join(',');
                if (!b.geos.every(g => Object.keys(g.attributes).sort().join(',') === attrsFirst)) continue;

                let merged;
                try { merged = mergeGeometries(b.geos, false); } catch { merged = null; }
                if (!merged) continue; // merge failed → leave originals untouched (safe)

                const mesh = new THREE.Mesh(merged, b.material);
                mesh.castShadow = b.cast;
                mesh.receiveShadow = b.receive;
                mesh.matrixAutoUpdate = false; // fully static
                this.scene.add(mesh);
                this.envObjects.push(mesh);

                // Remove the now-merged originals from the scene
                for (const src of b.sources) {
                    if (src.parent) src.parent.remove(src);
                    if (src.geometry) src.geometry.dispose();
                }
                mergedMeshes++;
                savedCalls += b.sources.length - 1;
            }
            if (mergedMeshes > 0) {
                console.log(`[Zolos] 🧩 Static merge: -${savedCalls} draw calls (${mergedMeshes} batches)`);
            }
        } catch (e) {
            console.warn('[Zolos] static merge skipped:', e.message);
        }
    }

    getCurrentMapName() {
        return MAP_CONFIGS[this.currentMap]?.name || 'Unknown';
    }

    getPortals() {
        return this.portalMeshes;
    }

    getOreNodes() {
        return this.oreNodes || [];
    }

    getNPC() {
        return this.npcMesh;
    }

    getNPCs() {
        const list = [];
        if (this.npcMesh) list.push(this.npcMesh);
        if (this.npcSellMesh) list.push(this.npcSellMesh);
        if (this.npcWeaponMesh) list.push(this.npcWeaponMesh);
        if (this.npcHeavenMesh) list.push(this.npcHeavenMesh);
        return list;
    }

    // ============ Sky Dome ============
    _createSkyDome(config) {
        const skyGeo = new THREE.SphereGeometry(100, 32, 20);
        const skyMat = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            uniforms: {
                topColor: { value: config.skyTop },
                bottomColor: { value: config.skyBottom },
                horizonColor: { value: config.skyHorizon },
                offset: { value: 10 },
                exponent: { value: 0.5 }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPos = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPos.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                uniform vec3 horizonColor;
                uniform float offset;
                uniform float exponent;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
                    float t = max(pow(max(h, 0.0), exponent), 0.0);
                    vec3 sky = mix(horizonColor, topColor, t);
                    float belowH = max(-h * 2.0, 0.0);
                    sky = mix(sky, bottomColor, belowH);
                    gl_FragColor = vec4(sky, 1.0);
                }
            `
        });
        const sky = new THREE.Mesh(skyGeo, skyMat);
        this.scene.add(sky);
        this.envObjects.push(sky);
        this.skyMat = skyMat; // weather system modulates sky uniforms

        // Stylized Sun & Corona Glow
        const sunDir = new THREE.Vector3(12, 25, 10).normalize();
        const sunPos = sunDir.clone().multiplyScalar(75); // Inner dome limit

        // Sun core sphere
        const sunGeo = new THREE.SphereGeometry(5.2, 16, 16);
        const sunMat = new THREE.MeshBasicMaterial({ color: 0xffefb8 });
        const sunMesh = new THREE.Mesh(sunGeo, sunMat);
        sunMesh.position.copy(sunPos);
        this.scene.add(sunMesh);
        this.envObjects.push(sunMesh);
        this.sunMesh = sunMesh;

        // Custom Halo Ring / Corona (billboard look-at)
        const coronaGeo = new THREE.RingGeometry(5.6, 9.2, 32);
        const coronaMat = new THREE.MeshBasicMaterial({
            color: 0xffaa33,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.45,
            depthWrite: false
        });
        const corona = new THREE.Mesh(coronaGeo, coronaMat);
        corona.position.copy(sunPos);
        corona.lookAt(0, 0, 0);
        this.scene.add(corona);
        this.envObjects.push(corona);
        this.sunCorona = corona;

        // Volumetric Sunbeams
        this._createSunbeams();

        // Clouds
        this._createClouds();
    }

    _createSunbeams() {
        const rayGeo = new THREE.CylinderGeometry(0.05, 3.2, 45, 8, 1, true);
        const rayMat = new THREE.MeshBasicMaterial({
            color: 0xffedd0,
            transparent: true,
            opacity: 0.08,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        // Scatter group
        const alignGroup = new THREE.Group();
        alignGroup.name = "sunbeams";
        const sunDir = new THREE.Vector3(-12, -25, -10).normalize();

        for (let i = 0; i < 2; i++) { // Reduced from 4 for performance
            const beam = new THREE.Mesh(rayGeo.clone(), rayMat.clone());
            const offset = new THREE.Vector3(
                (Math.random() - 0.5) * 20,
                0,
                (Math.random() - 0.5) * 20
            );

            const pivot = new THREE.Group();
            pivot.position.set(offset.x, 18, offset.z);

            // Align cylinder to sun direction
            const up = new THREE.Vector3(0, 1, 0);
            const quaternion = new THREE.Quaternion().setFromUnitVectors(up, sunDir);
            pivot.quaternion.copy(quaternion);

            // Offset beam center along local -Y direction
            beam.position.set(0, -12, 0);
            pivot.add(beam);
            alignGroup.add(pivot);
        }

        this.scene.add(alignGroup);
        this.envObjects.push(alignGroup);
        this.sunbeamGroup = alignGroup;
    }

    _createBirds() {
        this.birds = [];
        const birdCount = 4; // Reduced from 6 for performance

        const bodyGeo = new THREE.BoxGeometry(0.16, 0.08, 0.38);
        const bodyMat = new THREE.MeshBasicMaterial({ color: 0xffffff }); // pure white stylized look
        const wingGeo = new THREE.PlaneGeometry(0.38, 0.16);
        const wingMat = new THREE.MeshBasicMaterial({ color: 0xeeeeee, side: THREE.DoubleSide });

        for (let i = 0; i < birdCount; i++) {
            const bird = new THREE.Group();

            // Body
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            bird.add(body);

            // Left Wing + joint
            const leftWingPivot = new THREE.Group();
            leftWingPivot.position.set(-0.08, 0, 0);
            const leftWingMesh = new THREE.Mesh(wingGeo, wingMat);
            leftWingMesh.position.set(-0.19, 0, 0);
            leftWingPivot.add(leftWingMesh);
            bird.add(leftWingPivot);

            // Right Wing + joint
            const rightWingPivot = new THREE.Group();
            rightWingPivot.position.set(0.08, 0, 0);
            const rightWingMesh = new THREE.Mesh(wingGeo, wingMat);
            rightWingMesh.position.set(0.19, 0, 0);
            rightWingPivot.add(rightWingMesh);
            bird.add(rightWingPivot);

            const angle = Math.random() * Math.PI * 2;
            const radius = 18 + Math.random() * 8;
            const height = 12 + Math.random() * 4;
            const speed = 0.5 + Math.random() * 0.4;
            const flapSpeed = 12 + Math.random() * 6;

            bird.position.set(
                Math.cos(angle) * radius,
                height,
                Math.sin(angle) * radius
            );

            bird.userData = {
                angle,
                radius,
                height,
                speed,
                flapSpeed,
                flapOffset: Math.random() * Math.PI * 2,
                leftWing: leftWingPivot,
                rightWing: rightWingPivot
            };

            this.scene.add(bird);
            this.envObjects.push(bird);
            this.birds.push(bird);
        }
    }

    // ============ Weather & Seasons ============
    // Cycles through atmospheric presets (sunny / spring / cloudy / rain),
    // smoothly lerping fog, sky and light, and toggling rain / blossom
    // particle systems. Auto-advances on a timer; setWeather() forces one.
    _initWeather() {
        // --- Rain: short falling streaks in a box that follows the player ---
        const RAIN = 550;
        const rainPositions = new Float32Array(RAIN * 6); // 2 verts (streak) per drop
        const rainData = [];
        for (let i = 0; i < RAIN; i++) {
            const d = {
                x: (Math.random() - 0.5) * 44,
                y: Math.random() * 26,
                z: (Math.random() - 0.5) * 44,
                speed: 22 + Math.random() * 14,
                len: 0.5 + Math.random() * 0.5,
            };
            rainData.push(d);
        }
        const rainGeo = new THREE.BufferGeometry();
        rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
        const rainMat = new THREE.LineBasicMaterial({ color: 0xaac4e0, transparent: true, opacity: 0.5 });
        const rain = new THREE.LineSegments(rainGeo, rainMat);
        rain.frustumCulled = false;
        rain.visible = false;
        this.scene.add(rain);
        this.envObjects.push(rain);
        this._rain = { mesh: rain, data: rainData, positions: rainPositions };

        // --- Spring blossoms: pink/white petals drifting map-wide ---
        const BLOSSOM = 160;
        const bPos = new Float32Array(BLOSSOM * 3);
        const bData = [];
        for (let i = 0; i < BLOSSOM; i++) {
            const d = { x: (Math.random() - 0.5) * 60, y: Math.random() * 16, z: (Math.random() - 0.5) * 60,
                        fall: 0.5 + Math.random() * 0.6, sway: 0.4 + Math.random() * 0.5, phase: Math.random() * Math.PI * 2 };
            bData.push(d);
            bPos[i * 3] = d.x; bPos[i * 3 + 1] = d.y; bPos[i * 3 + 2] = d.z;
        }
        const bGeo = new THREE.BufferGeometry();
        bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
        const blossom = new THREE.Points(bGeo, new THREE.PointsMaterial({ color: 0xffc8dd, size: 0.22, transparent: true, opacity: 0.9, depthWrite: false }));
        blossom.frustumCulled = false;
        blossom.visible = false;
        this.scene.add(blossom);
        this.envObjects.push(blossom);
        this._blossom = { mesh: blossom, data: bData, positions: bPos };

        // Preset atmospheres. Colors are hex; lights are intensities.
        this._weatherPresets = {
            sunny:  { emoji: '☀️', label: 'แดดออก',   fog: 0.010, fogCol: 0x8fc7e8, sunCol: 0xffe8c0, sun: 1.5, amb: 0.40, skyTop: 0x3a7bd5, skyHor: 0xbfe3f5, rain: false, blossom: false, sunVis: true },
            spring: { emoji: '🌸', label: 'ใบไม้ผลิ',  fog: 0.010, fogCol: 0xbfe6c8, sunCol: 0xfff0d0, sun: 1.4, amb: 0.45, skyTop: 0x67b7e8, skyHor: 0xf2dcea, rain: false, blossom: true,  sunVis: true },
            cloudy: { emoji: '☁️', label: 'เมฆมาก',    fog: 0.018, fogCol: 0x9aa6b0, sunCol: 0xd8dce0, sun: 0.7, amb: 0.55, skyTop: 0x8b98a6, skyHor: 0xc2cad0, rain: false, blossom: false, sunVis: false },
            rain:   { emoji: '🌧️', label: 'ฝนตก',      fog: 0.030, fogCol: 0x5c6670, sunCol: 0xaeb6c0, sun: 0.5, amb: 0.55, skyTop: 0x4a535c, skyHor: 0x707a84, rain: true,  blossom: false, sunVis: false },
        };
        this._weatherOrder = ['sunny', 'spring', 'cloudy', 'rain'];
        // Each preset lasts this long; the whole cycle repeats. Weather is
        // derived from the shared wall clock so EVERY player sees the same
        // weather at the same time (no server/network needed — clocks are
        // NTP-synced). Full cycle here = 4 × 90s = 6 minutes.
        this._weatherPhaseMs = 90000;

        // Seed to whatever the shared schedule says right now
        const startType = this._scheduledWeather();
        const p0 = this._weatherPresets[startType];
        this._weatherCur = { fog: p0.fog, fogCol: new THREE.Color(p0.fogCol), sunCol: new THREE.Color(p0.sunCol), sun: p0.sun, amb: p0.amb, skyTop: new THREE.Color(p0.skyTop), skyHor: new THREE.Color(p0.skyHor) };
        this.weather = { type: startType };
        this._ensureWeatherIndicator();
        this.setWeather(startType, true);
    }

    // The weather everyone should currently be in, from the shared clock.
    _scheduledWeather() {
        const order = this._weatherOrder;
        const idx = Math.floor(Date.now() / this._weatherPhaseMs) % order.length;
        return order[idx];
    }

    _ensureWeatherIndicator() {
        if (document.getElementById('weather-indicator')) {
            this._weatherEl = document.getElementById('weather-indicator');
            return;
        }
        const el = document.createElement('div');
        el.id = 'weather-indicator';
        // Compact badge that sits just under the Lv. line in the player HUD.
        el.style.cssText = 'display:inline-block;margin-top:5px;align-self:flex-start;' +
            'background:rgba(20,18,32,.55);color:#fff;border:1px solid rgba(255,255,255,.18);' +
            'border-radius:14px;padding:3px 10px;font-family:Itim,Inter,sans-serif;font-size:12px;' +
            'pointer-events:none;white-space:nowrap';
        // Prefer to place it inside the player info block, right under the level
        const info = document.querySelector('.player-info');
        const level = info ? info.querySelector('.player-level') : null;
        if (info && level) {
            level.insertAdjacentElement('afterend', el);
        } else if (info) {
            info.appendChild(el);
        } else {
            // Fallback: fixed top-left if the HUD isn't present
            el.style.cssText += ';position:fixed;top:56px;left:12px;z-index:500';
            document.body.appendChild(el);
        }
        this._weatherEl = el;
    }

    _weatherTargetColors() {
        const p = this._weatherTarget;
        if (!this._wtc) this._wtc = { fogCol: new THREE.Color(), sunCol: new THREE.Color(), skyTop: new THREE.Color(), skyHor: new THREE.Color() };
        this._wtc.fogCol.set(p.fogCol); this._wtc.sunCol.set(p.sunCol);
        this._wtc.skyTop.set(p.skyTop); this._wtc.skyHor.set(p.skyHor);
        return this._wtc;
    }

    setWeather(type, instant = false) {
        if (!this._weatherPresets || !this._weatherPresets[type]) return;
        this.weather.type = type;
        const p = this._weatherPresets[type];
        this._weatherTarget = p;
        this._weatherTargetColors(); // cache target colors (no per-frame alloc)
        if (this._weatherEl) this._weatherEl.style.display = 'block';
        if (this._rain) this._rain.mesh.visible = p.rain;
        if (this._blossom) this._blossom.mesh.visible = p.blossom;
        if (this.sunMesh) this.sunMesh.visible = p.sunVis;
        if (this._weatherEl) this._weatherEl.textContent = `${p.emoji} ${p.label}`;
        if (instant && this._weatherCur) {
            const c = this._weatherCur;
            c.fog = p.fog; c.sun = p.sun; c.amb = p.amb;
            c.fogCol.set(p.fogCol); c.sunCol.set(p.sunCol); c.skyTop.set(p.skyTop); c.skyHor.set(p.skyHor);
            this._applyWeather();
        }
    }

    _applyWeather() {
        const c = this._weatherCur;
        if (this.scene.fog) { this.scene.fog.density = c.fog; this.scene.fog.color.copy(c.fogCol); }
        this.scene.background = c.fogCol;
        if (this.sunLight) { this.sunLight.intensity = c.sun; this.sunLight.color.copy(c.sunCol); }
        if (this.ambientLight) this.ambientLight.intensity = c.amb;
        if (this.skyMat) {
            this.skyMat.uniforms.topColor.value.copy(c.skyTop);
            this.skyMat.uniforms.horizonColor.value.copy(c.skyHor);
        }
    }

    _updateWeather(dt) {
        if (!this.weather || !this._weatherTarget) return;

        // Follow the shared schedule so all players stay in sync
        const sched = this._scheduledWeather();
        if (sched !== this.weather.type) this.setWeather(sched, false);

        // Smoothly lerp current atmosphere toward the target (~ a few seconds)
        const t = this._weatherTarget, c = this._weatherCur, tc = this._wtc, k = Math.min(1, dt * 0.5);
        c.fog += (t.fog - c.fog) * k;
        c.sun += (t.sun - c.sun) * k;
        c.amb += (t.amb - c.amb) * k;
        c.fogCol.lerp(tc.fogCol, k);
        c.sunCol.lerp(tc.sunCol, k);
        c.skyTop.lerp(tc.skyTop, k);
        c.skyHor.lerp(tc.skyHor, k);
        this._applyWeather();

        // Rain animation (streaks fall; box follows the player)
        if (this._rain && this._rain.mesh.visible) {
            const fx = this._weatherFocus ? this._weatherFocus.x : 0;
            const fz = this._weatherFocus ? this._weatherFocus.z : 0;
            const pos = this._rain.positions;
            const data = this._rain.data;
            for (let i = 0; i < data.length; i++) {
                const d = data[i];
                d.y -= d.speed * dt;
                if (d.y < 0) { d.y = 24 + Math.random() * 4; d.x = (Math.random() - 0.5) * 44; d.z = (Math.random() - 0.5) * 44; }
                const wx = fx + d.x, wz = fz + d.z;
                const j = i * 6;
                pos[j] = wx;         pos[j + 1] = d.y;          pos[j + 2] = wz;
                pos[j + 3] = wx;     pos[j + 4] = d.y - d.len;  pos[j + 5] = wz;
            }
            this._rain.mesh.geometry.attributes.position.needsUpdate = true;
        }

        // Blossom drift (spring)
        if (this._blossom && this._blossom.mesh.visible) {
            const fx = this._weatherFocus ? this._weatherFocus.x : 0;
            const fz = this._weatherFocus ? this._weatherFocus.z : 0;
            const pos = this._blossom.positions;
            const data = this._blossom.data;
            for (let i = 0; i < data.length; i++) {
                const d = data[i];
                d.y -= d.fall * dt;
                if (d.y < 0) { d.y = 15 + Math.random() * 3; d.x = (Math.random() - 0.5) * 60; d.z = (Math.random() - 0.5) * 60; }
                pos[i * 3] = fx + d.x + Math.sin(this.time * d.sway + d.phase) * 0.8;
                pos[i * 3 + 1] = d.y;
                pos[i * 3 + 2] = fz + d.z + Math.cos(this.time * d.sway * 0.7 + d.phase) * 0.6;
            }
            this._blossom.mesh.geometry.attributes.position.needsUpdate = true;
        }
    }

    // A loose V-formation flock that flies straight across the sky, then
    // respawns from a random edge after a short delay — reads as "birds
    // passing by" (distinct from the high circling birds above).
    _createBirdFlock() {
        const group = new THREE.Group();
        const birds = [];
        const bodyGeo = new THREE.BoxGeometry(0.16, 0.08, 0.4);
        const bodyMat = new THREE.MeshBasicMaterial({ color: 0x33323a });
        const wingGeo = new THREE.PlaneGeometry(0.5, 0.18);
        const wingMat = new THREE.MeshBasicMaterial({ color: 0x44424c, side: THREE.DoubleSide });

        const COUNT = 6;
        for (let i = 0; i < COUNT; i++) {
            const bird = new THREE.Group();
            bird.add(new THREE.Mesh(bodyGeo, bodyMat));
            const lp = new THREE.Group(); lp.position.set(-0.08, 0, 0);
            const lm = new THREE.Mesh(wingGeo, wingMat); lm.position.set(-0.25, 0, 0); lp.add(lm); bird.add(lp);
            const rp = new THREE.Group(); rp.position.set(0.08, 0, 0);
            const rm = new THREE.Mesh(wingGeo, wingMat); rm.position.set(0.25, 0, 0); rp.add(rm); bird.add(rp);

            // V-formation offset (leader at front, others fan out behind)
            const side = (i % 2 === 0 ? 1 : -1);
            const rank = Math.ceil(i / 2);
            bird.position.set(side * rank * 1.1, (Math.random() - 0.5) * 0.4, -rank * 1.2);
            bird.userData = { leftWing: lp, rightWing: rp, flapOffset: Math.random() * Math.PI * 2, flapSpeed: 9 + Math.random() * 3 };
            group.add(bird);
            birds.push(bird);
        }

        this.scene.add(group);
        this.envObjects.push(group);
        this.birdFlock = { group, birds, timer: 2 + Math.random() * 6, flying: false };
        this._respawnFlock();
    }

    _respawnFlock() {
        const f = this.birdFlock;
        if (!f) return;
        // Start just off one edge, fly to the opposite side across the map
        const fromLeft = Math.random() < 0.5;
        const startX = fromLeft ? -48 : 48;
        const z = -30 + Math.random() * 60;
        const height = 15 + Math.random() * 8;
        f.group.position.set(startX, height, z);
        // Heading roughly across X with a slight Z drift
        const dirX = fromLeft ? 1 : -1;
        const drift = (Math.random() - 0.5) * 0.35;
        f.dir = new THREE.Vector3(dirX, 0, drift).normalize();
        f.group.rotation.y = Math.atan2(f.dir.x, f.dir.z);
        f.speed = 6 + Math.random() * 4;
        f.flying = true;
    }

    _updateBirdFlock(dt) {
        const f = this.birdFlock;
        if (!f) return;
        if (!f.flying) {
            f.timer -= dt;
            if (f.timer <= 0) this._respawnFlock();
            return;
        }
        f.group.position.addScaledVector(f.dir, f.speed * dt);
        f.group.position.y += Math.sin(this.time * 0.6) * dt * 0.4; // gentle bob
        // Flap wings
        for (const b of f.birds) {
            const u = b.userData;
            const flap = Math.sin(this.time * u.flapSpeed + u.flapOffset) * 0.85;
            u.leftWing.rotation.z = -flap;
            u.rightWing.rotation.z = flap;
        }
        // Off the far edge? park it and schedule the next fly-by
        if (Math.abs(f.group.position.x) > 52) {
            f.flying = false;
            f.timer = 5 + Math.random() * 12;
        }
    }

    _createClouds() {
        const cloudMat = new THREE.MeshLambertMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.82,
            flatShading: true,
        });

        for (let i = 0; i < 8; i++) { // Reduced from 14 for performance
            const cloudGroup = new THREE.Group();

            // Build fluffy overlapping box modules (voxel style!)
            const centerGeo = new THREE.BoxGeometry(4.5, 1.8, 3.2);
            const centerMesh = new THREE.Mesh(centerGeo, cloudMat);
            cloudGroup.add(centerMesh);

            const sideGeo1 = new THREE.BoxGeometry(2.8, 1.3, 2.4);
            const sideMesh1 = new THREE.Mesh(sideGeo1, cloudMat);
            sideMesh1.position.set(-2.2, -0.2, 0.4);
            cloudGroup.add(sideMesh1);

            const sideMesh2 = new THREE.Mesh(sideGeo1, cloudMat);
            sideMesh2.position.set(2.2, -0.2, -0.4);
            cloudGroup.add(sideMesh2);

            const topGeo = new THREE.BoxGeometry(2.4, 1.0, 2.0);
            const topMesh = new THREE.Mesh(topGeo, cloudMat);
            topMesh.position.set(-0.2, 0.9, -0.2);
            cloudGroup.add(topMesh);

            const frontGeo = new THREE.BoxGeometry(1.8, 0.9, 1.4);
            const frontMesh = new THREE.Mesh(frontGeo, cloudMat);
            frontMesh.position.set(0.6, -0.4, 1.5);
            cloudGroup.add(frontMesh);

            // Orbit path settings
            const angle = Math.random() * Math.PI * 2;
            const radius = 45 + Math.random() * 25;
            const height = 24 + Math.random() * 16;

            cloudGroup.position.set(
                Math.cos(angle) * radius,
                height,
                Math.sin(angle) * radius
            );

            // Rotation so they point naturally along orbit direction
            cloudGroup.rotation.y = -angle + Math.PI / 2;

            cloudGroup.scale.setScalar(0.7 + Math.random() * 0.9);

            cloudGroup.userData = {
                speed: 0.015 + Math.random() * 0.02,
                angle: angle,
                radius: radius,
                height: height
            };

            this.scene.add(cloudGroup);
            this.envObjects.push(cloudGroup);
            this.cloudSprites.push(cloudGroup);
        }
    }

    // ============ Ground ============
    _createGround(config) {
        // Main textured ground with vertex colors
        const size = 70;
        const segments = 60;
        const groundGeo = new THREE.PlaneGeometry(size, size, segments, segments);

        // Add vertex colors for terrain variation
        const colors = [];
        const positions = groundGeo.attributes.position;
        const baseColor = new THREE.Color(config.groundColor);
        const altColor = new THREE.Color(config.groundColor2);
        const pathColor = new THREE.Color(config.pathColor);

        // Lush grass palette derived from the map colors (fresh highlight +
        // deep shade + a warm dry patch) so the field reads rich, not flat.
        const gLight = baseColor.clone().lerp(new THREE.Color(0xffffff), 0.30);
        const gDeep = altColor.clone().multiplyScalar(0.78);
        const gWarm = baseColor.clone().lerp(new THREE.Color(0xb8a24a), 0.35);

        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const z = -positions.getY(i); // Y in plane space = -Z in world after -90deg X rotation

            // Winding river logic: z = sin(x * 0.08) * 10 - 2
            const riverZ = Math.sin(x * 0.08) * 10 - 2;
            const distToRiver = Math.abs(z - riverZ);

            // Base noise height
            let height = Math.sin(x * 0.3) * Math.cos(z * 0.3) * 0.15;

            // Carve riverbed and build river banks
            if (distToRiver < 7.0) {
                // Smooth valley drop down to -1.3
                const t = distToRiver / 7.0; // 0 (center) to 1 (bank)
                height = -1.3 * (1.0 - t * t);
            } else if (distToRiver < 10.0) {
                // Raised bank ridge sloping down to ground
                const t = (distToRiver - 7.0) / 3.0; // 0 to 1
                const bankSwell = 0.35 * Math.sin(t * Math.PI);
                height += bankSwell;
            }

            positions.setZ(i, height);

            // Vertex coloring based on coordinates
            let color = baseColor.clone();
            const distFromCenter = Math.sqrt(x * x + z * z);

            if (distToRiver < 5.5) {
                // Muddy dark riverbed
                const t = distToRiver / 3.2;
                const mudColor = new THREE.Color(0x3a2e24);
                const sandColor = new THREE.Color(0x8a7258);
                color = mudColor.lerp(sandColor, t);
            } else if (distToRiver < 5.2) {
                // Sandy wet shore blending into grass
                const t = (distToRiver - 3.2) / 2.0;
                const sandColor = new THREE.Color(0x8a7258);
                const grassColor = baseColor.clone().lerp(altColor, 0.4);
                color = sandColor.lerp(grassColor, t);
            } else if (x < -6 && z < -6) {
                // Cave Zone: Dark charcoal gray
                color = new THREE.Color(0x282828).lerp(new THREE.Color(0x1a1a1a), (Math.sin(x) * Math.cos(z) * 0.5 + 0.5));
            } else if (x > 6 && z > 6) {
                // Mountain Zone: Stony rocky brown-gray
                color = new THREE.Color(0x6e655b).lerp(new THREE.Color(0x4f4941), (Math.sin(x) * Math.cos(z) * 0.5 + 0.5));
            } else {
                // Standard paths and fields color blending
                if (Math.abs(x) < 2.0 || Math.abs(z) < 2.0) {
                    // Path crosses
                    color.lerp(pathColor, 0.7 - distFromCenter * 0.01);
                } else {
                    // Lush multi-tone grass: two noise octaves blend deep→base,
                    // fresh-green highlights on the peaks, occasional warm patch.
                    const n1 = Math.sin(x * 0.5 + 1.3) * Math.cos(z * 0.7 + 0.8);   // broad
                    const n2 = Math.sin(x * 1.7 - 0.4) * Math.cos(z * 1.3 + 2.1);   // fine
                    color = gDeep.clone().lerp(baseColor, n1 * 0.5 + 0.5);
                    if (n2 > 0.5) color.lerp(gLight, (n2 - 0.5) * 1.3);
                    const patch = Math.sin(x * 0.13 + 4) * Math.cos(z * 0.11 - 2);
                    if (patch > 0.72) color.lerp(gWarm, (patch - 0.72) * 2.2);
                }
            }

            // Vignette shading on outer edges (lighter than before = more vibrant)
            const edgeFade = Math.max(0, 1 - distFromCenter / (size * 0.4));
            color.multiplyScalar(0.74 + edgeFade * 0.42);

            colors.push(color.r, color.g, color.b);
        }

        groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        groundGeo.computeVertexNormals();

        const groundMat = new THREE.MeshLambertMaterial({
            vertexColors: true,
            map: this._detailTexture
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        this.groundMesh = ground;
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);
        this.envObjects.push(ground);

        // Path overlays (cut or split to not float over the river)
        const pathMat = new THREE.MeshLambertMaterial({
            color: config.pathColor,
            transparent: true,
            opacity: 0.6
        });

        // Vertical Path Segment 1 (North)
        const pathGeoNorth = new THREE.PlaneGeometry(2.8, 20);
        const pathNorth = new THREE.Mesh(pathGeoNorth, pathMat);
        pathNorth.rotation.x = -Math.PI / 2;
        pathNorth.position.set(0, 0.02, 16);
        this.scene.add(pathNorth);
        this.envObjects.push(pathNorth);

        // Vertical Path Segment 2 (South)
        const pathGeoSouth = new THREE.PlaneGeometry(2.8, 20);
        const pathSouth = new THREE.Mesh(pathGeoSouth, pathMat);
        pathSouth.rotation.x = -Math.PI / 2;
        pathSouth.position.set(0, 0.02, -20);
        this.scene.add(pathSouth);
        this.envObjects.push(pathSouth);

        // Horizontal Path segment that spans east/west (above river curves)
        const pathGeoEastWest = new THREE.PlaneGeometry(2.8, 64);
        const pathEastWest = new THREE.Mesh(pathGeoEastWest, pathMat);
        pathEastWest.rotation.x = -Math.PI / 2;
        pathEastWest.rotation.z = Math.PI / 2;
        pathEastWest.position.set(0, 0.02, 10); // Placed at z = 10 where it avoids central river curve
        this.scene.add(pathEastWest);
        this.envObjects.push(pathEastWest);
    }

    // ============ Water ============
    _createWater(config) {
        // Large river water plane centered around z = -2, length 80, width 32
        const waterGeo = new THREE.PlaneGeometry(80, 40, 80, 30);
        const waterTex = this._createWaterTexture();
        // Flowing water: scroll the caustic texture along the river each frame
        waterTex.wrapS = THREE.RepeatWrapping;
        waterTex.wrapT = THREE.RepeatWrapping;
        this.waterFlowTex = waterTex;
        const waterMat = new THREE.MeshPhongMaterial({
            color: config.waterColor,
            map: waterTex,
            transparent: true,
            opacity: 0.68,
            shininess: 140,
            specular: 0xc0e8ff,
            side: THREE.DoubleSide,
            envMapIntensity: 0.4,
        });
        const water = new THREE.Mesh(waterGeo, waterMat);
        water.rotation.x = -Math.PI / 2;
        water.position.set(0, -0.26, -2);
        water.receiveShadow = true;
        this.scene.add(water);
        this.envObjects.push(water);
        this.waterMesh = water;

        // Custom riverbank rocks
        const bankRocks = [
            [-22, Math.sin(-22 * 0.08) * 10 - 6.2],
            [-16, Math.sin(-16 * 0.08) * 10 - 6.5],
            [-10, Math.sin(-10 * 0.08) * 10 - 6.0],
            [-5, Math.sin(-5 * 0.08) * 10 + 2.7],
            [5, Math.sin(5 * 0.08) * 10 - 6.5],
            [11, Math.sin(11 * 0.08) * 10 + 2.5],
            [18, Math.sin(18 * 0.08) * 10 + 2.6],
            [25, Math.sin(25 * 0.08) * 10 - 6.3],
            [-28, Math.sin(-28 * 0.08) * 10 + 2.4]
        ];
        bankRocks.forEach(([rx, rz]) => {
            this._createRock(rx, rz, 0.35 + Math.random() * 0.3);
        });

        // Floating Lily Pads
        const lilyMat = new THREE.MeshLambertMaterial({ color: 0x226b3a, side: THREE.DoubleSide });
        for (let i = 0; i < 8; i++) {
            const rx = -20 + Math.random() * 40;
            const rz = Math.sin(rx * 0.08) * 10 - 2 + (Math.random() - 0.5) * 2.5;
            const padGeo = new THREE.CircleGeometry(0.24 + Math.random() * 0.16, 8);
            const pad = new THREE.Mesh(padGeo, lilyMat);
            pad.rotation.x = -Math.PI / 2;
            pad.position.set(rx, -0.22, rz);
            this.scene.add(pad);
            this.envObjects.push(pad);
        }

        // Bridge over the winding river at x = 0, z = -2
        this._createBridge(0, -2);
    }

    // ============ PVP Arena ============
    // A circular dueling ring on the open field: raised stone platform,
    // torch pillars, red/blue banners, gold center emblem, and a pulsing
    // glow ring. Duelists spawn at center ± 3 on the x axis (see server.js).
    _createPvpArena() {
        const { x: cx, z: cz } = PVP_ARENA_POS;
        const group = new THREE.Group();
        const anim = { flames: [], glowRing: null, banners: [] };

        // --- Raised stone platform (two tiers) ---
        const stoneMat = new THREE.MeshLambertMaterial({ color: 0x8a8a92 });
        const darkStoneMat = new THREE.MeshLambertMaterial({ color: 0x5a5a64 });
        const base = new THREE.Mesh(new THREE.CylinderGeometry(6.6, 7.0, 0.25, 24), darkStoneMat);
        base.position.y = 0.12;
        base.receiveShadow = true;
        group.add(base);
        const floor = new THREE.Mesh(new THREE.CylinderGeometry(5.8, 6.2, 0.3, 24), stoneMat);
        floor.position.y = 0.38;
        floor.receiveShadow = true;
        group.add(floor);

        // --- Battle circle markings ---
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xd8b04a });
        const markRing = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.07, 6, 40), ringMat);
        markRing.rotation.x = -Math.PI / 2;
        markRing.position.y = 0.54;
        group.add(markRing);

        // --- Gold center emblem ---
        const emblem = new THREE.Mesh(
            new THREE.CylinderGeometry(0.8, 0.8, 0.06, 16),
            new THREE.MeshLambertMaterial({ color: 0xd8b04a, emissive: 0x604010, emissiveIntensity: 0.35 })
        );
        emblem.position.y = 0.55;
        group.add(emblem);

        // --- Pulsing glow ring (animated) ---
        const glowRing = new THREE.Mesh(
            new THREE.TorusGeometry(5.2, 0.1, 8, 48),
            new THREE.MeshBasicMaterial({ color: 0xff5040, transparent: true, opacity: 0.55 })
        );
        glowRing.rotation.x = -Math.PI / 2;
        glowRing.position.y = 0.56;
        group.add(glowRing);
        anim.glowRing = glowRing;

        // --- Torch pillars around the ring (gaps at the ± x entrances) ---
        const pillarMat = new THREE.MeshLambertMaterial({ color: 0x6a6a74 });
        const capMat = new THREE.MeshLambertMaterial({ color: 0x4a4a54 });
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            // Leave entrance gaps on the east/west sides (where duelists spawn)
            if (Math.abs(Math.cos(angle)) > 0.92) continue;
            const px = Math.cos(angle) * 5.9;
            const pz = Math.sin(angle) * 5.9;

            const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.0, 0.5), pillarMat);
            pillar.position.set(px, 1.35, pz);
            pillar.castShadow = true;
            group.add(pillar);
            const cap = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.18, 0.66), capMat);
            cap.position.set(px, 2.42, pz);
            group.add(cap);

            // Torch flame (emissive, flickers via updateAnimations)
            const flame = new THREE.Mesh(
                new THREE.ConeGeometry(0.16, 0.45, 6),
                new THREE.MeshBasicMaterial({ color: 0xff8830, transparent: true, opacity: 0.95 })
            );
            flame.position.set(px, 2.75, pz);
            group.add(flame);
            anim.flames.push(flame);
        }

        // --- Red/Blue banners at the two entrances ---
        const poleMat = new THREE.MeshLambertMaterial({ color: 0x4a3520 });
        [[-1, 0xe04040], [1, 0x4060d0]].forEach(([side, color]) => {
            for (const zOff of [-2.2, 2.2]) {
                const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.4, 6), poleMat);
                pole.position.set(side * 7.2, 1.7, zOff);
                pole.castShadow = true;
                group.add(pole);
                const flag = new THREE.Mesh(
                    new THREE.PlaneGeometry(1.0, 0.65),
                    new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide })
                );
                flag.position.set(side * 7.2 + side * -0.55, 3.0, zOff);
                flag.rotation.y = side > 0 ? Math.PI : 0;
                group.add(flag);
                anim.banners.push(flag);
            }
        });

        // --- Stone steps at both entrances ---
        for (const side of [-1, 1]) {
            const step = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.22, 2.4), darkStoneMat);
            step.position.set(side * 6.9, 0.11, 0);
            step.receiveShadow = true;
            group.add(step);
        }

        group.position.set(cx, 0, cz);
        this.scene.add(group);
        this.envObjects.push(group);
        this._arenaGroup = group; // excluded from static merge (has animated parts)
        this.arenaAnimParts = anim;
    }

    // ============ Grass Tufts & Wildflowers ============
    // Scatters 3D grass blade tufts and colorful wildflowers across the field
    // to give the ground depth and life. Uses InstancedMesh (few draw calls)
    // and a light wind sway. Skips river/arena/paths/rocky-cave zones.
    _createGrassDecor(config) {
        // Valid grassy spot? (away from water, arena, paths, mountain, cave)
        const okSpot = (x, z) => {
            const riverZ = Math.sin(x * 0.08) * 10 - 2;
            if (Math.abs(z - riverZ) < 8.5) return false;      // river + banks
            if (this.isInArena && this.isInArena(x, z, 1)) return false;
            if (Math.abs(x) < 2.2 || Math.abs(z) < 2.2) return false; // paths
            if (x > 6 && z > 6) return false;                  // mountain
            if (x < -6 && z < -6) return false;                // cave
            return true;
        };

        const groundH = (x, z) => Math.sin(x * 0.3) * Math.cos(z * 0.3) * 0.15;

        // --- Grass blade tufts (one InstancedMesh of a thin blade) ---
        const bladeGeo = new THREE.ConeGeometry(0.04, 0.6, 4);
        bladeGeo.translate(0, 0.3, 0); // base at origin so it grows upward
        const bladeMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
        const BLADES = 900;
        const grass = new THREE.InstancedMesh(bladeGeo, bladeMat, BLADES);
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const eul = new THREE.Euler();
        const baseG = new THREE.Color(config.groundColor);
        let placed = 0, attempts = 0;
        while (placed < BLADES && attempts < BLADES * 6) {
            attempts++;
            const x = (Math.random() - 0.5) * 60;
            const z = (Math.random() - 0.5) * 60;
            if (!okSpot(x, z)) continue;
            const s = 0.7 + Math.random() * 0.9;         // height variation
            eul.set((Math.random() - 0.5) * 0.4, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.4);
            q.setFromEuler(eul);
            m.compose(new THREE.Vector3(x, groundH(x, z), z), q, new THREE.Vector3(s, s, s));
            grass.setMatrixAt(placed, m);
            // green variation: fresh↔deep
            const c = baseG.clone().lerp(new THREE.Color(0x9fe25a), Math.random() * 0.5)
                .multiplyScalar(0.75 + Math.random() * 0.4);
            grass.setColorAt(placed, c);
            placed++;
        }
        grass.count = placed;
        grass.instanceMatrix.needsUpdate = true;
        if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
        grass.receiveShadow = true;
        this.scene.add(grass);
        this.envObjects.push(grass);
        this.grassDecor = grass;

        // --- Wildflowers (small bright heads on short stems) ---
        const flowerColors = [0xff5d7a, 0xffd23f, 0xffffff, 0xb46cff, 0x5db4ff];
        const headGeo = new THREE.SphereGeometry(0.11, 6, 5);
        const flowerMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
        const FLOWERS = 150;
        const flowers = new THREE.InstancedMesh(headGeo, flowerMat, FLOWERS);
        const stemGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.35, 4);
        stemGeo.translate(0, 0.175, 0);
        const stemMat = new THREE.MeshLambertMaterial({ color: 0x3d7a2e });
        const stems = new THREE.InstancedMesh(stemGeo, stemMat, FLOWERS);
        placed = 0; attempts = 0;
        while (placed < FLOWERS && attempts < FLOWERS * 8) {
            attempts++;
            const x = (Math.random() - 0.5) * 58;
            const z = (Math.random() - 0.5) * 58;
            if (!okSpot(x, z)) continue;
            const gy = groundH(x, z);
            m.compose(new THREE.Vector3(x, gy, z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
            stems.setMatrixAt(placed, m);
            m.compose(new THREE.Vector3(x, gy + 0.36, z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
            flowers.setMatrixAt(placed, m);
            flowers.setColorAt(placed, new THREE.Color(flowerColors[Math.floor(Math.random() * flowerColors.length)]));
            placed++;
        }
        stems.count = placed;
        flowers.count = placed;
        stems.instanceMatrix.needsUpdate = true;
        flowers.instanceMatrix.needsUpdate = true;
        if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
        this.scene.add(stems);
        this.scene.add(flowers);
        this.envObjects.push(stems, flowers);
    }

    // ============ Ambient Life: Sakura Petals ============
    // Small pink quads drifting down from every cherry-tree canopy, looping forever.
    _createSakuraPetals() {
        if (!this.cherryTreePositions || this.cherryTreePositions.length === 0) return;

        const petalsPerTree = 12;
        const total = Math.min(this.cherryTreePositions.length * petalsPerTree, 180);
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(total * 3);
        const data = [];

        for (let i = 0; i < total; i++) {
            const tree = this.cherryTreePositions[i % this.cherryTreePositions.length];
            const d = {
                treeX: tree.x,
                treeZ: tree.z,
                // spawn spread around the canopy
                offX: (Math.random() - 0.5) * 2.4,
                offZ: (Math.random() - 0.5) * 2.4,
                topY: 3.2 + Math.random() * 1.4,
                fallSpeed: 0.35 + Math.random() * 0.35,
                swayAmp: 0.25 + Math.random() * 0.35,
                swayFreq: 1.2 + Math.random() * 1.2,
                phase: Math.random() * Math.PI * 2,
                // stagger initial heights so petals don't fall in sync
                y: 0,
            };
            d.y = Math.random() * d.topY;
            data.push(d);
            positions[i * 3] = d.treeX + d.offX;
            positions[i * 3 + 1] = d.y;
            positions[i * 3 + 2] = d.treeZ + d.offZ;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({
            color: 0xffc2d1,
            size: 0.14,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
        });
        const points = new THREE.Points(geo, mat);
        points.frustumCulled = false;
        this.scene.add(points);
        this.envObjects.push(points);
        this.sakuraPetals = { points, data };
    }

    // ============ Ambient Life: River Fish ============
    // Small fish swim along the winding river; occasionally one leaps out with a flip.
    _createFish(config) {
        const fishColors = [0xe08040, 0xc0c8d0, 0x88b0d8, 0xd0a030];
        const count = 6;

        for (let i = 0; i < count; i++) {
            const group = new THREE.Group();
            const color = fishColors[i % fishColors.length];
            const mat = new THREE.MeshLambertMaterial({ color });

            // Body: squashed cone pointing forward
            const body = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 6), mat);
            body.rotation.x = Math.PI / 2; // point along +Z
            group.add(body);
            // Tail fin
            const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 4), mat);
            tail.rotation.x = -Math.PI / 2;
            tail.position.z = -0.28;
            group.add(tail);

            const u = {
                x: -25 + Math.random() * 50,
                dir: Math.random() < 0.5 ? 1 : -1,
                speed: 0.8 + Math.random() * 1.0,
                zOff: (Math.random() - 0.5) * 3.5,
                swimY: -0.55,
                // jumping
                jumpTimer: 3 + Math.random() * 9,
                jumpT: -1, // -1 = not jumping, else 0..1 progress
                jumpDur: 0.9,
                tail,
                wigglePhase: Math.random() * Math.PI * 2,
            };
            group.userData = u;
            group.position.set(u.x, u.swimY, Math.sin(u.x * 0.08) * 10 - 2 + u.zOff);

            this.scene.add(group);
            this.envObjects.push(group);
            this.fishes.push(group);
        }
    }

    _createBridge(x, z) {
        const group = new THREE.Group();

        // Bridge deck support beams (horizontal, underneath)
        const supportGeo = new THREE.BoxGeometry(0.2, 0.15, 16);
        const supportMat = new THREE.MeshLambertMaterial({ color: 0x3a2510 });
        [-1.2, 0, 1.2].forEach(xOff => {
            const beam = new THREE.Mesh(supportGeo, supportMat);
            beam.position.set(xOff, 0.12, 0);
            beam.castShadow = true;
            group.add(beam);
        });

        // Bridge planks (covering Z range from -8 to 8 for wider river)
        const plankGeo = new THREE.BoxGeometry(3.6, 0.14, 0.42);
        const plankMatDark = new THREE.MeshLambertMaterial({ color: 0x664a30 });
        const plankMatLight = new THREE.MeshLambertMaterial({ color: 0x7a5838 });
        for (let i = 0; i < 34; i++) {
            const mat = i % 3 === 0 ? plankMatLight : plankMatDark;
            const plank = new THREE.Mesh(plankGeo, mat);
            plank.position.set(0, 0.28, -8.0 + i * 0.48);
            plank.castShadow = true;
            group.add(plank);
        }

        // Bridge handrails (vertical posts)
        const railGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.75, 6);
        const railMat = new THREE.MeshLambertMaterial({ color: 0x4a321a });
        [-1.6, 1.6].forEach(xOff => {
            [-8, -6, -4, -2, 0, 2, 4, 6, 8].forEach(zOff => {
                const post = new THREE.Mesh(railGeo, railMat);
                post.position.set(xOff, 0.65, zOff);
                post.castShadow = true;
                group.add(post);
            });
            // Horizontal rail bars (top rail)
            const barGeo = new THREE.CylinderGeometry(0.05, 0.05, 16.2, 6);
            const bar = new THREE.Mesh(barGeo, railMat);
            bar.rotation.x = Math.PI / 2;
            bar.position.set(xOff, 0.95, 0);
            bar.castShadow = true;
            group.add(bar);

            // Lower horizontal rail
            const lowerBarGeo = new THREE.CylinderGeometry(0.035, 0.035, 16.2, 6);
            const lowerBar = new THREE.Mesh(lowerBarGeo, railMat);
            lowerBar.rotation.x = Math.PI / 2;
            lowerBar.position.set(xOff, 0.55, 0);
            group.add(lowerBar);
        });

        // Decorative rope/lantern posts at entry/exit
        const postTopGeo = new THREE.SphereGeometry(0.1, 6, 6);
        const postTopMat = new THREE.MeshLambertMaterial({ color: 0xc08a40 });
        [-1.6, 1.6].forEach(xOff => {
            [-8, 8].forEach(zOff => {
                const sphere = new THREE.Mesh(postTopGeo, postTopMat);
                sphere.position.set(xOff, 1.08, zOff);
                group.add(sphere);
            });
        });

        group.position.set(x, 0, z);
        this.scene.add(group);
        this.envObjects.push(group);
    }

    // ============ Environment ============
    _isOnLand(x, z) {
        // Returns true if not in the river zone (wider river)
        const riverZ = Math.sin(x * 0.08) * 10 - 2;
        if (Math.abs(z - riverZ) <= 7.0) return false;
        // Keep the PVP arena zone clear of random scenery (trees/rocks/etc.)
        const ax = x - PVP_ARENA_POS.x;
        const az = z - PVP_ARENA_POS.z;
        if (ax * ax + az * az < 8.5 * 8.5) return false;
        return true;
    }

    // True if (x,z) is inside the PVP arena keep-out zone (monsters excluded).
    isInArena(x, z, margin = 0) {
        if (this.currentMap !== 'prontera') return false;
        const dx = x - PVP_ARENA_POS.x;
        const dz = z - PVP_ARENA_POS.z;
        const r = 7.5 + margin;
        return dx * dx + dz * dz < r * r;
    }

    // Arena center + the fighting-ring radius used for the duel cage/clamp.
    getArenaInfo() {
        return { x: PVP_ARENA_POS.x, z: PVP_ARENA_POS.z, radius: 5.4 };
    }

    // ============ World Boss ============
    // A towering boss built on demand at the given spot. Only ever one exists;
    // it's added after the static merge, so it stays fully dynamic/animated.
    spawnWorldBoss(name, x = 0, z = 0) {
        if (this._worldBoss) this.removeWorldBoss();

        const group = new THREE.Group();
        group.position.set(x, 0, z);

        const darkMat = new THREE.MeshLambertMaterial({ color: 0x2a1230 });
        const rockMat = new THREE.MeshLambertMaterial({ color: 0x3b1f24 });
        const emberMat = new THREE.MeshBasicMaterial({ color: 0xff5522 });
        const coreMat = new THREE.MeshBasicMaterial({ color: 0xff8a1e });

        // Legs
        const legMat = darkMat;
        for (const sx of [-0.85, 0.85]) {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.65, 2.4, 7), legMat);
            leg.position.set(sx, 1.2, 0);
            leg.castShadow = true;
            group.add(leg);
            const foot = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 1.4), rockMat);
            foot.position.set(sx, 0.25, 0.2);
            group.add(foot);
        }

        // Torso — chunky crystalline body
        const torso = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9, 0), rockMat);
        torso.position.y = 3.6;
        torso.scale.set(1.0, 1.15, 0.9);
        torso.castShadow = true;
        group.add(torso);

        // Glowing molten core in the chest
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 12), coreMat);
        core.position.set(0, 3.7, 0.9);
        group.add(core);
        const coreGlow = new THREE.Mesh(
            new THREE.SphereGeometry(1.1, 16, 12),
            new THREE.MeshBasicMaterial({ color: 0xff5a1e, transparent: true, opacity: 0.35, depthWrite: false })
        );
        coreGlow.position.copy(core.position);
        group.add(coreGlow);
        const coreLight = new THREE.PointLight(0xff6a2a, 2.4, 16, 2);
        coreLight.position.copy(core.position);
        coreLight.castShadow = false;
        group.add(coreLight);

        // Shoulders + arms
        const arms = [];
        for (const sx of [-1, 1]) {
            const shoulder = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 0), rockMat);
            shoulder.position.set(sx * 2.1, 4.2, 0);
            group.add(shoulder);

            const arm = new THREE.Group();
            arm.position.set(sx * 2.1, 4.1, 0);
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 2.2, 6), darkMat);
            upper.position.y = -1.1;
            upper.castShadow = true;
            arm.add(upper);
            const fist = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), rockMat);
            fist.position.y = -2.3;
            arm.add(fist);
            // ember spikes on the fist
            for (let i = 0; i < 3; i++) {
                const spike = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 5), emberMat);
                spike.position.set((i - 1) * 0.35, -2.6, 0.2);
                arm.add(spike);
            }
            group.add(arm);
            arms.push({ arm, side: sx, phase: sx > 0 ? Math.PI : 0 });
        }

        // Head + horns + eyes
        const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95, 0), darkMat);
        head.position.y = 5.7;
        head.castShadow = true;
        group.add(head);
        for (const sx of [-1, 1]) {
            const horn = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.2, 6), rockMat);
            horn.position.set(sx * 0.5, 6.4, -0.1);
            horn.rotation.z = sx * -0.5;
            group.add(horn);
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffdd33 }));
            eye.position.set(sx * 0.38, 5.75, 0.8);
            group.add(eye);
        }

        // Floating ember shards orbiting the boss
        const embers = [];
        for (let i = 0; i < 10; i++) {
            const e = new THREE.Mesh(new THREE.TetrahedronGeometry(0.18), emberMat);
            const a = (i / 10) * Math.PI * 2;
            e.userData = { angle: a, radius: 2.6 + Math.random() * 1.2, y: 2 + Math.random() * 3, spin: 0.6 + Math.random() };
            group.add(e);
            embers.push(e);
        }

        this.scene.add(group);
        this._worldBoss = {
            group, name: name || 'World Boss', x, z,
            core, coreGlow, coreLight, arms, embers,
            baseY: 0, bob: 0, hitFlash: 0,
            torsoMat: rockMat, coreMat,
        };
        return this._worldBoss;
    }

    removeWorldBoss() {
        if (!this._worldBoss) return;
        const g = this._worldBoss.group;
        this.scene.remove(g);
        g.traverse(o => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) {
                if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
                else o.material.dispose();
            }
        });
        this._worldBoss = null;
    }

    getWorldBossInfo() {
        if (!this._worldBoss) return null;
        return { x: this._worldBoss.x, z: this._worldBoss.z, radius: 2.4, name: this._worldBoss.name };
    }

    // Brief flash + recoil when the boss takes a hit.
    playBossHitReaction() {
        if (this._worldBoss) this._worldBoss.hitFlash = 0.18;
    }

    _updateWorldBoss(dt) {
        const b = this._worldBoss;
        if (!b) return;
        b.bob += dt;
        // Idle breathing bob
        b.group.position.y = b.baseY + Math.sin(b.bob * 1.6) * 0.12;
        // Core pulse
        const pulse = 0.85 + Math.sin(b.bob * 4) * 0.15;
        b.core.scale.setScalar(pulse);
        b.coreGlow.scale.setScalar(pulse * 1.05);
        if (b.coreLight) b.coreLight.intensity = 2.0 + Math.sin(b.bob * 4) * 0.8;
        // Slow menacing sway of the arms
        b.arms.forEach(a => {
            a.arm.rotation.x = Math.sin(b.bob * 1.2 + a.phase) * 0.25;
        });
        // Orbiting embers
        b.embers.forEach(e => {
            const u = e.userData;
            u.angle += u.spin * dt;
            e.position.set(Math.cos(u.angle) * u.radius, u.y + Math.sin(b.bob * 2 + u.angle) * 0.3, Math.sin(u.angle) * u.radius);
            e.rotation.y += dt * 2;
        });
        // Hit reaction: flash the body red and recoil slightly
        if (b.hitFlash > 0) {
            b.hitFlash = Math.max(0, b.hitFlash - dt);
            const f = b.hitFlash / 0.18;
            b.torsoMat.emissive = b.torsoMat.emissive || new THREE.Color(0x000000);
            b.torsoMat.emissive.setRGB(f * 0.6, f * 0.1, f * 0.1);
            b.group.position.z = b.z + f * 0.15;
        } else {
            b.group.position.z = b.z;
        }
        // Face the player if we have a follow target
        if (this._weatherFocus) {
            const dx = this._weatherFocus.x - b.x;
            const dz = this._weatherFocus.z - b.z;
            b.group.rotation.y = Math.atan2(dx, dz);
        }
    }

    // ============ Arena MMR Leaderboard Board ============
    _createArenaLeaderboard() {
        const { x: cx, z: cz } = PVP_ARENA_POS;
        const group = new THREE.Group();

        // Two wooden posts
        const postMat = new THREE.MeshLambertMaterial({ color: 0x4a3520 });
        for (const sx of [-2.3, 2.3]) {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 5.2, 8), postMat);
            post.position.set(sx, 2.6, 0);
            post.castShadow = true;
            group.add(post);
        }
        // Top banner bar
        const bar = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.35, 0.35), postMat);
        bar.position.y = 5.0;
        group.add(bar);

        // Canvas-textured board panel
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 512;
        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 4;
        const panel = new THREE.Mesh(
            new THREE.PlaneGeometry(4.8, 4.8),
            new THREE.MeshBasicMaterial({ map: tex, transparent: true })
        );
        panel.position.set(0, 2.9, 0.2);
        group.add(panel);

        // Place behind the arena, facing back toward the approach (spawn side)
        group.position.set(cx, 0, cz + 7.5);
        group.rotation.y = Math.PI;
        this.scene.add(group);
        this.envObjects.push(group);

        this.arenaBoard = { group, canvas, ctx: canvas.getContext('2d'), tex };
        this.updateArenaLeaderboard(null); // initial "loading" state
    }

    // Redraw the leaderboard panel. entries: [{name, mmr, wins, losses}]
    updateArenaLeaderboard(entries) {
        if (!this.arenaBoard) return;
        const { canvas, ctx, tex } = this.arenaBoard;
        const W = canvas.width, H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        // Parchment/stone background
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#2a2436');
        grad.addColorStop(1, '#1a1626');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = '#d8b04a';
        ctx.lineWidth = 8;
        ctx.strokeRect(10, 10, W - 20, H - 20);

        // Title
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd94a';
        ctx.font = 'bold 46px "Fredoka One", Arial';
        ctx.fillText('🏆 PVP RANKING', W / 2, 70);
        ctx.strokeStyle = '#d8b04a';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(40, 92); ctx.lineTo(W - 40, 92); ctx.stroke();

        if (!entries) {
            ctx.fillStyle = '#cfc9dd';
            ctx.font = '28px Arial';
            ctx.fillText('กำลังโหลด...', W / 2, 260);
        } else if (entries.length === 0) {
            ctx.fillStyle = '#cfc9dd';
            ctx.font = '26px Arial';
            ctx.fillText('ยังไม่มีนักสู้ในตาราง', W / 2, 260);
        } else {
            const medals = ['🥇', '🥈', '🥉'];
            ctx.textAlign = 'left';
            let y = 150;
            entries.slice(0, 8).forEach((e, i) => {
                const rank = medals[i] || `${i + 1}.`;
                ctx.fillStyle = i === 0 ? '#ffd94a' : (i < 3 ? '#ffffff' : '#cfc9dd');
                ctx.font = i < 3 ? 'bold 34px Arial' : '30px Arial';
                const name = (e.name || 'Unknown').slice(0, 12);
                ctx.fillText(`${rank} ${name}`, 45, y);
                ctx.textAlign = 'right';
                ctx.fillStyle = '#7cd0ff';
                ctx.fillText(`${e.mmr}`, W - 45, y);
                ctx.textAlign = 'left';
                y += 46;
            });
        }
        tex.needsUpdate = true;
    }

    // Raise a translucent cage/dome over the arena during a duel.
    showArenaCage() {
        if (this._arenaCage) return;
        const { x: cx, z: cz, radius } = this.getArenaInfo();
        const R = radius + 0.3;
        const group = new THREE.Group();

        // Translucent energy dome
        const domeMat = new THREE.MeshBasicMaterial({
            color: 0xff6050, transparent: true, opacity: 0.12,
            side: THREE.DoubleSide, depthWrite: false,
        });
        const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
        dome.position.y = 0.4;
        group.add(dome);

        // Vertical cage bars
        const barMat = new THREE.MeshStandardMaterial({
            color: 0xffaa33, emissive: 0xff5522, emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.3,
        });
        const bars = 20;
        for (let i = 0; i < bars; i++) {
            const a = (i / bars) * Math.PI * 2;
            const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 6), barMat);
            bar.position.set(Math.cos(a) * R, 2.2, Math.sin(a) * R);
            group.add(bar);
        }
        // Top and bottom rings
        for (const y of [0.5, 4.2]) {
            const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.08, 8, 40), barMat);
            ring.rotation.x = Math.PI / 2;
            ring.position.y = y;
            group.add(ring);
        }

        group.position.set(cx, 0, cz);
        this.scene.add(group);
        this._arenaCage = group;
        this._arenaCagePulse = 0;
    }

    hideArenaCage() {
        if (!this._arenaCage) return;
        this.scene.remove(this._arenaCage);
        this._arenaCage.traverse(c => { if (c.geometry) c.geometry.dispose(); });
        this._arenaCage = null;
    }

    _createEnvironment(config) {
        // --- Trees ---
        const treePositions = [
            [-12, -10], [-15, 2], [10, -12], [13, 7], [-8, 14],
            [16, -6], [-17, -4], [6, 16], [-10, -16], [14, 13],
            [-17, 10], [7, -17], [-5, -14], [17, -14], [-14, -12],
            [18, 3], [-6, 18], [4, -19], [-19, -7], [11, 18],
        ];

        treePositions.forEach(([x, z], idx) => {
            if (this._isOnLand(x, z)) {
                const typeIdx = idx % config.treeTypes.length;
                const type = config.treeTypes[typeIdx];
                this._createTree(x, z, type);
            }
        });

        // --- Rocks scattered ---
        const rockPosMain = [
            [-5, -5], [6, -3], [-3, 9], [10, 10], [-9, 5],
            [4, -8], [-7, -13], [11, -9], [-12, 3], [8, 5],
            [15, 0], [-4, 7], [-16, 8], [9, -14], [-11, -8],
            [14, -3], [-2, -11], [7, 12], [-13, 14], [3, 14],
        ];
        rockPosMain.forEach(([x, z]) => {
            if (this._isOnLand(x, z)) this._createRock(x, z);
        });

        const density = config.decorDensity;

        // --- Flowers (reduced for performance) ---
        for (let i = 0; i < Math.floor(55 * density); i++) {
            const x = (Math.random() - 0.5) * 42;
            const z = (Math.random() - 0.5) * 42;
            if (Math.abs(x) < 1.5 && Math.abs(z) < 1.5) continue;
            if (!this._isOnLand(x, z)) continue;
            if (x < -6 && z < -6) continue; // Skip Cave
            if (x > 6 && z > 6) continue; // Skip Mountain
            this._createFlower(x, z);
        }

        // --- Grass tufts (reduced for performance) ---
        for (let i = 0; i < Math.floor(100 * density); i++) {
            const x = (Math.random() - 0.5) * 48;
            const z = (Math.random() - 0.5) * 48;
            if (!this._isOnLand(x, z)) continue;
            this._createGrassTuft(x, z);
        }

        // --- Mushrooms (doubled) ---
        for (let i = 0; i < Math.floor(28 * density); i++) {
            const x = (Math.random() - 0.5) * 34;
            const z = (Math.random() - 0.5) * 34;
            if (Math.abs(x) < 2 && Math.abs(z) < 2) continue;
            if (!this._isOnLand(x, z)) continue;
            this._createMushroom(x, z);
        }

        // --- Pebbles / small stones (reduced for performance) ---
        for (let i = 0; i < Math.floor(50 * density); i++) {
            const x = (Math.random() - 0.5) * 46;
            const z = (Math.random() - 0.5) * 46;
            if (!this._isOnLand(x, z)) continue;
            this._createPebble(x, z);
        }

        // --- Clover / ground cover patches (reduced for performance) ---
        for (let i = 0; i < Math.floor(25 * density); i++) {
            const x = (Math.random() - 0.5) * 40;
            const z = (Math.random() - 0.5) * 40;
            if (Math.abs(x) < 2 && Math.abs(z) < 2) continue;
            if (!this._isOnLand(x, z)) continue;
            this._createCloverPatch(x, z);
        }

        // --- Fallen leaf piles (reduced for performance) ---
        for (let i = 0; i < Math.floor(15 * density); i++) {
            const x = (Math.random() - 0.5) * 38;
            const z = (Math.random() - 0.5) * 38;
            if (!this._isOnLand(x, z)) continue;
            this._createFallenLeaves(x, z);
        }

        // --- Stepping stone paths ---
        this._createSteppingStones();

        // --- Fence segments along one edge ---
        this._createFence();

        // --- Signpost near spawn ---
        this._createSignpost(2.5, 2.5);
    }

    // ============ Tree Types ============
    _createTree(x, z, type = 'oak') {
        const group = new THREE.Group();

        switch (type) {
            case 'oak': {
                // Trunk
                const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 2.5, 6);
                const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
                const trunk = new THREE.Mesh(trunkGeo, trunkMat);
                trunk.position.y = 1.25;
                trunk.castShadow = true;
                group.add(trunk);
                // Layered canopy
                const baseColors = ['#2a8a2a', '#3a9a3a', '#4aaa3a'];
                const leafColors = ['#4aaa3a', '#5aba4a', '#6aca5a'];
                for (let i = 0; i < 3; i++) {
                    const coneGeo = new THREE.ConeGeometry(1.3 - i * 0.3, 1.6, 7);
                    const coneMat = new THREE.MeshLambertMaterial({
                        map: this._createLeafTexture(baseColors[i], leafColors[i])
                    });
                    const cone = new THREE.Mesh(coneGeo, coneMat);
                    cone.position.y = 2.5 + i * 0.9;
                    cone.castShadow = true;
                    group.add(cone);
                }
                break;
            }
            case 'cherry': {
                // Record position so sakura petals can fall from this tree
                if (this.cherryTreePositions) this.cherryTreePositions.push({ x, z });
                // Slender trunk
                const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 3, 6);
                const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a5a3a });
                const trunk = new THREE.Mesh(trunkGeo, trunkMat);
                trunk.position.y = 1.5;
                trunk.castShadow = true;
                group.add(trunk);
                // Pink spherical canopy
                const canopyGeo = new THREE.SphereGeometry(1.8, 8, 6);
                const canopyMat = new THREE.MeshLambertMaterial({
                    map: this._createLeafTexture('#ffb0c0', '#ffd0db')
                });
                const canopy = new THREE.Mesh(canopyGeo, canopyMat);
                canopy.position.y = 3.8;
                canopy.scale.set(1, 0.7, 1);
                canopy.castShadow = true;
                group.add(canopy);
                // Extra pink cluster
                const cluster = new THREE.Mesh(
                    new THREE.SphereGeometry(1.2, 6, 5),
                    new THREE.MeshLambertMaterial({
                        map: this._createLeafTexture('#ff90a0', '#ffccd5')
                    })
                );
                cluster.castShadow = true;
                group.add(cluster);
                break;
            }
            case 'willow': {
                // Thick trunk
                const trunkGeo = new THREE.CylinderGeometry(0.2, 0.35, 3.5, 7);
                const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a4a2a });
                const trunk = new THREE.Mesh(trunkGeo, trunkMat);
                trunk.position.y = 1.75;
                trunk.castShadow = true;
                group.add(trunk);
                // Drooping canopy using scaled cones
                for (let i = 0; i < 5; i++) {
                    const angle = (i / 5) * Math.PI * 2;
                    const droopGeo = new THREE.ConeGeometry(0.4, 2.5, 4);
                    const droopMat = new THREE.MeshLambertMaterial({
                        map: this._createLeafTexture('#5aaa4a', '#7aca6a')
                    });
                    const droop = new THREE.Mesh(droopGeo, droopMat);
                    droop.position.set(
                        Math.cos(angle) * 1.0,
                        3.0,
                        Math.sin(angle) * 1.0
                    );
                    droop.castShadow = true;
                    group.add(droop);
                }
                // Top sphere
                const topGeo = new THREE.SphereGeometry(1.5, 7, 5);
                const topMat = new THREE.MeshLambertMaterial({
                    map: this._createLeafTexture('#4a9a3a', '#6aca5a')
                });
                const top = new THREE.Mesh(topGeo, topMat);
                top.position.y = 4.0;
                top.scale.set(1, 0.6, 1);
                top.castShadow = true;
                group.add(top);
                break;
            }
            case 'bush': {
                const bushGeo = new THREE.SphereGeometry(0.8, 6, 5);
                const bushMat = new THREE.MeshLambertMaterial({
                    map: this._createLeafTexture('#3a7a2a', '#5aba3a')
                });
                const bush = new THREE.Mesh(bushGeo, bushMat);
                bush.position.y = 0.6;
                bush.scale.set(1.2, 0.8, 1.2);
                bush.castShadow = true;
                group.add(bush);
                break;
            }
            case 'autumn': {
                const trunkGeo = new THREE.CylinderGeometry(0.15, 0.28, 2.5, 6);
                const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a3a1a });
                const trunk = new THREE.Mesh(trunkGeo, trunkMat);
                trunk.position.y = 1.25;
                trunk.castShadow = true;
                group.add(trunk);
                const autumnColors = ['#d4642a', '#c8841a', '#b8441a'];
                const autumnLeafColors = ['#f8844a', '#e8a43a', '#d8643a'];
                for (let i = 0; i < 3; i++) {
                    const coneGeo = new THREE.ConeGeometry(1.2 - i * 0.25, 1.5, 7);
                    const coneMat = new THREE.MeshLambertMaterial({
                        map: this._createLeafTexture(autumnColors[i], autumnLeafColors[i])
                    });
                    const cone = new THREE.Mesh(coneGeo, coneMat);
                    cone.position.y = 2.3 + i * 0.85;
                    cone.castShadow = true;
                    group.add(cone);
                }
                break;
            }
            case 'dead': {
                const trunkGeo = new THREE.CylinderGeometry(0.1, 0.25, 3, 5);
                const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a3a2a });
                const trunk = new THREE.Mesh(trunkGeo, trunkMat);
                trunk.position.y = 1.5;
                trunk.castShadow = true;
                group.add(trunk);
                // Bare branches
                for (let i = 0; i < 3; i++) {
                    const branchGeo = new THREE.CylinderGeometry(0.03, 0.06, 1.2, 4);
                    const branch = new THREE.Mesh(branchGeo, trunkMat);
                    const angle = (i / 3) * Math.PI * 2 + 0.5;
                    branch.position.set(
                        Math.cos(angle) * 0.3,
                        2.5 + i * 0.3,
                        Math.sin(angle) * 0.3
                    );
                    branch.rotation.z = Math.cos(angle) * 0.8;
                    branch.rotation.x = Math.sin(angle) * 0.5;
                    group.add(branch);
                }
                break;
            }
            case 'pine': {
                const trunkGeo = new THREE.CylinderGeometry(0.12, 0.22, 3, 5);
                const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a3020 });
                const trunk = new THREE.Mesh(trunkGeo, trunkMat);
                trunk.position.y = 1.5;
                trunk.castShadow = true;
                group.add(trunk);
                for (let i = 0; i < 4; i++) {
                    const coneGeo = new THREE.ConeGeometry(1.0 - i * 0.15, 1.2, 6);
                    const coneMat = new THREE.MeshLambertMaterial({
                        map: this._createLeafTexture('#1a5a2a', '#2d7d3d')
                    });
                    const cone = new THREE.Mesh(coneGeo, coneMat);
                    cone.position.y = 2.2 + i * 0.7;
                    cone.castShadow = true;
                    group.add(cone);
                }
                break;
            }
        }

        group.position.set(x, 0, z);
        const scale = 0.7 + Math.random() * 0.5;
        group.scale.setScalar(scale);
        this.scene.add(group);
        this.envObjects.push(group);
        if (type !== 'bush') {
            this.swayingObjects.push(group);
        }
    }

    // ============ Decorations ============
    _createRock(x, z, size = null) {
        const s = size || (0.3 + Math.random() * 0.5);
        const geo = new THREE.DodecahedronGeometry(s, 0);
        const shade = 0x5a + Math.floor(Math.random() * 0x20);
        const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(shade / 255, shade / 255, (shade + 0x10) / 255) });
        const rock = new THREE.Mesh(geo, mat);
        rock.position.set(x, s * 0.4, z);
        rock.rotation.set(Math.random(), Math.random(), 0);
        rock.castShadow = true;
        rock.receiveShadow = true;
        this.scene.add(rock);
        this.envObjects.push(rock);
    }

    _createFlower(x, z) {
        const group = new THREE.Group();
        const stemH = 0.25 + Math.random() * 0.25;

        // Stem with slight curve
        const stemGeo = new THREE.CylinderGeometry(0.015, 0.025, stemH, 4);
        const stemMat = new THREE.MeshLambertMaterial({ color: 0x2a7a2a });
        const stem = new THREE.Mesh(stemGeo, stemMat);
        stem.position.y = stemH / 2;
        stem.rotation.z = (Math.random() - 0.5) * 0.15;
        group.add(stem);

        // Small leaf on stem
        const leafGeo = new THREE.PlaneGeometry(0.1, 0.06);
        const leafMat = new THREE.MeshLambertMaterial({ color: 0x3a9a3a, side: THREE.DoubleSide });
        const leaf1 = new THREE.Mesh(leafGeo, leafMat);
        leaf1.position.set(0.04, stemH * 0.4, 0);
        leaf1.rotation.z = -0.6;
        leaf1.rotation.y = Math.random() * Math.PI;
        group.add(leaf1);
        if (Math.random() > 0.4) {
            const leaf2 = new THREE.Mesh(leafGeo.clone(), leafMat);
            leaf2.position.set(-0.04, stemH * 0.6, 0);
            leaf2.rotation.z = 0.6;
            leaf2.rotation.y = Math.random() * Math.PI;
            group.add(leaf2);
        }

        // Flower petals (beautiful radial pattern)
        const petalPalettes = [
            { petals: 0xff6090, center: 0xffee44 },  // Pink + yellow center
            { petals: 0xff4060, center: 0xffe830 },  // Red + golden
            { petals: 0xffaa50, center: 0xffffff },  // Orange + white
            { petals: 0xff80ff, center: 0xffee60 },  // Purple + yellow
            { petals: 0x60b0ff, center: 0xffffff },  // Blue + white center
            { petals: 0xffdd40, center: 0xff8040 },  // Sunflower yellow + orange
            { petals: 0xffffff, center: 0xffee30 },  // White daisy + yellow
            { petals: 0xff90b0, center: 0xffccdd },  // Soft pink + light rose
        ];
        const palette = petalPalettes[Math.floor(Math.random() * petalPalettes.length)];
        const petalCount = 5 + Math.floor(Math.random() * 4);
        const petalSize = 0.06 + Math.random() * 0.04;

        const petalMat = new THREE.MeshLambertMaterial({ color: palette.petals, side: THREE.DoubleSide });
        for (let i = 0; i < petalCount; i++) {
            const angle = (i / petalCount) * Math.PI * 2;
            const petalGeo = new THREE.PlaneGeometry(petalSize, petalSize * 1.6);
            const petal = new THREE.Mesh(petalGeo, petalMat);
            const dist = petalSize * 0.7;
            petal.position.set(
                Math.cos(angle) * dist,
                stemH + 0.02,
                Math.sin(angle) * dist
            );
            petal.rotation.x = -Math.PI / 2 + 0.35;
            petal.rotation.z = angle;
            group.add(petal);
        }

        // Center pistil
        const centerGeo = new THREE.SphereGeometry(petalSize * 0.55, 6, 5);
        const centerMat = new THREE.MeshLambertMaterial({ color: palette.center });
        const center = new THREE.Mesh(centerGeo, centerMat);
        center.position.y = stemH + 0.03;
        center.scale.y = 0.6;
        group.add(center);

        group.position.set(x, 0, z);
        const scale = 0.8 + Math.random() * 0.5;
        group.scale.setScalar(scale);
        this.scene.add(group);
        this.envObjects.push(group);
    }

    _createGrassTuft(x, z) {
        const group = new THREE.Group();
        const count = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
            const geo = new THREE.PlaneGeometry(0.12, 0.3 + Math.random() * 0.2);
            const green = 0x40 + Math.floor(Math.random() * 0x40);
            const mat = new THREE.MeshLambertMaterial({
                color: new THREE.Color(0x20 / 255, green / 255, 0x20 / 255),
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.85,
            });
            const blade = new THREE.Mesh(geo, mat);
            blade.position.set(
                (Math.random() - 0.5) * 0.15,
                0.15,
                (Math.random() - 0.5) * 0.15
            );
            blade.rotation.y = Math.random() * Math.PI;
            blade.rotation.x = (Math.random() - 0.5) * 0.3;
            group.add(blade);
        }
        group.position.set(x, 0, z);
        this.scene.add(group);
        this.envObjects.push(group);
    }

    _createMushroom(x, z) {
        const group = new THREE.Group();
        // Stem
        const stemGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.25, 5);
        const stemMat = new THREE.MeshLambertMaterial({ color: 0xf0e8d0 });
        const stem = new THREE.Mesh(stemGeo, stemMat);
        stem.position.y = 0.125;
        group.add(stem);
        // Cap
        const isRed = Math.random() > 0.5;
        const capGeo = new THREE.SphereGeometry(0.15, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
        const capMat = new THREE.MeshLambertMaterial({ color: isRed ? 0xd03030 : 0xc0a050 });
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.position.y = 0.25;
        group.add(cap);

        group.position.set(x, 0, z);
        const scale = 0.8 + Math.random() * 0.6;
        group.scale.setScalar(scale);
        this.scene.add(group);
        this.envObjects.push(group);
    }

    // ============ Pebbles ============
    _createPebble(x, z) {
        const size = 0.04 + Math.random() * 0.08;
        const geo = new THREE.SphereGeometry(size, 4, 3);
        const shade = 0x60 + Math.floor(Math.random() * 0x30);
        const mat = new THREE.MeshLambertMaterial({
            color: new THREE.Color(shade / 255, (shade - 0x08) / 255, (shade - 0x10) / 255)
        });
        const peb = new THREE.Mesh(geo, mat);
        peb.position.set(x, size * 0.3, z);
        peb.scale.y = 0.5 + Math.random() * 0.3;
        peb.rotation.set(Math.random(), Math.random(), 0);
        this.scene.add(peb);
        this.envObjects.push(peb);
    }

    // ============ Clover / Ground Cover ============
    _createCloverPatch(x, z) {
        const group = new THREE.Group();
        const count = 3 + Math.floor(Math.random() * 5);
        const patchColors = [0x2a6a2a, 0x3a7a2a, 0x2a5a1a, 0x4a8a3a];
        for (let i = 0; i < count; i++) {
            const cloverGeo = new THREE.CircleGeometry(0.06 + Math.random() * 0.05, 5);
            const color = patchColors[Math.floor(Math.random() * patchColors.length)];
            const cloverMat = new THREE.MeshLambertMaterial({
                color,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.8,
            });
            const clover = new THREE.Mesh(cloverGeo, cloverMat);
            clover.position.set(
                (Math.random() - 0.5) * 0.5,
                0.02,
                (Math.random() - 0.5) * 0.5
            );
            clover.rotation.x = -Math.PI / 2 + (Math.random() - 0.5) * 0.15;
            clover.rotation.z = Math.random() * Math.PI;
            group.add(clover);
        }
        group.position.set(x, 0, z);
        this.scene.add(group);
        this.envObjects.push(group);
    }

    // ============ Fallen Leaves ============
    _createFallenLeaves(x, z) {
        const group = new THREE.Group();
        const count = 2 + Math.floor(Math.random() * 4);
        const leafColors = [0xc07830, 0xa06020, 0xd09040, 0x905020, 0xb86830, 0xe0a050];
        for (let i = 0; i < count; i++) {
            const leafGeo = new THREE.PlaneGeometry(0.1 + Math.random() * 0.1, 0.06 + Math.random() * 0.06);
            const color = leafColors[Math.floor(Math.random() * leafColors.length)];
            const leafMat = new THREE.MeshLambertMaterial({
                color,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.75,
            });
            const leaf = new THREE.Mesh(leafGeo, leafMat);
            leaf.position.set(
                (Math.random() - 0.5) * 0.6,
                0.015,
                (Math.random() - 0.5) * 0.6
            );
            leaf.rotation.x = -Math.PI / 2;
            leaf.rotation.z = Math.random() * Math.PI * 2;
            group.add(leaf);
        }
        group.position.set(x, 0, z);
        this.scene.add(group);
        this.envObjects.push(group);
    }

    // ============ Stepping Stones ============
    _createSteppingStones() {
        // A winding path of flat stones from spawn area outward
        const stonePositions = [
            [0, 3], [0.5, 4.5], [-0.3, 6], [0.2, 7.5], [0.8, 9],
            [1.5, 10.5], [2.5, 11.5], [3.5, 12],
            // Path toward left
            [-1, 3.5], [-2.5, 4], [-4, 4.5], [-5.5, 5.5], [-7, 6],
            // Scattered around field
            [6, 7], [7, 8.5], [8, 6], [-10, 8], [-11, 9.5],
            [5, -6], [6, -7.5], [3, -9], [-6, -8], [-7, -10],
        ];

        const stoneMat = new THREE.MeshLambertMaterial({ color: 0x8a8a7a });
        const stoneMat2 = new THREE.MeshLambertMaterial({ color: 0x7a7a6a });

        stonePositions.forEach(([sx, sz]) => {
            if (!this._isOnLand(sx, sz)) return;
            const w = 0.4 + Math.random() * 0.3;
            const d = 0.3 + Math.random() * 0.2;
            const stoneGeo = new THREE.BoxGeometry(w, 0.06, d);
            const mat = Math.random() > 0.5 ? stoneMat : stoneMat2;
            const stone = new THREE.Mesh(stoneGeo, mat);
            stone.position.set(sx + (Math.random() - 0.5) * 0.3, 0.04, sz + (Math.random() - 0.5) * 0.3);
            stone.rotation.y = Math.random() * Math.PI;
            stone.receiveShadow = true;
            this.scene.add(stone);
            this.envObjects.push(stone);
        });
    }

    _createFence() {
        const fenceMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
        for (let i = -5; i <= 5; i++) {
            // Post
            const postGeo = new THREE.BoxGeometry(0.15, 0.8, 0.15);
            const post = new THREE.Mesh(postGeo, fenceMat);
            post.position.set(-20, 0.4, i * 2);
            post.castShadow = true;
            this.scene.add(post);
            this.envObjects.push(post);
        }
        // Horizontal bars
        for (let i = -5; i < 5; i++) {
            const barGeo = new THREE.BoxGeometry(0.08, 0.08, 1.9);
            const bar = new THREE.Mesh(barGeo, fenceMat);
            bar.position.set(-20, 0.55, i * 2 + 1);
            this.scene.add(bar);
            this.envObjects.push(bar);
            const bar2 = new THREE.Mesh(barGeo.clone(), fenceMat);
            bar2.position.set(-20, 0.25, i * 2 + 1);
            this.scene.add(bar2);
            this.envObjects.push(bar2);
        }
    }

    _createSignpost(x, z) {
        const group = new THREE.Group();
        // Post
        const postGeo = new THREE.BoxGeometry(0.15, 1.5, 0.15);
        const postMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.y = 0.75;
        post.castShadow = true;
        group.add(post);
        // Sign board
        const signGeo = new THREE.BoxGeometry(1.2, 0.5, 0.08);
        const signMat = new THREE.MeshLambertMaterial({ color: 0xa08a5a });
        const sign = new THREE.Mesh(signGeo, signMat);
        sign.position.set(0, 1.3, 0.1);
        group.add(sign);

        group.position.set(x, 0, z);
        this.scene.add(group);
        this.envObjects.push(group);
    }

    // ============ Glast Heim Environment ============
    _createGlastHeimEnvironment(config) {
        // --- Ruined stone pillars ---
        const pillarPositions = [
            [-8, -8], [-8, 8], [8, -8], [8, 8],
            [-14, 0], [14, 0], [0, -14], [0, 14],
            [-10, -4], [10, 4], [-4, 10], [4, -10],
            [-16, -10], [16, 10], [-12, 12], [12, -12],
        ];
        pillarPositions.forEach(([x, z]) => {
            if (!this._isOnLand(x, z)) return;
            const height = 2 + Math.random() * 4;
            const geo = new THREE.CylinderGeometry(
                0.3 + Math.random() * 0.2,
                0.4 + Math.random() * 0.2,
                height, 6
            );
            const mat = new THREE.MeshLambertMaterial({
                color: new THREE.Color(0x2a2035).lerp(new THREE.Color(0x1a1528), Math.random())
            });
            const pillar = new THREE.Mesh(geo, mat);
            pillar.position.set(x, height / 2, z);
            pillar.castShadow = true;
            pillar.receiveShadow = true;
            // Crack/tilt effect
            pillar.rotation.z = (Math.random() - 0.5) * 0.15;
            pillar.rotation.x = (Math.random() - 0.5) * 0.1;
            this.scene.add(pillar);
            this.envObjects.push(pillar);
        });

        // --- Ruined walls ---
        const wallPositions = [
            [-18, -5, 8, 0.5, 3], [18, 5, 8, 0.5, 3],
            [-5, -18, 0.5, 8, 3], [5, 18, 0.5, 8, 3],
            [-12, -12, 5, 0.5, 2.5], [12, 12, 5, 0.5, 2.5],
        ];
        wallPositions.forEach(([x, z, w, d, h]) => {
            const geo = new THREE.BoxGeometry(w, h, d);
            const mat = new THREE.MeshLambertMaterial({ color: 0x1e1830 });
            const wall = new THREE.Mesh(geo, mat);
            wall.position.set(x, h / 2, z);
            wall.castShadow = true;
            wall.receiveShadow = true;
            this.scene.add(wall);
            this.envObjects.push(wall);
        });

        // --- Dead trees ---
        const deadTreePositions = [
            [-12, -10], [-15, 2], [10, -12], [13, 7],
            [16, -6], [-17, -4], [-10, -16], [14, 13],
            [-17, 10], [7, -17], [-5, -14], [17, -14],
        ];
        deadTreePositions.forEach(([x, z]) => {
            if (this._isOnLand(x, z)) this._createTree(x, z, 'dead');
        });

        // --- Glowing purple mushrooms ---
        for (let i = 0; i < 30; i++) {
            const x = (Math.random() - 0.5) * 40;
            const z = (Math.random() - 0.5) * 40;
            if (!this._isOnLand(x, z)) continue;
            this._createGlowMushroom(x, z, 0xaa40ff);
        }

        // --- Scattered bones/debris ---
        for (let i = 0; i < 50; i++) {
            const x = (Math.random() - 0.5) * 44;
            const z = (Math.random() - 0.5) * 44;
            if (!this._isOnLand(x, z)) continue;
            this._createPebble(x, z);
        }

        // --- Eerie fog lights ---
        const fogLightPositions = [
            [-10, -10], [10, 10], [-10, 10], [10, -10], [0, 0]
        ];
        fogLightPositions.forEach(([x, z]) => {
            const light = new THREE.PointLight(0x6020a0, 0.6, 12);
            light.position.set(x, 1.5, z);
            this.scene.add(light);
            this.envObjects.push(light);
        });
    }

    // ============ Mjolnir Mountains Environment ============
    _createMjolnirEnvironment(config) {
        // --- Large mountain boulders ---
        const boulderPositions = [
            [-10, -8, 2.5], [-6, -14, 2.0], [8, -10, 3.0], [12, -6, 1.8],
            [-14, 4, 2.2], [14, 6, 2.8], [-8, 12, 2.0], [6, 14, 2.5],
            [-16, -2, 3.5], [16, 2, 3.0], [0, -16, 2.0], [0, 16, 2.2],
            [-12, 8, 1.5], [10, -14, 1.8], [-4, -18, 2.0], [4, 18, 1.6],
        ];
        boulderPositions.forEach(([x, z, scale]) => {
            if (!this._isOnLand(x, z)) return;
            const geo = new THREE.DodecahedronGeometry(scale, 0);
            const shade = 0x60 + Math.floor(Math.random() * 0x20);
            const mat = new THREE.MeshLambertMaterial({
                color: new THREE.Color(shade / 255, (shade - 0x08) / 255, (shade - 0x10) / 255)
            });
            const boulder = new THREE.Mesh(geo, mat);
            boulder.position.set(x, scale * 0.5, z);
            boulder.rotation.set(Math.random(), Math.random(), Math.random());
            boulder.castShadow = true;
            boulder.receiveShadow = true;
            this.scene.add(boulder);
            this.envObjects.push(boulder);
        });

        // --- Pine trees ---
        const pinePositions = [
            [-12, -10], [-15, 2], [10, -12], [13, 7], [-8, 14],
            [16, -6], [-17, -4], [6, 16], [-10, -16], [14, 13],
        ];
        pinePositions.forEach(([x, z]) => {
            if (this._isOnLand(x, z)) this._createTree(x, z, 'pine');
        });

        // --- Snow patches ---
        for (let i = 0; i < 60; i++) {
            const x = (Math.random() - 0.5) * 44;
            const z = (Math.random() - 0.5) * 44;
            if (!this._isOnLand(x, z)) continue;
            const snowGeo = new THREE.CircleGeometry(0.3 + Math.random() * 0.5, 6);
            const snowMat = new THREE.MeshLambertMaterial({
                color: 0xe8f0ff,
                transparent: true,
                opacity: 0.7,
            });
            const snow = new THREE.Mesh(snowGeo, snowMat);
            snow.rotation.x = -Math.PI / 2;
            snow.position.set(x, 0.02, z);
            this.scene.add(snow);
            this.envObjects.push(snow);
        }

        // --- Rocky debris ---
        for (let i = 0; i < 80; i++) {
            const x = (Math.random() - 0.5) * 46;
            const z = (Math.random() - 0.5) * 46;
            if (!this._isOnLand(x, z)) continue;
            this._createPebble(x, z);
        }

        // --- Mountain atmosphere lights ---
        const atmLights = [
            [-15, -15], [15, 15], [-15, 15], [15, -15]
        ];
        atmLights.forEach(([x, z]) => {
            const light = new THREE.PointLight(0xc0d0ff, 0.4, 20);
            light.position.set(x, 5, z);
            this.scene.add(light);
            this.envObjects.push(light);
        });
    }

    // ============ Abyss Lake Environment ============
    _createAbyssLakeEnvironment(config) {
        // --- Ancient stone formations ---
        const stonePositions = [
            [-8, -8], [-8, 8], [8, -8], [8, 8],
            [-14, 0], [14, 0], [0, -14], [0, 14],
            [-10, -4], [10, 4], [-4, 10], [4, -10],
        ];
        stonePositions.forEach(([x, z]) => {
            if (!this._isOnLand(x, z)) return;
            const height = 1.5 + Math.random() * 3;
            const geo = new THREE.CylinderGeometry(
                0.2 + Math.random() * 0.3,
                0.5 + Math.random() * 0.3,
                height, 5
            );
            const mat = new THREE.MeshLambertMaterial({ color: 0x0a1020 });
            const stone = new THREE.Mesh(geo, mat);
            stone.position.set(x, height / 2, z);
            stone.castShadow = true;
            this.scene.add(stone);
            this.envObjects.push(stone);
        });

        // --- Glowing blue crystals ---
        for (let i = 0; i < 40; i++) {
            const x = (Math.random() - 0.5) * 42;
            const z = (Math.random() - 0.5) * 42;
            if (!this._isOnLand(x, z)) continue;
            this._createGlowMushroom(x, z, 0x2060ff);
        }

        // --- Abyss coral/kelp formations ---
        for (let i = 0; i < 25; i++) {
            const x = (Math.random() - 0.5) * 38;
            const z = (Math.random() - 0.5) * 38;
            if (!this._isOnLand(x, z)) continue;
            const h = 0.5 + Math.random() * 1.5;
            const geo = new THREE.CylinderGeometry(0.05, 0.1, h, 4);
            const mat = new THREE.MeshLambertMaterial({ color: 0x102040 });
            const coral = new THREE.Mesh(geo, mat);
            coral.position.set(x, h / 2, z);
            coral.rotation.z = (Math.random() - 0.5) * 0.5;
            this.scene.add(coral);
            this.envObjects.push(coral);
        }

        // --- Scattered debris ---
        for (let i = 0; i < 60; i++) {
            const x = (Math.random() - 0.5) * 44;
            const z = (Math.random() - 0.5) * 44;
            if (!this._isOnLand(x, z)) continue;
            this._createPebble(x, z);
        }

        // --- Deep abyss glow lights ---
        const abyssLights = [
            [0, 0, 0x1030a0],
            [-12, -12, 0x0020a0],
            [12, 12, 0x0020a0],
            [-12, 12, 0x102080],
            [12, -12, 0x102080],
        ];
        abyssLights.forEach(([x, z, color]) => {
            const light = new THREE.PointLight(color, 0.8, 15);
            light.position.set(x, 0.5, z);
            this.scene.add(light);
            this.envObjects.push(light);
        });
    }

    // ============ Glow Mushroom Helper ============
    _createGlowMushroom(x, z, color = 0xaa40ff) {
        const group = new THREE.Group();
        const stemGeo = new THREE.CylinderGeometry(0.05, 0.08, 0.3, 5);
        const stemMat = new THREE.MeshLambertMaterial({ color: 0x201828 });
        const stem = new THREE.Mesh(stemGeo, stemMat);
        stem.position.y = 0.15;
        group.add(stem);

        const capGeo = new THREE.SphereGeometry(0.18, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
        const capMat = new THREE.MeshBasicMaterial({ color });
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.position.y = 0.3;
        group.add(cap);

        // Glow light
        const glowLight = new THREE.PointLight(color, 0.4, 3);
        glowLight.position.set(0, 0.4, 0);
        group.add(glowLight);

        group.position.set(x, 0, z);
        const scale = 0.7 + Math.random() * 0.8;
        group.scale.setScalar(scale);
        this.scene.add(group);
        this.envObjects.push(group);
    }

    // ============ Svarrga (Heaven city) environment + ore nodes ============
    _createSvarrgaEnvironment(config) {
        this.oreNodes = this.oreNodes || [];

        // Fluffy cloud puffs floating around at various heights.
        const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
        for (let i = 0; i < 26; i++) {
            const cloud = new THREE.Group();
            const puffs = 3 + Math.floor(Math.random() * 3);
            for (let j = 0; j < puffs; j++) {
                const r = 1.2 + Math.random() * 1.8;
                const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), cloudMat);
                puff.position.set((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 3);
                puff.scale.y = 0.6;
                cloud.add(puff);
            }
            const ang = Math.random() * Math.PI * 2;
            const rad = 8 + Math.random() * 24;
            cloud.position.set(Math.cos(ang) * rad, 3 + Math.random() * 9, Math.sin(ang) * rad);
            cloud.userData.driftPhase = Math.random() * Math.PI * 2;
            cloud.userData.baseX = cloud.position.x;
            this.scene.add(cloud);
            this.envObjects.push(cloud);
        }

        // Golden glowing spires around the rim to frame the heavenly city.
        const spireMat = new THREE.MeshLambertMaterial({ color: 0xf3e0a0, emissive: 0xffcf4a, emissiveIntensity: 0.35 });
        const capMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
        for (let i = 0; i < 10; i++) {
            const ang = (i / 10) * Math.PI * 2;
            const rad = 30;
            const spire = new THREE.Group();
            const h = 6 + Math.random() * 4;
            const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, h, 8), spireMat);
            shaft.position.y = h / 2;
            shaft.castShadow = true;
            spire.add(shaft);
            const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.9), capMat);
            cap.position.y = h + 0.6;
            spire.add(cap);
            spire.position.set(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
            this.scene.add(spire);
            this.envObjects.push(spire);
        }

        // Central golden altar so the city has a clear focal landmark.
        const altar = new THREE.Group();
        const steps = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 0.8, 24), new THREE.MeshLambertMaterial({ color: 0xf0e6c0 }));
        steps.position.y = 0.4; steps.receiveShadow = true; altar.add(steps);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.2, 12, 32), new THREE.MeshBasicMaterial({ color: 0xffcf4a }));
        ring.rotation.x = Math.PI / 2; ring.position.y = 3.2; altar.add(ring);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 8, 24, 1, true),
            new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
        beam.position.y = 4.8; altar.add(beam);
        altar.position.set(0, 0, 0);
        this.scene.add(altar);
        this.envObjects.push(altar);

        // ---- Heaven Merchant NPC (sells the pickaxe, converts ore -> ZOL) ----
        const merchant = new THREE.Group();
        const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.95, 1.9, 12), new THREE.MeshLambertMaterial({ color: 0xf7eed6 }));
        robe.position.y = 0.95; robe.castShadow = true; merchant.add(robe);
        const sash = new THREE.Mesh(new THREE.CylinderGeometry(0.53, 0.74, 0.42, 12), new THREE.MeshLambertMaterial({ color: 0xffcf4a }));
        sash.position.y = 1.35; merchant.add(sash);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), new THREE.MeshLambertMaterial({ color: 0xffe0bd }));
        head.position.y = 2.15; merchant.add(head);
        const halo = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 24), new THREE.MeshBasicMaterial({ color: 0xffe14a }));
        halo.rotation.x = Math.PI / 2; halo.position.y = 2.78; merchant.add(halo);
        const label = this._makePortalLabel('พ่อค้าสวรรค์', new THREE.Color(0xffe14a), '⛏️ ร้านค้าพิเศษ');
        label.position.set(0, 3.7, 0); label.scale.set(4.2, 1.31, 1);
        merchant.add(label);
        merchant.userData.npcType = 'heaven_merchant';
        merchant.position.set(0, 0, 4);
        merchant.rotation.y = Math.PI; // face the player arriving from the portal
        this.scene.add(merchant);
        this.envObjects.push(merchant);
        this.npcHeavenMesh = merchant;

        // ---- Celestial Ore nodes (minable) ----
        const oreCount = 9;
        for (let i = 0; i < oreCount; i++) {
            const ang = (i / oreCount) * Math.PI * 2 + 0.3;
            const rad = 12 + (i % 3) * 6;
            const x = Math.cos(ang) * rad;
            const z = Math.sin(ang) * rad;
            const node = this._makeOreNode();
            node.position.set(x, 0, z);
            this.scene.add(node);
            this.envObjects.push(node);
            this.oreNodes.push(node);
        }
    }

    // A cluster of glowing crystals that the player mines for Celestial Ore.
    _makeOreNode() {
        const group = new THREE.Group();
        // rocky base
        const base = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1),
            new THREE.MeshLambertMaterial({ color: 0x8fa8c8 }));
        base.position.y = 0.5; base.castShadow = true;
        group.add(base);
        // glowing crystals
        const crystalMat = new THREE.MeshBasicMaterial({ color: 0x7fe0ff });
        const crystals = [];
        for (let i = 0; i < 4; i++) {
            const c = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.1 + Math.random() * 0.6, 5), crystalMat);
            const a = Math.random() * Math.PI * 2;
            c.position.set(Math.cos(a) * 0.5, 0.9 + Math.random() * 0.3, Math.sin(a) * 0.5);
            c.rotation.z = (Math.random() - 0.5) * 0.5;
            c.rotation.x = (Math.random() - 0.5) * 0.5;
            group.add(c);
            crystals.push(c);
        }
        const glow = new THREE.PointLight(0x7fe0ff, 1.0, 6);
        glow.position.y = 1.2;
        group.add(glow);
        group.userData = { isOre: true, oreType: 'Celestial Ore', mined: false, respawnAt: 0, crystals, glow, base };
        return group;
    }

    // ============ Portals ============
    _createPortals(mapId) {
        // Portal color by destination tier
        const PORTAL_COLORS = {
            prontera: 0x40c0ff,   // Cyan — starter
            payon: 0x60ff80,   // Green — forest
            glast_heim: 0xc040ff, // Purple — ruins
            mjolnir: 0xffa040,   // Orange — mountains
            abyss_lake: 0x2060ff, // Deep Blue — abyss
            svarrga: 0xffe14a,   // Gold — heaven
        };

        const PORTAL_MAP = {
            prontera: [{ x: 25, z: -5, target: 'payon' }, { x: -25, z: 5, target: 'glast_heim' }, { x: -25, z: -22, target: 'svarrga' }],
            payon: [{ x: -25, z: 0, target: 'prontera' }, { x: 25, z: 0, target: 'mjolnir' }],
            glast_heim: [{ x: 25, z: 0, target: 'prontera' }, { x: -25, z: 0, target: 'abyss_lake' }],
            mjolnir: [{ x: -25, z: 0, target: 'payon' }, { x: 25, z: 0, target: 'abyss_lake' }],
            abyss_lake: [{ x: 25, z: 0, target: 'glast_heim' }, { x: -25, z: 0, target: 'mjolnir' }],
            svarrga: [{ x: -25, z: 0, target: 'prontera' }],
        };

        const portalPositions = PORTAL_MAP[mapId] || [{ x: 25, z: 0, target: 'prontera' }];

        portalPositions.forEach(p => {
            const group = new THREE.Group();
            group.userData.targetMap = p.target;

            const portalColor = PORTAL_COLORS[p.target] || 0x40c0ff;
            const colorObj = new THREE.Color(portalColor);
            const destConfig = MAP_CONFIGS[p.target];
            const destName = destConfig ? destConfig.name : p.target;
            group.userData.destName = destName;

            const anim = { runes: [], motes: [] };

            // ---- Ground magic circle (flat glowing rune ring on the floor) ----
            const baseMat = new THREE.MeshBasicMaterial({
                color: portalColor, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending, depthWrite: false,
            });
            const baseCircle = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.4, 40), baseMat);
            baseCircle.rotation.x = -Math.PI / 2;
            baseCircle.position.y = 0.06;
            group.add(baseCircle);
            anim.baseCircle = baseCircle;

            // ---- Upright swirling energy vortex (inside the ring) ----
            const swirlMat = new THREE.MeshBasicMaterial({
                map: this._makePortalSwirlTexture(colorObj), transparent: true, opacity: 0.9,
                side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
            });
            const swirl = new THREE.Mesh(new THREE.CircleGeometry(1.55, 40), swirlMat);
            swirl.position.y = 2.4;
            group.add(swirl);
            anim.swirl = swirl;

            // ---- Upright glowing doorway ring + faint outer halo ----
            const ring = new THREE.Mesh(new THREE.TorusGeometry(1.65, 0.16, 14, 44),
                new THREE.MeshBasicMaterial({ color: portalColor }));
            ring.position.y = 2.4;
            group.add(ring);
            anim.ring = ring;

            const halo = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.32, 12, 44),
                new THREE.MeshBasicMaterial({ color: portalColor, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
            halo.position.y = 2.4;
            group.add(halo);
            anim.halo = halo;

            // ---- Stone arch: two pillars, glowing runes, top keystone beam ----
            const stoneMat = new THREE.MeshLambertMaterial({ color: 0x6a6f86 });
            [-1.95, 1.95].forEach(xOff => {
                const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.8, 0.5), stoneMat);
                pillar.position.set(xOff, 2.4, 0);
                pillar.castShadow = true;
                group.add(pillar);
                const rune = new THREE.Mesh(new THREE.BoxGeometry(0.09, 3.6, 0.56),
                    new THREE.MeshBasicMaterial({ color: portalColor, transparent: true, opacity: 0.8 }));
                rune.position.set(xOff + (xOff < 0 ? 0.29 : -0.29), 2.5, 0);
                group.add(rune);
                anim.runes.push(rune);
            });
            const topBeam = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.6, 0.6), stoneMat);
            topBeam.position.set(0, 4.95, 0);
            topBeam.castShadow = true;
            group.add(topBeam);

            // ---- Rising energy motes ----
            for (let i = 0; i < 6; i++) {
                const mote = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6),
                    new THREE.MeshBasicMaterial({ color: portalColor, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
                mote.userData.phase = Math.random();
                mote.userData.rx = (Math.random() - 0.5) * 2.6;
                group.add(mote);
                anim.motes.push(mote);
            }

            // ---- Portal light ----
            const light = new THREE.PointLight(portalColor, 1.1, 13);
            light.position.set(0, 2.4, 0);
            group.add(light);
            anim.light = light;

            // ---- Floating destination label (billboard, always readable) ----
            const label = this._makePortalLabel(destName, colorObj);
            label.position.set(0, 6.2, 0);
            group.add(label);
            anim.label = label;

            // Face the doorway toward the field centre (portals sit at ±25 on x).
            group.rotation.y = p.x >= 0 ? -Math.PI / 2 : Math.PI / 2;
            group.position.set(p.x, 0, p.z);
            group.userData.anim = anim;
            this.scene.add(group);
            this.envObjects.push(group);
            this.portalMeshes.push(group);
        });
    }

    // Radial energy-vortex texture for the portal's inner plane.
    _makePortalSwirlTexture(color) {
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        const ctx = c.getContext('2d');
        const cx = 128, cy = 128;
        const r = Math.round(color.r * 255), g = Math.round(color.g * 255), b = Math.round(color.b * 255);
        const rgba = (a) => `rgba(${r},${g},${b},${a})`;
        const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 128);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.3, rgba(0.95));
        grad.addColorStop(0.72, rgba(0.32));
        grad.addColorStop(1, rgba(0));
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(cx, cy, 128, 0, Math.PI * 2); ctx.fill();
        // spiral streaks for a swirling look
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            for (let a = 0; a < Math.PI * 4; a += 0.15) {
                const rr = a * 8.5;
                const x = cx + Math.cos(a + i * 1.256) * rr;
                const y = cy + Math.sin(a + i * 1.256) * rr;
                a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
        const tex = new THREE.CanvasTexture(c);
        tex.minFilter = THREE.LinearFilter;
        return tex;
    }

    // Billboard label above the portal: "◈ วาปไป ◈" + destination name.
    _makePortalLabel(text, color, header = '◈ วาปไป ◈') {
        const c = document.createElement('canvas');
        c.width = 512; c.height = 160;
        const ctx = c.getContext('2d');
        const hex = '#' + color.getHexString();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        // header
        ctx.font = '700 26px "Baloo 2","Fredoka One",system-ui,sans-serif';
        ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(header, 256, 34);
        ctx.fillStyle = hex;
        ctx.fillText(header, 256, 34);
        // destination name (white with coloured glow + dark outline)
        ctx.font = '700 58px "Fredoka One","Baloo 2",system-ui,sans-serif';
        ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(0,0,0,0.9)';
        ctx.strokeText(text, 256, 100);
        ctx.shadowColor = hex; ctx.shadowBlur = 30;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, 256, 100);
        ctx.fillText(text, 256, 100); // second pass to intensify the glow
        ctx.shadowBlur = 0;
        const tex = new THREE.CanvasTexture(c);
        tex.minFilter = THREE.LinearFilter;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: tex, transparent: true, depthTest: false, depthWrite: false,
        }));
        sprite.scale.set(5.2, 1.625, 1); // 512:160 aspect
        sprite.renderOrder = 999;
        return sprite;
    }

    // ============ NPC — Kafra Shop Stall ============
    _createNPC() {
        const group = new THREE.Group();
        group.userData.isNPC = true;
        group.userData.npcType = 'shop';

        const woodDark = new THREE.MeshLambertMaterial({ color: 0x5a3a1a });
        const woodLight = new THREE.MeshLambertMaterial({ color: 0x8a6a3a });
        const woodPlank = new THREE.MeshLambertMaterial({ color: 0x9a7a4a });
        const roofTile = new THREE.MeshPhongMaterial({
            map: this._roofTileTexture,
            shininess: 35,
            specular: 0x331111
        });
        const roofTrim = new THREE.MeshLambertMaterial({ color: 0x6a1818 });
        const clothRed = new THREE.MeshLambertMaterial({ color: 0xc03030 });

        // ---- Platform base ----
        const platformGeo = new THREE.BoxGeometry(4.5, 0.18, 3.5);
        const platform = new THREE.Mesh(platformGeo, woodPlank);
        platform.position.y = 0.09;
        platform.castShadow = true;
        platform.receiveShadow = true;
        group.add(platform);

        // Platform edge trim
        const trimGeo = new THREE.BoxGeometry(4.6, 0.06, 3.6);
        const trim = new THREE.Mesh(trimGeo, woodDark);
        trim.position.y = 0.2;
        group.add(trim);

        // ---- 4 Corner posts ----
        const postGeo = new THREE.CylinderGeometry(0.1, 0.12, 3.2, 6);
        const postPositions = [
            [-2.0, 1.8, -1.5],
            [2.0, 1.8, -1.5],
            [-2.0, 1.8, 1.5],
            [2.0, 1.8, 1.5],
        ];
        postPositions.forEach(([px, py, pz]) => {
            const post = new THREE.Mesh(postGeo, woodDark);
            post.position.set(px, py, pz);
            post.castShadow = true;
            group.add(post);
        });

        // ---- Sloped roof ----
        // Main roof slab (slightly tilted forward for charm)
        const roofGeo = new THREE.BoxGeometry(5.2, 0.15, 4.2);
        const roof = new THREE.Mesh(roofGeo, roofTile);
        roof.position.set(0, 3.5, 0.1);
        roof.rotation.x = -0.08; // slight forward tilt
        roof.castShadow = true;
        group.add(roof);

        // Roof ridge beam
        const ridgeGeo = new THREE.BoxGeometry(5.4, 0.12, 0.2);
        const ridge = new THREE.Mesh(ridgeGeo, roofTrim);
        ridge.position.set(0, 3.6, 0);
        group.add(ridge);

        // Roof overhang trim (front & back decorative strip)
        const overhangGeo = new THREE.BoxGeometry(5.2, 0.08, 0.15);
        const overhangFront = new THREE.Mesh(overhangGeo, roofTrim);
        overhangFront.position.set(0, 3.45, 2.15);
        group.add(overhangFront);
        const overhangBack = new THREE.Mesh(overhangGeo, roofTrim);
        overhangBack.position.set(0, 3.45, -2.0);
        group.add(overhangBack);

        // ---- Awning / cloth banner (front) ----
        const awningGeo = new THREE.PlaneGeometry(3.6, 0.7);
        const awning = new THREE.Mesh(awningGeo, clothRed);
        awning.position.set(0, 3.1, 1.55);
        awning.rotation.x = -0.3;
        group.add(awning);

        // ---- Counter desk (front-facing) ----
        const counterGeo = new THREE.BoxGeometry(3.6, 0.9, 0.6);
        const counter = new THREE.Mesh(counterGeo, woodLight);
        counter.position.set(0, 0.65, 1.2);
        counter.castShadow = true;
        group.add(counter);

        // Counter top surface
        const counterTopGeo = new THREE.BoxGeometry(3.8, 0.06, 0.8);
        const counterTop = new THREE.Mesh(counterTopGeo, woodPlank);
        counterTop.position.set(0, 1.13, 1.2);
        group.add(counterTop);

        // ---- Back wall (half-height for cozy feel) ----
        const backWallGeo = new THREE.BoxGeometry(4.3, 2.0, 0.1);
        const backWallMat = new THREE.MeshLambertMaterial({ color: 0x9a8060 });
        const backWall = new THREE.Mesh(backWallGeo, backWallMat);
        backWall.position.set(0, 1.2, -1.5);
        group.add(backWall);

        // ---- Side panels (left & right, partial) ----
        const sidePanelGeo = new THREE.BoxGeometry(0.1, 2.0, 2.8);
        const sidePanelMat = new THREE.MeshLambertMaterial({ color: 0x8a7050 });
        const leftPanel = new THREE.Mesh(sidePanelGeo, sidePanelMat);
        leftPanel.position.set(-2.15, 1.2, 0);
        group.add(leftPanel);
        const rightPanel = new THREE.Mesh(sidePanelGeo, sidePanelMat);
        rightPanel.position.set(2.15, 1.2, 0);
        group.add(rightPanel);

        // ---- Decorative props ----
        // Barrel (right side)
        const barrelGeo = new THREE.CylinderGeometry(0.35, 0.38, 0.9, 8);
        const barrelMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
        const barrel = new THREE.Mesh(barrelGeo, barrelMat);
        barrel.position.set(1.6, 0.65, -0.6);
        barrel.castShadow = true;
        group.add(barrel);

        // Barrel ring trim
        const ringGeo = new THREE.TorusGeometry(0.36, 0.025, 6, 12);
        const ringMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
        const ring1 = new THREE.Mesh(ringGeo, ringMat);
        ring1.position.set(1.6, 0.45, -0.6);
        ring1.rotation.x = Math.PI / 2;
        group.add(ring1);
        const ring2 = new THREE.Mesh(ringGeo, ringMat);
        ring2.position.set(1.6, 0.85, -0.6);
        ring2.rotation.x = Math.PI / 2;
        group.add(ring2);

        // Crate (left side)
        const crateGeo = new THREE.BoxGeometry(0.7, 0.6, 0.7);
        const crateMat = new THREE.MeshLambertMaterial({ color: 0x7a5a2a });
        const crate = new THREE.Mesh(crateGeo, crateMat);
        crate.position.set(-1.5, 0.5, -0.5);
        crate.rotation.y = 0.25;
        crate.castShadow = true;
        group.add(crate);

        // Small crate on top
        const smallCrateGeo = new THREE.BoxGeometry(0.45, 0.4, 0.45);
        const smallCrate = new THREE.Mesh(smallCrateGeo, crateMat);
        smallCrate.position.set(-1.4, 1.0, -0.4);
        smallCrate.rotation.y = -0.4;
        group.add(smallCrate);

        // ---- Hanging Lantern ----
        // Lantern arm (from front post)
        const armGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.8, 4);
        const arm = new THREE.Mesh(armGeo, woodDark);
        arm.position.set(1.6, 3.0, 1.5);
        arm.rotation.z = Math.PI / 2;
        group.add(arm);

        // Lantern body
        const lanternGeo = new THREE.BoxGeometry(0.2, 0.3, 0.2);
        const lanternMat = new THREE.MeshBasicMaterial({ color: 0xffe080 });
        const lantern = new THREE.Mesh(lanternGeo, lanternMat);
        lantern.position.set(1.2, 2.75, 1.5);
        group.add(lantern);

        // Lantern warm glow
        const lanternLight = new THREE.PointLight(0xffcc66, 1.2, 8);
        lanternLight.position.set(1.2, 2.6, 1.5);
        group.add(lanternLight);

        // ---- Merchant character (behind counter) ----
        const merchantGroup = new THREE.Group();

        // Merchant body (apron style - wider torso)
        const mBodyGeo = new THREE.BoxGeometry(0.55, 0.75, 0.35);
        const mBodyMat = new THREE.MeshLambertMaterial({ color: 0xd4a050 }); // warm vest
        const mBody = new THREE.Mesh(mBodyGeo, mBodyMat);
        mBody.position.y = 1.0;
        mBody.castShadow = true;
        merchantGroup.add(mBody);

        // White apron overlay
        const apronGeo = new THREE.BoxGeometry(0.48, 0.55, 0.02);
        const apronMat = new THREE.MeshLambertMaterial({ color: 0xf0e8d0 });
        const apron = new THREE.Mesh(apronGeo, apronMat);
        apron.position.set(0, 0.9, 0.18);
        merchantGroup.add(apron);

        // Merchant head
        const mHeadGeo = new THREE.BoxGeometry(0.42, 0.42, 0.42);
        const mHeadMat = new THREE.MeshLambertMaterial({ color: 0xf5d0a0 });
        const mHead = new THREE.Mesh(mHeadGeo, mHeadMat);
        mHead.position.y = 1.62;
        mHead.castShadow = true;
        merchantGroup.add(mHead);

        // Merchant eyes
        const mEyeGeo = new THREE.BoxGeometry(0.07, 0.07, 0.04);
        const mEyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const mEyeL = new THREE.Mesh(mEyeGeo, mEyeMat);
        mEyeL.position.set(-0.1, 1.65, 0.22);
        merchantGroup.add(mEyeL);
        const mEyeR = new THREE.Mesh(mEyeGeo, mEyeMat);
        mEyeR.position.set(0.1, 1.65, 0.22);
        merchantGroup.add(mEyeR);

        // Merchant hat (merchant cap / beret)
        const mHatGeo = new THREE.CylinderGeometry(0.28, 0.32, 0.2, 8);
        const mHatMat = new THREE.MeshLambertMaterial({ color: 0x8a3030 });
        const mHat = new THREE.Mesh(mHatGeo, mHatMat);
        mHat.position.y = 1.9;
        merchantGroup.add(mHat);

        // Hat brim
        const brimGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.04, 8);
        const brim = new THREE.Mesh(brimGeo, mHatMat);
        brim.position.y = 1.82;
        merchantGroup.add(brim);

        // Merchant arms
        const mArmGeo = new THREE.BoxGeometry(0.18, 0.5, 0.18);
        const mArmMat = new THREE.MeshLambertMaterial({ color: 0xd4a050 });
        const mArmL = new THREE.Mesh(mArmGeo, mArmMat);
        mArmL.position.set(-0.4, 0.95, 0);
        merchantGroup.add(mArmL);
        const mArmR = new THREE.Mesh(mArmGeo, mArmMat);
        mArmR.position.set(0.4, 0.95, 0);
        merchantGroup.add(mArmR);

        // Merchant legs
        const mLegGeo = new THREE.BoxGeometry(0.2, 0.45, 0.22);
        const mLegMat = new THREE.MeshLambertMaterial({ color: 0x3a3a5a });
        const mLegL = new THREE.Mesh(mLegGeo, mLegMat);
        mLegL.position.set(-0.14, 0.4, 0);
        merchantGroup.add(mLegL);
        const mLegR = new THREE.Mesh(mLegGeo, mLegMat);
        mLegR.position.set(0.14, 0.4, 0);
        merchantGroup.add(mLegR);

        // Position merchant behind counter, facing forward
        merchantGroup.position.set(0, 0.18, 0.5);
        merchantGroup.rotation.y = 0; // facing +Z (toward player)
        group.add(merchantGroup);

        // ---- Floating shop name tag ----
        const canvas = document.createElement('canvas');
        canvas.width = 1024; // Double resolution for better clarity and overflow protection
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        // Background
        ctx.fillStyle = 'rgba(40, 20, 10, 0.7)';
        ctx.roundRect(128, 16, 768, 96, 24);
        ctx.fill();
        // Border
        ctx.strokeStyle = '#c8a050';
        ctx.lineWidth = 6;
        ctx.roundRect(128, 16, 768, 96, 24);
        ctx.stroke();
        // Text
        ctx.font = 'bold 48px "Helvetica Neue", Helvetica, Arial, sans-serif';
        ctx.textAlign = 'left'; // Use left alignment and manual offset for more control in Safari
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffd040';
        // Manually center by measuring or using a safe offset
        // '🏪 ร้านค้า' is approx 240px wide at 48px font. 
        // Canvas is 1024, center is 512. 512 - 120 = 392.
        ctx.fillText('🏪 ร้านค้า', 410, 64);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const nameTag = new THREE.Sprite(spriteMat);
        nameTag.position.y = 4.4;
        nameTag.scale.set(5.0, 0.625, 1); // Adjusted scale for wider canvas
        group.add(nameTag);

        // ---- Position the entire shop on dry land ----
        group.position.set(-8, 0, 5);
        this.scene.add(group);
        this.envObjects.push(group);
        this.npcMesh = group;
    }

    // ---- Weapon Smith: a blacksmith stall that opens the equipment shop ----
    _createWeaponSmithNPC() {
        const group = new THREE.Group();
        group.userData.isNPC = true;
        group.userData.npcType = 'weaponsmith';

        const stone = new THREE.MeshLambertMaterial({ color: 0x5c5c66 });
        const darkStone = new THREE.MeshLambertMaterial({ color: 0x3a3a42 });
        const iron = new THREE.MeshLambertMaterial({ color: 0x2e2e34 });
        const wood = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });

        // ---- Stone platform ----
        const base = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.16, 3.2), new THREE.MeshLambertMaterial({ color: 0x6b6b60 }));
        base.position.y = 0.08; base.receiveShadow = true;
        group.add(base);

        // ---- Forge furnace (stone block with glowing coals) ----
        const furnace = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.3, 1.2), stone);
        furnace.position.set(-1.1, 0.75, -0.7); furnace.castShadow = true;
        group.add(furnace);
        // Furnace mouth
        const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.2), darkStone);
        mouth.position.set(-1.1, 0.7, 0.0);
        group.add(mouth);
        // Glowing coals
        const coals = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.15), new THREE.MeshBasicMaterial({ color: 0xff6a1a }));
        coals.position.set(-1.1, 0.6, 0.02);
        group.add(coals);
        const forgeGlow = new THREE.PointLight(0xff7a2a, 1.6, 7);
        forgeGlow.position.set(-1.1, 0.8, 0.4);
        group.add(forgeGlow);
        // Chimney
        const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 1.4, 6), darkStone);
        chimney.position.set(-1.1, 2.1, -0.7); chimney.castShadow = true;
        group.add(chimney);

        // ---- Anvil ----
        const anvilBase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.5, 6), wood);
        anvilBase.position.set(0.6, 0.35, 0.4); anvilBase.castShadow = true;
        group.add(anvilBase);
        const anvilTop = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.32), iron);
        anvilTop.position.set(0.6, 0.7, 0.4); anvilTop.castShadow = true;
        group.add(anvilTop);
        const anvilHorn = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 6), iron);
        anvilHorn.position.set(1.05, 0.72, 0.4); anvilHorn.rotation.z = -Math.PI / 2;
        group.add(anvilHorn);
        // A glowing sword being forged on the anvil
        const forgeBlade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.03), new THREE.MeshLambertMaterial({ color: 0xff8844, emissive: new THREE.Color(0xff5511), emissiveIntensity: 0.7 }));
        forgeBlade.position.set(0.55, 0.9, 0.4); forgeBlade.rotation.z = 0.3;
        group.add(forgeBlade);

        // ---- Weapon rack (behind, with a few blades on display) ----
        const rack = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.25), wood);
        rack.position.set(1.0, 1.7, -1.35);
        group.add(rack);
        const rackLegGeo = new THREE.BoxGeometry(0.1, 1.7, 0.1);
        [0.1, 1.9].forEach(x => {
            const leg = new THREE.Mesh(rackLegGeo, wood);
            leg.position.set(x, 0.85, -1.35); leg.castShadow = true;
            group.add(leg);
        });
        const rackColors = [0xd0d0dc, 0xffd23a, 0x88ccff];
        rackColors.forEach((c, i) => {
            const disp = new THREE.Group();
            const bl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.03), new THREE.MeshLambertMaterial({ color: c }));
            bl.position.y = 0.45; bl.castShadow = true; disp.add(bl);
            const gd = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.08), new THREE.MeshLambertMaterial({ color: 0x8a6a3a }));
            disp.add(gd);
            disp.position.set(0.4 + i * 0.6, 1.15, -1.3);
            group.add(disp);
        });

        // ---- Blacksmith figure ----
        const smith = new THREE.Group();
        smith.add(this._boxMesh(0.6, 0.8, 0.4, 0x6a4030, 0, 1.0, 0));           // torso (leather)
        const apron = this._boxMesh(0.5, 0.6, 0.02, 0x2a2a2a, 0, 0.9, 0.2); smith.add(apron); // apron
        smith.add(this._boxMesh(0.46, 0.46, 0.46, 0xdCA878, 0, 1.66, 0));       // head
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        [[-0.1, 1.68, 0.24], [0.1, 1.68, 0.24]].forEach(([x, y, z]) => {
            const e = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.04), eyeMat);
            e.position.set(x, y, z); smith.add(e);
        });
        smith.add(this._boxMesh(0.5, 0.16, 0.5, 0x7a1f1f, 0, 1.95, 0));         // bandana
        smith.add(this._boxMesh(0.18, 0.5, 0.18, 0xdCA878, -0.4, 0.95, 0.05));  // left arm
        smith.add(this._boxMesh(0.18, 0.5, 0.18, 0xdCA878, 0.4, 0.85, 0.15));   // right arm (raised, hammering)
        smith.add(this._boxMesh(0.2, 0.45, 0.22, 0x3a2a1a, -0.14, 0.4, 0));     // legs
        smith.add(this._boxMesh(0.2, 0.45, 0.22, 0x3a2a1a, 0.14, 0.4, 0));
        // Hammer in right hand
        const hHandle = this._boxMesh(0.05, 0.4, 0.05, 0x5a3a1a, 0.55, 1.05, 0.2); smith.add(hHandle);
        const hHead = this._boxMesh(0.16, 0.14, 0.16, 0x2e2e34, 0.55, 1.28, 0.2); smith.add(hHead);
        smith.position.set(0.55, 0.16, 1.05);
        smith.rotation.y = -0.5;
        group.add(smith);

        // ---- Floating name tag ----
        const canvas = document.createElement('canvas');
        canvas.width = 1024; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(30, 20, 12, 0.72)';
        ctx.roundRect(128, 16, 768, 96, 24); ctx.fill();
        ctx.strokeStyle = '#d08040'; ctx.lineWidth = 6;
        ctx.roundRect(128, 16, 768, 96, 24); ctx.stroke();
        ctx.font = 'bold 46px "Helvetica Neue", Helvetica, Arial, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffb060';
        ctx.fillText('⚒️ ช่างตีอาวุธ', 512, 64);
        const nameTag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }));
        nameTag.position.y = 3.2;
        nameTag.scale.set(5.0, 0.625, 1);
        group.add(nameTag);

        // ---- Place on dry land, away from the general shop ----
        group.position.set(9, 0, 6);
        group.rotation.y = -0.4;
        this.scene.add(group);
        this.envObjects.push(group);
        this.npcWeaponMesh = group;
    }

    // ============ Vending Stalls (player shops) ============
    // A market street on the north side of Prontera: up to 8 player stalls in a
    // row, each with a colored awning, a seated vendor styled like the owner,
    // a glowing shop sign and the top wares displayed on the counter.
    clearVendingStalls() {
        if (!this.stallMeshes) this.stallMeshes = [];
        for (const g of this.stallMeshes) {
            this.scene.remove(g);
            g.traverse(o => {
                if (o.geometry) o.geometry.dispose();
                if (o.material) {
                    const mats = Array.isArray(o.material) ? o.material : [o.material];
                    mats.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
                }
            });
        }
        this.stallMeshes = [];
    }

    buildVendingStalls(stalls) {
        this.clearVendingStalls();
        if (this.currentMap !== 'prontera') return;

        const AWNING_COLORS = [0xd94a4a, 0x3a8ad9, 0x3fae5a, 0xd9a03a, 0x9a5ad9, 0xd95a9a, 0x3ab8b0, 0xb8763a];
        const SLOT_X = [-14, -10, -6, -2, 2, 6, 10, 14];
        // South side of town — the winding river tops out at z ≈ +8, the PvP
        // arena at (-14,14) reaches z ≈ 20, portals sit at x = ±25. z = 22
        // keeps the whole street clear of all of them.
        const STREET_Z = 22;

        // Empty slots render as vacant stands ("แผงว่าง") so the street is
        // always visible and clicking a vacant stand opens the setup flow.
        const bySlot = new Map();
        (stalls || []).forEach(s => bySlot.set(Math.max(0, Math.min(7, s.slot | 0)), s));

        for (let slot = 0; slot < 8; slot++) {
            const stall = bySlot.get(slot);
            if (!stall) {
                const g = this._buildEmptyStallStand(slot, SLOT_X[slot], STREET_Z);
                this.scene.add(g);
                this.stallMeshes.push(g);
                continue;
            }
            const group = new THREE.Group();
            group.userData.isStall = true;
            group.userData.stall = stall;

            const awningColor = AWNING_COLORS[slot];
            const wood = new THREE.MeshLambertMaterial({ color: 0x7a5a34 });
            const woodDark = new THREE.MeshLambertMaterial({ color: 0x5a3e20 });

            // Platform + counter
            const base = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.14, 2.4), wood);
            base.position.y = 0.07; base.receiveShadow = true;
            group.add(base);
            const counter = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.75, 0.55), woodDark);
            counter.position.set(0, 0.5, 0.75); counter.castShadow = true;
            group.add(counter);
            const counterTop = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.06, 0.7), wood);
            counterTop.position.set(0, 0.9, 0.75);
            group.add(counterTop);

            // Posts + sloped awning
            const postGeo = new THREE.CylinderGeometry(0.06, 0.07, 2.3, 6);
            [[-1.3, -0.85], [1.3, -0.85], [-1.3, 1.0], [1.3, 1.0]].forEach(([px, pz]) => {
                const post = new THREE.Mesh(postGeo, woodDark);
                post.position.set(px, 1.25, pz); post.castShadow = true;
                group.add(post);
            });
            const awning = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 2.6),
                new THREE.MeshLambertMaterial({ color: awningColor }));
            awning.position.set(0, 2.45, 0.1);
            awning.rotation.x = -0.12;
            awning.castShadow = true;
            group.add(awning);
            // Scalloped front trim
            for (let i = 0; i < 5; i++) {
                const trim = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.3, 4),
                    new THREE.MeshLambertMaterial({ color: awningColor }));
                trim.position.set(-1.28 + i * 0.64, 2.2, 1.35);
                trim.rotation.x = Math.PI;
                group.add(trim);
            }

            // Seated vendor styled like the owner
            const app = stall.appearance || {};
            const vendor = new THREE.Group();
            vendor.add(this._boxMesh(0.5, 0.6, 0.34, app.bodyColor || 0x4060c0, 0, 0.62, 0));
            vendor.add(this._boxMesh(0.4, 0.4, 0.4, 0xffccaa, 0, 1.18, 0));
            vendor.add(this._boxMesh(0.45, 0.22, 0.45, app.hairColor || 0xc04040, 0, 1.42, 0));
            const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
            [[-0.09, 1.2], [0.09, 1.2]].forEach(([x, y]) => {
                const e = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.03), eyeMat);
                e.position.set(x, y, 0.21); vendor.add(e);
            });
            vendor.add(this._boxMesh(0.16, 0.42, 0.16, app.bodyColor || 0x4060c0, -0.33, 0.62, 0.1));
            vendor.add(this._boxMesh(0.16, 0.42, 0.16, app.bodyColor || 0x4060c0, 0.33, 0.62, 0.1));
            vendor.position.set(0, 0.14, -0.15);
            group.add(vendor);

            // Featured wares on the counter (up to 3 item emojis)
            const items = stall.items || [];
            if (items.length) {
                const ic = document.createElement('canvas');
                ic.width = 384; ic.height = 128;
                const ictx = ic.getContext('2d');
                ictx.font = '84px Arial';
                ictx.textAlign = 'center';
                items.slice(0, 3).forEach((it, i) => {
                    const meta = (typeof ITEMS !== 'undefined' && ITEMS[it.item_name]) || null;
                    ictx.fillText((meta && meta.emoji) || '📦', 64 + i * 128, 96);
                });
                const itemSprite = new THREE.Sprite(new THREE.SpriteMaterial({
                    map: new THREE.CanvasTexture(ic), transparent: true
                }));
                itemSprite.position.set(0, 1.25, 0.78);
                itemSprite.scale.set(1.5, 0.5, 1);
                group.add(itemSprite);
            }

            // Glowing shop sign
            const canvas = document.createElement('canvas');
            canvas.width = 512; canvas.height = 160;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'rgba(20, 12, 6, 0.8)';
            ctx.roundRect(24, 10, 464, 88, 18); ctx.fill();
            ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 5;
            ctx.roundRect(24, 10, 464, 88, 18); ctx.stroke();
            ctx.textAlign = 'center';
            ctx.shadowColor = '#ffb020'; ctx.shadowBlur = 14;
            ctx.font = 'bold 44px Arial';
            ctx.fillStyle = '#ffd97a';
            ctx.fillText(`🏪 ${stall.shop_name || 'ร้านค้า'}`, 256, 68);
            ctx.shadowBlur = 0;
            ctx.font = 'bold 30px Arial';
            ctx.fillStyle = '#cfe0f0';
            ctx.fillText(`ร้านของ ${stall.owner_name || '???'}`, 256, 138);
            const sign = new THREE.Sprite(new THREE.SpriteMaterial({
                map: new THREE.CanvasTexture(canvas), transparent: true
            }));
            sign.position.y = 3.3;
            sign.scale.set(3.2, 1.0, 1);
            group.add(sign);

            group.position.set(SLOT_X[slot], 0, STREET_Z);
            this.scene.add(group);
            this.stallMeshes.push(group);
        }

        // One shared warm light over the market street (perf: never per-stall)
        if (this.stallMeshes.length) {
            const streetLight = new THREE.PointLight(0xffcc77, 1.1, 30);
            streetLight.position.set(0, 6, STREET_Z + 1);
            const holder = new THREE.Group();
            holder.add(streetLight);
            this.scene.add(holder);
            this.stallMeshes.push(holder);
        }
    }

    // A vacant stall stand — muted wood, "แผงว่าง" sign, clickable to open one.
    _buildEmptyStallStand(slot, x, z) {
        const group = new THREE.Group();
        group.userData.isStall = true;
        group.userData.stall = { empty: true, slot };

        const wood = new THREE.MeshLambertMaterial({ color: 0x6a5236 });
        const base = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.14, 2.4), wood);
        base.position.y = 0.07; base.receiveShadow = true;
        group.add(base);
        const counter = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.75, 0.55), new THREE.MeshLambertMaterial({ color: 0x54402a }));
        counter.position.set(0, 0.5, 0.75); counter.castShadow = true;
        group.add(counter);
        const postGeo = new THREE.CylinderGeometry(0.06, 0.07, 2.3, 6);
        [[-1.3, -0.85], [1.3, -0.85], [-1.3, 1.0], [1.3, 1.0]].forEach(([px, pz]) => {
            const post = new THREE.Mesh(postGeo, wood);
            post.position.set(px, 1.25, pz); post.castShadow = true;
            group.add(post);
        });
        const awning = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 2.6), new THREE.MeshLambertMaterial({ color: 0x8a8378 }));
        awning.position.set(0, 2.45, 0.1); awning.rotation.x = -0.12;
        group.add(awning);

        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 96;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(20, 16, 10, 0.65)';
        ctx.roundRect(64, 8, 384, 80, 16); ctx.fill();
        ctx.strokeStyle = '#9a8a6a'; ctx.lineWidth = 4;
        ctx.roundRect(64, 8, 384, 80, 16); ctx.stroke();
        ctx.textAlign = 'center';
        ctx.font = 'bold 36px Arial';
        ctx.fillStyle = '#cfc4a8';
        ctx.fillText('🏪 แผงว่าง — เปิดร้านได้!', 256, 60);
        const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }));
        sign.position.y = 3.1;
        sign.scale.set(2.8, 0.55, 1);
        group.add(sign);

        group.position.set(x, 0, z);
        return group;
    }

    // Tiny helper for boxy NPC parts
    _boxMesh(w, h, d, color, x, y, z) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
        m.position.set(x, y, z);
        m.castShadow = true;
        return m;
    }

    _createSellNPC() {
        const group = new THREE.Group();
        group.name = "npcSell";
        group.userData.isNPC = true;
        group.userData.npcType = 'sell';

        // ---- Wooden floor/deck ----
        const floorGeo = new THREE.BoxGeometry(3.6, 0.12, 2.6);
        const floorMat = new THREE.MeshLambertMaterial({ color: 0x5a4225 }); // slightly darker wood
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.position.y = 0.06;
        floor.receiveShadow = true;
        group.add(floor);

        // ---- Four supporting pillars ----
        const pillarGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.5);
        const pillarMat = new THREE.MeshLambertMaterial({ color: 0x47341c });

        const positions = [
            [-1.6, 1.25, -1.1],
            [1.6, 1.25, -1.1],
            [-1.6, 1.25, 1.1],
            [1.6, 1.25, 1.1]
        ];

        positions.forEach(([px, py, pz]) => {
            const pillar = new THREE.Mesh(pillarGeo, pillarMat);
            pillar.position.set(px, py, pz);
            pillar.castShadow = true;
            group.add(pillar);
        });

        // ---- Front merchant counter table ----
        const counterGeo = new THREE.BoxGeometry(3.6, 0.9, 0.7);
        const counterMat = new THREE.MeshLambertMaterial({ color: 0x765532 });
        const counter = new THREE.Mesh(counterGeo, counterMat);
        counter.position.set(0, 0.45, 0.95);
        counter.castShadow = true;
        group.add(counter);

        // ---- Decorative displays on counter (boxes with items) ----
        // Mini display container box
        const boxGeo = new THREE.BoxGeometry(0.8, 0.25, 0.5);
        const boxMat = new THREE.MeshLambertMaterial({ color: 0x906d44 });

        const boxL = new THREE.Mesh(boxGeo, boxMat);
        boxL.position.set(-1.0, 0.92, 0.95);
        boxL.rotation.y = 0.1;
        group.add(boxL);

        const boxR = new THREE.Mesh(boxGeo, boxMat);
        boxR.position.set(1.0, 0.92, 0.95);
        boxR.rotation.y = -0.1;
        group.add(boxR);

        // Gold and material representation on display
        const item1Geo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
        const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.1, metalness: 0.8 });
        const item1 = new THREE.Mesh(item1Geo, goldMat);
        item1.position.set(-1.0, 1.05, 0.95);
        group.add(item1);

        const item2 = new THREE.Mesh(item1Geo, new THREE.MeshPhongMaterial({ color: 0x228b22 }));
        item2.position.set(1.0, 1.02, 0.95);
        group.add(item2);

        // ---- Golden/Yellow Striped Roof Canopy ----
        const roofGeo = new THREE.BoxGeometry(4.0, 0.28, 3.0);
        const roofMat = new THREE.MeshLambertMaterial({ color: 0xe5a93b }); // golden yellow
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.set(0, 2.45, 0);
        roof.castShadow = true;
        group.add(roof);

        // Roof trim valence
        const valenceGeo = new THREE.BoxGeometry(4.0, 0.4, 0.08);
        const valenceMat = new THREE.MeshLambertMaterial({ color: 0x6e4313 }); // brown trim

        const valenceF = new THREE.Mesh(valenceGeo, valenceMat);
        valenceF.position.set(0, 2.2, 1.48);
        group.add(valenceF);

        const valenceB = new THREE.Mesh(valenceGeo, valenceMat);
        valenceB.position.set(0, 2.2, -1.48);
        group.add(valenceB);

        // ---- Lantern warm glow ----
        const lanternGeo = new THREE.BoxGeometry(0.2, 0.3, 0.2);
        const lanternMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0 });
        const lantern = new THREE.Mesh(lanternGeo, lanternMat);
        lantern.position.set(-1.2, 2.2, 1.25);
        group.add(lantern);

        const lanternLight = new THREE.PointLight(0xffb84d, 1.0, 6);
        lanternLight.position.set(-1.2, 2.0, 1.25);
        group.add(lanternLight);

        // ---- Merchant character (behind counter) ----
        const merchantGroup = new THREE.Group();

        // Merchant body (green vest)
        const mBodyGeo = new THREE.BoxGeometry(0.55, 0.75, 0.35);
        const mBodyMat = new THREE.MeshLambertMaterial({ color: 0x2c6b3f });
        const mBody = new THREE.Mesh(mBodyGeo, mBodyMat);
        mBody.position.y = 1.0;
        mBody.castShadow = true;
        merchantGroup.add(mBody);

        // Merchant head
        const mHeadGeo = new THREE.BoxGeometry(0.42, 0.42, 0.42);
        const mHeadMat = new THREE.MeshLambertMaterial({ color: 0xf5d0a0 });
        const mHead = new THREE.Mesh(mHeadGeo, mHeadMat);
        mHead.position.y = 1.62;
        mHead.castShadow = true;
        merchantGroup.add(mHead);

        // Merchant spectacles
        const frameGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.04, 8);
        const frameMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const lensL = new THREE.Mesh(frameGeo, frameMat);
        lensL.rotation.x = Math.PI / 2;
        lensL.position.set(-0.1, 1.65, 0.22);
        merchantGroup.add(lensL);
        const lensR = new THREE.Mesh(frameGeo, frameMat);
        lensR.rotation.x = Math.PI / 2;
        lensR.position.set(0.1, 1.65, 0.22);
        merchantGroup.add(lensR);

        // Merchant beard
        const beardGeo = new THREE.BoxGeometry(0.3, 0.18, 0.1);
        const beardMat = new THREE.MeshLambertMaterial({ color: 0x4a3c31 });
        const beard = new THREE.Mesh(beardGeo, beardMat);
        beard.position.set(0, 1.45, 0.18);
        merchantGroup.add(beard);

        // Merchant hat
        const mHatGeo = new THREE.CylinderGeometry(0.3, 0.32, 0.18, 8);
        const mHatMat = new THREE.MeshLambertMaterial({ color: 0x6e4313 });
        const mHat = new THREE.Mesh(mHatGeo, mHatMat);
        mHat.position.y = 1.88;
        merchantGroup.add(mHat);

        // Merchant arms
        const mArmGeo = new THREE.BoxGeometry(0.18, 0.5, 0.18);
        const mArmMat = new THREE.MeshLambertMaterial({ color: 0x2c6b3f });
        const mArmL = new THREE.Mesh(mArmGeo, mArmMat);
        mArmL.position.set(-0.4, 0.95, 0);
        merchantGroup.add(mArmL);
        const mArmR = new THREE.Mesh(mArmGeo, mArmMat);
        mArmR.position.set(0.4, 0.95, 0);
        merchantGroup.add(mArmR);

        // Position merchant behind counter
        merchantGroup.position.set(0, 0.18, 0.5);
        group.add(merchantGroup);

        // ---- Floating shop name tag ----
        const canvas = document.createElement('canvas');
        canvas.width = 1024; // Higher width to prevent clipping
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(10, 40, 20, 0.7)';
        ctx.roundRect(64, 16, 896, 96, 24);
        ctx.fill();
        ctx.strokeStyle = '#ebd040';
        ctx.lineWidth = 6;
        ctx.roundRect(64, 16, 896, 96, 24);
        ctx.stroke();
        ctx.font = 'bold 42px "Helvetica Neue", Helvetica, Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffdd44';
        // '💰 รับซื้อไอเทม (Sell Shop)' is approx 450px wide.
        // 512 - 225 = 287. Using 280 for safety.
        ctx.fillText('💰 รับซื้อไอเทม (Sell Shop)', 280, 64);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const nameTag = new THREE.Sprite(spriteMat);
        nameTag.position.y = 4.4;
        nameTag.scale.set(6.0, 0.75, 1); // Wider sprite scale to match wider canvas
        group.add(nameTag);

        // Position on dry land - slightly higher elevation and shifted
        group.position.set(9.5, 0.45, -4.5);
        this.scene.add(group);
        this.envObjects.push(group);
        group.userData.isNPC = true;
        group.userData.npcType = 'sell';
        this.npcSellMesh = group;
    }

    getMouseIntersection(event, monsters, npcs, remotePlayersMap) {
        if (!this.canvas) return null;

        const rect = this.canvas.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);

        const targets = [];

        if (this.groundMesh) targets.push(this.groundMesh);
        if (this.waterMesh) targets.push(this.waterMesh);

        if (npcs) {
            if (Array.isArray(npcs)) {
                npcs.forEach(n => { if (n) targets.push(n); });
            } else {
                targets.push(npcs);
            }
        }
        // Player vending stalls are clickable shops
        if (this.stallMeshes) {
            this.stallMeshes.forEach(s => { if (s.userData && s.userData.isStall) targets.push(s); });
        }
        // Celestial Ore nodes (Svarrga) are clickable to mine
        if (this.oreNodes) {
            this.oreNodes.forEach(o => { if (o && !o.userData.mined) targets.push(o); });
        }
        if (monsters && monsters.monsters) {
            monsters.monsters.forEach(m => {
                if (m.alive && m.mesh) {
                    targets.push(m.mesh);
                }
            });
        }
        if (remotePlayersMap) {
            remotePlayersMap.forEach(rp => {
                if (rp.mesh) {
                    targets.push(rp.mesh);
                }
            });
        }

        const intersects = raycaster.intersectObjects(targets, true);
        if (intersects.length > 0) {
            for (let i = 0; i < intersects.length; i++) {
                const hit = intersects[i];
                let obj = hit.object;

                while (obj) {
                    if (obj.userData && obj.userData.isStall) {
                        return { type: 'stall', point: hit.point, object: obj.userData.stall };
                    }
                    if (obj.userData && obj.userData.isOre) {
                        return { type: 'ore', point: hit.point, object: obj };
                    }
                    if (npcs) {
                        if (Array.isArray(npcs)) {
                            for (const n of npcs) {
                                if (obj === n) {
                                    return { type: 'npc', point: hit.point, object: n };
                                }
                            }
                        } else if (obj === npcs) {
                            return { type: 'npc', point: hit.point, object: npcs };
                        }
                    }
                    if (monsters && monsters.monsters) {
                        const matchedMonster = monsters.monsters.find(m => m.mesh === obj && m.alive);
                        if (matchedMonster) {
                            return { type: 'monster', point: hit.point, object: matchedMonster };
                        }
                    }
                    if (remotePlayersMap) {
                        for (const [uid, rp] of remotePlayersMap.entries()) {
                            if (rp.mesh === obj) {
                                return {
                                    type: 'player',
                                    point: hit.point,
                                    object: {
                                        userId: uid,
                                        username: rp.character?.stats?.name || 'Guest',
                                        level: rp.character?.stats?.level || 1
                                    }
                                };
                            }
                        }
                    }
                    obj = obj.parent;
                }
            }

            const firstHit = intersects[0];
            if (firstHit.object === this.groundMesh || firstHit.object === this.waterMesh) {
                return { type: 'ground', point: firstHit.point };
            }
        }

        return null;
    }



    // ============ Core Methods ============
    _onResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }

    getDelta() {
        return this.clock.getDelta();
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    // Follow a target position (camera follows player)
    // stableY: use the character's baseY instead of animated mesh.position.y
    //          to prevent camera shake from walking/running bounce animation
    followTarget(targetPos, stableY) {
        const baseOffsetY = 18;
        const baseDist = 18;        // horizontal distance from the player
        const smoothing = 0.08;

        // Apply Roblox-style zoom factor
        const zoom = this.cameraZoom || 1.0;
        const dist = baseDist * zoom;
        const offsetY = baseOffsetY * zoom;

        // Orbit the horizontal offset by the player-controlled yaw. At yaw 0
        // this is (0, 18) — identical to the original fixed camera angle.
        const yaw = this.cameraYaw || 0;
        const offsetX = Math.sin(yaw) * dist;
        const offsetZ = Math.cos(yaw) * dist;

        // Use stableY (baseY) for camera Y to avoid bounce-induced shake
        const followY = stableY !== undefined ? stableY : targetPos.y;

        const targetCamX = targetPos.x + offsetX;
        const targetCamY = followY + offsetY;
        const targetCamZ = targetPos.z + offsetZ;

        this.camera.position.x += (targetCamX - this.camera.position.x) * smoothing;
        this.camera.position.y += (targetCamY - this.camera.position.y) * smoothing;
        this.camera.position.z += (targetCamZ - this.camera.position.z) * smoothing;

        this.camera.lookAt(targetPos.x, followY, targetPos.z);
        this._weatherFocus = { x: targetPos.x, z: targetPos.z }; // rain follows the player
    }

    // Adjust camera zoom level (scroll wheel). Roblox-style: scroll up = zoom in, scroll down = zoom out.
    adjustZoom(delta) {
        // Roblox uses a non-linear zoom step usually, but a linear factor is a good start.
        // delta > 0 is scroll down (zoom out), delta < 0 is scroll up (zoom in)
        const zoomStep = 0.08;
        let newZoom = this.cameraZoom + (delta > 0 ? zoomStep : -zoomStep);
        
        // Clamp to min/max
        this.cameraZoom = Math.max(this.minZoom, Math.min(this.maxZoom, newZoom));
    }

    // Rotate the follow camera around the player (right-drag). deltaYaw is in
    // radians. The angle is kept in [-π, π] to avoid unbounded growth.
    rotateCamera(deltaYaw) {
        let y = (this.cameraYaw || 0) + deltaYaw;
        if (y > Math.PI) y -= Math.PI * 2;
        else if (y < -Math.PI) y += Math.PI * 2;
        this.cameraYaw = y;
    }

    // Snap the camera back to the default behind-the-shoulder angle.
    resetCameraYaw() {
        this.cameraYaw = 0;
    }

    getCameraYaw() {
        return this.cameraYaw || 0;
    }

    // Duel camera: frame BOTH fighters. Centers on their midpoint and pulls
    // back based on how far apart they are, so both stay on screen. Mobile
    // (narrow/portrait viewport) needs to pull back more because the limited
    // horizontal FOV would otherwise crop a fighter off the side.
    frameDuel(posA, posB, isMobile = false) {
        const midX = (posA.x + posB.x) / 2;
        const midZ = (posA.z + posB.z) / 2;
        const sep = Math.hypot(posA.x - posB.x, posA.z - posB.z);

        // Base rig, expanded by separation. Portrait screens get a bigger
        // multiplier + a wider minimum so nobody is cropped.
        const aspect = window.innerWidth / Math.max(1, window.innerHeight);
        const portrait = isMobile || aspect < 1;
        const zoomK = portrait ? 1.75 : 1.15;
        const baseDist = portrait ? 15 : 13;
        const dist = Math.min(34, baseDist + sep * zoomK);

        const targetCamX = midX;
        const targetCamY = dist;      // height scales with pull-back
        const targetCamZ = midZ + dist;
        const smoothing = 0.1;

        this.camera.position.x += (targetCamX - this.camera.position.x) * smoothing;
        this.camera.position.y += (targetCamY - this.camera.position.y) * smoothing;
        this.camera.position.z += (targetCamZ - this.camera.position.z) * smoothing;
        this.camera.lookAt(midX, 1.0, midZ);
    }

    // Check if a position is in the winding river (and not on the bridge)
    isInWater(position) {
        if (!this.waterMesh) return false;

        // Check if on the bridge (approximate bounds)
        // Bridge is centered at xOffset = 0, zOffset = -2
        // Bridge planks have width 3.6 (x between -1.8 and 1.8), and span z from -10 to +6
        if (Math.abs(position.x) < 1.8 && position.z >= -10 && position.z <= 6) {
            return false;
        }

        // River centerline: z = sin(x * 0.08) * 10 - 2
        const riverZ = Math.sin(position.x * 0.08) * 10 - 2;
        const distToRiver = Math.abs(position.z - riverZ);

        // Riverbed cut boundary for wider river
        return distToRiver < 5.5;
    }

    getEnvironmentAt(position) {
        if (!position) return 'ground';
        if (this.isInWater(position)) {
            return 'water';
        }
        if (position.x < -6 && position.z < -6) {
            return 'cave';
        }
        if (position.x > 6 && position.z > 6) {
            return 'mountain';
        }
        return 'ground';
    }

    // World to screen position
    worldToScreen(worldPos) {
        const vec = worldPos.clone();
        vec.project(this.camera);
        return {
            x: (vec.x * 0.5 + 0.5) * window.innerWidth,
            y: (-vec.y * 0.5 + 0.5) * window.innerHeight
        };
    }

    // ============ Animate per-frame ============
    updateAnimations(dt) {
        this.time += dt;

        // Animate water waves (disabled temporarily to fix blue screen issue)
        /*
        if (this.waterMesh && this._waterFrameSkip === undefined) this._waterFrameSkip = 0;
        if (this.waterMesh) {
            this._waterFrameSkip = (this._waterFrameSkip + 1) % 2;
            if (this._waterFrameSkip === 0) {
                const positions = this.waterMesh.geometry.attributes.position;
                for (let i = 0; i < positions.count; i++) {
                    const x = positions.getX(i);
                    const y = positions.getY(i);
                    const wave = Math.sin(x * 2 + this.time * 2) * 0.04 +
                        Math.cos(y * 3 + this.time * 1.5) * 0.03;
                    positions.setZ(i, wave);
                }
                positions.needsUpdate = true;
            }
        }
        */

        // PVP arena ambiance: torch flicker, glow-ring pulse, banner wave
        if (this.arenaAnimParts) {
            const a = this.arenaAnimParts;
            a.flames.forEach((f, i) => {
                const s = 0.85 + Math.sin(this.time * 9 + i * 1.7) * 0.18 + Math.sin(this.time * 23 + i) * 0.07;
                f.scale.set(s, 0.8 + s * 0.35, s);
                f.material.opacity = 0.75 + Math.sin(this.time * 13 + i * 2.1) * 0.2;
            });
            if (a.glowRing) {
                a.glowRing.material.opacity = 0.35 + Math.sin(this.time * 2.2) * 0.2;
                const rs = 1 + Math.sin(this.time * 2.2) * 0.012;
                a.glowRing.scale.set(rs, rs, 1);
            }
            a.banners.forEach((b, i) => {
                b.rotation.z = Math.sin(this.time * 2.4 + i * 1.3) * 0.09;
            });
        }

        // Duel cage shimmer
        if (this._arenaCage) {
            this._arenaCagePulse = (this._arenaCagePulse || 0) + dt;
            const dome = this._arenaCage.children[0];
            if (dome && dome.material) dome.material.opacity = 0.10 + Math.sin(this._arenaCagePulse * 3) * 0.06;
        }

        // Flowing water: scroll the caustic texture along the river
        if (this.waterFlowTex) {
            this.waterFlowTex.offset.x += dt * 0.025;
            this.waterFlowTex.offset.y += dt * 0.008;
        }

        // Sakura petals drifting down from cherry trees
        if (this.sakuraPetals) {
            const { points, data } = this.sakuraPetals;
            const pos = points.geometry.attributes.position;
            for (let i = 0; i < data.length; i++) {
                const d = data[i];
                d.y -= d.fallSpeed * dt;
                if (d.y <= 0.05) {
                    // Respawn at canopy with a fresh horizontal offset
                    d.y = d.topY;
                    d.offX = (Math.random() - 0.5) * 2.4;
                    d.offZ = (Math.random() - 0.5) * 2.4;
                    d.phase = Math.random() * Math.PI * 2;
                }
                const sway = Math.sin(this.time * d.swayFreq + d.phase) * d.swayAmp;
                const drift = Math.cos(this.time * d.swayFreq * 0.6 + d.phase) * d.swayAmp * 0.6;
                pos.setXYZ(i, d.treeX + d.offX + sway, d.y, d.treeZ + d.offZ + drift);
            }
            pos.needsUpdate = true;
        }

        // Fish swimming along the river, occasionally leaping
        if (this.fishes && this.fishes.length) {
            for (const fish of this.fishes) {
                const u = fish.userData;

                // Move along the river's x axis; z follows the winding curve
                u.x += u.dir * u.speed * dt;
                if (u.x > 27) { u.x = 27; u.dir = -1; }
                if (u.x < -27) { u.x = -27; u.dir = 1; }
                const riverZ = Math.sin(u.x * 0.08) * 10 - 2 + u.zOff;

                let y = u.swimY;
                let pitch = 0;

                if (u.jumpT >= 0) {
                    // Mid-jump: parabolic arc + forward flip
                    u.jumpT += dt / u.jumpDur;
                    if (u.jumpT >= 1) {
                        u.jumpT = -1;
                        u.jumpTimer = 4 + Math.random() * 10;
                    } else {
                        const t = u.jumpT;
                        y = u.swimY + Math.sin(t * Math.PI) * 1.1;
                        pitch = -Math.sin(t * Math.PI * 2) * 0.9;
                    }
                } else {
                    u.jumpTimer -= dt;
                    if (u.jumpTimer <= 0) u.jumpT = 0;
                    // gentle bobbing while swimming
                    y = u.swimY + Math.sin(this.time * 2 + u.wigglePhase) * 0.05;
                }

                fish.position.set(u.x, y, riverZ);
                // Face swim direction (fish model points +Z; heading is along x)
                fish.rotation.y = u.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
                fish.rotation.x = pitch;
                // Tail wiggle
                if (u.tail) u.tail.rotation.y = Math.sin(this.time * 8 + u.wigglePhase) * 0.5;
            }
        }

        // Animate voxel clouds
        this.cloudSprites.forEach(cloud => {
            cloud.userData.angle += cloud.userData.speed * dt;
            cloud.position.x = Math.cos(cloud.userData.angle) * cloud.userData.radius;
            cloud.position.z = Math.sin(cloud.userData.angle) * cloud.userData.radius;
            // Face parallel to flight circle tangent (tangent is Z normal facing)
            cloud.rotation.y = -cloud.userData.angle + Math.PI / 2;
        });

        // Animate wind sway on trees
        if (this.swayingObjects) {
            this.swayingObjects.forEach(obj => {
                const offset = obj.position.x * 0.15 + obj.position.z * 0.15;
                const swaySpeed = 1.6;
                const swayStrength = 0.022;
                obj.rotation.x = Math.sin(this.time * swaySpeed + offset) * swayStrength;
                obj.rotation.z = Math.cos(this.time * (swaySpeed * 0.8) + offset) * (swayStrength * 0.7);
            });
        }

        // Animate sunbeams shimmer
        if (this.sunbeamGroup) {
            this.sunbeamGroup.children.forEach((pivot, idx) => {
                const pulse = 0.05 + Math.sin(this.time * 1.1 + idx * 1.5) * 0.035;
                pivot.children[0].material.opacity = pulse;
            });
        }

        // Flock of birds passing across the sky
        this._updateBirdFlock(dt);

        // Weather / seasons
        this._updateWeather(dt);

        // World boss idle animation
        this._updateWorldBoss(dt);

        // Animate flying birds
        if (this.birds) {
            this.birds.forEach(bird => {
                const u = bird.userData;
                u.angle += u.speed * dt;

                // Fly in matching circle
                bird.position.set(
                    Math.cos(u.angle) * u.radius,
                    u.height,
                    Math.sin(u.angle) * u.radius
                );

                // Tangent yaw heading matching motion
                const tangentX = -Math.sin(u.angle);
                const tangentZ = Math.cos(u.angle);
                bird.rotation.y = Math.atan2(tangentX, tangentZ);

                // Wing flaps
                const flap = Math.sin(this.time * u.flapSpeed + u.flapOffset) * 0.75;
                u.leftWing.rotation.z = -flap;
                u.rightWing.rotation.z = flap;
            });
        }

        // Animate portals (swirl spin, ring/halo pulse, rising motes, label bob)
        const t = this.time;
        this.portalMeshes.forEach(portal => {
            const a = portal.userData.anim;
            if (!a) return;
            if (a.swirl) {
                a.swirl.rotation.z = t * 1.4;
                a.swirl.material.opacity = 0.72 + Math.sin(t * 3) * 0.2;
            }
            if (a.ring) a.ring.scale.setScalar(1 + Math.sin(t * 3) * 0.04);
            if (a.halo) {
                a.halo.material.opacity = 0.16 + Math.sin(t * 2) * 0.12;
                a.halo.scale.setScalar(1 + Math.sin(t * 2) * 0.05);
            }
            if (a.baseCircle) {
                a.baseCircle.rotation.z = -t * 0.5;
                a.baseCircle.material.opacity = 0.4 + Math.sin(t * 2.5) * 0.18;
            }
            if (a.light) a.light.intensity = 1.0 + Math.sin(t * 3) * 0.4;
            if (a.runes) a.runes.forEach((r, i) => { r.material.opacity = 0.55 + Math.sin(t * 2.5 + i) * 0.35; });
            if (a.motes) a.motes.forEach(m => {
                const y = (t * 0.35 + m.userData.phase) % 1; // 0..1 rising loop
                m.position.set(m.userData.rx * (1 - y * 0.35), 0.3 + y * 4.4, Math.sin(t + m.userData.phase * 6.28) * 0.35);
                m.material.opacity = 0.9 * (1 - y);
            });
            if (a.label) a.label.position.y = 6.2 + Math.sin(t * 1.5) * 0.14;
        });

        // Animate Celestial Ore nodes: crystal glow pulse + spin, and respawn a
        // depleted node once its cooldown elapses.
        if (this.oreNodes && this.oreNodes.length) {
            const nowMs = Date.now();
            this.oreNodes.forEach(node => {
                const u = node.userData;
                if (u.mined) {
                    if (u.respawnAt && nowMs >= u.respawnAt) {
                        u.mined = false;
                        node.visible = true;
                        node.scale.setScalar(1);
                    }
                    return;
                }
                node.rotation.y = t * 0.4;
                const pulse = 0.7 + Math.sin(t * 2.5) * 0.3;
                if (u.glow) u.glow.intensity = pulse * 1.2;
                if (u.crystals) u.crystals.forEach((c, i) => { c.position.y = 0.9 + Math.sin(t * 3 + i) * 0.06; });
            });
        }

        // Animate fishing bobber & line
        this._updateFishingAnimations(dt);
    }

    // ============ 3D Fishing Visuals ============
    createFishingLine(playerPos, bobberPos) {
        this.removeFishingLine();

        this._fishingGroup = new THREE.Group();

        // Use dynamic bobber position if provided, otherwise fall back to defaults
        const bobberX = bobberPos ? bobberPos.x : 2.8;
        const bobberZ = bobberPos ? bobberPos.z : -2;
        const bobberY = bobberPos ? (bobberPos.y || 0.05) : 0.05;

        // Create curved fishing line from player hand to bobber
        const curve = new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(playerPos.x, playerPos.y + 1.4, playerPos.z),
            new THREE.Vector3(
                (playerPos.x + bobberX) / 2,
                2.5,
                (playerPos.z + bobberZ) / 2
            ),
            new THREE.Vector3(bobberX, bobberY, bobberZ)
        );
        const points = curve.getPoints(24);
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineBasicMaterial({
            color: 0xc0c0c0,
            linewidth: 1,
            transparent: true,
            opacity: 0.85,
        });
        this._fishingLineMesh = new THREE.Line(lineGeo, lineMat);
        this._fishingGroup.add(this._fishingLineMesh);

        // Bobber (orange/red sphere)
        const bobberGeo = new THREE.SphereGeometry(0.12, 8, 6);
        const bobberMat = new THREE.MeshLambertMaterial({ color: 0xff4020 });
        this._fishingBobber = new THREE.Mesh(bobberGeo, bobberMat);
        this._fishingBobber.position.set(bobberX, bobberY, bobberZ);
        this._fishingGroup.add(this._fishingBobber);

        // Bobber white stripe
        const stripeGeo = new THREE.SphereGeometry(0.13, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.4);
        const stripeMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
        const stripe = new THREE.Mesh(stripeGeo, stripeMat);
        stripe.position.set(bobberX, bobberY + 0.04, bobberZ);
        this._fishingGroup.add(stripe);

        // Store metadata
        this._fishingBobberBaseY = bobberY;
        this._fishingBobberBase = { x: bobberX, y: bobberY, z: bobberZ };
        this._fishingPlayerPos = { ...playerPos };
        this._fishingBiteActive = false;
        this._fishingBiteTimer = 0;
        this._fishingRodTip = null;
        this._fishingYank = 0;

        this.scene.add(this._fishingGroup);
    }

    animateFishBite() {
        if (!this._fishingGroup || !this._fishingBobber) return;

        this._fishingBiteActive = true;
        this._fishingBiteTimer = 0;

        // Create fish mesh swimming up
        if (this._fishingFishMesh) {
            this._fishingGroup.remove(this._fishingFishMesh);
        }
        const fishGroup = new THREE.Group();

        // Fish body
        const bodyGeo = new THREE.SphereGeometry(0.15, 6, 4);
        bodyGeo.scale(1.8, 0.8, 1);
        const bodyMat = new THREE.MeshLambertMaterial({ color: 0x4080ff });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        fishGroup.add(body);

        // Tail fin
        const tailGeo = new THREE.ConeGeometry(0.12, 0.2, 4);
        const tailMat = new THREE.MeshLambertMaterial({ color: 0x3060d0 });
        const tail = new THREE.Mesh(tailGeo, tailMat);
        tail.position.set(-0.28, 0, 0);
        tail.rotation.z = Math.PI / 2;
        fishGroup.add(tail);

        // Eye
        const eyeGeo = new THREE.SphereGeometry(0.03, 4, 4);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const eye = new THREE.Mesh(eyeGeo, eyeMat);
        eye.position.set(0.15, 0.04, 0.08);
        fishGroup.add(eye);

        const bx = this._fishingBobber.position.x;
        const bz = this._fishingBobber.position.z;
        fishGroup.position.set(bx + 0.8, -0.3, bz);
        fishGroup.rotation.y = Math.PI / 2;

        this._fishingFishMesh = fishGroup;
        this._fishingGroup.add(fishGroup);
    }

    removeFishingLine() {
        if (this._fishingGroup) {
            this.scene.remove(this._fishingGroup);
            this._fishingGroup = null;
        }
        this._fishingLineMesh = null;
        this._fishingBobber = null;
        this._fishingFishMesh = null;
        this._fishingBiteActive = false;
    }

    _updateFishingAnimations(dt) {
        if (!this._fishingGroup || !this._fishingBobber) return;

        // Idle bobber floating
        const baseY = this._fishingBobberBaseY || 0.05;
        const bob = Math.sin(this.time * 2.5) * 0.03;
        this._fishingBobber.position.y = baseY + bob;

        // Bite animation
        if (this._fishingBiteActive) {
            this._fishingBiteTimer += dt;
            const t = this._fishingBiteTimer;

            // Bobber dips down sharply
            const dipAmount = Math.sin(t * 12) * 0.15 * Math.max(0, 1 - t * 1.5);
            this._fishingBobber.position.y = baseY - Math.abs(dipAmount) - 0.05;

            // Fish swims toward bobber
            if (this._fishingFishMesh) {
                const bx = this._fishingBobber.position.x;
                const bz = this._fishingBobber.position.z;
                const fishTargetX = bx;
                const fishTargetZ = bz;

                this._fishingFishMesh.position.x += (fishTargetX - this._fishingFishMesh.position.x) * 2.5 * dt;
                this._fishingFishMesh.position.z += (fishTargetZ - this._fishingFishMesh.position.z) * 2.5 * dt;
                this._fishingFishMesh.position.y = -0.15 + Math.sin(t * 8) * 0.05;

                // Tail wiggle
                this._fishingFishMesh.rotation.y = Math.PI / 2 + Math.sin(t * 10) * 0.3;
            }

            // End bite after 1s
            if (t > 1.0) {
                this._fishingBiteActive = false;
                if (this._fishingFishMesh) {
                    this._fishingGroup.remove(this._fishingFishMesh);
                    this._fishingFishMesh = null;
                }
            }
        }

        // Yank hoist: while the rod is being lifted, pull the bobber up out of
        // the water and slightly toward the player (applied after bite/idle
        // animations so it wins during the yank).
        const yank = this._fishingYank || 0;
        if (yank > 0.01 && this._fishingBobberBase) {
            const base = this._fishingBobberBase;
            const tip = this._fishingRodTip || { x: base.x, z: base.z };
            this._fishingBobber.position.x = base.x + (tip.x - base.x) * yank * 0.35;
            this._fishingBobber.position.z = base.z + (tip.z - base.z) * yank * 0.35;
            this._fishingBobber.position.y = base.y + yank * 1.5;
        } else if (this._fishingBobberBase && this._fishingBobber.position.y > (this._fishingBobberBaseY || 0.05) + 0.5) {
            // Ease back down to the water after the yank ends
            this._fishingBobber.position.x = this._fishingBobberBase.x;
            this._fishingBobber.position.z = this._fishingBobberBase.z;
            this._fishingBobber.position.y = this._fishingBobberBaseY || 0.05;
        }

        // Update the fishing line curve every frame. The line starts at the
        // ROD TIP (live world position, follows the yank), not the static
        // position captured at cast time.
        if (this._fishingLineMesh) {
            const bp = this._fishingBobber.position;
            const tip = this._fishingRodTip
                ? this._fishingRodTip
                : { x: this._fishingPlayerPos.x, y: (this._fishingPlayerPos.y || 0) + 1.4, z: this._fishingPlayerPos.z };

            // Line sag: slack while waiting, taut (less sag) during the yank
            const sag = 0.7 * (1 - yank * 0.85) + Math.sin(this.time * 1.5) * 0.06;
            const midY = Math.max((tip.y + bp.y) / 2 + sag, bp.y + 0.15);

            const curve = new THREE.QuadraticBezierCurve3(
                new THREE.Vector3(tip.x, tip.y, tip.z),
                new THREE.Vector3((tip.x + bp.x) / 2, midY, (tip.z + bp.z) / 2),
                new THREE.Vector3(bp.x, bp.y, bp.z)
            );
            this._fishingLineMesh.geometry.setFromPoints(curve.getPoints(24));
        }
    }

    // Called from the game loop each frame while fishing: live rod-tip world
    // position + current yank progress (0..1) from the character animation.
    updateFishingRodTip(tipPos, yankProgress = 0) {
        if (!this._fishingRodTip) this._fishingRodTip = new THREE.Vector3();
        this._fishingRodTip.copy(tipPos);
        this._fishingYank = yankProgress;
    }

    _createDetailTexture() {
        const size = 512; // Reduced from 1024 for faster startup
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Base earthy color (will be multiplied with vertex colors)
        ctx.fillStyle = '#d8d0c0';
        ctx.fillRect(0, 0, size, size);

        // Layer 1: Coarse earth noise (large patches of light/dark soil)
        for (let i = 0; i < 2000; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = 8 + Math.random() * 20;
            const brightness = Math.random();
            if (brightness < 0.4) {
                ctx.fillStyle = `rgba(90, 75, 55, ${0.06 + Math.random() * 0.1})`;
            } else if (brightness < 0.7) {
                ctx.fillStyle = `rgba(140, 125, 95, ${0.05 + Math.random() * 0.08})`;
            } else {
                ctx.fillStyle = `rgba(200, 195, 170, ${0.04 + Math.random() * 0.08})`;
            }
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        // Layer 2: Fine soil grain (tiny specks)
        for (let i = 0; i < 20000; i++) { // Reduced from 80000 for faster startup
            const x = Math.random() * size;
            const y = Math.random() * size;
            const v = Math.random();
            if (v < 0.5) {
                ctx.fillStyle = `rgba(60, 50, 35, ${0.03 + Math.random() * 0.09})`;
            } else if (v < 0.8) {
                ctx.fillStyle = `rgba(110, 100, 70, ${0.03 + Math.random() * 0.08})`;
            } else {
                ctx.fillStyle = `rgba(245, 240, 225, ${0.04 + Math.random() * 0.1})`;
            }
            const s = 1 + Math.random() * 2;
            ctx.fillRect(x, y, s, s);
        }

        // Layer 3: Dense grass blades (realistic thin strokes)
        for (let i = 0; i < 12000; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const length = 6 + Math.random() * 16;
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.7;
            const green = 50 + Math.floor(Math.random() * 80);
            const alpha = 0.06 + Math.random() * 0.12;
            ctx.strokeStyle = `rgba(${20 + Math.floor(Math.random() * 30)}, ${green}, ${15 + Math.floor(Math.random() * 25)}, ${alpha})`;
            ctx.lineWidth = 0.8 + Math.random() * 1.2;
            ctx.beginPath();
            ctx.moveTo(x, y);
            // Slight curve via quadratic
            const cx = x + Math.sin(angle) * length * 0.5 + (Math.random() - 0.5) * 3;
            const cy = y + Math.cos(angle) * length * 0.5;
            ctx.quadraticCurveTo(cx, cy, x + Math.sin(angle) * length, y - Math.cos(angle) * length);
            ctx.stroke();
        }

        // Layer 4: Clover/weed dark spots
        for (let i = 0; i < 600; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const w = 2 + Math.random() * 5;
            const h = w * (0.6 + Math.random() * 0.3);
            const darkGreen = Math.random() > 0.5;
            ctx.fillStyle = darkGreen
                ? `rgba(30, 65, 25, ${0.06 + Math.random() * 0.08})`
                : `rgba(100, 80, 40, ${0.05 + Math.random() * 0.07})`;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(Math.random() * Math.PI);
            ctx.beginPath();
            ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Layer 5: Mini fallen leaves and organic litter
        const leafShades = [
            'rgba(160, 90, 35, 0.1)', 'rgba(130, 70, 25, 0.09)',
            'rgba(180, 120, 50, 0.08)', 'rgba(70, 95, 45, 0.07)'
        ];
        for (let i = 0; i < 500; i++) {
            const lx = Math.random() * size;
            const ly = Math.random() * size;
            const lw = 3 + Math.random() * 5;
            const lh = lw * (0.4 + Math.random() * 0.3);
            ctx.fillStyle = leafShades[Math.floor(Math.random() * leafShades.length)];
            ctx.save();
            ctx.translate(lx, ly);
            ctx.rotate(Math.random() * Math.PI * 2);
            ctx.beginPath();
            ctx.ellipse(0, 0, lw, lh, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Layer 6: Tiny pebble dots
        for (let i = 0; i < 1200; i++) {
            const px = Math.random() * size;
            const py = Math.random() * size;
            const pr = 1 + Math.random() * 2.5;
            const shade = 100 + Math.floor(Math.random() * 80);
            ctx.fillStyle = `rgba(${shade}, ${shade - 10}, ${shade - 20}, ${0.1 + Math.random() * 0.15})`;
            ctx.beginPath();
            ctx.arc(px, py, pr, 0, Math.PI * 2);
            ctx.fill();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(12, 12);
        return texture;
    }

    _createWaterTexture() {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Deep water base
        ctx.fillStyle = '#2a6090';
        ctx.fillRect(0, 0, size, size);

        // Layered caustic ripple patterns
        for (let layer = 0; layer < 3; layer++) {
            const count = 300 + layer * 200;
            for (let i = 0; i < count; i++) {
                const x = Math.random() * size;
                const y = Math.random() * size;
                const rx = 4 + Math.random() * 12;
                const ry = rx * (0.3 + Math.random() * 0.4);
                const rot = Math.random() * Math.PI;
                const alpha = 0.03 + Math.random() * 0.06;
                ctx.fillStyle = layer < 2
                    ? `rgba(120, 200, 255, ${alpha})`
                    : `rgba(255, 255, 255, ${alpha * 0.7})`;
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(rot);
                ctx.beginPath();
                ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }

        // Shimmer streaks (reflected light)
        for (let i = 0; i < 200; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const len = 10 + Math.random() * 30;
            ctx.strokeStyle = `rgba(200, 240, 255, ${0.04 + Math.random() * 0.06})`;
            ctx.lineWidth = 1 + Math.random() * 2;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + len, y + (Math.random() - 0.5) * 6);
            ctx.stroke();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(6, 4);
        return texture;
    }

    _createRoofTileTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#8b2020';
        ctx.fillRect(0, 0, 512, 512);

        const rows = 16;
        const cols = 12;
        const rowH = 512 / rows;
        const colW = 512 / cols;

        // Draw tiles row by row (clay shingle effect)
        for (let r = 0; r < rows; r++) {
            const y = r * rowH;
            const xOffset = (r % 2) * (colW / 2);

            for (let c = -1; c <= cols; c++) {
                const x = c * colW + xOffset;

                // Shadow underneath
                ctx.fillStyle = '#450606';
                ctx.beginPath();
                ctx.arc(x + colW / 2, y + rowH, colW / 2 + 1, Math.PI, 0, true);
                ctx.fill();

                const colorValue = 0.85 + (Math.sin(r * 0.7 + c * 0.9) * 0.1);
                const redHex = Math.floor(139 * colorValue);
                const grnHex = Math.floor(32 * colorValue);
                ctx.fillStyle = `rgb(${redHex}, ${grnHex}, ${grnHex})`;

                ctx.beginPath();
                ctx.arc(x + colW / 2, y + rowH - 2, colW / 2 - 1, Math.PI, 0, true);
                ctx.fill();

                // Highlight rim
                ctx.strokeStyle = 'rgba(255, 120, 120, 0.2)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(x + colW / 2, y + rowH - 4, colW / 3, Math.PI, 0, true);
                ctx.stroke();
            }

            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.fillRect(0, y + rowH - 2, 512, 3);
        }

        // Moss & dirt
        for (let i = 0; i < 80; i++) {
            const mx = Math.random() * 512;
            const my = Math.random() * 512;
            const mr = 4 + Math.random() * 8;
            ctx.fillStyle = Math.random() > 0.65 ? 'rgba(50, 75, 30, 0.22)' : 'rgba(15, 10, 5, 0.28)';
            ctx.beginPath();
            ctx.arc(mx, my, mr, 0, Math.PI * 2);
            ctx.fill();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 2.5);
        return texture;
    }

    _createLeafTexture(baseColorHex, leafColorHex) {
        const cacheKey = `${baseColorHex}-${leafColorHex}`;
        if (this._leafTextureCache && this._leafTextureCache.has(cacheKey)) {
            return this._leafTextureCache.get(cacheKey);
        }

        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = baseColorHex;
        ctx.fillRect(0, 0, 256, 256);

        ctx.shadowBlur = 1;
        ctx.shadowColor = 'rgba(0,0,0,0.1)';

        for (let i = 0; i < 800; i++) {
            const x = Math.random() * 256;
            const y = Math.random() * 256;
            const rx = 3 + Math.random() * 5;
            const ry = rx * (0.5 + Math.random() * 0.2);
            const rot = Math.random() * Math.PI * 2;

            const rand = Math.random();
            if (rand < 0.45) {
                ctx.fillStyle = leafColorHex;
            } else if (rand < 0.75) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
            } else {
                ctx.fillStyle = baseColorHex;
            }

            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(rot);
            ctx.beginPath();
            ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(4, 4);

        if (!this._leafTextureCache) {
            this._leafTextureCache = new Map();
        }
        this._leafTextureCache.set(cacheKey, texture);
        return texture;
    }
}
