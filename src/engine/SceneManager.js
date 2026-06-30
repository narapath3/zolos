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
        this.sunLight.shadow.mapSize.set(2048, 2048);
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

        // Clouds
        this._createClouds();
    }

    _createClouds() {
        const cloudGeo = new THREE.PlaneGeometry(8, 4);
        const cloudMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
            depthWrite: false,
        });

        for (let i = 0; i < 15; i++) {
            const cloud = new THREE.Mesh(cloudGeo.clone(), cloudMat.clone());
            const angle = Math.random() * Math.PI * 2;
            const radius = 50 + Math.random() * 30;
            const height = 30 + Math.random() * 20;
            cloud.position.set(
                Math.cos(angle) * radius,
                height,
                Math.sin(angle) * radius
            );
            cloud.lookAt(0, height, 0);
            cloud.scale.setScalar(0.8 + Math.random() * 1.5);
            cloud.userData.speed = 0.02 + Math.random() * 0.03;
            cloud.userData.angle = angle;
            cloud.userData.radius = radius;
            cloud.userData.height = height;
            this.scene.add(cloud);
            this.envObjects.push(cloud);
            this.cloudSprites.push(cloud);
        }
    }

    // ============ Ground ============
    _createGround(config) {
        // Main textured ground with vertex colors
        const size = 70;
        const segments = 40;
        const groundGeo = new THREE.PlaneGeometry(size, size, segments, segments);

        // Add vertex colors for terrain variation
        const colors = [];
        const positions = groundGeo.attributes.position;
        const baseColor = new THREE.Color(config.groundColor);
        const altColor = new THREE.Color(config.groundColor2);
        const pathColor = new THREE.Color(config.pathColor);

        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const z = positions.getY(i); // Y in plane space = Z in world

            // Gentle terrain displacement
            const noise = Math.sin(x * 0.3) * Math.cos(z * 0.3) * 0.15;
            positions.setZ(i, noise);

            // Color variation
            let color = baseColor.clone();
            const distFromCenter = Math.sqrt(x * x + z * z);

            // Path areas (cross paths)
            if (Math.abs(x) < 2.0 || Math.abs(z) < 2.0) {
                color.lerp(pathColor, 0.7 - distFromCenter * 0.01);
            } else {
                // Natural variation
                const noiseVal = Math.sin(x * 0.5 + 1.3) * Math.cos(z * 0.7 + 0.8);
                color.lerp(altColor, noiseVal * 0.5 + 0.5);
            }

            // Edge darkening
            const edgeFade = Math.max(0, 1 - distFromCenter / (size * 0.4));
            color.multiplyScalar(0.6 + edgeFade * 0.5);

            colors.push(color.r, color.g, color.b);
        }

        groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        groundGeo.computeVertexNormals();

        const groundMat = new THREE.MeshLambertMaterial({
            vertexColors: true,
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);
        this.envObjects.push(ground);

        // Path overlay with better material
        const pathGeo = new THREE.PlaneGeometry(2.8, 50, 1, 10);
        const pathMat = new THREE.MeshLambertMaterial({
            color: config.pathColor,
            transparent: true,
            opacity: 0.6
        });
        const path = new THREE.Mesh(pathGeo, pathMat);
        path.rotation.x = -Math.PI / 2;
        path.position.y = 0.02;
        this.scene.add(path);
        this.envObjects.push(path);

        const crossPath = new THREE.Mesh(pathGeo.clone(), pathMat.clone());
        crossPath.rotation.x = -Math.PI / 2;
        crossPath.rotation.z = Math.PI / 2;
        crossPath.position.y = 0.02;
        this.scene.add(crossPath);
        this.envObjects.push(crossPath);
    }

    // ============ Water ============
    _createWater(config) {
        const waterGeo = new THREE.PlaneGeometry(8, 6, 20, 15);
        const waterMat = new THREE.MeshPhongMaterial({
            color: config.waterColor,
            transparent: true,
            opacity: 0.65,
            shininess: 100,
            specular: 0xffffff,
            side: THREE.DoubleSide,
        });
        const water = new THREE.Mesh(waterGeo, waterMat);
        water.rotation.x = -Math.PI / 2;
        water.position.set(-12, 0.05, 8);
        water.receiveShadow = true;
        this.scene.add(water);
        this.envObjects.push(water);
        this.waterMesh = water;

        // Pond edge rocks
        const rockPositions = [
            [-15, 6], [-15, 10], [-9, 6], [-9, 10],
            [-16, 8], [-8, 8], [-13, 5.5], [-11, 10.5],
        ];
        rockPositions.forEach(([x, z]) => {
            this._createRock(x, z, 0.25 + Math.random() * 0.2);
        });

        // Small bridge over water
        this._createBridge(-12, 8);
    }

    _createBridge(x, z) {
        const group = new THREE.Group();

        // Bridge planks
        const plankGeo = new THREE.BoxGeometry(3, 0.12, 0.4);
        const plankMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
        for (let i = 0; i < 7; i++) {
            const plank = new THREE.Mesh(plankGeo, plankMat);
            plank.position.set(0, 0.35, -1.5 + i * 0.5);
            plank.castShadow = true;
            group.add(plank);
        }

        // Bridge rails
        const railGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.6, 6);
        const railMat = new THREE.MeshLambertMaterial({ color: 0x5a3a1a });
        [-1.3, 1.3].forEach(xOff => {
            [-1.5, 0, 1.5].forEach(zOff => {
                const post = new THREE.Mesh(railGeo, railMat);
                post.position.set(xOff, 0.6, zOff);
                group.add(post);
            });
            // Rail bar
            const barGeo = new THREE.CylinderGeometry(0.04, 0.04, 3.2, 4);
            const bar = new THREE.Mesh(barGeo, railMat);
            bar.rotation.x = Math.PI / 2;
            bar.position.set(xOff, 0.85, 0);
            group.add(bar);
        });

        group.position.set(x, 0, z);
        this.scene.add(group);
        this.envObjects.push(group);
    }

    // ============ Environment ============
    _createEnvironment(config) {
        const treePositions = [
            [-12, -10], [-15, 2], [10, -12], [13, 7], [-8, 14],
            [16, -6], [-17, -4], [6, 16], [-10, -16], [14, 13],
            [-17, 10], [7, -17], [-5, -14], [17, -14], [-14, -12],
            [18, 3], [-6, 18], [4, -19], [-19, -7], [11, 18],
        ];

        treePositions.forEach(([x, z], idx) => {
            const typeIdx = idx % config.treeTypes.length;
            const type = config.treeTypes[typeIdx];
            this._createTree(x, z, type);
        });

        // Rocks scattered
        const rockPosMain = [
            [-5, -5], [6, -3], [-3, 9], [10, 10], [-9, 5],
            [4, -8], [-7, -13], [11, -9], [-12, 3], [8, 5],
            [15, 0], [-4, 7]
        ];
        rockPosMain.forEach(([x, z]) => this._createRock(x, z));

        // Decorations
        const density = config.decorDensity;
        // Flowers
        for (let i = 0; i < Math.floor(50 * density); i++) {
            const x = (Math.random() - 0.5) * 36;
            const z = (Math.random() - 0.5) * 36;
            if (Math.abs(x) < 1.5 && Math.abs(z) < 1.5) continue; // skip path
            this._createFlower(x, z);
        }

        // Grass tufts
        for (let i = 0; i < Math.floor(80 * density); i++) {
            const x = (Math.random() - 0.5) * 40;
            const z = (Math.random() - 0.5) * 40;
            this._createGrassTuft(x, z);
        }

        // Mushrooms
        for (let i = 0; i < Math.floor(12 * density); i++) {
            const x = (Math.random() - 0.5) * 30;
            const z = (Math.random() - 0.5) * 30;
            if (Math.abs(x) < 2 && Math.abs(z) < 2) continue;
            this._createMushroom(x, z);
        }

        // Fence segments along one edge
        this._createFence();

        // Signpost near spawn
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
                const colors = [0x2a8a2a, 0x3a9a3a, 0x4aaa3a];
                for (let i = 0; i < 3; i++) {
                    const coneGeo = new THREE.ConeGeometry(1.3 - i * 0.3, 1.6, 7);
                    const coneMat = new THREE.MeshLambertMaterial({ color: colors[i] });
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
                const canopyMat = new THREE.MeshLambertMaterial({ color: 0xffb0c0 });
                const canopy = new THREE.Mesh(canopyGeo, canopyMat);
                canopy.position.y = 3.8;
                canopy.scale.set(1, 0.7, 1);
                canopy.castShadow = true;
                group.add(canopy);
                // Extra pink cluster
                const cluster = new THREE.Mesh(
                    new THREE.SphereGeometry(1.2, 6, 5),
                    new THREE.MeshLambertMaterial({ color: 0xff90a0 })
                );
                cluster.position.set(0.5, 4.2, 0.3);
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
                    const droopMat = new THREE.MeshLambertMaterial({ color: 0x5aaa4a });
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
                const topMat = new THREE.MeshLambertMaterial({ color: 0x4a9a3a });
                const top = new THREE.Mesh(topGeo, topMat);
                top.position.y = 4.0;
                top.scale.set(1, 0.6, 1);
                top.castShadow = true;
                group.add(top);
                break;
            }
            case 'bush': {
                const bushGeo = new THREE.SphereGeometry(0.8, 6, 5);
                const bushMat = new THREE.MeshLambertMaterial({ color: 0x3a7a2a });
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
                const autumnColors = [0xd4642a, 0xc8841a, 0xb8441a];
                for (let i = 0; i < 3; i++) {
                    const coneGeo = new THREE.ConeGeometry(1.2 - i * 0.25, 1.5, 7);
                    const coneMat = new THREE.MeshLambertMaterial({ color: autumnColors[i] });
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
                    const coneMat = new THREE.MeshLambertMaterial({ color: 0x1a5a2a });
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
        // Stem
        const stemGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.3, 3);
        const stemMat = new THREE.MeshLambertMaterial({ color: 0x3a8a3a });
        const stem = new THREE.Mesh(stemGeo, stemMat);
        stem.position.y = 0.15;
        group.add(stem);
        // Flower head
        const flowerColors = [0xff6080, 0xffaa40, 0xff4060, 0xffd040, 0xff80ff, 0x60c0ff];
        const color = flowerColors[Math.floor(Math.random() * flowerColors.length)];
        const headGeo = new THREE.SphereGeometry(0.08, 5, 4);
        const headMat = new THREE.MeshLambertMaterial({ color });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 0.32;
        group.add(head);

        group.position.set(x, 0, z);
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
            ? [{ x: 25, z: 0, target: 'payon' }]
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

    // ============ NPC ============
    _createNPC() {
        const group = new THREE.Group();
        group.userData.isNPC = true;
        group.userData.npcType = 'shop';

        // Body
        const bodyGeo = new THREE.CylinderGeometry(0.25, 0.35, 1.2, 8);
        const bodyMat = new THREE.MeshLambertMaterial({ color: 0x4060c0 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.9;
        body.castShadow = true;
        group.add(body);

        // Cape / dress
        const dressGeo = new THREE.ConeGeometry(0.55, 0.8, 8);
        const dressMat = new THREE.MeshLambertMaterial({ color: 0x3050a0 });
        const dress = new THREE.Mesh(dressGeo, dressMat);
        dress.position.y = 0.4;
        group.add(dress);

        // Head
        const headGeo = new THREE.SphereGeometry(0.25, 8, 6);
        const headMat = new THREE.MeshLambertMaterial({ color: 0xf5d0a0 });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 1.7;
        head.castShadow = true;
        group.add(head);

        // Hat (kafra style)
        const hatGeo = new THREE.ConeGeometry(0.3, 0.4, 6);
        const hatMat = new THREE.MeshLambertMaterial({ color: 0xf0c040 });
        const hat = new THREE.Mesh(hatGeo, hatMat);
        hat.position.y = 2.05;
        group.add(hat);

        // Floating name tag
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, 256, 64);
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd040';
        ctx.fillText('🏪 Kafra Shop', 128, 38);
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.position.y = 2.8;
        sprite.scale.set(2.5, 0.6, 1);
        group.add(sprite);

        group.position.set(5, 0, -3);
        this.scene.add(group);
        this.envObjects.push(group);
        this.npcMesh = group;
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

        // Animate water
        if (this.waterMesh) {
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

        // Animate clouds
        this.cloudSprites.forEach(cloud => {
            cloud.userData.angle += cloud.userData.speed * dt;
            cloud.position.x = Math.cos(cloud.userData.angle) * cloud.userData.radius;
            cloud.position.z = Math.sin(cloud.userData.angle) * cloud.userData.radius;
        });

        // Animate portal glow
        this.portalMeshes.forEach(portal => {
            const scale = 1 + Math.sin(this.time * 3) * 0.05;
            portal.children[0].scale.setScalar(scale); // ring pulse
            portal.children[1].material.opacity = 0.3 + Math.sin(this.time * 2) * 0.15;
        });
    }
}
