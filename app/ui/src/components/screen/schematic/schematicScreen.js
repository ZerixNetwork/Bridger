import React from "react";
import {BaseScreen} from "../baseScreen";
import {readNbt, toSchematic} from "./nbt";
import {blockColor} from "./blockColor";
import {Schematic3D} from "./schematic3D";
import {disposeTexturePack, loadTexturePack} from "./texturePack";
import {loadVanillaTextures} from "./vanillaTextures";
import {loadLegacyBlocks} from "./legacyBlocks";
import "./schematicScreen.css";

const SAFE_3D_VOLUME = 2000000;

export class SchematicScreen extends BaseScreen {
    state = {
        schematic: null, name: "", layer: 0, view: "3d", allowLarge3D: false,
        showLarge3DWarning: false, texturePack: null, texturePackName: "", textureStatus: "",
        loadingSchematic: false, loadingName: "", layerMode: false, revision: 0, error: null
    };
    input = React.createRef();
    canvas = React.createRef();
    textureInput = React.createRef();
    textureLoadId = 0;
    mounted = false;

    componentDidMount() {
        super.componentDidMount();
        this.mounted = true;
        if (this.app.state.pendingSchematicFile) {
            const file = this.app.state.pendingSchematicFile;
            this.app.setState({pendingSchematicFile: null});
            this.loadFile(file);
        }
    }

    load = async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        await this.loadFile(file);
    };

    loadFile = async (file) => {
        this.setState({loadingSchematic: true, loadingName: file.name, error: null});
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        try {
            const [nbt, legacyBlocks] = await Promise.all([readNbt(file), loadLegacyBlocks()]);
            const schematic = toSchematic(nbt, legacyBlocks);
            const large = schematic.width * schematic.height * schematic.length > SAFE_3D_VOLUME;
            this.setState(state => ({
                schematic, name: file.name, layer: schematic.height - 1, view: large ? "2d" : "3d",
                allowLarge3D: false, revision: state.revision + 1, error: null
            }), () => {
                this.draw();
                if (!this.state.texturePack) this.loadOriginalTextures();
            });
        } catch (error) {
            this.setState({schematic: null, name: file.name, error: error.message});
        } finally {
            this.setState({loadingSchematic: false});
        }
    };

    draw = () => {
        const {schematic, layer, layerMode} = this.state;
        const canvas = this.canvas.current;
        if (!schematic || !canvas) return;
        canvas.width = schematic.width;
        canvas.height = schematic.length;
        const context = canvas.getContext("2d");
        const colors = schematic.palette.map(blockColor);
        context.clearRect(0, 0, canvas.width, canvas.height);
        for (let z = 0; z < schematic.length; z++) for (let x = 0; x < schematic.width; x++) {
            if (layerMode) {
                const color = colors[schematic.blockAt(schematic.index(x, layer, z))];
                if (color) { context.fillStyle = color; context.fillRect(x, z, 1, 1); }
                continue;
            }
            for (let y = schematic.height - 1; y >= 0; y--) {
                const color = colors[schematic.blockAt(schematic.index(x, y, z))];
                if (color) {
                    context.fillStyle = color;
                    context.fillRect(x, z, 1, 1);
                    break;
                }
            }
        }
    };

    setLayer = (event) => this.setState({layer: Number(event.target.value)}, this.draw);

    show3D = () => {
        const s = this.state.schematic;
        const large = s.width * s.height * s.length > SAFE_3D_VOLUME;
        if (large && !this.state.allowLarge3D) {
            this.setState({showLarge3DWarning: true});
            return;
        }
        this.setState({view: "3d", allowLarge3D: large});
    };

    confirmLarge3D = () => this.setState({view: "3d", allowLarge3D: true, showLarge3DWarning: false});

    loadOriginalTextures = async () => {
        if (this.state.textureStatus.startsWith("Loading")) return;
        const loadId = ++this.textureLoadId;
        this.setState({textureStatus: "Loading bundled Minecraft textures..."});
        try {
            const result = await loadVanillaTextures();
            if (!this.mounted || loadId !== this.textureLoadId) {
                disposeTexturePack(result.textures);
                return;
            }
            disposeTexturePack(this.state.texturePack);
            this.setState(state => ({
                texturePack: result.textures, texturePackName: `Minecraft ${result.version}`,
                textureStatus: "", revision: state.revision + 1
            }));
        } catch (error) {
            if (this.mounted && loadId === this.textureLoadId) {
                this.setState({textureStatus: "Original textures unavailable. Using block colors."});
            }
        }
    };

    loadTextures = async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const loadId = ++this.textureLoadId;
        try {
            const texturePack = await loadTexturePack(file);
            if (!this.mounted || loadId !== this.textureLoadId) {
                disposeTexturePack(texturePack);
                return;
            }
            disposeTexturePack(this.state.texturePack);
            this.setState(state => ({
                texturePack, texturePackName: file.name, textureStatus: "", revision: state.revision + 1, error: null
            }));
        } catch (error) {
            if (this.mounted && loadId === this.textureLoadId) this.setState({error: error.message});
        }
    };

    componentWillUnmount() {
        this.mounted = false;
        this.textureLoadId++;
        disposeTexturePack(this.state.texturePack);
    }

    render() {
        const s = this.state.schematic;
        return <div className="maincol">
            {this.state.loadingSchematic && <div className="modal_overlay schematic_file_loading">
                <div className="modal">
                    <div className="schematic_spinner"/>
                    <h3>Loading schematic</h3>
                    <p>{this.state.loadingName}</p>
                </div>
            </div>}
            {this.state.showLarge3DWarning && <div className="modal_overlay">
                <div className="modal">
                    <h3>Large 3D preview</h3>
                    <p>This structure contains more than 2,000,000 blocks. Rendering it in 3D may freeze or crash the application and use significant memory.</p>
                    <p>
                        <button className="button red" onClick={() => this.setState({showLarge3DWarning: false})}>Cancel</button>
                        <button className="button green" onClick={this.confirmLarge3D}>Continue</button>
                    </p>
                </div>
            </div>}
            <div className="topbar"><h1>Schematic Viewer</h1><h2>Preview Java and Bedrock structures locally, without conversion.</h2></div>
            <div className="main_content schematic_viewer">
                {!s && <button className="gray_box" onClick={() => this.input.current.click()}>
                    Select schematic<span>.schematic, .schem, .nbt, .mcstructure</span>
                </button>}
                <input ref={this.input} hidden type="file" accept=".schematic,.schem,.nbt,.mcstructure"
                       onClick={event => event.target.value = null} onChange={this.load}/>
                {this.state.error && <p className="schematic_error">{this.state.error}</p>}
                {s && <>
                    <div className="schematic_info">
                        <strong>{this.state.name}</strong><span>{s.width} x {s.height} x {s.length}</span>
                        <div className="schematic_views">
                            <button className={this.state.view === "3d" ? "active" : ""} onClick={this.show3D}>3D</button>
                            <button className={this.state.view === "2d" ? "active" : ""} onClick={() => this.setState({view: "2d"}, this.draw)}>2D</button>
                        </div>
                        <button className="button small green" disabled={this.state.textureStatus.startsWith("Loading")}
                                onClick={this.loadOriginalTextures}>Original textures</button>
                        <button className="button small magenta" onClick={() => this.textureInput.current.click()}>Custom textures</button>
                        <input ref={this.textureInput} hidden type="file" accept=".zip"
                               onClick={event => event.target.value = null} onChange={this.loadTextures}/>
                    </div>
                    {this.state.texturePackName && <div className="schematic_pack">Textures: {this.state.texturePackName}</div>}
                    {this.state.textureStatus && <div className="schematic_pack">{this.state.textureStatus}</div>}
                    {this.state.view === "3d" && <Schematic3D key={this.state.revision} schematic={s}
                                                                     textures={this.state.texturePack} allowLarge={this.state.allowLarge3D}/>}
                    {this.state.view === "2d" && <>
                        <div className="schematic_2d_controls">
                            <button className={!this.state.layerMode ? "active" : ""}
                                    onClick={() => this.setState({layerMode: false}, this.draw)}>Top view</button>
                            <button className={this.state.layerMode ? "active" : ""}
                                    onClick={() => this.setState({layerMode: true}, this.draw)}>Layer</button>
                        </div>
                        <div className="schematic_canvas"><canvas ref={this.canvas}/></div>
                        {this.state.layerMode && <label>Layer {this.state.layer + 1} / {s.height}<input type="range" min="0" max={s.height - 1} value={this.state.layer} onChange={this.setLayer}/></label>}
                    </>}
                </>}
            </div>
            <div className="bottombar">
                <button className="button red" onClick={() => window.location.reload()}>Back</button>
                {s && <button className="button green" onClick={() => this.input.current.click()}>Open another</button>}
            </div>
        </div>;
    }
}
