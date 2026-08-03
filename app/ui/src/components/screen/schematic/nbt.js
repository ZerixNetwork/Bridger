const TYPES = {1: 1, 2: 2, 3: 4, 4: 8, 5: 4, 6: 8};

export async function readNbt(file) {
    let bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
        bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    }
    return parse(bytes, file.name.toLowerCase().endsWith(".mcstructure"));
}

function parse(bytes, littleEndian) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 0;
    const number = (size, signed = true) => {
        let value;
        if (size === 1) value = signed ? view.getInt8(offset) : view.getUint8(offset);
        else if (size === 2) value = signed ? view.getInt16(offset, littleEndian) : view.getUint16(offset, littleEndian);
        else if (size === 4) value = view.getInt32(offset, littleEndian);
        else value = Number(view.getBigInt64(offset, littleEndian));
        offset += size;
        return value;
    };
    const string = () => {
        const length = number(2, false);
        const value = new TextDecoder().decode(bytes.subarray(offset, offset + length));
        offset += length;
        return value;
    };
    const payload = (type) => {
        if (TYPES[type]) {
            if (type === 5) { const value = view.getFloat32(offset, littleEndian); offset += 4; return value; }
            if (type === 6) { const value = view.getFloat64(offset, littleEndian); offset += 8; return value; }
            return number(TYPES[type]);
        }
        if (type === 7 || type === 11 || type === 12) {
            const length = number(4);
            if (length < 0 || length > 50000000) throw new Error("Invalid NBT array length");
            const size = type === 7 ? 1 : type === 11 ? 4 : 8;
            return Array.from({length}, () => number(size));
        }
        if (type === 8) return string();
        if (type === 9) {
            const childType = number(1);
            const length = number(4);
            if (length < 0 || length > 50000000) throw new Error("Invalid NBT list length");
            return Array.from({length}, () => payload(childType));
        }
        if (type === 10) {
            const value = {};
            while (true) {
                const childType = number(1);
                if (childType === 0) return value;
                value[string()] = payload(childType);
            }
        }
        throw new Error("Unsupported NBT tag " + type);
    };
    const rootType = number(1);
    if (rootType !== 10) throw new Error("NBT root is not a compound");
    string();
    return payload(rootType);
}

export function toSchematic(root) {
    root = root.Schematic || root;
    if (root.Width !== undefined && root.Blocks) return legacy(root);
    if (root.Width !== undefined && root.Palette && root.BlockData) return sponge(root);
    if (root.size && root.palette && root.blocks) return javaStructure(root);
    if (root.size && root.structure?.block_indices) return bedrockStructure(root);
    throw new Error("Unsupported schematic structure");
}

function legacy(root) {
    const ids = root.Blocks.map(id => id & 255);
    const palette = Array.from(new Set(ids)).map(id => "Block " + id);
    const lookup = new Map(palette.map((name, i) => [Number(name.slice(6)), i]));
    return result(root.Width, root.Height, root.Length, ids.map(id => lookup.get(id)), palette);
}

function sponge(root) {
    const palette = [];
    Object.entries(root.Palette).forEach(([name, id]) => palette[id] = name);
    const blocks = [], data = root.BlockData;
    for (let i = 0; i < data.length;) {
        let value = 0, shift = 0, byte;
        do { byte = data[i++] & 255; value |= (byte & 127) << shift; shift += 7; } while (byte & 128);
        blocks.push(value);
    }
    return result(root.Width, root.Height, root.Length, blocks, palette);
}

function javaStructure(root) {
    const [width, height, length] = root.size;
    validateDimensions(width, height, length);
    const palette = root.palette.map(block => block.Name || "unknown");
    let air = palette.findIndex(name => name.includes("air"));
    if (air < 0) { air = palette.length; palette.push("minecraft:air"); }
    const blocks = Array(width * height * length).fill(air);
    root.blocks.forEach(block => {
        const [x, y, z] = block.pos;
        blocks[index(x, y, z, width, length)] = block.state;
    });
    return result(width, height, length, blocks, palette);
}

function bedrockStructure(root) {
    const [width, height, length] = root.size;
    validateDimensions(width, height, length);
    const paletteData = root.structure.palette.default.block_palette;
    const palette = paletteData.map(block => block.name || "unknown");
    let air = palette.findIndex(name => name.includes("air"));
    if (air < 0) { air = palette.length; palette.push("minecraft:air"); }
    const source = root.structure.block_indices[0];
    const blocks = Array(width * height * length).fill(air);
    for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) for (let z = 0; z < length; z++) {
        const id = source[x * height * length + y * length + z];
        blocks[index(x, y, z, width, length)] = id < 0 ? air : id;
    }
    return result(width, height, length, blocks, palette);
}

function index(x, y, z, width, length) { return x + z * width + y * width * length; }
function validateDimensions(width, height, length) {
    const volume = width * height * length;
    if (!Number.isSafeInteger(volume) || width < 1 || height < 1 || length < 1 || volume > 50000000) {
        throw new Error("Invalid or excessively large schematic dimensions");
    }
}
function result(width, height, length, blocks, palette) {
    validateDimensions(width, height, length);
    const volume = width * height * length;
    if (blocks.length < volume) throw new Error("Schematic block data is incomplete");
    return {width, height, length, blocks, palette, index: (x, y, z) => index(x, y, z, width, length)};
}
