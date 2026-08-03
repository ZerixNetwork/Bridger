import React from "react";
import {BaseScreen} from "../baseScreen";
import {SettingsScreen} from "../settings/settingsScreen";
import {getFormatName, getVersionName, ModeOption} from "./modeOption";
import {ProcessingScreen} from "../processing/processingScreen";
import api from "../../../api";

export class ModeScreen extends BaseScreen {
    state = {
        selected: undefined,
        edition: undefined
    };

    getStage = () => {
        return 2;
    };

    convertWorld = (advanced) => {
        // Get data
        let data = this.app.state.sessionData.version.writers.filter(key => key.id === this.state.selected)[0];

        // Start preview if already done
        if (!this.app.state.requestPreview && advanced && this.app.settingsProgress.isComplete()) {
            this.app.generatePreview();
        }

        // Update output
        this.app.setState({outputType: data, requestPreview: advanced});

        let self = this;
        if (advanced) {
            // Fetch inputType mappings
            fetch("static://blocks/" + this.app.state.inputType.id)
                .then(res => res.json())
                .then(data =>
                    self.app.setState({inputBlockSuggestions: data})
                );

            // Fetch outputType mappings
            fetch("static://blocks/" + data.id)
                .then(res => res.json())
                .then(data =>
                    self.app.setState({outputBlockSuggestions: data})
                );

            api.send({
                type: "flow",
                method: "get_biomes",
                outputType: data.id
            }, function (message) {
                if (message.type === "response") {
                    self.app.setState({
                        inputBiomeSuggestions: message.output.input,
                        outputBiomeSuggestions: message.output.output
                    });
                }
            });

            // Next screen
            this.app.setScreen(SettingsScreen);
        } else {
            // Next screen
            this.app.setScreen(ProcessingScreen);
        }
    };
    updateSelected = (newSelection) => {
        this.setState({selected: newSelection});
    };

    render() {
        const input = this.app.state.inputType;
        const inputFormat = getFormatName(input.id);
        const inputVersion = input.version || getVersionName(input.id);
        const inputEdition = input.id.startsWith("BEDROCK_") ? "bedrock" : "java";
        let writers = this.app.state.sessionData.version.writers.slice(0).reverse()
            .filter(writer => !this.state.edition || writer.id.startsWith(this.state.edition + "_"));
        return (
            <div className="maincol">
                <div className="topbar">
                    <h1>{this.state.edition ? `Convert to ${getFormatName(this.state.edition)}` : "Choose destination"}</h1>
                    <h2>{this.state.edition ? "Select the target Minecraft version." : "Which edition would you like to convert this world to?"}</h2>
                </div>
                <div className="main_content world_format_info">
                    <div className={`world_format_card ${inputEdition}`}>
                        <div className="world_format_icon"/>
                        <div>
                            <span className="world_format_label">Detected world</span>
                            <strong>{inputFormat} Edition</strong>
                            <span className="world_format_version">Version {inputVersion}</span>
                        </div>
                    </div>
                </div>
                {this.app.state.sessionData.version.warnings &&
                    <div className="main_content warning">
                        <span>Warning: {this.app.state.sessionData.version.warnings}</span>
                    </div>}
                {!this.state.edition && <div className="main_content conversion_editions">
                    <button className="gray_box bedrock" onClick={() => this.setState({edition: "BEDROCK"})}>
                        Convert to Bedrock
                        <span>Choose a Bedrock Edition version</span>
                    </button>
                    <button className="gray_box java" onClick={() => this.setState({edition: "JAVA"})}>
                        Convert to Java
                        <span>Choose a Java Edition version</span>
                    </button>
                </div>}
                {this.state.edition && <div className="main_content export">
                    {writers.map(key => (
                        <ModeOption
                            key={key.id} selected={this.state.selected} update={this.updateSelected} type={key.id}
                            value={key} source={key.id === this.app.state.inputType.id}/>
                    ))}
                </div>}
                <div className="bottombar">
                    <button onClick={() => this.state.edition ? this.setState({edition: undefined, selected: undefined}) : window.location.reload()}
                            type="submit" className="button red">{this.state.edition ? "Back" : "Restart"}</button>
                    {this.state.edition && <button
                        type="submit" className="button magenta" disabled={this.state.selected === undefined}
                        onClick={() => this.convertWorld(true)}>Advanced Mode</button>}
                    {this.state.edition && <button
                        type="submit" className="button green" disabled={this.state.selected === undefined}
                        onClick={() => this.convertWorld(false)}>Convert</button>}
                </div>
            </div>
        );
    }
}
