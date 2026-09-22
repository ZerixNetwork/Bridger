import {dimensionMappingForSelection, selectionForDimensionMapping} from "./dimensionSelection";

const dimensions = ["minecraft:overworld", "minecraft:the_nether", "custom:builds"];

test("keeps every dimension for complete-world conversion", () => {
    expect(dimensionMappingForSelection(dimensions, "ALL")).toEqual({
        "minecraft:overworld": "minecraft:overworld",
        "minecraft:the_nether": "minecraft:the_nether",
        "custom:builds": "custom:builds"
    });
});

test("turns one selected dimension into the overworld and excludes the others", () => {
    expect(dimensionMappingForSelection(dimensions, "custom:builds")).toEqual({
        "custom:builds": "minecraft:overworld"
    });
});

test("restores the selection from the active dimension mapping", () => {
    expect(selectionForDimensionMapping(dimensions, {
        "custom:builds": "minecraft:overworld"
    })).toBe("custom:builds");
    expect(selectionForDimensionMapping(dimensions, {
        "minecraft:overworld": "minecraft:overworld",
        "minecraft:the_nether": "minecraft:the_nether",
        "custom:builds": "custom:builds"
    })).toBe("ALL");
    expect(selectionForDimensionMapping(dimensions, {
        "minecraft:overworld": "minecraft:the_end"
    })).toBe("CUSTOM");
});
