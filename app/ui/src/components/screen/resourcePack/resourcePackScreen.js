import React from "react";
import {saveAs} from "file-saver";
import {SelectWorldScreen} from "../select/selectWorldScreen";
import {BaseScreen} from "../baseScreen";
import {convertResourcePack, inspectResourcePack} from "./converter";
import {versionsFor} from "./versions";
import "./resourcePackScreen.css";

export class ResourcePackScreen extends BaseScreen {
    state = {file: null, source: null, sourceVersion: "", targetVersion: "", extensionMismatch: false,
        converting: false, error: null, report: null};
    input = React.createRef();

    selectFile = async event => {
        const file = event.target.files[0];
        if (!file) return;
        this.setState({file, source: null, error: null, report: null});
        try {
            const {source, sourceVersion, extensionMismatch} = await inspectResourcePack(file);
            const target = source === "java" ? "bedrock" : "java";
            const targetVersions = versionsFor(target);
            this.setState({source, extensionMismatch, sourceVersion: sourceVersion || versionsFor(source).at(-1).id,
                targetVersion: targetVersions.at(-1).id});
        } catch (error) {
            this.setState({file: null, error: error.message});
        }
    };

    convert = async () => {
        this.setState({converting: true, error: null});
        try {
            const result = await convertResourcePack(this.state.file, {
                sourceVersion: this.state.sourceVersion,
                targetVersion: this.state.targetVersion
            });
            saveAs(result.blob, result.fileName);
            this.setState({report: result.report});
        } catch (error) {
            this.setState({error: error.message});
        } finally {
            this.setState({converting: false});
        }
    };

    render() {
        const target = this.state.source === "java" ? "Bedrock" : "Java";
        const sourceVersions = this.state.source ? versionsFor(this.state.source) : [];
        const targetVersions = this.state.source ? versionsFor(this.state.source === "java" ? "bedrock" : "java") : [];
        return <div className="maincol resource_pack_screen">
            <div className="topbar">
                <h1>Resource Pack Converter</h1>
                <h2>Convert common textures between Java and Bedrock locally.</h2>
            </div>
            <div className="main_content resource_pack_content">
                <div className="resource_pack_alpha">
                    <strong>ALPHA</strong>
                    <span>Resource Pack Converter is experimental. Some textures or pack features may need manual fixes.</span>
                </div>
                <input ref={this.input} hidden type="file" accept=".zip,.mcpack" onChange={this.selectFile}/>
                <button className="gray_box resource_pack_picker" onClick={() => this.input.current.click()}>
                    {this.state.file ? this.state.file.name : "Select resource pack"}
                    <span>Supported types: .zip, .mcpack</span>
                </button>
                {this.state.source && <div className="resource_pack_direction">
                    <div><small>Source</small><strong>{this.state.source === "java" ? "Java" : "Bedrock"}</strong>
                        <select value={this.state.sourceVersion} onChange={event => this.setState({sourceVersion: event.target.value})}>
                            {!sourceVersions.some(version => version.id === this.state.sourceVersion) &&
                                <option value={this.state.sourceVersion}>{this.state.sourceVersion}</option>}
                            {sourceVersions.map(version => <option key={version.id}>{version.id}</option>)}
                        </select>
                    </div>
                    <span>→</span>
                    <div><small>Target</small><strong>{target}</strong>
                        <select value={this.state.targetVersion} onChange={event => this.setState({targetVersion: event.target.value})}>
                            {targetVersions.map(version => <option key={version.id}>{version.id}</option>)}
                        </select>
                    </div>
                </div>}
                {this.state.error && <p className="resource_pack_error">{this.state.error}</p>}
                {this.state.extensionMismatch && <p className="resource_pack_warning">
                    File uses .mcpack extension, but its internal metadata and folders are Java format.
                </p>}
                {this.state.report && <p className="resource_pack_success">
                    Converted {this.state.report.converted.length} files. Preserved {this.state.report.unmapped.length} unmapped files in <code>bridger_unmapped/</code>.
                </p>}
                <p className="resource_pack_note">Models, animations, sounds definitions and UI layouts may require manual work. Original unmapped files stay inside output archive.</p>
            </div>
            <div className="bottombar">
                <button className="button red" onClick={() => this.props.app.setScreen(SelectWorldScreen)}>Back</button>
                <button className="button green" disabled={!this.state.source || this.state.converting} onClick={this.convert}>
                    {this.state.converting ? "Converting..." : `Convert${this.state.source ? ` to ${target}` : ""}`}
                </button>
            </div>
        </div>;
    }
}
