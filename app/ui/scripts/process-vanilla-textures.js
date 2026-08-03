const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const manifestUrl = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const output = path.join(__dirname, "../public/textures/vanilla");

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return response.json();
}

async function processVanillaTextures() {
    const manifest = await fetchJson(manifestUrl);
    const release = manifest.versions.find(version => version.id === manifest.latest.release);
    const version = await fetchJson(release.url);
    const existingIndex = path.join(output, "index.json");
    if (fs.existsSync(existingIndex) && JSON.parse(fs.readFileSync(existingIndex)).version === version.id) {
        console.log(`Using bundled Minecraft ${version.id} textures`);
        return;
    }

    const response = await fetch(version.downloads.client.url);
    if (!response.ok) throw new Error(`Client download failed: ${response.status}`);
    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    const prefix = "assets/minecraft/textures/block/";
    const entries = Object.values(zip.files).filter(entry => !entry.dir && entry.name.startsWith(prefix) && entry.name.endsWith(".png"));
    fs.rmSync(output, {recursive: true, force: true});
    fs.mkdirSync(output, {recursive: true});

    const textures = {};
    for (const entry of entries) {
        const name = entry.name.slice(prefix.length, -4);
        const filename = name + ".png";
        const target = path.join(output, filename);
        fs.mkdirSync(path.dirname(target), {recursive: true});
        fs.writeFileSync(target, await entry.async("nodebuffer"));
        textures[name] = `textures/vanilla/${filename.replace(/\\/g, "/")}`;
    }
    fs.writeFileSync(existingIndex, JSON.stringify({version: version.id, textures}));
    console.log(`Bundled ${entries.length} Minecraft ${version.id} block textures`);
}

processVanillaTextures().catch(error => {
    console.error("Failed to bundle Minecraft textures:", error.message);
    process.exitCode = 1;
});
