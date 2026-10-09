package com.hivemc.chunker.conversion.encoding.preview;

import com.hivemc.chunker.conversion.intermediate.column.ChunkerColumn;
import com.hivemc.chunker.conversion.intermediate.column.chunk.ChunkCoordPair;
import com.hivemc.chunker.conversion.intermediate.column.chunk.identifier.ChunkerBlockIdentifier;
import com.hivemc.chunker.conversion.intermediate.column.chunk.identifier.type.block.ChunkerVanillaBlockType;
import com.hivemc.chunker.conversion.intermediate.world.Dimension;
import com.hivemc.chunker.conversion.intermediate.column.chunk.identifier.type.block.states.vanilla.VanillaBlockStates;
import com.hivemc.chunker.conversion.intermediate.column.chunk.identifier.type.block.states.vanilla.types.Bool;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.DataInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Set;
import java.util.Map;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.*;

public class PreviewColumnWriterTests {
    @TempDir
    Path directory;

    @Test
    public void excludesEveryAirTypeAndRetainsBlocksBehindCutoutCubes() throws IOException {
        var world = new PreviewWorldWriter.WorldData();
        world.dimension = Dimension.OVERWORLD;
        var writer = new PreviewColumnWriter(directory.toFile(), world);
        var empty = new ChunkerColumn(new ChunkCoordPair(32, 0));
        empty.setBlock(1, 10, 1, new ChunkerBlockIdentifier(ChunkerVanillaBlockType.CAVE_AIR));
        empty.setBlock(2, 10, 1, new ChunkerBlockIdentifier(ChunkerVanillaBlockType.VOID_AIR));
        writer.writeColumn(empty);
        var column = new ChunkerColumn(new ChunkCoordPair(0, 0));
        column.setBlock(5, 5, 5, new ChunkerBlockIdentifier(ChunkerVanillaBlockType.STONE));
        for (int[] p : new int[][]{{4,5,5},{6,5,5},{5,4,5},{5,6,5},{5,5,4},{5,5,6}}) {
            column.setBlock(p[0],p[1],p[2],new ChunkerBlockIdentifier(ChunkerVanillaBlockType.COPPER_GRATE));
        }
        writer.writeColumn(column);
        writer.flushColumns();
        assertEquals(1,world.regionToPresentChunks.size());
        assertFalse(Files.exists(directory.resolve("minecraft_overworld.1.0.blocks.bin")));
        try (var input = new DataInputStream(Files.newInputStream(directory.resolve("minecraft_overworld.0.0.blocks.bin")))) {
            assertEquals(7,input.readInt());
        }
    }

    @Test
    public void includesGlassOnlyChunksAndBlocksBehindTransparentNeighbors() throws IOException {
        var world = new PreviewWorldWriter.WorldData();
        world.dimension = Dimension.OVERWORLD;
        var writer = new PreviewColumnWriter(directory.toFile(), world);
        var column = new ChunkerColumn(new ChunkCoordPair(0, 0));
        column.setBlock(5, 5, 5, new ChunkerBlockIdentifier(ChunkerVanillaBlockType.STONE));
        int[][] neighbors = {{4,5,5},{6,5,5},{5,4,5},{5,6,5},{5,5,4},{5,5,6}};
        for (int[] p : neighbors) column.setBlock(p[0],p[1],p[2],new ChunkerBlockIdentifier(ChunkerVanillaBlockType.GLASS));
        writer.writeColumn(column);
        var glassOnly = new ChunkerColumn(new ChunkCoordPair(32, 0));
        glassOnly.setBlock(5, 64, 5, new ChunkerBlockIdentifier(ChunkerVanillaBlockType.GLASS_PANE,
                Map.of(VanillaBlockStates.NORTH, Bool.TRUE)));
        writer.writeColumn(glassOnly);
        writer.flushColumns();
        assertEquals(2, world.regionToPresentChunks.size());
        try (var input = new DataInputStream(Files.newInputStream(directory.resolve("minecraft_overworld.0.0.blocks.bin")))) {
            assertEquals(7, input.readInt(), "Opaque block behind glass must remain available");
        }
        try (var input = new DataInputStream(Files.newInputStream(directory.resolve("minecraft_overworld.1.0.blocks.bin")))) {
            assertEquals(1,input.readInt());
            assertEquals(1,input.readUnsignedShort());
            String identifier = new String(input.readNBytes(input.readInt()),java.nio.charset.StandardCharsets.UTF_8);
            assertTrue(identifier.startsWith("minecraft:glass_pane["));
            assertTrue(identifier.contains("north=true"));
        }
    }

    @Test
    public void retainsEveryExposedBlockAndRegionDuringParallelWrites() throws IOException {
        var world = new PreviewWorldWriter.WorldData();
        world.dimension = Dimension.OVERWORLD;
        var writer = new PreviewColumnWriter(directory.toFile(), world);
        var stone = new ChunkerBlockIdentifier(ChunkerVanillaBlockType.STONE);

        // Empty regions must not consume slots; the old region cap lost later terrain.
        for (int region = -12; region < 0; region++) {
            writer.writeColumn(new ChunkerColumn(new ChunkCoordPair(region * 32, 0)));
        }
        // 65,536 visible blocks exceed the old 55,555-block cutoff in a single region.
        IntStream.range(0, 256).parallel().forEach(index -> {
            var column = new ChunkerColumn(new ChunkCoordPair(index % 16, index / 16));
            for (int x = 0; x < 16; x++) for (int z = 0; z < 16; z++) {
                column.setBlock(x, -60, z, stone);
            }
            writer.writeColumn(column);
        });
        for (int region = 1; region <= 10; region++) {
            var column = new ChunkerColumn(new ChunkCoordPair(region * 32, 0));
            column.setBlock(0, 100, 0, stone);
            writer.writeColumn(column);
        }
        writer.flushColumns();

        try (var input = new DataInputStream(Files.newInputStream(directory.resolve("minecraft_overworld.0.0.blocks.bin")))) {
            assertEquals(65_536, input.readInt());
            assertEquals(1, input.readUnsignedShort());
            assertEquals("minecraft:stone", new String(input.readNBytes(input.readInt()), java.nio.charset.StandardCharsets.UTF_8));
            Set<Integer> positions = new HashSet<>();
            for (int i = 0; i < 65_536; i++) {
                int x = input.readUnsignedShort();
                assertEquals(-60, input.readShort());
                int z = input.readUnsignedShort();
                assertEquals(stone.getRGBColor(), input.readInt());
                assertEquals(0, input.readUnsignedShort());
                assertTrue(positions.add(x * 512 + z), "Duplicate block position");
            }
            assertEquals(-1, input.read());
        }
        for (int region = 1; region <= 10; region++) {
            try (var input = new DataInputStream(Files.newInputStream(directory.resolve("minecraft_overworld." + region + ".0.blocks.bin")))) {
                assertEquals(1, input.readInt());
            }
        }
        try (var files = Files.list(directory)) {
            assertFalse(files.anyMatch(file -> file.toString().endsWith(".blocks.tmp")));
        }
    }
}
