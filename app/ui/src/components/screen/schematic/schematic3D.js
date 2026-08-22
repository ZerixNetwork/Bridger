import React, {Component} from "react";
import * as THREE from "three";
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls.js";
import {blockColor, blockTint} from "./blockColor";
import {blockTextures} from "./texturePack";

const MAX_BLOCKS = 2000000;
const MAX_VOLUME = 2000000;
const BUILD_BATCH = 32768;

export class Schematic3D extends Component {
    state = {warning: null, fullscreen: false, loading: true, progress: 0};
    container = React.createRef();
    viewer = React.createRef();

    componentDidMount() {
        this.start();
    }

    start = async () => {
        const container = this.container.current;
        const {schematic} = this.props;
        if (!this.props.allowLarge && schematic.width * schematic.height * schematic.length > MAX_VOLUME) {
            this.setState({warning: "Structure too large for 3D preview. Use the 2D view.", loading: false});
            return;
        }
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x242424);

        const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100000);
        const size = Math.max(schematic.width, schematic.height, schematic.length);
        camera.position.set(size * 1.2, size, size * 1.2);

        const renderer = new THREE.WebGLRenderer({antialias: true});
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 0, 0);
        controls.enableDamping = true;

        const keys = new Set();
        const movementKeys = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight"]);
        this.keyDown = event => {
            if (!movementKeys.has(event.code)) return;
            keys.add(event.code);
            event.preventDefault();
        };
        this.keyUp = event => keys.delete(event.code);
        this.clearKeys = () => keys.clear();
        this.viewer.current.addEventListener("keydown", this.keyDown);
        window.addEventListener("keyup", this.keyUp);
        window.addEventListener("blur", this.clearKeys);
        this.fullscreenChange = () => {
            this.setState({fullscreen: document.fullscreenElement === this.viewer.current});
            requestAnimationFrame(this.resize);
        };
        document.addEventListener("fullscreenchange", this.fullscreenChange);

        scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
        const light = new THREE.DirectionalLight(0xffffff, 0.8);
        light.position.set(1, 2, 1);
        scene.add(light);

        let geometry = null;
        const materials = [], loadedTextures = [];
        const disposeScene = () => {
            this.viewer.current?.removeEventListener("keydown", this.keyDown);
            window.removeEventListener("keyup", this.keyUp);
            window.removeEventListener("blur", this.clearKeys);
            document.removeEventListener("fullscreenchange", this.fullscreenChange);
            controls.dispose();
            geometry?.dispose();
            materials.forEach(material => material.dispose());
            loadedTextures.forEach(texture => texture.dispose());
            renderer.dispose();
            renderer.domElement.remove();
        };
        this.earlyCleanup = disposeScene;

        const {blocks, truncated} = await this.visibleBlocks(schematic);
        if (this.destroyed) return;
        if (truncated) this.setState({warning: `Preview limited to ${MAX_BLOCKS.toLocaleString()} visible blocks.`});
        const groups = new Map();
        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];
            const textures = blockTextures(this.props.textures, block.identifier);
            const key = textures ? `${textures.side}|${textures.top}|${textures.bottom}` : "fallback";
            if (!groups.has(key)) groups.set(key, {blocks: [], textures});
            groups.get(key).blocks.push(block);
            if (i > 0 && i % BUILD_BATCH === 0) {
                this.setState({progress: 70 + Math.round(i / blocks.length * 10)});
                await new Promise(resolve => requestAnimationFrame(resolve));
                if (this.destroyed) return;
            }
        }
        geometry = new THREE.BoxGeometry(1, 1, 1);
        const matrix = new THREE.Matrix4();
        const texturedMaterial = (textureUrl, block) => {
            const material = new THREE.MeshLambertMaterial({color: block.color, alphaTest: 0.1});
            const texture = new THREE.TextureLoader().load(textureUrl, () => {
                material.color.set(blockTint(block.identifier));
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
        let built = 0;
        for (const groupData of groups.values()) {
            const group = groupData.blocks;
            let material;
            if (!groupData.textures) {
                material = new THREE.MeshLambertMaterial();
                materials.push(material);
            } else {
                const side = texturedMaterial(groupData.textures.side, group[0]);
                const top = texturedMaterial(groupData.textures.top, group[0]);
                const bottom = texturedMaterial(groupData.textures.bottom, group[0]);
                material = [side, side, top, bottom, side, side];
            }
            const mesh = new THREE.InstancedMesh(geometry, material, group.length);
            for (let i = 0; i < group.length; i++) {
                const block = group[i];
                matrix.makeTranslation(
                    block.x - schematic.width / 2,
                    block.y - schematic.height / 2,
                    block.z - schematic.length / 2
                );
                mesh.setMatrixAt(i, matrix);
                if (!groupData.textures) mesh.setColorAt(i, new THREE.Color(block.color));
                built++;
                if (built % BUILD_BATCH === 0) {
                    this.setState({progress: 80 + Math.round(built / blocks.length * 20)});
                    await new Promise(resolve => requestAnimationFrame(resolve));
                    if (this.destroyed) return;
                }
            }
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            scene.add(mesh);
        }
        this.setState({loading: false, progress: 100});

        this.resize = () => {
            const width = container.clientWidth;
            const height = container.clientHeight;
            if (!width || !height || (width === this.renderWidth && height === this.renderHeight)) return;
            this.renderWidth = width;
            this.renderHeight = height;
            renderer.setSize(width, height, false);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        };
        window.addEventListener("resize", this.resize);
        this.resize();

        const clock = new THREE.Clock();
        const forward = new THREE.Vector3();
        const right = new THREE.Vector3();
        const movement = new THREE.Vector3();
        const animate = () => {
            this.animation = requestAnimationFrame(animate);
            this.resize();
            const delta = Math.min(clock.getDelta(), 0.1);
            camera.getWorldDirection(forward);
            forward.y = 0;
            forward.normalize();
            right.crossVectors(forward, camera.up).normalize();
            movement.set(0, 0, 0);
            if (keys.has("KeyW")) movement.add(forward);
            if (keys.has("KeyS")) movement.sub(forward);
            if (keys.has("KeyD")) movement.add(right);
            if (keys.has("KeyA")) movement.sub(right);
            if (movement.lengthSq() > 0) {
                const fast = keys.has("ShiftLeft") || keys.has("ShiftRight");
                movement.normalize().multiplyScalar(Math.max(4, size * 0.08) * delta * (fast ? 3 : 1));
                camera.position.add(movement);
                controls.target.add(movement);
            }
            controls.update();
            renderer.render(scene, camera);
        };
        animate();

        this.cleanup = () => {
            cancelAnimationFrame(this.animation);
            window.removeEventListener("resize", this.resize);
            disposeScene();
        };
    };

    componentWillUnmount() {
        this.destroyed = true;
        if (this.cleanup) this.cleanup();
        else this.earlyCleanup?.();
    }

    toggleFullscreen = async () => {
        if (document.fullscreenElement === this.viewer.current) await document.exitFullscreen();
        else await this.viewer.current.requestFullscreen();
        this.viewer.current.focus();
    };

    visibleBlocks = async (schematic) => {
        const blocks = [];
        const colors = schematic.palette.map(blockColor);
        const total = schematic.width * schematic.height * schematic.length;
        let scanned = 0;
        const colorAt = (x, y, z) => {
            if (x < 0 || y < 0 || z < 0 || x >= schematic.width || y >= schematic.height || z >= schematic.length) return null;
            return colors[schematic.blockAt(schematic.index(x, y, z))];
        };
        for (let y = 0; y < schematic.height && blocks.length < MAX_BLOCKS; y++) {
            for (let z = 0; z < schematic.length && blocks.length < MAX_BLOCKS; z++) {
                for (let x = 0; x < schematic.width && blocks.length < MAX_BLOCKS; x++) {
                    scanned++;
                    const color = colorAt(x, y, z);
                    if (color && (!colorAt(x - 1, y, z) || !colorAt(x + 1, y, z) || !colorAt(x, y - 1, z) ||
                        !colorAt(x, y + 1, z) || !colorAt(x, y, z - 1) || !colorAt(x, y, z + 1))) {
                        const identifier = schematic.palette[schematic.blockAt(schematic.index(x, y, z))];
                        blocks.push({x, y, z, color, identifier});
                    }
                    if ((scanned & 262143) === 0) {
                        if (this.destroyed) return {blocks, truncated: false};
                        this.setState({progress: Math.round(scanned / total * 70)});
                        await new Promise(resolve => requestAnimationFrame(resolve));
                    }
                }
            }
        }
        return {blocks, truncated: scanned < total};
    };

    render() { return <div className="schematic_3d" ref={this.viewer} tabIndex="0"
                          onPointerDown={() => this.viewer.current.focus()}>
        <div className="schematic_3d_canvas" ref={this.container}/>
        <button className="button small green schematic_fullscreen" onClick={this.toggleFullscreen}>
            {this.state.fullscreen ? "Exit fullscreen" : "Fullscreen"}
        </button>
        <div className="schematic_controls">WASD move · Shift faster · Mouse rotate · Wheel zoom</div>
        {this.state.loading && <div className="schematic_loading">
            <div className="schematic_spinner"/>
            <strong>Building 3D preview... {this.state.progress}%</strong>
        </div>}
        {this.state.warning && <div className="schematic_3d_warning">{this.state.warning}</div>}
    </div>; }
}
