import {toSchematic} from "./nbt";

test("legacy schematics keep large block data compact and support AddBlocks", () => {
    const schematic = toSchematic({
        Width: 2,
        Height: 1,
        Length: 1,
        Blocks: new Uint8Array([1, 1]),
        Data: new Uint8Array([0, 1]),
        AddBlocks: new Uint8Array([0x01]),
        BlockIDs: {"example:high_block": 257}
    });

    expect(schematic.blocks).toBeNull();
    expect(schematic.palette[schematic.blockAt(0)]).toBe("example:high_block");
    expect(schematic.palette[schematic.blockAt(1)]).toBe("minecraft:stone");
});

test("legacy schematics reject truncated metadata arrays", () => {
    expect(() => toSchematic({
        Width: 2,
        Height: 1,
        Length: 1,
        Blocks: new Uint8Array(2),
        Data: new Uint8Array(1)
    })).toThrow("Schematic metadata is incomplete");

    expect(() => toSchematic({
        Width: 3,
        Height: 1,
        Length: 1,
        Blocks: new Uint8Array(3),
        AddBlocks: new Uint8Array(1)
    })).toThrow("Schematic extended block data is incomplete");
});
