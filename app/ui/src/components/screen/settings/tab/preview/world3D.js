import React, {Component} from "react";
import * as THREE from "three";
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls.js";
import {loadVanillaTextures} from "../../../schematic/vanillaTextures";
import {blockTextures, disposeTexturePack} from "../../../schematic/texturePack";
import {blockTint} from "../../../schematic/blockColor";
import {buildWorldMeshes} from "./worldMesh";
import {createBlockModels} from "./blockModels";

const MAX_REGIONS = 9;

const loadBlocks = async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load blocks: ${response.status}`);
    return response.arrayBuffer();
};

export class World3D extends Component {
    container = React.createRef();
    state = {loading: true, error: null, limited: false, missing: []};

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
        const geometries = [];
        const materials = [], loadedTextures = [];
        let texturePack = null, modelLibrary = null;
        const instancedMeshes = [];
        const missing = new Set();
        this.cleanup = () => {
            if (this.animation) cancelAnimationFrame(this.animation);
            if (this.resize) window.removeEventListener("resize", this.resize);
            controls.dispose();
            container.removeEventListener("keydown", this.keyDown);
            window.removeEventListener("keyup", this.keyUp);
            geometries.forEach(geometry => geometry.dispose());
            instancedMeshes.forEach(mesh => mesh.dispose());
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
            try {
                const vanilla = await loadVanillaTextures();
                texturePack = vanilla.textures;
                if (vanilla.models) modelLibrary = createBlockModels(vanilla.models);
            } catch (_) { /* colors remain available */ }
            if (this.destroyed) {
                disposeTexturePack(texturePack);
                return;
            }
            const materialCache = new Map();
            const makeTextureMaterial = (url, identifier, descriptor) => {
                const material = new THREE.MeshLambertMaterial({color: 0xffffff,
                    alphaTest: descriptor?.translucent ? 0.01 : 0.1,
                    transparent: !!descriptor?.translucent, depthWrite: !descriptor?.translucent,
                    side: descriptor ? THREE.DoubleSide : THREE.FrontSide,
                    polygonOffset: !!descriptor?.tinted, polygonOffsetFactor: -1, polygonOffsetUnits: -1});
                const texture = new THREE.TextureLoader().load(url, () => {
                    material.color.set(descriptor?.water ? 0x3f76e4 : !descriptor || descriptor.tinted ? blockTint(identifier) : 0xffffff);
                    if (texture.image.height > texture.image.width) {
                        const frame = document.createElement("canvas");
                        frame.width = frame.height = texture.image.width;
                        frame.getContext("2d").drawImage(texture.image, 0, 0, frame.width, frame.height, 0, 0, frame.width, frame.height);
                        texture.image = frame;
                        texture.needsUpdate = true;
                    }
                    material.map = texture;
                    material.needsUpdate = true;
                });
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.magFilter = THREE.NearestFilter;
                texture.minFilter = THREE.NearestFilter;
                texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
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
            const nativeMaterialCache = new Map();
            const getNativeMaterials = (model, identifier, rgb) => model.materials.map(descriptor => {
                const name = descriptor.texture?.replace(/^minecraft:/, "").replace(/^block\//, "");
                const url = name && texturePack?.get(name);
                const tint = descriptor.water ? 0x3f76e4 : descriptor.tinted ? blockTint(identifier) : 0xffffff;
                const key = JSON.stringify([url, tint, descriptor.translucent, descriptor.color, url ? null : rgb]);
                if (nativeMaterialCache.has(key)) return nativeMaterialCache.get(key);
                if (!url) missing.add(identifier.split("[")[0]);
                const material = url ? makeTextureMaterial(url, identifier, descriptor) : new THREE.MeshLambertMaterial({
                    color: descriptor.color ?? (model.missing ? 0xff00ff : rgb), transparent:descriptor.translucent,
                    opacity:descriptor.translucent ? 0.4 : 1, depthWrite:!descriptor.translucent, side:THREE.DoubleSide});
                if (!url) materials.push(material);
                nativeMaterialCache.set(key, material);
                return material;
            });
            const modelGeometryCache = new Map();
            await Promise.all(regions.map(async region => {
                const previewPath = this.props.previewPath ?? "preview/current";
                const buffer = await loadBlocks(`session://${this.props.session}/${previewPath}/${dimension}.${region.x}.${region.z}.blocks.bin`);
                if (this.destroyed) return;
                for (const surface of buildWorldMeshes(buffer, modelLibrary)) {
                    const native = surface.model;
                    if (native?.missing || native?.specialized) missing.add(surface.identifier.split("[")[0]);
                    let geometry;
                    if (surface.instances && modelGeometryCache.has(surface.identifier)) {
                        geometry = modelGeometryCache.get(surface.identifier);
                    } else {
                        geometry = new THREE.BufferGeometry();
                        const source = surface.instances ? native : surface;
                        geometry.setAttribute("position", new THREE.BufferAttribute(source.positions, 3));
                        geometry.setAttribute("normal", new THREE.BufferAttribute(source.normals, 3));
                        geometry.setAttribute("uv", new THREE.BufferAttribute(source.uv, 2));
                        geometry.setIndex(new THREE.BufferAttribute(source.indices, 1));
                        source.groups.forEach(group => geometry.addGroup(group.start, group.count, group.materialIndex));
                        geometries.push(geometry);
                        if (surface.instances) modelGeometryCache.set(surface.identifier, geometry);
                    }
                    const material = native ? getNativeMaterials(native, surface.identifier, surface.color)
                        : getMaterial(surface.identifier, surface.color);
                    const mesh = surface.instances ? new THREE.InstancedMesh(geometry, material, surface.instances.length / 3)
                        : new THREE.Mesh(geometry, material);
                    if (surface.instances) {
                        const matrix = new THREE.Matrix4();
                        for (let i = 0; i < surface.instances.length; i += 3) {
                            matrix.makeTranslation(surface.instances[i], surface.instances[i + 1], surface.instances[i + 2]);
                            mesh.setMatrixAt(i / 3, matrix);
                        }
                        mesh.instanceMatrix.needsUpdate = true;
                        instancedMeshes.push(mesh);
                    }
                    mesh.position.set(region.x * 512 - originX, 0, region.z * 512 - originZ);
                    scene.add(mesh);
                }
            }));
            if (this.destroyed) return;
            const bounds = new THREE.Box3().setFromObject(scene);
            if (!bounds.isEmpty()) {
                const center = bounds.getCenter(new THREE.Vector3());
                const radius = bounds.getSize(new THREE.Vector3()).length() / 2;
                const aspect = container.clientWidth / Math.max(container.clientHeight, 1);
                const verticalFov = THREE.MathUtils.degToRad(camera.fov);
                const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
                const distance = radius / Math.sin(Math.min(verticalFov, horizontalFov) / 2) * 1.05;
                controls.target.copy(center);
                camera.position.copy(center).add(new THREE.Vector3(1, 0.8, 1).normalize().multiplyScalar(distance));
                camera.far = Math.max(20000, distance + radius * 3);
            }
            this.setState({loading: false, limited: allRegions.length > MAX_REGIONS, missing:[...missing].sort()});
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
        {this.state.missing.length > 0 && <details className="world_3d_notice" style={{top: "auto", bottom: 32, left: 12, transform: "none"}}>
            <summary>{this.state.missing.length} block types use fallback or simplified special models</summary>
            <div style={{maxHeight: 160, overflow: "auto"}}>{this.state.missing.join(", ")}</div>
        </details>}
        <div className="schematic_controls">WASD move · Shift faster · Mouse rotate · Wheel zoom</div>
    </div>; }
}
