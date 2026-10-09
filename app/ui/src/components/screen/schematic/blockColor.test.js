import {blockTint} from "./blockColor";

test("block states never turn foliage or dry blocks into water-colored materials", () => {
    for (const leaf of ["oak_leaves", "spruce_leaves", "birch_leaves", "jungle_leaves"]) {
        const tint = blockTint("minecraft:" + leaf);
        for (const waterlogged of ["false", "true"]) {
            expect(blockTint(`minecraft:${leaf}[distance=7,persistent=false,waterlogged=${waterlogged}]`)).toBe(tint);
        }
        expect(tint).not.toBe(0x3f76e4);
    }
    expect(blockTint("minecraft:spruce_leaves[waterlogged=false]")).toBe(0x619961);
    expect(blockTint("minecraft:birch_leaves[waterlogged=false]")).toBe(0x80a755);
    expect(blockTint("minecraft:oak_slab[waterlogged=false]")).toBe(0xffffff);
    expect(blockTint("minecraft:water[level=0]")).toBe(0x3f76e4);
    expect(blockTint("minecraft:cherry_leaves[waterlogged=true]")).toBe(0xffffff);
    expect(blockTint("minecraft:redstone_wire[power=15]")).toBe(0xff3300);
});
