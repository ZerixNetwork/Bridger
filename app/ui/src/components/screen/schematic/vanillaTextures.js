export async function loadVanillaTextures() {
    const response = await fetch("textures/vanilla/index.json");
    if (!response.ok) throw new Error("Bundled Minecraft textures are unavailable.");
    const index = await response.json();
    const modelResponse = await fetch("textures/vanilla/models.json");
    const models = modelResponse.ok ? await modelResponse.json() : null;
    return {textures: new Map(Object.entries(index.textures)), version: index.version, models};
}
