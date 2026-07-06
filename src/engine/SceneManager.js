// Scene Manager — Three.js Scene, Camera, Renderer, Environment
// Upgraded: Lush world with water, varied trees, sky dome, portals, NPC
import * as THREE from 'three';

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

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.3;

        // Clock
        this.clock = new THREE.Clock();

        // Animation time
        this.time = 0;
        this.waterMesh = null;
        this.cloudSprites = [];
        this.portalMeshes = [];
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
        this.sunLight.castShadow = true;
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
        this.waterMesh = null;
        this.cloudSprites = [];
        this.npcMesh = null;
        this.swayingObjects = [];
        this.birds = [];

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
        this._createEnvironment(config);
        this._createPortals(mapId);
        this._createBirds();

        if (mapId === 'prontera') {
            this._createNPC();
        }
    }

    getCurrentMapName() {
        return MAP_CONFIGS[this.currentMap]?.name || 'Unknown';
    }

    getPortals() {
        return this.portalMeshes;
    }

    getNPC() {
        return this.npcMesh;
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
                    // Grass color variation
                    const noiseVal = Math.sin(x * 0.5 + 1.3) * Math.cos(z * 0.7 + 0.8);
                    color.lerp(altColor, noiseVal * 0.5 + 0.5);
                }
            }

            // Vignette shading on outer edges
            const edgeFade = Math.max(0, 1 - distFromCenter / (size * 0.4));
            color.multiplyScalar(0.6 + edgeFade * 0.5);

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
        return Math.abs(z - riverZ) > 7.0;
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

    // ============ Portals ============
    _createPortals(mapId) {
        const portalPositions = mapId === 'prontera'
            ? [{ x: 25, z: -5, target: 'payon' }]
            : [{ x: -25, z: 0, target: 'prontera' }];

        portalPositions.forEach(p => {
            const group = new THREE.Group();
            group.userData.targetMap = p.target;

            // Portal ring
            const ringGeo = new THREE.TorusGeometry(1.5, 0.15, 8, 20);
            const ringMat = new THREE.MeshBasicMaterial({ color: 0x40c0ff });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = Math.PI / 2;
            ring.position.y = 1.8;
            group.add(ring);

            // Inner glow
            const glowGeo = new THREE.CircleGeometry(1.3, 16);
            const glowMat = new THREE.MeshBasicMaterial({
                color: 0x60d0ff,
                transparent: true,
                opacity: 0.4,
                side: THREE.DoubleSide,
            });
            const glow = new THREE.Mesh(glowGeo, glowMat);
            glow.rotation.x = -Math.PI / 2;
            glow.position.y = 1.8;
            group.add(glow);

            // Base pillars
            [-1.2, 1.2].forEach(xOff => {
                const pillarGeo = new THREE.BoxGeometry(0.4, 3.5, 0.4);
                const pillarMat = new THREE.MeshLambertMaterial({ color: 0x5a6a8a });
                const pillar = new THREE.Mesh(pillarGeo, pillarMat);
                pillar.position.set(xOff, 1.75, 0);
                pillar.castShadow = true;
                group.add(pillar);
            });

            // Floating particles (point light)
            const particleLight = new THREE.PointLight(0x40c0ff, 0.8, 8);
            particleLight.position.set(0, 2, 0);
            group.add(particleLight);

            group.position.set(p.x, 0, p.z);
            this.scene.add(group);
            this.envObjects.push(group);
            this.portalMeshes.push(group);
        });
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
        canvas.width = 512;
        canvas.height = 96;
        const ctx = canvas.getContext('2d');
        // Background
        ctx.fillStyle = 'rgba(40, 20, 10, 0.7)';
        ctx.roundRect(8, 8, 496, 80, 12);
        ctx.fill();
        // Border
        ctx.strokeStyle = '#c8a050';
        ctx.lineWidth = 3;
        ctx.roundRect(8, 8, 496, 80, 12);
        ctx.stroke();
        // Text
        ctx.font = 'bold 36px Arial';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd040';
        ctx.fillText('🏪 ร้านค้า', 256, 60);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const nameTag = new THREE.Sprite(spriteMat);
        nameTag.position.y = 4.4;
        nameTag.scale.set(3.5, 0.7, 1);
        group.add(nameTag);

        // ---- Position the entire shop on dry land ----
        group.position.set(-8, 0, 5);
        this.scene.add(group);
        this.envObjects.push(group);
        this.npcMesh = group;
    }

    getMouseIntersection(event, monsters, npc) {
        if (!this.canvas) return null;

        const rect = this.canvas.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);

        const targets = [];

        if (this.groundMesh) targets.push(this.groundMesh);
        if (npc) targets.push(npc);
        if (monsters && monsters.monsters) {
            monsters.monsters.forEach(m => {
                if (m.alive && m.mesh) {
                    targets.push(m.mesh);
                }
            });
        }

        const intersects = raycaster.intersectObjects(targets, true);
        if (intersects.length > 0) {
            const hit = intersects[0];
            let obj = hit.object;

            while (obj) {
                if (obj === npc) {
                    return { type: 'npc', point: hit.point, object: npc };
                }
                if (monsters && monsters.monsters) {
                    const matchedMonster = monsters.monsters.find(m => m.mesh === obj && m.alive);
                    if (matchedMonster) {
                        return { type: 'monster', point: hit.point, object: matchedMonster };
                    }
                }
                obj = obj.parent;
            }

            if (hit.object === this.groundMesh) {
                return { type: 'ground', point: hit.point };
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
    followTarget(targetPos) {
        const offsetX = 0;
        const offsetY = 18;
        const offsetZ = 18;
        const smoothing = 0.08;

        const targetCamX = targetPos.x + offsetX;
        const targetCamY = targetPos.y + offsetY;
        const targetCamZ = targetPos.z + offsetZ;

        this.camera.position.x += (targetCamX - this.camera.position.x) * smoothing;
        this.camera.position.y += (targetCamY - this.camera.position.y) * smoothing;
        this.camera.position.z += (targetCamZ - this.camera.position.z) * smoothing;

        this.camera.lookAt(targetPos.x, targetPos.y, targetPos.z);
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

        // Animate portal glow
        this.portalMeshes.forEach(portal => {
            const scale = 1 + Math.sin(this.time * 3) * 0.05;
            portal.children[0].scale.setScalar(scale); // ring pulse
            portal.children[1].material.opacity = 0.3 + Math.sin(this.time * 2) * 0.15;
        });

        // Animate fishing bobber & line
        this._updateFishingAnimations(dt);
    }

    // ============ 3D Fishing Visuals ============
    createFishingLine(playerPos) {
        this.removeFishingLine();

        this._fishingGroup = new THREE.Group();

        // Bobber landing position — water near bridge edge
        const bobberX = 2.8;
        const bobberZ = -2;
        const bobberY = 0.05;

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
        this._fishingPlayerPos = { ...playerPos };
        this._fishingBiteActive = false;
        this._fishingBiteTimer = 0;

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

        // Update the fishing line curve dynamically (throttled: every 2nd frame)
        this._fishingLineFrame = ((this._fishingLineFrame || 0) + 1) % 2;
        if (this._fishingLineFrame === 0 && this._fishingLineMesh && this._fishingPlayerPos) {
            const pp = this._fishingPlayerPos;
            const bp = this._fishingBobber.position;
            const curve = new THREE.QuadraticBezierCurve3(
                new THREE.Vector3(pp.x, (pp.y || 0) + 1.4, pp.z),
                new THREE.Vector3(
                    (pp.x + bp.x) / 2,
                    2.5 + Math.sin(this.time * 1.5) * 0.1,
                    (pp.z + bp.z) / 2
                ),
                new THREE.Vector3(bp.x, bp.y, bp.z)
            );
            const points = curve.getPoints(24);
            this._fishingLineMesh.geometry.setFromPoints(points);
        }
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
