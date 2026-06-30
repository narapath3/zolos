// Scene Manager — Three.js Scene, Camera, Renderer, Environment
import * as THREE from 'three';

export class SceneManager {
    constructor(canvas) {
        this.canvas = canvas;

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a2a3a);
        this.scene.fog = new THREE.FogExp2(0x1a2a3a, 0.015);

        // Camera (isometric-style)
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 200);
        this.camera.position.set(0, 18, 18);
        this.camera.lookAt(0, 0, 0);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;

        // Clock
        this.clock = new THREE.Clock();

        // Lights
        this._setupLights();

        // Environment
        this._createGround();
        this._createEnvironment();

        // Resize handling
        window.addEventListener('resize', () => this._onResize());
    }

    _setupLights() {
        // Ambient
        const ambient = new THREE.AmbientLight(0x404870, 0.6);
        this.scene.add(ambient);

        // Directional (sun)
        this.sunLight = new THREE.DirectionalLight(0xffe0a0, 1.2);
        this.sunLight.position.set(10, 20, 10);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.set(2048, 2048);
        this.sunLight.shadow.camera.near = 0.5;
        this.sunLight.shadow.camera.far = 60;
        this.sunLight.shadow.camera.left = -20;
        this.sunLight.shadow.camera.right = 20;
        this.sunLight.shadow.camera.top = 20;
        this.sunLight.shadow.camera.bottom = -20;
        this.scene.add(this.sunLight);

        // Point lights for atmosphere
        const pointLight1 = new THREE.PointLight(0x4080ff, 0.5, 30);
        pointLight1.position.set(-8, 4, -8);
        this.scene.add(pointLight1);

        const pointLight2 = new THREE.PointLight(0xff8040, 0.4, 25);
        pointLight2.position.set(8, 3, 6);
        this.scene.add(pointLight2);
    }

    _createGround() {
        // Main ground
        const groundGeo = new THREE.PlaneGeometry(60, 60, 30, 30);
        const groundMat = new THREE.MeshLambertMaterial({ color: 0x2a5a2a });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Path/road
        const pathGeo = new THREE.PlaneGeometry(3, 40);
        const pathMat = new THREE.MeshLambertMaterial({ color: 0x8a7a5a });
        const path = new THREE.Mesh(pathGeo, pathMat);
        path.rotation.x = -Math.PI / 2;
        path.position.y = 0.01;
        this.scene.add(path);

        // Cross path
        const crossPath = new THREE.Mesh(pathGeo.clone(), pathMat.clone());
        crossPath.rotation.x = -Math.PI / 2;
        crossPath.rotation.z = Math.PI / 2;
        crossPath.position.y = 0.01;
        this.scene.add(crossPath);
    }

    _createEnvironment() {
        // Trees
        const treePositions = [
            [-10, -8], [-12, 4], [8, -10], [11, 6], [-7, 12],
            [14, -5], [-14, -3], [5, 14], [-9, -14], [12, 12],
            [-15, 8], [6, -15], [-4, -12], [15, -12], [-12, -10]
        ];

        treePositions.forEach(([x, z]) => {
            this._createTree(x, z);
        });

        // Rocks
        const rockPositions = [
            [-5, -5], [6, -3], [-3, 8], [9, 9], [-8, 5],
            [4, -8], [-6, -12], [10, -8], [-11, 2]
        ];

        rockPositions.forEach(([x, z]) => {
            this._createRock(x, z);
        });

        // Flowers / grass patches
        for (let i = 0; i < 40; i++) {
            const x = (Math.random() - 0.5) * 28;
            const z = (Math.random() - 0.5) * 28;
            this._createGrassDecor(x, z);
        }
    }

    _createTree(x, z) {
        const group = new THREE.Group();

        // Trunk
        const trunkGeo = new THREE.CylinderGeometry(0.15, 0.25, 2, 6);
        const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 1;
        trunk.castShadow = true;
        group.add(trunk);

        // Canopy (layered)
        const colors = [0x2a8a2a, 0x3a9a3a, 0x4aaa3a];
        for (let i = 0; i < 3; i++) {
            const coneGeo = new THREE.ConeGeometry(1.2 - i * 0.3, 1.5, 6);
            const coneMat = new THREE.MeshLambertMaterial({ color: colors[i] });
            const cone = new THREE.Mesh(coneGeo, coneMat);
            cone.position.y = 2 + i * 0.8;
            cone.castShadow = true;
            group.add(cone);
        }

        group.position.set(x, 0, z);
        group.scale.setScalar(0.8 + Math.random() * 0.6);
        this.scene.add(group);
    }

    _createRock(x, z) {
        const geo = new THREE.DodecahedronGeometry(0.4 + Math.random() * 0.4, 0);
        const mat = new THREE.MeshLambertMaterial({ color: 0x6a6a7a });
        const rock = new THREE.Mesh(geo, mat);
        rock.position.set(x, 0.2, z);
        rock.rotation.set(Math.random(), Math.random(), 0);
        rock.castShadow = true;
        this.scene.add(rock);
    }

    _createGrassDecor(x, z) {
        const geo = new THREE.PlaneGeometry(0.3, 0.5);
        const mat = new THREE.MeshLambertMaterial({
            color: Math.random() > 0.7 ? 0xffff40 : 0x40aa40,
            side: THREE.DoubleSide
        });
        const grass = new THREE.Mesh(geo, mat);
        grass.position.set(x, 0.25, z);
        grass.rotation.y = Math.random() * Math.PI;
        this.scene.add(grass);
    }

    _onResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }

    // Get delta time
    getDelta() {
        return this.clock.getDelta();
    }

    // Render
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
}
