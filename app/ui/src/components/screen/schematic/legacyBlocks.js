let blocks;

export async function loadLegacyBlocks() {
    if (blocks) return blocks;
    const response = await fetch("data/legacy-blocks.json");
    blocks = response.ok ? await response.json() : {};
    return blocks;
}
