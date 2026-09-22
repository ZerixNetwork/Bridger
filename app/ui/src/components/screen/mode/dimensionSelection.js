export function dimensionMappingForSelection(dimensions, selected) {
    if (selected === "ALL") return Object.fromEntries(dimensions.map(identifier => [identifier, identifier]));
    return dimensions.includes(selected) ? {[selected]: "minecraft:overworld"} : {};
}

export function selectionForDimensionMapping(dimensions, mapping) {
    const entries = Object.entries(mapping);
    if (entries.length === dimensions.length && dimensions.every(identifier => mapping[identifier] === identifier)) return "ALL";
    if (entries.length === 1 && dimensions.includes(entries[0][0]) && entries[0][1] === "minecraft:overworld") return entries[0][0];
    return "CUSTOM";
}
