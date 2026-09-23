import React from "react";
import {decode} from "base64-arraybuffer";
import {BaseScreen} from "../baseScreen";
import api from "../../../api";
import {World3D} from "../settings/tab/preview/world3D";
import {getDimensionDisplayName} from "../settings/tab/dimensionPruningTab";
import "./worldRenderScreen.css";

const request = (data, onProgress) => new Promise((resolve, reject) => api.send(data, message => {
    if (message.type === "response") resolve(message.output);
    else if (message.type === "error") reject(new Error(message.error));
    else onProgress?.(message);
}));

const decodePreview = base64 => {
    const buffer = decode(base64);
    const data = new DataView(buffer);
    const worlds = {};
    let offset = 0;
    const count = data.getInt32(offset, true); offset += 4;
    for (let i = 0; i < count; i++) {
        const length = data.getUint16(offset, true); offset += 2;
        const identifier = new TextDecoder().decode(new Uint8Array(buffer, offset, length)); offset += length;
        const world = worlds[identifier] = {
            minX: data.getInt32(offset, true), minZ: data.getInt32(offset + 4, true),
            maxX: data.getInt32(offset + 8, true), maxZ: data.getInt32(offset + 12, true), regions: []
        };
        offset += 16;
        const regions = data.getInt32(offset, true); offset += 4;
        for (let region = 0; region < regions; region++) {
            world.regions.push({x: data.getInt32(offset, true), z: data.getInt32(offset + 4, true)});
            offset += 136;
        }
    }
    return worlds;
};

export class WorldRenderScreen extends BaseScreen {
    state = {maps: [], active: null, loading: false, status: "", error: null};

    connect = () => new Promise((resolve, reject) => {
        if (api.isConnected()) return resolve();
        api.connect(code => api.isConnected() ? resolve() : reject(new Error(`Backend stopped (${code})`)));
    });

    chooseFolders = async () => {
        const selectedPaths = await window.chunker.chooseWorldFolders();
        if (!selectedPaths.length) return;
        this.setState({loading: true, error: null, status: "Searching for Minecraft worlds..."});
        try {
            const paths = await window.chunker.discoverWorldFolders(selectedPaths);
            if (!paths.length) throw new Error("No Minecraft worlds were found in the selected folders.");
            await this.connect();
            for (const worldPath of paths) await this.loadWorld(worldPath);
        } catch (error) {
            this.setState({error: error.message});
        } finally {
            this.setState({loading: false, status: ""});
        }
    };

    loadWorld = async worldPath => {
        const name = worldPath.split(/[\\/]/).filter(Boolean).pop();
        const id = crypto.randomUUID().replaceAll("-", "");
        this.setState({status: `Loading ${name}...`});
        const session = await request({type: "flow", method: "select_world", path: worldPath});
        const preview = await request({type: "flow", method: "generate_preview", previewId: id}, message => {
            if (message.type === "progress") this.setState({status: `Rendering ${name}... ${Math.round(message.percentage * 100)}%`});
        });
        const data = decodePreview(preview);
        const dimension = Object.keys(data)[0];
        this.setState(state => ({
            maps: [...state.maps, {id, name, session: session.session, data, dimension}], active: id
        }));
    };

    updateDimension = (id, dimension) => this.setState(state => ({
        maps: state.maps.map(map => map.id === id ? {...map, dimension} : map)
    }));

    closeMap = id => this.setState(state => {
        const maps = state.maps.filter(map => map.id !== id);
        return {maps, active: state.active === id ? maps.at(-1)?.id ?? null : state.active};
    });

    render() {
        const active = this.state.maps.find(map => map.id === this.state.active);
        return <div className="maincol world_render_screen">
            <div className="topbar"><h1>Rendering 3D</h1><h2>Open multiple Minecraft worlds in separate tabs.</h2></div>
            <div className="world_render_tabs">
                {this.state.maps.map(map => <button key={map.id} className={map.id === this.state.active ? "active" : ""}
                    onClick={() => this.setState({active: map.id})}>{map.name}
                    <span onClick={event => { event.stopPropagation(); this.closeMap(map.id); }}>×</span></button>)}
                <button className="add" disabled={this.state.loading} onClick={this.chooseFolders}>+ Add worlds</button>
            </div>
            <div className="main_content world_render_content">
                {!active && !this.state.loading && <button className="gray_box" onClick={this.chooseFolders}>
                    Select world folders<span>Choose one or more Java or Bedrock worlds</span></button>}
                {this.state.loading && <div className="world_render_status"><div className="schematic_spinner"/><strong>{this.state.status}</strong></div>}
                {this.state.error && <p className="schematic_error">{this.state.error}</p>}
                {active && <>
                    <select value={active.dimension} onChange={event => this.updateDimension(active.id, event.target.value)}>
                        {Object.keys(active.data).map(dimension => <option key={dimension} value={dimension}>
                            {getDimensionDisplayName(dimension)}</option>)}
                    </select>
                    <World3D key={`${active.id}-${active.dimension}`} session={active.session}
                        previewPath={`preview/${active.id}`} dimension={active.dimension} data={active.data[active.dimension]}/>
                </>}
            </div>
            <div className="bottombar"><button className="button red" onClick={() => window.location.reload()}>Back</button>
                <button className="button green" disabled={this.state.loading} onClick={this.chooseFolders}>Add worlds</button></div>
        </div>;
    }
}
