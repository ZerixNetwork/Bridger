import {buildWorldMeshes} from "./worldMesh";
import {createBlockModels} from "./blockModels";

global.TextDecoder = require("util").TextDecoder;

const encode = (blocks, palette = ["minecraft:stone"]) => {
    const identifiers = palette.map(identifier => Buffer.from(identifier));
    const start = 6 + identifiers.reduce((sum, identifier) => sum + 4 + identifier.length, 0);
    const buffer = Buffer.alloc(start + blocks.length * 12);
    buffer.writeUInt32BE(blocks.length, 0);
    buffer.writeUInt16BE(palette.length, 4);
    let position = 6;
    identifiers.forEach(identifier => {
        buffer.writeUInt32BE(identifier.length, position); position += 4;
        identifier.copy(buffer, position); position += identifier.length;
    });
    blocks.forEach(([x, y, z, index = 0], i) => {
        const offset = start + i * 12;
        buffer.writeUInt16BE(x, offset);
        buffer.writeInt16BE(y, offset + 2);
        buffer.writeUInt16BE(z, offset + 4);
        buffer.writeUInt32BE(0x888888, offset + 6);
        buffer.writeUInt16BE(index, offset + 10);
    });
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
};

test("merges a solid floor into six correctly oriented textured faces", () => {
    const blocks = [];
    for (let x = 0; x < 32; x++) for (let z = 0; z < 32; z++) blocks.push([x, -60, z]);
    const [mesh] = buildWorldMeshes(encode(blocks));
    expect(mesh.indices.length).toBe(36);
    expect(mesh.groups).toHaveLength(6);
    let area = 0;
    for (let i = 0; i < mesh.indices.length; i += 3) {
        const points = [0, 1, 2].map(j => Array.from(mesh.positions.slice(mesh.indices[i + j] * 3, mesh.indices[i + j] * 3 + 3)));
        const a = points[1].map((v, j) => v - points[0][j]);
        const b = points[2].map((v, j) => v - points[0][j]);
        const cross = [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
        const normal = mesh.normals.slice(mesh.indices[i] * 3, mesh.indices[i] * 3 + 3);
        expect(cross.reduce((sum, v, j) => sum + v * normal[j], 0)).toBeGreaterThan(0);
        area += Math.hypot(...cross) / 2;
    }
    expect(area).toBe(32 * 32 * 2 + 32 * 4);
    expect(Math.max(...mesh.uv)).toBe(32);
});

test("keeps holes and avoids wrapping neighbors across region boundaries", () => {
    const [mesh] = buildWorldMeshes(encode([[511, -60, 0], [0, -60, 1], [10, 100, 10]]));
    expect(mesh.indices.length).toBe(108);
});

test("keeps different textures separate while removing the shared opaque face", () => {
    const meshes = buildWorldMeshes(encode([[0, 0, 0, 0], [1, 0, 0, 1]], ["minecraft:stone", "minecraft:dirt"]));
    expect(meshes.map(mesh => mesh.identifier)).toEqual(["minecraft:stone", "minecraft:dirt"]);
    expect(meshes.map(mesh => mesh.indices.length)).toEqual([30, 30]);
});

test("retains faces visible through transparent neighbors", () => {
    const meshes = buildWorldMeshes(encode([[0, 0, 0, 0], [1, 0, 0, 1]], ["minecraft:stone", "minecraft:glass"]));
    expect(meshes.map(mesh => mesh.indices.length)).toEqual([36, 30]);
});

test("never draws cave or void air even in older preview data",()=>{
    const models=createBlockModels({models:{},blockstates:{}});
    expect(buildWorldMeshes(encode([[0,0,0,0],[1,0,0,1]], ["minecraft:cave_air","minecraft:void_air"]),models)).toEqual([]);
});
