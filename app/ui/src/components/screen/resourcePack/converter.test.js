import JSZip from "jszip";
import {convertResourcePack, inspectResourcePack, javaMetadata} from "./converter";
import {targetVersion} from "./versions";

test("converts Bedrock textures and preserves unmapped files", async () => {
    const zip = new JSZip();
    zip.file("Pack/manifest.json", "{}");
    zip.file("Pack/textures/blocks/stone.png", new Uint8Array([1, 2, 3]));
    zip.file("Pack/ui/custom.json", "{}");
    const input = await zip.generateAsync({type: "uint8array"});
    input.name = "Test Pack.mcpack";

    const result = await convertResourcePack(input, {packFormat: 34});

    expect(result.fileName).toBe("Test Pack-java.zip");
    expect(result.report.converted).toEqual(["textures/blocks/stone.png"]);
    expect(result.report.unmapped).toEqual(["ui/custom.json"]);
});

test("writes correct Java metadata for old and current pack formats", () => {
    expect(javaMetadata("Pack", targetVersion("java", "1.21.4")).pack.pack_format).toBe(46);
    expect(javaMetadata("Pack", targetVersion("java", "26.2")).pack).toMatchObject({
        min_format: [88, 0], max_format: [88, 0]
    });
});

test("uses Bedrock manifest for mcpack archives containing both metadata files", async () => {
    const zip = new JSZip();
    zip.file("Pack/manifest.json", "{}");
    zip.file("Pack/pack.mcmeta", "{}");
    zip.file("Pack/textures/blocks/stone.png", new Uint8Array([1]));
    const input = await zip.generateAsync({type: "uint8array"});
    input.name = "Pack.mcpack";

    const result = await inspectResourcePack(input);

    expect(result.source).toBe("bedrock");
    expect(result.extensionMismatch).toBe(false);
});
