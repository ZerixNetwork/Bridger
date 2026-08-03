const fs = require("fs");
const path = require("path");

const resolverPath = path.join(__dirname, "../../../cli/src/main/java/com/hivemc/chunker/conversion/encoding/java/base/resolver/identifier/legacy/JavaLegacyBlockIDResolver.java");
const statesPath = path.join(__dirname, "../../../cli/src/test/resources/java/resolver/pre_1_13_blocks.json");
const outputPath = path.join(__dirname, "../public/data/legacy-blocks.json");

const source = fs.readFileSync(resolverPath, "utf8");
const states = JSON.parse(fs.readFileSync(statesPath, "utf8"));
const ids = new Map(Array.from(source.matchAll(/mapping\.put\("([^"]+)",\s*(\d+)\)/g), match => [match[1], Number(match[2])]));
const output = {};

for (const [legacyName, definition] of Object.entries(states)) {
    const id = ids.get(legacyName);
    if (id === undefined) continue;
    for (const [data, value] of Object.entries(definition.data || {})) output[`${id}:${data}`] = value.identifier;
}

fs.mkdirSync(path.dirname(outputPath), {recursive: true});
fs.writeFileSync(outputPath, JSON.stringify(output));
console.log(`Processed ${Object.keys(output).length} legacy block states`);
