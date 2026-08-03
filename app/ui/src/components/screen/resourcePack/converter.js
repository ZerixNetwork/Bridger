import JSZip from "jszip";
import {detectPack, mapPackPaths} from "./mappings";
import {targetVersion, versionFromMetadata} from "./versions";

const MAX_FILES = 10000;
const MAX_SIZE = 512 * 1024 * 1024;
const SOURCE_METADATA = new Set(["pack.mcmeta", "manifest.json"]);

function packRoot(entries, source) {
    const metadata = source === "bedrock" ? "manifest.json" : "pack.mcmeta";
    const marker = entries.find(path => path === metadata || path.endsWith("/" + metadata));
    return marker ? marker.slice(0, marker.lastIndexOf("/") + 1) : "";
}

function safeName(name) {
    return (name || "Converted Pack").replace(/[<>:"/\\|?*]/g, "").trim() || "Converted Pack";
}

function bedrockManifest(name, version) {
    return {
        format_version: 2,
        header: {name, description: `${name} converted by Bridger`, uuid: crypto.randomUUID(), version: [1, 0, 0], min_engine_version: version.engine},
        modules: [{type: "resources", uuid: crypto.randomUUID(), version: [1, 0, 0]}]
    };
}

export function javaMetadata(name, version) {
    const pack = {description: `${name} converted by Bridger`};
    if (version.format[0] >= 65) {
        pack.min_format = version.format;
        pack.max_format = version.format;
    } else {
        pack.pack_format = version.format[0];
    }
    return {pack};
}

export async function inspectResourcePack(file) {
    const zip = await JSZip.loadAsync(file);
    const rawEntries = Object.values(zip.files).filter(entry => !entry.dir && !entry.name.includes("__MACOSX/"));
    if (rawEntries.length > MAX_FILES) throw new Error(`Pack contains more than ${MAX_FILES.toLocaleString()} files.`);
    const size = rawEntries.reduce((total, entry) => total + (entry._data?.uncompressedSize || 0), 0);
    if (size > MAX_SIZE) throw new Error("Uncompressed pack is larger than 512 MB.");

    const paths = rawEntries.map(entry => entry.name);
    const extensionSource = file.name?.toLowerCase().endsWith(".mcpack") ? "bedrock" : null;
    const bedrockRoot = packRoot(paths, "bedrock");
    const javaRoot = packRoot(paths, "java");
    const hasBedrockMetadata = paths.some(path => path === "manifest.json" || path.endsWith("/manifest.json"));
    const hasJavaMetadata = paths.some(path => path === "pack.mcmeta" || path.endsWith("/pack.mcmeta"));
    const source = extensionSource && hasBedrockMetadata ? "bedrock" :
        hasJavaMetadata ? "java" : hasBedrockMetadata ? "bedrock" : detectPack(paths, extensionSource);
    if (!source) throw new Error("Could not detect a Java or Bedrock resource pack.");
    const root = source === "bedrock" ? bedrockRoot : javaRoot;
    const entries = rawEntries.map(entry => ({entry, path: entry.name.slice(root.length)})).filter(item => item.path && !item.path.includes("../"));
    const detectedSource = detectPack(entries.map(item => item.path), source) || source;
    const metadataName = source === "java" ? "pack.mcmeta" : "manifest.json";
    const metadataEntry = entries.find(item => item.path === metadataName);
    let metadata = null;
    if (metadataEntry) {
        try {
            metadata = JSON.parse(await metadataEntry.entry.async("string"));
        } catch (_) {
            throw new Error(`Invalid ${metadataName}.`);
        }
    }
    return {zip, entries, source: detectedSource, sourceVersion: versionFromMetadata(detectedSource, metadata),
        extensionMismatch: Boolean(extensionSource && detectedSource !== extensionSource)};
}

export async function convertResourcePack(file, options = {}) {
    const {entries, source, sourceVersion: detectedVersion} = await inspectResourcePack(file);
    const target = source === "java" ? "bedrock" : "java";
    const selectedVersion = targetVersion(target, options.targetVersion);
    const name = safeName(options.name || file.name.replace(/\.(zip|mcpack)$/i, ""));
    const output = new JSZip();
    const report = {source, sourceVersion: options.sourceVersion || detectedVersion, target, targetVersion: selectedVersion.id, converted: [], unmapped: [], collisions: []};

    for (const {entry, path} of entries) {
        if (SOURCE_METADATA.has(path)) continue;
        const mapped = mapPackPaths(path, source);
        const destinations = mapped.length ? mapped : [`bridger_unmapped/${path}`];
        const data = await entry.async("uint8array");
        let written = false;
        destinations.forEach(destination => {
            if (output.file(destination)) report.collisions.push(path);
            else {
                output.file(destination, data);
                written = true;
            }
        });
        if (written) (mapped.length ? report.converted : report.unmapped).push(path);
    }

    if (target === "bedrock") output.file("manifest.json", JSON.stringify(bedrockManifest(name, selectedVersion), null, 2));
    else output.file("pack.mcmeta", JSON.stringify(javaMetadata(name, selectedVersion), null, 2));
    output.file("BRIDGER_REPORT.json", JSON.stringify(report, null, 2));

    return {
        blob: await output.generateAsync({type: "blob", compression: "DEFLATE", compressionOptions: {level: 6}}),
        fileName: `${name}-${target}.${target === "bedrock" ? "mcpack" : "zip"}`,
        report
    };
}
