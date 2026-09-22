import {dimensionFolderSelection, isDirectorySelection, selectedDirectoryFromFile} from "./dimensionFolder";

test("recognizes a directly selected Java dimension folder", () => {
    const file = "C:\\saves\\world\\dimensions\\minecraft\\knight\\region\\r.1.25.mca";
    const directory = selectedDirectoryFromFile(file, "/knight/region/r.1.25.mca");
    expect(dimensionFolderSelection(directory)).toEqual({
        worldPath: "C:/saves/world",
        identifier: "minecraft:knight"
    });
});

test("recognizes a selected folder containing one file", () => {
    expect(isDirectorySelection([{path: "/knight/region/r.1.25.mca"}])).toBe(true);
    expect(isDirectorySelection([{path: "/world.mcworld"}])).toBe(false);
});

test("does not treat a normal folder as a dimension", () => {
    expect(dimensionFolderSelection("C:/saves/world")).toBeNull();
});
