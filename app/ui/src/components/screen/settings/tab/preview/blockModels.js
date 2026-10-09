import {Matrix4, Vector3, MathUtils} from "three";

const names = ["east", "west", "up", "down", "south", "north"];
const normals = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const resource = name => name.includes(":") ? name : "minecraft:" + name;

export const parseBlock = identifier => {
    const [name, suffix = ""] = identifier.split("[");
    return {name, states: Object.fromEntries(suffix.replace(/\]$/, "").split(",").filter(Boolean).map(pair => pair.split("=")))};
};

export function matchesStates(condition, states) {
    if (!condition) return true;
    return Object.entries(condition).every(([key, value]) => key === "OR"
        ? value.some(item => matchesStates(item, states)) : key === "AND"
            ? value.every(item => matchesStates(item, states))
            : String(value).split("|").includes(String(states[key])));
}

const box = (from, to, texture) => ({from, to, faces: Object.fromEntries(names.map(name => [name, {texture}]))});
const entityBox = (from, to, texture, offset, atlasSize = 64) => {
    const element = box(from, to, texture);
    const [w,h,d] = to.map((value,i)=>value-from[i]), [u,v] = offset;
    const rects = [[u+d+w,v+d,u+d+w+d,v+d+h],[u,v+d,u+d,v+d+h],
        [u+d,v,u+d+w,v+d],[u+d+w,v,u+d+w+w,v+d],
        [u+d+w+d,v+d,u+d+w+d+w,v+d+h],[u+d,v+d,u+d+w,v+d+h]];
    names.forEach((name,i)=>{element.faces[name].uv=rects[i].map((value,j)=>value*16/(Array.isArray(atlasSize) ? atlasSize[j%2] : atlasSize));});
    return element;
};

// Fluids and block entities have no ordinary JSON elements in the vanilla pack.
function specialElements(name, states, textures) {
    const short = name.replace("minecraft:", "");
    const particle = textures.particle || "minecraft:block/" + short;
    if (/^(water|lava)$/.test(short)) {
        const level = Number(states.level || 0);
        return [box([0,0,0], [16, level >= 8 ? 16 : (8 - level) * 16 / 9,16], `minecraft:block/${short}_still`)];
    }
    if (/^(ender_chest|trapped_chest|chest)$/.test(short)) {
        const texture = "minecraft:entity/chest/" + (short === "ender_chest" ? "ender" : short === "trapped_chest" ? "trapped" : "normal");
        return [entityBox([1,0,1],[15,10,15],texture,[0,19]),entityBox([1,10,1],[15,15,15],texture,[0,0]),
            entityBox([7,7,0],[9,11,1],texture,[0,0])];
    }
    if (short.endsWith("_bed")) return [box([0,3,0],[16,9,16], `minecraft:block/${short.replace("_bed", "_wool")}`),
        box([0,0,0],[3,3,3], "minecraft:block/oak_planks"), box([13,0,13],[16,3,16], "minecraft:block/oak_planks")];
    if (short.includes("banner")) return [box([7,0,7],[9,16,9], "minecraft:block/oak_planks"),
        box([1,6,7],[15,26,8], `minecraft:block/${short.split("_wall_banner")[0].split("_banner")[0]}_wool`)];
    if (short.includes("head") || short.includes("skull")) {
        const wall = short.includes("wall");
        const texture = short.includes("skeleton") ? "minecraft:entity/skeleton/skeleton"
            : short.includes("creeper") ? "minecraft:entity/creeper/creeper"
                : short.includes("zombie") ? "minecraft:entity/zombie/zombie" : "minecraft:entity/player/wide/steve";
        return [entityBox(wall ? [4,4,8] : [4,0,4],wall ? [12,12,16] : [12,8,12],texture,[0,0],
            [64,short.includes("skeleton") || short.includes("creeper") ? 32 : 64])];
    }
    if (short === "decorated_pot") return [box([1,0,1],[15,16,15], "minecraft:block/terracotta")];
    if (short === "conduit") return [box([5,5,5],[11,11,11], "minecraft:block/prismarine")];
    if (short === "shulker_box" || short.endsWith("_shulker_box")) return [box([0,0,0],[16,16,16], particle)];
    if (short.endsWith("_sign")) {
        const wood = textures.particle || "minecraft:block/oak_planks";
        if (short.includes("wall")) return [box([0,4,14],[16,12,16], wood)];
        return [box([7,0,7],[9,9,9],wood),box([0,9,7],[16,17,9],wood)];
    }
    return null;
}

export function createBlockModels(catalog) {
    const resolved = new Map(), cache = new Map();
    function inherit(name, visiting = new Set()) {
        name = resource(name);
        if (resolved.has(name)) return resolved.get(name);
        if (visiting.has(name)) throw new Error(`Cyclic block model: ${name}`);
        const model = catalog.models[name];
        if (!model) return null;
        visiting.add(name);
        const parent = model.parent ? inherit(model.parent, visiting) : null;
        visiting.delete(name);
        const merged = {...parent, ...model, textures: {...parent?.textures, ...model.textures}};
        resolved.set(name, merged);
        return merged;
    }
    function get(identifier) {
        if (cache.has(identifier)) return cache.get(identifier);
        const {name, states} = parseBlock(identifier);
        // Preview preserves unknown Bedrock identifiers; normalize their common orientation state.
        if (!states.facing && states.facing_direction !== undefined) {
            states.facing = {0:"down",1:"up",2:"north",3:"south",4:"west",5:"east"}[states.facing_direction];
        }
        if (/^minecraft:(air|cave_air|void_air|barrier|light|structure_void)$/.test(name)) {
            const invisible = {identifier, invisible:true, fullCube:false, occludes:false, materials:[], cubeFaces:[],
                positions:new Float32Array(), normals:new Float32Array(), uv:new Float32Array(), indices:new Uint32Array(), groups:[]};
            cache.set(identifier,invisible); return invisible;
        }
        const definition = catalog.blockstates[name];
        let applications = [];
        if (definition?.variants) {
            const variant = Object.entries(definition.variants).find(([key]) => matchesStates(
                Object.fromEntries(key.split(",").filter(Boolean).map(pair => pair.split("="))), states));
            if (variant) applications.push(variant[1]);
        }
        if (definition?.multipart) applications.push(...definition.multipart.filter(part => matchesStates(part.when, states)).map(part => part.apply));
        applications = applications.map(apply => Array.isArray(apply) ? apply[0] : apply);
        const positions = [], normalData = [], uvData = [], indices = [], groups = [], materials = [], cubeFaces = [];
        let fullCube = applications.length === 1, missing = !applications.length, specialized = false;
        const textureFor = (reference, textures) => {
            const visited = new Set();
            while (typeof reference === "string" && reference.startsWith("#")) {
                if (visited.has(reference)) return null;
                visited.add(reference); reference = textures[reference.slice(1)];
            }
            return typeof reference === "object" ? reference : {sprite: reference};
        };
        if (!applications.length) applications = [{model: name.replace(":", ":block/")}];
        for (const apply of applications) {
            const model = inherit(apply.model);
            const textures = model?.textures || {};
            let elements = model?.elements;
            if (!elements?.length) {
                elements = specialElements(name, states, textures);
                specialized ||= !!elements;
                if (!elements) { elements = [box([0,0,0],[16,16,16], textures.particle || "minecraft:block/missing")]; missing = true; }
            }
            if (states.waterlogged === "true" && apply === applications[0]) {
                const water = box([0,0,0],[16,14,16],{sprite:"minecraft:block/water_still",force_translucent:true});
                Object.values(water.faces).forEach(face=>{face.tintindex=0;});
                elements = [...elements,water];
            }
            fullCube &&= elements.length === 1 && !elements[0].rotation &&
                elements[0].from.every(value => value === 0) && elements[0].to.every(value => value === 16) &&
                names.every(face => elements[0].faces?.[face]);
            const specialFacing = states.facing || {2:"north",3:"south",4:"west",5:"east"}[states.facing_direction];
            const specialY = specialized ? states.rotation !== undefined ? Number(states.rotation) * 22.5
                : {north:0,east:90,south:180,west:270}[specialFacing] || 0 : 0;
            const variant = new Matrix4().makeRotationY(-MathUtils.degToRad(apply.y || specialY || 0))
                .multiply(new Matrix4().makeRotationX(-MathUtils.degToRad(apply.x || 0)));
            for (const element of elements) {
                const from = element.from.map(value => value / 16), to = element.to.map(value => value / 16);
                let transform = new Matrix4();
                if (element.rotation) {
                    const rotation = element.rotation, origin = rotation.origin.map(value => value / 16);
                    const angle = MathUtils.degToRad(rotation.angle);
                    const rotate = new Matrix4()[`makeRotation${rotation.axis.toUpperCase()}`](angle);
                    if (rotation.rescale) {
                        const scale = [1,1,1].map((value, i) => "xyz"[i] === rotation.axis ? 1 : 1 / Math.cos(angle));
                        rotate.multiply(new Matrix4().makeScale(...scale));
                    }
                    transform.makeTranslation(...origin).multiply(rotate).multiply(new Matrix4().makeTranslation(...origin.map(value => -value)));
                }
                transform = new Matrix4().makeTranslation(0.5,0.5,0.5).multiply(variant)
                    .multiply(new Matrix4().makeTranslation(-0.5,-0.5,-0.5)).multiply(transform);
                for (const [faceName, face] of Object.entries(element.faces || {})) {
                    const originalFace = names.indexOf(faceName), axis = originalFace >> 1;
                    const plane = (originalFace % 2 === 0 ? to : from)[axis];
                    const u0 = axis === 0 ? from[2] : from[0], u1 = axis === 0 ? to[2] : to[0];
                    const v0 = axis === 1 ? from[2] : from[1], v1 = axis === 1 ? to[2] : to[1];
                    const points = [[u0,v0],[u1,v0],[u1,v1],[u0,v1]].map(([u,v]) => new Vector3(...(
                        axis === 0 ? [plane,v,u] : axis === 1 ? [u,plane,v] : [u,v,plane])).applyMatrix4(transform));
                    const normal = new Vector3().subVectors(points[1],points[0]).cross(new Vector3().subVectors(points[2],points[0])).normalize();
                    const reverse = axis === 2 ? originalFace % 2 === 1 : originalFace % 2 === 0;
                    if (reverse) normal.negate();
                    const worldFace = normals.findIndex(n => normal.dot(new Vector3(...n)) > 0.999);
                    const texture = textureFor(face.texture, textures);
                    const sprite = texture?.sprite && resource(texture.sprite);
                    const material = {texture: sprite, tinted: face.tintindex !== undefined,
                        water: sprite?.includes("water"),
                        translucent: !!texture?.force_translucent || /glass/.test(name) ||
                            /^minecraft:(water|ice|frosted_ice|slime_block|honey_block)$/.test(name),
                        color: sprite ? undefined : 0xff00ff};
                    const materialKey = JSON.stringify(material);
                    let materialIndex = materials.findIndex(item => JSON.stringify(item) === materialKey);
                    if (materialIndex < 0) { materialIndex = materials.length; materials.push(material); }
                    const defaults = originalFace === 0 ? [16-to[2]*16,16-to[1]*16,16-from[2]*16,16-from[1]*16]
                        : originalFace === 1 ? [from[2]*16,16-to[1]*16,to[2]*16,16-from[1]*16]
                        : originalFace === 2 ? [from[0]*16,from[2]*16,to[0]*16,to[2]*16]
                        : originalFace === 3 ? [from[0]*16,16-to[2]*16,to[0]*16,16-from[2]*16]
                        : originalFace === 4 ? [from[0]*16,16-to[1]*16,to[0]*16,16-from[1]*16]
                        : [16-to[0]*16,16-to[1]*16,16-from[0]*16,16-from[1]*16];
                    const rect = face.uv || defaults;
                    const uv = [[0,0],[1,0],[1,1],[0,1]].map(([u,v], corner) => {
                        let direction = originalFace;
                        if (apply.uvlock && worldFace >= 0) {
                            direction = worldFace;
                            const point = points[corner], worldAxis = direction >> 1;
                            const us = points.map(p => worldAxis === 0 ? p.z : p.x);
                            const vs = points.map(p => worldAxis === 1 ? p.z : p.y);
                            u = ((worldAxis === 0 ? point.z : point.x) - Math.min(...us)) / (Math.max(...us)-Math.min(...us) || 1);
                            v = ((worldAxis === 1 ? point.z : point.y) - Math.min(...vs)) / (Math.max(...vs)-Math.min(...vs) || 1);
                        }
                        u = direction === 0 || direction === 5 ? 1-u : u;
                        v = direction === 2 ? v : 1-v;
                        for (let turn=0;turn<(face.rotation || 0)/90;turn++) [u,v] = [v,1-u];
                        return [(rect[0]+u*(rect[2]-rect[0]))/16,1-(rect[1]+v*(rect[3]-rect[1]))/16];
                    });
                    const vertex = positions.length / 3, groupStart = indices.length;
                    points.forEach((point, i) => { positions.push(...point.toArray()); normalData.push(...normal.toArray()); uvData.push(...uv[i]); });
                    indices.push(...(reverse ? [0,2,1,0,3,2] : [0,1,2,0,2,3]).map(i => vertex+i));
                    groups.push({start: groupStart, count: 6, materialIndex});
                    if (worldFace >= 0 && fullCube) {
                        const worldAxis = worldFace >> 1;
                        const cornerUvs = [];
                        points.forEach((p, i) => {
                            const u = Math.round(worldAxis === 0 ? p.z : p.x), v = Math.round(worldAxis === 1 ? p.z : p.y);
                            cornerUvs[u+v*2] = uv[i];
                        });
                        if (cornerUvs.every(Boolean)) cubeFaces[worldFace] = {materialIndex, origin:cornerUvs[0],
                            du:cornerUvs[1].map((value,i)=>value-cornerUvs[0][i]), dv:cornerUvs[2].map((value,i)=>value-cornerUvs[0][i])};
                    }
                }
            }
        }
        const transparent = materials.some(material => material.translucent) || /leaves|grate|spawner|mangrove_roots|beacon/.test(name);
        const mergedIndices = [], mergedGroups = [];
        materials.forEach((_, materialIndex) => {
            const start = mergedIndices.length;
            groups.filter(group=>group.materialIndex===materialIndex).forEach(group=>mergedIndices.push(...indices.slice(group.start,group.start+group.count)));
            if (mergedIndices.length > start) mergedGroups.push({start,count:mergedIndices.length-start,materialIndex});
        });
        const result = {identifier, fullCube:!!fullCube && cubeFaces.length === 6, occludes:!!fullCube && !transparent,
            missing, specialized, materials, cubeFaces, positions:new Float32Array(positions), normals:new Float32Array(normalData),
            uv:new Float32Array(uvData), indices:new Uint32Array(mergedIndices), groups:mergedGroups, waterlogged:states.waterlogged === "true"};
        cache.set(identifier,result); return result;
    }
    return {get};
}
