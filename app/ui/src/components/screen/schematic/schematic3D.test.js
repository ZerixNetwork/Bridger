import {Schematic3D} from "./schematic3D";

jest.mock("three/examples/jsm/controls/OrbitControls.js", () => ({OrbitControls: jest.fn()}));

const originalRequestAnimationFrame = global.requestAnimationFrame;
afterEach(() => global.requestAnimationFrame = originalRequestAnimationFrame);

test("3D preview includes a million visible blocks and yields while scanning", async () => {
    const width = 1000000;
    let yields = 0;
    global.requestAnimationFrame = callback => {
        yields++;
        callback();
    };
    const viewer = new Schematic3D({});
    viewer.setState = () => {};
    const result = await viewer.visibleBlocks({
        width,
        height: 1,
        length: 1,
        palette: ["minecraft:stone"],
        blockAt: () => 0,
        index: x => x
    });

    expect(result.blocks).toHaveLength(width);
    expect(result.truncated).toBe(false);
    expect(yields).toBeGreaterThan(0);
});
