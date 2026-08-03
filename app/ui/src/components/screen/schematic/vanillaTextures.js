export async function loadVanillaTextures() {
    const response = await fetch("textures/vanilla/index.json");
    if (!response.ok) throw new Error("Bundled Minecraft textures are unavailable.");
    const index = await response.json();
    return {textures: new Map(Object.entries(index.textures)), version: index.version};
}
