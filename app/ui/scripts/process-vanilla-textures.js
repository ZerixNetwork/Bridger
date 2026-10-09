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
    if (fs.existsSync(existingIndex) && JSON.parse(fs.readFileSync(existingIndex)).version === version.id
        && fs.existsSync(path.join(output, "models.json"))) {
        console.log(`Using bundled Minecraft ${version.id} textures`);
        return;
    }

    const cache = path.resolve(__dirname, "../../../build/minecraft", `client-${version.id}.jar`);
    fs.mkdirSync(path.dirname(cache), {recursive: true});
    if (!fs.existsSync(cache)) {
        const response = await fetch(version.downloads.client.url);
        if (!response.ok) throw new Error(`Client download failed: ${response.status}`);
        fs.writeFileSync(cache, Buffer.from(await response.arrayBuffer()));
    }
    const client = fs.readFileSync(cache);
    if (require("crypto").createHash("sha1").update(client).digest("hex") !== version.downloads.client.sha1) {
        throw new Error("Minecraft client checksum mismatch");
    }
    const zip = await JSZip.loadAsync(client);
    const prefix = "assets/minecraft/textures/block/";
    const entries = Object.values(zip.files).filter(entry => !entry.dir && entry.name.endsWith(".png") &&
        (entry.name.startsWith(prefix) || entry.name.startsWith("assets/minecraft/textures/entity/")));
    fs.rmSync(output, {recursive: true, force: true});
    fs.mkdirSync(output, {recursive: true});

    const textures = {};
    for (const entry of entries) {
        const name = entry.name.startsWith(prefix) ? entry.name.slice(prefix.length, -4)
            : entry.name.slice("assets/minecraft/textures/".length, -4);
        const filename = name + ".png";
        const target = path.join(output, filename);
        fs.mkdirSync(path.dirname(target), {recursive: true});
        fs.writeFileSync(target, await entry.async("nodebuffer"));
        textures[name] = `textures/vanilla/${filename.replace(/\\/g, "/")}`;
    }
    const models = {}, blockstates = {};
    for (const entry of Object.values(zip.files)) {
        if (entry.dir || !entry.name.endsWith(".json")) continue;
        if (entry.name.startsWith("assets/minecraft/models/block/")) {
            models["minecraft:" + entry.name.slice("assets/minecraft/models/".length, -5)] = JSON.parse(await entry.async("string"));
        } else if (entry.name.startsWith("assets/minecraft/blockstates/")) {
            blockstates["minecraft:" + entry.name.slice("assets/minecraft/blockstates/".length, -5)] = JSON.parse(await entry.async("string"));
        }
    }
    fs.writeFileSync(path.join(output, "models.json"), JSON.stringify({version: version.id, models, blockstates}));
    fs.writeFileSync(existingIndex, JSON.stringify({version: version.id, textures}));
    console.log(`Bundled ${entries.length} Minecraft ${version.id} block textures`);
}

processVanillaTextures().catch(error => {
    console.error("Failed to bundle Minecraft textures:", error.message);
    process.exitCode = 1;
});
