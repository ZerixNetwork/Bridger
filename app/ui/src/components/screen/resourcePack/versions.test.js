import {targetVersion, versionFromMetadata} from "./versions";

test("reads source versions from Java and Bedrock metadata", () => {
    expect(versionFromMetadata("java", {pack: {pack_format: 46}})).toBe("1.21.4");
    expect(versionFromMetadata("java", {pack: {min_format: [88, 0]}})).toBe("26.2");
    expect(versionFromMetadata("bedrock", {header: {min_engine_version: [1, 21, 80]}})).toBe("1.21.80");
});

test("selects target metadata versions", () => {
    expect(targetVersion("java", "26.2").format).toEqual([88, 0]);
    expect(targetVersion("bedrock", "1.21.130").engine).toEqual([1, 21, 130]);
});
