import {detectPack, mapPackPath} from "./mappings";

test("detects Java and Bedrock packs", () => {
    expect(detectPack(["pack.mcmeta", "assets/minecraft/textures/block/stone.png"])).toBe("java");
    expect(detectPack(["manifest.json", "textures/blocks/stone.png"])).toBe("bedrock");
    expect(detectPack(["manifest.json", "pack.mcmeta", "assets/minecraft/textures/block/stone.png"], "bedrock")).toBe("bedrock");
});

test("maps common texture paths both ways", () => {
    expect(mapPackPath("assets/minecraft/textures/block/stone.png", "java")).toBe("textures/blocks/stone.png");
    expect(mapPackPath("textures/items/apple.png", "bedrock")).toBe("assets/minecraft/textures/item/apple.png");
    expect(mapPackPath("pack.png", "java")).toBe("pack_icon.png");
});

test("renames edition-specific block and item textures", () => {
    expect(mapPackPath("assets/minecraft/textures/block/acacia_log.png", "java")).toBe("textures/blocks/log_acacia.png");
    expect(mapPackPath("assets/minecraft/textures/block/white_wool.png", "java")).toBe("textures/blocks/wool_colored_white.png");
    expect(mapPackPath("assets/minecraft/textures/item/golden_apple.png", "java")).toBe("textures/items/apple_golden.png");
    expect(mapPackPath("textures/blocks/log_acacia.png", "bedrock")).toBe("assets/minecraft/textures/block/acacia_log.png");
    expect(mapPackPath("assets/minecraft/textures/block/water_still.png.mcmeta", "java")).toBeNull();
});
