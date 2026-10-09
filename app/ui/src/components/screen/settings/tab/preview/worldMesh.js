// Merge adjacent faces with the same block texture instead of drawing a complete cube per block.
export function buildWorldMeshes(buffer, modelLibrary) {
    const data = new DataView(buffer);
    const count = data.getUint32(0), paletteCount = data.getUint16(4);
    const palette = [], colors = new Uint32Array(paletteCount);
    let offset = 6;
    const decoder = new TextDecoder();
    for (let i = 0; i < paletteCount; i++) {
        const length = data.getUint32(offset); offset += 4;
        palette.push(decoder.decode(new Uint8Array(buffer, offset, length))); offset += length;
    }
    const start = offset;
    const models = palette.map(identifier => modelLibrary?.get(identifier));
    const instances = palette.map(() => []);
    const key = (x, y, z) => x + z * 512 + (y + 32768) * 262144;
    const blocks = new Map();
    for (let i = 0; i < count; i++, offset += 12) {
        const index = data.getUint16(offset + 10);
        if (models[index]?.invisible) continue;
        blocks.set(key(data.getUint16(offset), data.getInt16(offset + 2), data.getUint16(offset + 4)), index);
        colors[index] = data.getUint32(offset + 6);
    }
    const occludes = palette.map((name, index) => models[index] ? models[index].occludes
        : !/leaves|glass|water|ice|bars|fence|stairs|slab|door|plant/.test(name));
    const directions = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    const planes = new Map();
    offset = start;
    for (let i = 0; i < count; i++, offset += 12) {
        const x = data.getUint16(offset), y = data.getInt16(offset + 2), z = data.getUint16(offset + 4);
        const index = data.getUint16(offset + 10);
        if (models[index]?.invisible) continue;
        if (models[index] && !models[index].fullCube) {
            instances[index].push(x,y,z);
            continue;
        }
        for (let face = 0; face < 6; face++) {
            const [dx, dy, dz] = directions[face];
            const nx = x + dx, nz = z + dz;
            const neighbor = nx >= 0 && nx < 512 && nz >= 0 && nz < 512
                ? blocks.get(key(nx, y + dy, nz)) : undefined;
            if (neighbor !== undefined && occludes[neighbor]) continue;
            if (neighbor === index && models[index]?.fullCube && models[index].materials.every(material=>material.translucent)) continue;
            const axis = face >> 1;
            const plane = [x, y, z][axis] + (face % 2 === 0 ? 1 : 0);
            const u = axis === 0 ? z : x;
            const v = axis === 1 ? z : y + 32768;
            const planeKey = `${index}:${face}:${plane}`;
            let bucket = planes.get(planeKey);
            if (!bucket) {
                bucket = {index, face, plane, cells: new Set()};
                planes.set(planeKey, bucket);
            }
            bucket.cells.add(u + v * 65536);
        }
    }
    blocks.clear();
    const quads = palette.map(() => Array.from({length: 6}, () => []));
    for (const {index, face, plane, cells} of planes.values()) {
        for (const cell of [...cells].sort((a, b) => a - b)) {
            if (!cells.has(cell)) continue;
            const u = cell % 65536, v = Math.floor(cell / 65536);
            let width = 1, height = 1;
            while (u + width < 512 && cells.has(cell + width)) width++;
            rows: while (true) {
                for (let du = 0; du < width; du++) {
                    if (!cells.has(cell + height * 65536 + du)) break rows;
                }
                height++;
            }
            for (let dv = 0; dv < height; dv++) for (let du = 0; du < width; du++) {
                cells.delete(cell + dv * 65536 + du);
            }
            quads[index][face].push([plane, u, v, width, height]);
        }
    }
    planes.clear();
    return palette.map((identifier, index) => {
        const quadCount = quads[index].reduce((sum, faces) => sum + faces.length, 0);
        const positions = new Float32Array(quadCount * 12), normals = new Float32Array(quadCount * 12);
        const uv = new Float32Array(quadCount * 8), indices = new Uint32Array(quadCount * 6), groups = [];
        let vertex = 0, triangle = 0;
        for (let face = 0; face < 6; face++) {
            const groupStart = triangle, axis = face >> 1;
            for (const [plane, u, v, width, height] of quads[index][face]) {
                const corners = [[0,0],[width,0],[width,height],[0,height]];
                for (let corner = 0; corner < 4; corner++) {
                    const [du, dv] = corners[corner];
                    const point = axis === 0 ? [plane, v + dv - 32768, u + du]
                        : axis === 1 ? [u + du, plane, v + dv] : [u + du, v + dv - 32768, plane];
                    positions.set(point, (vertex + corner) * 3);
                    normals.set(directions[face], (vertex + corner) * 3);
                    const modelFace = models[index]?.cubeFaces[face];
                    uv.set(modelFace ? modelFace.origin.map((value,i)=>value+modelFace.du[i]*du+modelFace.dv[i]*dv)
                        : [face === 0 || face === 5 ? width - du : du, face === 2 ? height - dv : dv], (vertex + corner) * 2);
                }
                const reverse = axis === 2 ? face % 2 === 1 : face % 2 === 0;
                const firstVertex = vertex;
                indices.set((reverse ? [0,2,1,0,3,2] : [0,1,2,0,2,3]).map(i => firstVertex + i), triangle);
                vertex += 4; triangle += 6;
            }
            if (triangle > groupStart) groups.push({start: groupStart, count: triangle - groupStart,
                materialIndex: models[index]?.cubeFaces[face].materialIndex ?? face});
        }
        return {identifier, color: colors[index], positions, normals, uv, indices, groups,
            model:models[index], instances:instances[index].length ? new Float32Array(instances[index]) : null};
    }).filter(mesh => mesh.indices.length > 0 || mesh.instances);
}
