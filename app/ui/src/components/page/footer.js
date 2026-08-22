import React, {Component} from "react";

export class Footer extends Component {
    state = {credits: false, settings: false, automaticMemory: true, memoryGB: 1, memoryInfo: null, settingsError: null};

    openSettings = () => {
        const memoryInfo = window.chunker.getMemorySettings();
        this.setState({
            settings: true,
            automaticMemory: memoryInfo.memoryMB === null,
            memoryGB: (memoryInfo.memoryMB ?? memoryInfo.recommendedMemoryMB) / 1024,
            memoryInfo,
            settingsError: null
        });
    };

    saveSettings = () => {
        const memoryMB = this.state.automaticMemory ? null : Math.round(Number(this.state.memoryGB) * 1024);
        const result = window.chunker.setMemorySettings(memoryMB);
        if (result.error) {
            this.setState({settingsError: result.error});
        } else {
            this.setState({settings: false, memoryInfo: result.settings, settingsError: null});
        }
    };

    render() {
        return <React.Fragment>
            {this.state.credits && <div className="modal_overlay">
                <div className="modal credits_modal">
                    <h3>Credits</h3>
                    <p><strong>Bridger</strong> is a fork developed and maintained by Zerix Network.</p>
                    <p>Based on <a href="https://github.com/HiveGamesOSS/Chunker" target="_blank" rel="noopener noreferrer">Chunker</a>, originally created by Hive Games and distributed under the MIT License. Original copyright and license notices remain available in the included LICENSE file.</p>
                    <p><a href="https://www.minecraft.net" target="_blank" rel="noopener noreferrer">Minecraft</a> block textures are obtained from Mojang's official game client during the build and used only to identify blocks inside the schematic preview. They are not licensed under Chunker's MIT License.</p>
                    <p>Minecraft is a trademark of Microsoft. This fork is not affiliated with or endorsed by Hive Games, Mojang Studios, or Microsoft.</p>
                    <p><button className="button green" onClick={() => this.setState({credits: false})}>Close</button></p>
                </div>
            </div>}
            {this.state.settings && <div className="modal_overlay">
                <div className="modal memory_settings_modal">
                    <h3>Memory settings</h3>
                    <p>Set the maximum RAM for the Java conversion backend. Large schematics use a separate memory-efficient viewer.</p>
                    <label className="memory_automatic">
                        <input type="checkbox" checked={this.state.automaticMemory}
                               onChange={event => this.setState({automaticMemory: event.target.checked})}/>
                        Automatic (recommended)
                    </label>
                    <label className="memory_amount">
                        Maximum RAM
                        <span><input type="number" min="0.5" step="0.5"
                                     max={(this.state.memoryInfo.maxMemoryMB / 1024).toFixed(1)}
                                     disabled={this.state.automaticMemory} value={this.state.memoryGB}
                                     onChange={event => this.setState({memoryGB: event.target.value})}/> GB</span>
                    </label>
                    <small>Total system memory: {(this.state.memoryInfo.totalMemoryMB / 1024).toFixed(1)} GB. Applies to new conversion sessions.</small>
                    {this.state.settingsError && <p className="settings_error">{this.state.settingsError}</p>}
                    <p className="memory_settings_actions">
                        <button className="button red" onClick={() => this.setState({settings: false})}>Cancel</button>
                        <button className="button green" onClick={this.saveSettings}>Save</button>
                    </p>
                </div>
            </div>}
            <footer id="footer">
                <nav className="footer_top">
                    <div className="wrapper">
                        <ul>
                            <li><a href="https://github.com/ZerixNetwork/Bridger" target="_blank" rel="noopener noreferrer">GitHub</a></li>
                            <li><a href="https://github.com/HiveGamesOSS/Chunker/network/dependencies" target="_blank" rel="noopener noreferrer">Dependencies</a></li>
                            {window.chunker?.getMemorySettings && <li><button onClick={this.openSettings}>Settings</button></li>}
                            <li><button onClick={() => this.setState({credits: true})}>Credits</button></li>
                            <li><a className="discord_link" href="https://discord.gg/Jsnpvu7S5e" target="_blank" rel="noopener noreferrer">
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.5 5.3A17 17 0 0 0 15.4 4l-.5 1.1a15.5 15.5 0 0 0-5.8 0L8.6 4a17 17 0 0 0-4.1 1.3C1.9 9.1 1.2 12.8 1.6 16.4a16.7 16.7 0 0 0 5 2.5l1.2-1.7-1.7-.8.4-.3a12 12 0 0 0 11 0l.4.3-1.7.8 1.2 1.7a16.7 16.7 0 0 0 5-2.5c.5-4.2-.8-7.9-2.9-11.1ZM8.9 14.5c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Zm6.2 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Z"/></svg>
                                Join Our Discord
                            </a></li>
                        </ul>
                    </div>
                </nav>
                <div className="wrapper">
                    <div className="footer_bottom">
                        <a className="zerix_brand" href="https://github.com/ZerixNetwork" target="_blank" rel="noopener noreferrer">
                            <img src="images/zerix/logo.png" alt="Zerix"/>
                        </a>
                        <p>Bridger by Zerix Network<br/><span className="copy">Fork modifications &copy; Zerix Network {new Date().getFullYear()}</span></p>
                        <span className="build">
                            {(window.chunker && window.chunker.version) || "unknown"}-{(window.chunker && window.chunker.gitVersion) || "unknown"}
                        </span>
                    </div>
                </div>
            </footer>
        </React.Fragment>;
    }
}
