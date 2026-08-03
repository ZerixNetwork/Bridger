import textureMappings from "./textureMappings.json";

const JAVA_PREFIX = "assets/minecraft/";

const JAVA_TO_BEDROCK = [
    ["textures/block/", "textures/blocks/"],
    ["textures/item/", "textures/items/"],
    ["textures/entity/", "textures/entity/"],
    ["textures/environment/", "textures/environment/"],
    ["textures/particle/", "textures/particle/"],
    ["sounds/", "sounds/"]
];

const BEDROCK_TO_JAVA = JAVA_TO_BEDROCK.map(([javaPath, bedrockPath]) => [bedrockPath, javaPath]);

function flattenMappings(node, key, parents = [], output = {}) {
    if (Array.isArray(node)) output[key] = node;
    else if (node && typeof node === "object") {
        Object.entries(node).forEach(([child, value]) => flattenMappings(value, `${key}/${child}`, [...parents, key], output));
    } else output[key] = [(parents.length ? parents.join("/") + "/" : "") + node];
    return output;
}

const FLAT_MAPPINGS = Object.entries(textureMappings).reduce((output, [key, value]) =>
    flattenMappings(value, key, [], output), {});
const REVERSE_MAPPINGS = Object.entries(FLAT_MAPPINGS).reduce((output, [javaPath, bedrockPaths]) => {
    bedrockPaths.forEach(bedrockPath => {
        if (!output[bedrockPath]) output[bedrockPath] = javaPath;
    });
    return output;
}, {});
const BEDROCK_DIRECTORIES = {block: "blocks", item: "items", gui: "ui"};
const JAVA_DIRECTORIES = {blocks: "block", items: "item", ui: "gui"};

export function detectPack(paths, preferred = null) {
    const java = paths.includes("pack.mcmeta") || paths.some(path => path.startsWith(JAVA_PREFIX));
    const bedrock = paths.includes("manifest.json") || paths.some(path => path.startsWith("textures/blocks/") || path.startsWith("textures/items/"));
    if (preferred === "bedrock" && bedrock) return "bedrock";
    if (preferred === "java" && java) return "java";
    if (paths.includes("manifest.json")) return "bedrock";
    if (paths.includes("pack.mcmeta")) return "java";
    if (bedrock) return "bedrock";
    if (java) return "java";
    return null;
}

export function mapPackPath(path, source) {
    return mapPackPaths(path, source)[0] || null;
}

export function mapPackPaths(path, source) {
    if (source === "java") {
        if (path === "pack.png") return ["pack_icon.png"];
        if (!path.startsWith(JAVA_PREFIX)) return [];
        const relative = path.slice(JAVA_PREFIX.length);
        if (relative.startsWith("textures/") && relative.endsWith(".png")) {
            const texturePath = relative.slice("textures/".length, -4);
            const root = texturePath.split("/")[0];
            const bedrockRoot = BEDROCK_DIRECTORIES[root] || root;
            return (FLAT_MAPPINGS[texturePath] || [texturePath]).map(mapped => {
                const slash = mapped.indexOf("/");
                return `textures/${bedrockRoot}/${slash === -1 ? mapped : mapped.slice(slash + 1)}.png`;
            });
        }
        if (relative.startsWith("textures/")) return [];
        const mapping = JAVA_TO_BEDROCK.find(([from]) => relative.startsWith(from));
        return mapping ? [mapping[1] + relative.slice(mapping[0].length)] : [];
    }

    if (path === "pack_icon.png") return ["pack.png"];
    if (path.startsWith("textures/") && path.endsWith(".png")) {
        const relative = path.slice("textures/".length, -4);
        const slash = relative.indexOf("/");
        const root = slash === -1 ? relative : relative.slice(0, slash);
        const javaRoot = JAVA_DIRECTORIES[root] || root;
        const texturePath = `${javaRoot}/${slash === -1 ? relative : relative.slice(slash + 1)}`;
        return [`${JAVA_PREFIX}textures/${REVERSE_MAPPINGS[texturePath] || texturePath}.png`];
    }
    if (path.startsWith("textures/")) return [];
    const mapping = BEDROCK_TO_JAVA.find(([from]) => path.startsWith(from));
    return mapping ? [JAVA_PREFIX + mapping[1] + path.slice(mapping[0].length)] : [];
}
