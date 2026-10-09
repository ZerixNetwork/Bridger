export function blockColor(name) {
    if (!name || name.includes("air") || name === "Block 0") return null;
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
    return `hsl(${Math.abs(hash) % 360} 38% 48%)`;
}

export function blockTint(name) {
    if (!name) return 0xffffff;
    if (name.startsWith("minecraft:redstone_wire")) {
        const power = Math.max(0, Math.min(15, Number(name.match(/power=(\d+)/)?.[1] || 0))) / 15;
        const red = power === 0 ? 0.3 : power * 0.6 + 0.4;
        const green = Math.max(0, power * power * 0.7 - 0.5);
        const blue = Math.max(0, power * power * 0.6 - 0.7);
        return (Math.round(red * 255) << 16) | (Math.round(green * 255) << 8) | Math.round(blue * 255);
    }
    const block = name.split("[", 1)[0].replace(/^minecraft:/, "");
    if (block === "water" || block === "flowing_water") return 0x3f76e4;
    // Fixed species tints from the bundled vanilla leaf models; states never change the tint type.
    if (block === "spruce_leaves") return 0x619961;
    if (block === "birch_leaves") return 0x80a755;
    if (["cherry_leaves", "pale_oak_leaves", "azalea_leaves", "flowering_azalea_leaves"].includes(block)) return 0xffffff;
    if (block.includes("grass") || block.includes("fern") || block.includes("leaves") || block.includes("vine")) return 0x6da34d;
    return 0xffffff;
}
