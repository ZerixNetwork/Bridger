import {createBlockModels, matchesStates} from "./blockModels";
import {blockTint} from "../../../schematic/blockColor";

const faces = Object.fromEntries(["east","west","up","down","south","north"].map(name=>[name,{texture:"#all",cullface:name}]));
const catalog = {models:{
    "minecraft:block/cube":{textures:{all:"minecraft:block/stone"},elements:[{from:[0,0,0],to:[16,16,16],faces}]},
    "minecraft:block/glass":{parent:"block/cube",textures:{all:{sprite:"minecraft:block/glass",force_translucent:true}}},
    "minecraft:block/slab":{textures:{all:"minecraft:block/oak_planks"},elements:[{from:[0,0,0],to:[16,8,16],faces}]},
    "minecraft:block/post":{textures:{all:"minecraft:block/glass"},elements:[{from:[7,0,7],to:[9,16,9],faces}]},
    "minecraft:block/arm":{textures:{all:"minecraft:block/glass"},elements:[{from:[7,0,0],to:[9,16,7],faces}]}
},blockstates:{
    "minecraft:stone":{variants:{"":{model:"block/cube"}}},
    "minecraft:glass":{variants:{"":{model:"block/glass"}}},
    "minecraft:oak_slab":{variants:{"type=bottom":{model:"block/slab"},"type=top":{model:"block/slab",x:180},"type=double":{model:"block/cube"}}},
    "minecraft:glass_pane":{multipart:[{apply:{model:"block/post"}},{when:{north:"true"},apply:{model:"block/arm"}},
        {when:{east:"true"},apply:{model:"block/arm",y:90}}]}
}};

test("resolves inherited textures and translucent glass without making it an occluder",()=>{
    const library=createBlockModels(catalog), glass=library.get("minecraft:glass");
    expect(glass.fullCube).toBe(true);
    expect(glass.occludes).toBe(false);
    expect(glass.materials[0]).toMatchObject({texture:"minecraft:block/glass",translucent:true});
    expect(glass.cubeFaces).toHaveLength(6);
    expect(library.get("minecraft:stone").occludes).toBe(true);
});

test("uses slab state and rotations for actual half-block geometry",()=>{
    const library=createBlockModels(catalog);
    const bottom=library.get("minecraft:oak_slab[type=bottom]"), top=library.get("minecraft:oak_slab[type=top]");
    const ys=model=>Array.from(model.positions).filter((_,i)=>i%3===1);
    expect(Math.max(...ys(bottom))).toBe(0.5);
    expect(Math.min(...ys(top))).toBeCloseTo(0.5);
    expect(Math.max(...ys(top))).toBeCloseTo(1);
    expect(bottom.occludes).toBe(false);
    expect(library.get("minecraft:oak_slab[type=double]").fullCube).toBe(true);
});

test("keeps cutout cube neighbors visible and colors redstone by power",()=>{
    const blockstates={...catalog.blockstates};
    for (const name of ["copper_grate","trial_spawner","mangrove_roots","beacon"]) {
        blockstates["minecraft:"+name]={variants:{"":{model:"block/cube"}}};
    }
    const library=createBlockModels({...catalog,blockstates});
    for (const name of ["copper_grate","trial_spawner","mangrove_roots","beacon"]) {
        expect(library.get("minecraft:"+name).occludes).toBe(false);
    }
    expect(blockTint("minecraft:redstone_wire[power=0]")).toBe(0x4d0000);
    expect(blockTint("minecraft:redstone_wire[power=15]")).toBe(0xff3300);
});

test("builds connected panes from matching multipart conditions",()=>{
    const library=createBlockModels(catalog);
    const post=library.get("minecraft:glass_pane[north=false,east=false]");
    const connected=library.get("minecraft:glass_pane[north=true,east=true]");
    expect(post.indices.length).toBe(36);
    expect(connected.indices.length).toBe(108);
    expect(connected.fullCube).toBe(false);
    expect(Math.min(...Array.from(connected.positions).filter((_,i)=>i%3===2))).toBe(0);
});

test("selects native models for preserved Bedrock facing states",()=>{
    const library=createBlockModels({...catalog,blockstates:{...catalog.blockstates,
        "minecraft:poplar_wall_sign":{variants:{"facing=west":{model:"block/slab",y:90}}}}});
    const sign=library.get("minecraft:poplar_wall_sign[facing_direction=4]");
    expect(sign.missing).toBe(false);
    expect(sign.specialized).toBe(false);
    expect(sign.positions.length).toBeGreaterThan(0);
});

test("supports nested conditions, waterlogging, and explicit unknown-model fallbacks",()=>{
    expect(matchesStates({AND:[{facing:"north|east"},{OR:[{open:"true"},{powered:"true"}]}]},{facing:"east",open:"true"})).toBe(true);
    const library=createBlockModels(catalog);
    const wet=library.get("minecraft:oak_slab[type=bottom,waterlogged=true]");
    expect(wet.indices.length).toBe(72);
    expect(wet.materials.some(material=>material.water && material.translucent)).toBe(true);
    const unknown=library.get("minecraft:unknown_block");
    expect(unknown.missing).toBe(true);
    expect(unknown.indices.length).toBeGreaterThan(0);
    const sign=library.get("minecraft:poplar_wall_sign[facing_direction=4]");
    expect(sign.specialized).toBe(true);
    expect(sign.fullCube).toBe(false);
    expect(sign.materials[0].texture).toBe("minecraft:block/oak_planks");
    for (const name of ["air","cave_air","void_air"]) {
        const air=library.get("minecraft:"+name);
        expect(air.invisible).toBe(true);
        expect(air.indices.length).toBe(0);
    }
});
