export function blockColor(name) {
    if (!name || name.includes("air") || name === "Block 0") return null;
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
    return `hsl(${Math.abs(hash) % 360} 38% 48%)`;
}

export function blockTint(name) {
    if (!name) return 0xffffff;
    if (name.includes("water")) return 0x3f76e4;
    if (name.includes("grass") || name.includes("fern") || name.includes("leaves") || name.includes("vine")) return 0x6da34d;
    return 0xffffff;
}
