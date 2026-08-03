import JSZip from "jszip";

export async function loadTexturePack(file) {
    const zip = await JSZip.loadAsync(file);
    const textures = new Map();
    const markers = ["assets/minecraft/textures/block/", "textures/blocks/"];
    const entries = Object.values(zip.files).filter(entry => !entry.dir && entry.name.endsWith(".png") &&
        markers.some(marker => entry.name.includes(marker)));
    const unpackedSize = entries.reduce((size, entry) => size + (entry._data?.uncompressedSize || 0), 0);
    if (entries.length > 4096 || unpackedSize > 256 * 1024 * 1024) throw new Error("Texture pack is too large.");
    try {
        for (const entry of entries) {
            const marker = markers.find(value => entry.name.includes(value));
            const name = entry.name.slice(entry.name.indexOf(marker) + marker.length, -4);
            const url = URL.createObjectURL(await entry.async("blob"));
            if (textures.has(name)) URL.revokeObjectURL(textures.get(name));
            textures.set(name, url);
        }
    } catch (error) {
        disposeTexturePack(textures);
        throw error;
    }
    if (textures.size === 0) throw new Error("The ZIP does not contain Java or Bedrock block textures.");
    return textures;
}

export function blockTextures(textures, identifier) {
    if (!textures || !identifier) return null;
    const name = identifier.replace(/^minecraft:/, "").replace(/\[.*]$/, "");
    const base = textures.get(name);
    const side = textures.get(name + "_side") || base || textures.get(name + "_top");
    const top = textures.get(name + "_top") || base || side;
    const bottom = textures.get(name + "_bottom") || (name === "grass_block" ? textures.get("dirt") : null) || base || side;
    return side ? {side, top, bottom} : null;
}

export function disposeTexturePack(textures) {
    textures?.forEach(url => {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    });
}
