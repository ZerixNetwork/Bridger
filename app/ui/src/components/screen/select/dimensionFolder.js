export function selectedDirectoryFromFile(fullPath, relativePath) {
    const normalizedPath = fullPath.replaceAll("\\", "/");
    const relativeParts = relativePath.split("/").filter(Boolean);
    const suffix = relativeParts.slice(1).join("/");
    return suffix ? normalizedPath.slice(0, -suffix.length - 1) : normalizedPath;
}

export function isDirectorySelection(files) {
    return files.some(({path}) => path.split("/").filter(Boolean).length > 1);
}

export function dimensionFolderSelection(directory) {
    const normalized = directory.replaceAll("\\", "/").replace(/\/$/, "");
    const marker = "/dimensions/";
    const markerIndex = normalized.toLowerCase().lastIndexOf(marker);
    if (markerIndex === -1) return null;

    const parts = normalized.slice(markerIndex + marker.length).split("/");
    if (parts.length !== 2 || parts.some(part => !part)) return null;
    return {
        worldPath: normalized.slice(0, markerIndex),
        identifier: parts.join(":")
    };
}
