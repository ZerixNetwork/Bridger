const fs = require("fs");
const path = require("path");

const commit = "40d6c483bf63006b0865a1d32cb2fe4239c50579";
const source = `https://raw.githubusercontent.com/GeyserMC/PackConverter/${commit}/converter/src/main/resources/mappings/textures.json`;
const output = path.join(__dirname, "../src/components/screen/resourcePack/textureMappings.json");

fetch(source).then(response => {
    if (!response.ok) throw new Error(`Mapping download failed: ${response.status}`);
    return response.text();
}).then(text => {
    JSON.parse(text);
    fs.writeFileSync(output, text);
    console.log("Updated resource-pack texture mappings from GeyserMC PackConverter");
}).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
