import React from "react";
import {BaseScreen} from "../baseScreen";
import {readNbt, toSchematic} from "./nbt";
import "./schematicScreen.css";

export class SchematicScreen extends BaseScreen {
    state = {schematic: null, name: "", layer: 0, error: null};
    input = React.createRef();
    canvas = React.createRef();

    load = async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        try {
            const schematic = toSchematic(await readNbt(file));
            this.setState({schematic, name: file.name, layer: schematic.height - 1, error: null}, this.draw);
        } catch (error) {
            this.setState({schematic: null, name: file.name, error: error.message});
        }
    };

    color = (name) => {
        if (!name || name.includes("air") || name === "Block 0") return null;
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
        return `hsl(${Math.abs(hash) % 360} 38% 48%)`;
    };

    draw = () => {
        const {schematic, layer} = this.state;
        const canvas = this.canvas.current;
        if (!schematic || !canvas) return;
        canvas.width = schematic.width;
        canvas.height = schematic.length;
        const context = canvas.getContext("2d");
        context.clearRect(0, 0, canvas.width, canvas.height);
        for (let z = 0; z < schematic.length; z++) for (let x = 0; x < schematic.width; x++) {
            const color = this.color(schematic.palette[schematic.blocks[schematic.index(x, layer, z)]]);
            if (color) { context.fillStyle = color; context.fillRect(x, z, 1, 1); }
        }
    };

    setLayer = (event) => this.setState({layer: Number(event.target.value)}, this.draw);

    render() {
        const s = this.state.schematic;
        return <div className="maincol">
            <div className="topbar"><h1>Schematic Viewer</h1><h2>Preview Java and Bedrock structures locally, without conversion.</h2></div>
            <div className="main_content schematic_viewer">
                {!s && <button className="gray_box" onClick={() => this.input.current.click()}>
                    Select schematic<span>.schematic, .schem, .nbt, .mcstructure</span>
                </button>}
                <input ref={this.input} hidden type="file" accept=".schematic,.schem,.nbt,.mcstructure" onChange={this.load}/>
                {this.state.error && <p className="schematic_error">{this.state.error}</p>}
                {s && <>
                    <div className="schematic_info"><strong>{this.state.name}</strong><span>{s.width} x {s.height} x {s.length}</span></div>
                    <div className="schematic_canvas"><canvas ref={this.canvas}/></div>
                    <label>Layer {this.state.layer + 1} / {s.height}<input type="range" min="0" max={s.height - 1} value={this.state.layer} onChange={this.setLayer}/></label>
                </>}
            </div>
            <div className="bottombar">
                <button className="button red" onClick={() => window.location.reload()}>Back</button>
                {s && <button className="button green" onClick={() => this.input.current.click()}>Open another</button>}
            </div>
        </div>;
    }
}
