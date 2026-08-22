const TYPES = {1: 1, 2: 2, 3: 4, 4: 8, 5: 4, 6: 8};
const MAX_NBT_ARRAY_BYTES = 512 * 1024 * 1024;
const MAX_SCHEMATIC_VOLUME = 100000000;

export async function readNbt(file) {
    let bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
        bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    } else if (bytes[0] === 0x78) {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
        bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    }
    const littleEndian = file.name.toLowerCase().endsWith(".mcstructure");
    try {
        return parse(bytes, littleEndian);
    } catch (firstError) {
        try {
            return parse(bytes, !littleEndian);
        } catch {
            throw firstError;
        }
    }
}

function parse(bytes, littleEndian) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 0;
    const requireBytes = (length) => {
        if (length < 0 || offset + length > bytes.length) throw new Error("Unexpected end of NBT data");
    };
    const number = (size, signed = true) => {
        requireBytes(size);
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
        requireBytes(length);
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
            const size = type === 7 ? 1 : type === 11 ? 4 : 8;
            const byteLength = length * size;
            if (!Number.isSafeInteger(byteLength) || byteLength < 0 || byteLength > MAX_NBT_ARRAY_BYTES) {
                throw new Error("Invalid or excessively large NBT array");
            }
            requireBytes(byteLength);
            if (type === 7) {
                const value = bytes.subarray(offset, offset + length);
                offset += length;
                return value;
            }
            const value = type === 11 ? new Int32Array(length) : new Float64Array(length);
            for (let i = 0; i < length; i++) value[i] = number(size);
            return value;
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
    const root = payload(rootType);
    for (; offset < bytes.length; offset++) {
        if (bytes[offset] !== 0) throw new Error("Unexpected data after NBT root");
    }
    return root;
}

export function toSchematic(root, legacyBlocks = {}) {
    root = root.Schematic || root;
    if (root.Width !== undefined && root.Blocks) return legacy(root, legacyBlocks);
    if (root.Width !== undefined && root.Palette && root.BlockData) return sponge(root);
    if (root.size && root.palette && root.blocks) return javaStructure(root);
    if (root.size && root.structure?.block_indices) return bedrockStructure(root);
    throw new Error("Unsupported schematic structure");
}

function legacy(root, legacyBlocks) {
    const ids = root.Blocks;
    const data = root.Data;
    const addBlocks = root.AddBlocks;
    const volume = root.Width * root.Height * root.Length;
    validateDimensions(root.Width, root.Height, root.Length);
    if (ids.length < volume) throw new Error("Schematic block data is incomplete");
    if (data && data.length < volume) throw new Error("Schematic metadata is incomplete");
    if (addBlocks && addBlocks.length < Math.ceil(volume / 2)) throw new Error("Schematic extended block data is incomplete");
    const embedded = root.SchematicaMapping || root.BlockIDs || {};
    const names = new Map(Object.entries(embedded).map(([name, id]) => [id, name.includes(":") ? name : "minecraft:" + name]));
    const palette = [], lookup = new Map();
    const stateAt = index => {
        const high = addBlocks ? (addBlocks[index >> 1] >> ((index & 1) * 4)) & 15 : 0;
        return (((ids[index] & 255) | (high << 8)) << 4) | (data ? data[index] & 15 : 0);
    };
    for (let i = 0; i < volume; i++) {
        const state = stateAt(i);
        if (lookup.has(state)) continue;
        const id = state >> 4, metadata = state & 15, key = `${id}:${metadata}`;
        lookup.set(state, palette.length);
        palette.push(legacyBlocks[key] || names.get(id) || LEGACY_BLOCKS[id] || "Block " + key);
    }
    return result(root.Width, root.Height, root.Length, null, palette, index => lookup.get(stateAt(index)));
}

const LEGACY_BLOCKS = {
    0: "minecraft:air", 1: "minecraft:stone", 2: "minecraft:grass_block", 3: "minecraft:dirt",
    4: "minecraft:cobblestone", 5: "minecraft:oak_planks", 7: "minecraft:bedrock", 8: "minecraft:water",
    9: "minecraft:water", 10: "minecraft:lava", 11: "minecraft:lava", 12: "minecraft:sand",
    13: "minecraft:gravel", 14: "minecraft:gold_ore", 15: "minecraft:iron_ore", 16: "minecraft:coal_ore",
    17: "minecraft:oak_log", 18: "minecraft:oak_leaves", 19: "minecraft:sponge", 20: "minecraft:glass",
    21: "minecraft:lapis_ore", 22: "minecraft:lapis_block", 24: "minecraft:sandstone", 35: "minecraft:white_wool",
    41: "minecraft:gold_block", 42: "minecraft:iron_block", 45: "minecraft:bricks", 46: "minecraft:tnt",
    47: "minecraft:bookshelf", 48: "minecraft:mossy_cobblestone", 49: "minecraft:obsidian", 50: "minecraft:torch",
    56: "minecraft:diamond_ore", 57: "minecraft:diamond_block", 58: "minecraft:crafting_table",
    73: "minecraft:redstone_ore", 79: "minecraft:ice", 80: "minecraft:snow_block", 81: "minecraft:cactus",
    82: "minecraft:clay", 87: "minecraft:netherrack", 88: "minecraft:soul_sand", 89: "minecraft:glowstone",
    98: "minecraft:stone_bricks", 103: "minecraft:melon", 110: "minecraft:mycelium",
    112: "minecraft:nether_bricks", 121: "minecraft:end_stone", 129: "minecraft:emerald_ore",
    133: "minecraft:emerald_block", 152: "minecraft:redstone_block", 155: "minecraft:quartz_block",
    159: "minecraft:white_terracotta", 165: "minecraft:slime_block", 166: "minecraft:barrier",
    168: "minecraft:prismarine", 169: "minecraft:sea_lantern", 172: "minecraft:terracotta"
};

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
    if (!Number.isSafeInteger(volume) || width < 1 || height < 1 || length < 1 || volume > MAX_SCHEMATIC_VOLUME) {
        throw new Error("Invalid or excessively large schematic dimensions");
    }
}
function result(width, height, length, blocks, palette, blockAt = index => blocks[index]) {
    validateDimensions(width, height, length);
    const volume = width * height * length;
    if (blocks && blocks.length < volume) throw new Error("Schematic block data is incomplete");
    return {width, height, length, blocks, palette, blockAt, index: (x, y, z) => index(x, y, z, width, length)};
}
