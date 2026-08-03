export const JAVA_VERSIONS = [
    {id: "1.20–1.20.1", format: [15, 0]},
    {id: "1.20.2", format: [18, 0]},
    {id: "1.20.3–1.20.4", format: [22, 0]},
    {id: "1.20.5–1.20.6", format: [32, 0]},
    {id: "1.21–1.21.1", format: [34, 0]},
    {id: "1.21.2–1.21.3", format: [42, 0]},
    {id: "1.21.4", format: [46, 0]},
    {id: "1.21.5", format: [55, 0]},
    {id: "1.21.6", format: [63, 0]},
    {id: "1.21.7–1.21.8", format: [64, 0]},
    {id: "1.21.9–1.21.10", format: [69, 0]},
    {id: "1.21.11", format: [75, 0]},
    {id: "26.1", format: [84, 0]},
    {id: "26.2", format: [88, 0]}
];

export const BEDROCK_VERSIONS = [
    {id: "1.20.0", engine: [1, 20, 0]},
    {id: "1.20.80", engine: [1, 20, 80]},
    {id: "1.21.0", engine: [1, 21, 0]},
    {id: "1.21.80", engine: [1, 21, 80]},
    {id: "1.21.130", engine: [1, 21, 130]},
    {id: "1.26.0", engine: [1, 26, 0]},
    {id: "1.26.30", engine: [1, 26, 30]}
];

export const versionsFor = edition => edition === "java" ? JAVA_VERSIONS : BEDROCK_VERSIONS;

export function versionFromMetadata(edition, metadata) {
    if (edition === "bedrock") {
        const version = metadata?.header?.min_engine_version;
        return Array.isArray(version) ? version.join(".") : (typeof version === "string" ? version : null);
    }
    const raw = metadata?.pack?.min_format ?? metadata?.pack?.pack_format;
    const format = Array.isArray(raw) ? raw : [raw, 0];
    if (!Number.isFinite(format[0])) return null;
    return JAVA_VERSIONS.find(version => version.format[0] === format[0] && version.format[1] === (format[1] || 0))?.id ||
        `Pack format ${format.join(".")}`;
}

export function targetVersion(edition, id) {
    const versions = versionsFor(edition);
    return versions.find(version => version.id === id) || versions[versions.length - 1];
}
