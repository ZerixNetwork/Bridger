import React, {Component} from "react";
import * as THREE from "three";
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls.js";
import {loadVanillaTextures} from "../../../schematic/vanillaTextures";
import {blockTextures, disposeTexturePack} from "../../../schematic/texturePack";
import {blockTint} from "../../../schematic/blockColor";

const MAX_REGIONS = 9;

const loadBlocks = async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load blocks: ${response.status}`);
    return response.arrayBuffer();
};

export class World3D extends Component {
    container = React.createRef();
    state = {loading: true, error: null, limited: false};

    componentDidMount() { this.start(); }

    start = async () => {
        const container = this.container.current;
        const allRegions = this.props.data?.regions ?? [];
        if (!allRegions.length) {
            this.setState({loading: false, error: "No terrain is available for this dimension."});
            return;
        }
        const centerX = 0;
        const centerZ = 0;
        const regions = [...allRegions].sort((a, b) =>
            Math.hypot(a.x - centerX, a.z - centerZ) - Math.hypot(b.x - centerX, b.z - centerZ)
        ).slice(0, MAX_REGIONS);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x242424);
        const camera = new THREE.PerspectiveCamera(50, 1, 1, 20000);
        camera.position.set(700, 550, 700);
        const renderer = new THREE.WebGLRenderer({antialias: true});
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(renderer.domElement);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        const keys = new Set();
        const movementKeys = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight"]);
        this.keyDown = event => {
            if (!movementKeys.has(event.code)) return;
            keys.add(event.code);
            event.preventDefault();
        };
        this.keyUp = event => keys.delete(event.code);
        container.tabIndex = 0;
        container.addEventListener("keydown", this.keyDown);
        window.addEventListener("keyup", this.keyUp);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x333333, 1.7));
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const materials = [], loadedTextures = [];
        let texturePack = null;
        this.cleanup = () => {
            if (this.animation) cancelAnimationFrame(this.animation);
            if (this.resize) window.removeEventListener("resize", this.resize);
            controls.dispose();
            container.removeEventListener("keydown", this.keyDown);
            window.removeEventListener("keyup", this.keyUp);
            geometry.dispose();
            materials.forEach(material => material.dispose());
            loadedTextures.forEach(texture => texture.dispose());
            disposeTexturePack(texturePack);
            renderer.dispose();
            renderer.domElement.remove();
        };
        const dimension = this.props.dimension.replace(":", "_");
        const originX = regions.reduce((sum, region) => sum + region.x * 512, 0) / regions.length;
        const originZ = regions.reduce((sum, region) => sum + region.z * 512, 0) / regions.length;

        try {
            try { texturePack = (await loadVanillaTextures()).textures; } catch (_) { /* colors remain available */ }
            const materialCache = new Map();
            const makeTextureMaterial = (url, identifier) => {
                const material = new THREE.MeshLambertMaterial({color: 0xffffff, alphaTest: 0.1});
                const texture = new THREE.TextureLoader().load(url, () => {
                    material.color.set(blockTint(identifier));
                    material.map = texture;
                    material.needsUpdate = true;
                });
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.magFilter = THREE.NearestFilter;
                texture.minFilter = THREE.NearestFilter;
                loadedTextures.push(texture);
                materials.push(material);
                return material;
            };
            const getMaterial = (identifier, rgb) => {
                if (materialCache.has(identifier)) return materialCache.get(identifier);
                const textures = blockTextures(texturePack, identifier);
                let material;
                if (textures) {
                    const side = makeTextureMaterial(textures.side, identifier);
                    const top = makeTextureMaterial(textures.top, identifier);
                    const bottom = makeTextureMaterial(textures.bottom, identifier);
                    material = [side, side, top, bottom, side, side];
                } else {
                    material = new THREE.MeshLambertMaterial({color: rgb});
                    materials.push(material);
                }
                materialCache.set(identifier, material);
                return material;
            };
            await Promise.all(regions.map(async region => {
                const previewPath = this.props.previewPath ?? "preview/current";
                const buffer = await loadBlocks(`session://${this.props.session}/${previewPath}/${dimension}.${region.x}.${region.z}.blocks.bin`);
                if (this.destroyed) return;
                const data = new DataView(buffer);
                const count = data.getUint32(0);
                const paletteCount = data.getUint16(4);
                const palette = [];
                const decoder = new TextDecoder();
                let offset = 6;
                for (let i = 0; i < paletteCount; i++) {
                    const length = data.getUint32(offset);
                    offset += 4;
                    palette.push(decoder.decode(new Uint8Array(buffer, offset, length)));
                    offset += length;
                }
                const recordStart = offset;
                const counts = new Uint32Array(paletteCount);
                const colors = new Uint32Array(paletteCount);
                for (let i = 0; i < count; i++, offset += 12) {
                    const paletteIndex = data.getUint16(offset + 10);
                    counts[paletteIndex]++;
                    colors[paletteIndex] = data.getUint32(offset + 6);
                }
                const meshes = palette.map((identifier, index) => new THREE.InstancedMesh(
                    geometry, getMaterial(identifier, colors[index]), counts[index]
                ));
                const positions = new Uint32Array(paletteCount);
                const matrix = new THREE.Matrix4();
                offset = recordStart;
                for (let i = 0; i < count; i++, offset += 12) {
                    const x = data.getUint16(offset);
                    const y = data.getInt16(offset + 2);
                    const z = data.getUint16(offset + 4);
                    const paletteIndex = data.getUint16(offset + 10);
                    matrix.makeTranslation(region.x * 512 + x + 0.5 - originX, y + 0.5,
                        region.z * 512 + z + 0.5 - originZ);
                    meshes[paletteIndex].setMatrixAt(positions[paletteIndex]++, matrix);
                }
                meshes.forEach(mesh => {
                    mesh.instanceMatrix.needsUpdate = true;
                    scene.add(mesh);
                });
            }));
            if (this.destroyed) return;
            this.setState({loading: false, limited: allRegions.length > MAX_REGIONS});
        } catch (error) {
            if (!this.destroyed) this.setState({loading: false, error: "The 3D terrain preview could not be loaded."});
        }

        if (this.destroyed) return;

        this.resize = () => {
            const width = container.clientWidth, height = container.clientHeight;
            if (!width || !height) return;
            renderer.setSize(width, height, false);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        };
        window.addEventListener("resize", this.resize);
        this.resize();
        const clock = new THREE.Clock();
        const animate = () => {
            this.animation = requestAnimationFrame(animate);
            const delta = Math.min(clock.getDelta(), 0.1);
            const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 180 : 60;
            const forward = new THREE.Vector3();
            camera.getWorldDirection(forward);
            forward.y = 0;
            forward.normalize().multiplyScalar(speed * delta);
            const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize().multiplyScalar(speed * delta);
            const move = new THREE.Vector3();
            if (keys.has("KeyW")) move.add(forward);
            if (keys.has("KeyS")) move.sub(forward);
            if (keys.has("KeyD")) move.add(right);
            if (keys.has("KeyA")) move.sub(right);
            camera.position.add(move);
            controls.target.add(move);
            controls.update();
            renderer.render(scene, camera);
        };
        animate();
    };

    componentWillUnmount() {
        this.destroyed = true;
        this.cleanup?.();
    }

    render() { return <div className="world_3d" ref={this.container} onPointerDown={() => this.container.current.focus()}>
        {this.state.loading && <div className="world_3d_message">Building 3D terrain preview...</div>}
        {this.state.error && <div className="world_3d_message error">{this.state.error}</div>}
        {this.state.limited && <div className="world_3d_notice">Showing the 9 central regions for performance.</div>}
        <div className="schematic_controls">WASD move · Shift faster · Mouse rotate · Wheel zoom</div>
    </div>; }
}
