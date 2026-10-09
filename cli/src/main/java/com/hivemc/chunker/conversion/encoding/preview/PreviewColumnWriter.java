package com.hivemc.chunker.conversion.encoding.preview;

import com.google.common.collect.Sets;
import com.hivemc.chunker.conversion.WorldConverter;
import com.hivemc.chunker.conversion.encoding.EncodingType;
import com.hivemc.chunker.conversion.encoding.java.base.resolver.identifier.JavaBlockIdentifierResolver;
import com.hivemc.chunker.conversion.encoding.base.writer.ColumnWriter;
import com.hivemc.chunker.conversion.intermediate.column.ChunkerColumn;
import com.hivemc.chunker.conversion.intermediate.column.chunk.ChunkCoordPair;
import com.hivemc.chunker.conversion.intermediate.column.chunk.RegionCoordPair;
import com.hivemc.chunker.conversion.intermediate.column.chunk.identifier.ChunkerBlockIdentifier;
import com.hivemc.chunker.conversion.intermediate.column.chunk.identifier.type.block.ChunkerCustomBlockType;
import com.hivemc.chunker.conversion.intermediate.column.chunk.identifier.type.block.ChunkerVanillaBlockType;
import it.unimi.dsi.fastutil.Pair;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * Write all the regions as images based on the block colors.
 */
public class PreviewColumnWriter implements ColumnWriter {
    private static final JavaBlockIdentifierResolver MODEL_IDENTIFIERS = new JavaBlockIdentifierResolver(
            new WorldConverter(null), EncodingType.JAVA.getSupportedVersions().stream().max(Comparator.naturalOrder()).orElseThrow(), false, true);
    private final ConcurrentMap<ChunkerBlockIdentifier, String> modelNames = new ConcurrentHashMap<>();
    private final File outputFolder;
    private final ConcurrentMap<RegionCoordPair, ConcurrentMap<ChunkCoordPair, int[]>> chunkRGBA = new ConcurrentHashMap<>();
    private final ConcurrentMap<RegionCoordPair, ConcurrentMap<ChunkCoordPair, short[]>> chunkHeights = new ConcurrentHashMap<>();
    private final ConcurrentMap<RegionCoordPair, VoxelData> regionVoxels = new ConcurrentHashMap<>();
    private final PreviewWorldWriter.WorldData worldData;

    /**
     * Create a new preview column writer.
     *
     * @param outputFolder the folder where the images should be written.
     * @param worldData    the world data to add present chunks to.
     */
    public PreviewColumnWriter(File outputFolder, PreviewWorldWriter.WorldData worldData) {
        this.outputFolder = outputFolder;
        this.worldData = worldData;
    }

    @Override
    public void writeColumn(ChunkerColumn chunkerColumn) {
        int[] argb = new int[256];
        short[] heights = new short[256];
        boolean present = false;

        // Loop through each column to calculate color
        for (int x = 0; x < 16; x++) {
            for (int z = 0; z < 16; z++) {
                // Find the highest block that has RGB color
                present |= chunkerColumn.getHighestBlock(x, z, PreviewColumnWriter::isRenderable) != null;
                Pair<Integer, ChunkerBlockIdentifier> block = chunkerColumn.getHighestBlock(x, z, ChunkerBlockIdentifier::hasRGBColor);
                if (block != null) {
                    // Mark the chunk as present
                    present = true;

                    // Grab the color
                    int rgb = block.value().getRGBColor();

                    // Convert to ARGB
                    argb[(z << 4) | x] = rgb == 0 ? 0 : 0xFF000000 | rgb;

                    // Retain the height compactly; it is encoded into red/green when the PNG is written.
                    heights[(z << 4) | x] = (short) Math.max(Short.MIN_VALUE, Math.min(Short.MAX_VALUE, block.first()));
                }
            }
        }

        RegionCoordPair regionCoordPair = chunkerColumn.getPosition().getRegion();
        ConcurrentMap<ChunkCoordPair, int[]> regionRGBA = chunkRGBA.computeIfAbsent(regionCoordPair, (ignored) -> new ConcurrentHashMap<>());
        if (present) {
            // Add the RGB
            regionRGBA.put(chunkerColumn.getPosition(), argb);
            chunkHeights.computeIfAbsent(regionCoordPair, (ignored) -> new ConcurrentHashMap<>())
                    .put(chunkerColumn.getPosition(), heights);

            // Record the chunk being present in this region
            Set<ChunkCoordPair> chunks = worldData.regionToPresentChunks.computeIfAbsent(regionCoordPair, (ignored) -> Sets.newConcurrentHashSet());
            chunks.add(chunkerColumn.getPosition());
        }

        // Write every exposed block; truncating a region leaves random holes in the terrain.
        if (!present) return;
        VoxelData voxels = regionVoxels.computeIfAbsent(regionCoordPair, region -> {
            String name = worldData.dimension.getIdentifier().replace(":", "_");
            return new VoxelData(new File(outputFolder,
                    name + "." + region.regionX() + "." + region.regionZ() + ".blocks.tmp"));
        });
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        DataOutputStream records = new DataOutputStream(bytes);
        for (var chunk : chunkerColumn.getChunks().values()) {
            int baseY = chunk.getY() << 4;
            for (int y = 0; y < 16; y++) for (int z = 0; z < 16; z++) for (int x = 0; x < 16; x++) {
                ChunkerBlockIdentifier identifier = chunk.getPalette().get(x, y, z, ChunkerBlockIdentifier.AIR);
                if (!isRenderable(identifier)) continue;
                int worldY = baseY + y;
                boolean visible = x == 0 || x == 15 || z == 0 || z == 15 ||
                        !occludes(chunkerColumn.getBlock(x - 1, worldY, z)) ||
                        !occludes(chunkerColumn.getBlock(x + 1, worldY, z)) ||
                        !occludes(chunkerColumn.getBlock(x, worldY - 1, z)) ||
                        !occludes(chunkerColumn.getBlock(x, worldY + 1, z)) ||
                        !occludes(chunkerColumn.getBlock(x, worldY, z - 1)) ||
                        !occludes(chunkerColumn.getBlock(x, worldY, z + 1));
                if (!visible) continue;
                String blockName = modelNames.computeIfAbsent(identifier, block -> MODEL_IDENTIFIERS.from(block)
                        .map(Object::toString).orElseGet(() -> block.getType() instanceof ChunkerCustomBlockType custom
                                ? custom.getIdentifier() : "minecraft:" + ((Enum<?>) block.getType()).name().toLowerCase(Locale.ROOT)));
                voxels.add(records, ((chunkerColumn.getPosition().chunkX() & 31) << 4) | x, worldY,
                        ((chunkerColumn.getPosition().chunkZ() & 31) << 4) | z, previewColor(identifier), blockName);
            }
        }
        voxels.append(bytes);
    }

    private static boolean isRenderable(ChunkerBlockIdentifier block) {
        return !block.isAir() && block.getType() != ChunkerVanillaBlockType.BARRIER
                && block.getType() != ChunkerVanillaBlockType.CAVE_AIR
                && block.getType() != ChunkerVanillaBlockType.VOID_AIR
                && block.getType() != ChunkerVanillaBlockType.LIGHT
                && block.getType() != ChunkerVanillaBlockType.STRUCTURE_VOID;
    }

    private static boolean occludes(ChunkerBlockIdentifier block) {
        String name = block.getType().toString().toLowerCase(Locale.ROOT);
        return isRenderable(block) && block.getType().isAllFacesSolid()
                && !name.contains("glass") && !name.contains("leaves") && !name.contains("ice")
                && !name.contains("slime") && !name.contains("honey") && !name.contains("grate")
                && !name.contains("spawner") && !name.contains("mangrove_roots") && !name.contains("beacon");
    }

    private static int previewColor(ChunkerBlockIdentifier block) {
        return block.hasRGBColor() ? block.getRGBColor() : 0xC0D8E0;
    }

    @Override
    public void flushColumns() {
        // Calculate min & max for the world
        for (Set<ChunkCoordPair> regionChunks : worldData.regionToPresentChunks.values()) {
            for (ChunkCoordPair chunk : regionChunks) {
                if (chunk.chunkX() < worldData.minX) {
                    worldData.minX = chunk.chunkX();
                }

                if (chunk.chunkX() > worldData.maxX) {
                    worldData.maxX = chunk.chunkX();
                }

                if (chunk.chunkZ() < worldData.minZ) {
                    worldData.minZ = chunk.chunkZ();
                }

                if (chunk.chunkZ() > worldData.maxZ) {
                    worldData.maxZ = chunk.chunkZ();
                }
            }
        }

        // Ensure output is a directory
        outputFolder.mkdirs();

        // Create the images for each region and write them
        for (Map.Entry<RegionCoordPair, ConcurrentMap<ChunkCoordPair, int[]>> entry : chunkRGBA.entrySet()) {
            RegionCoordPair region = entry.getKey();

            BufferedImage image = new BufferedImage(512, 512, BufferedImage.TYPE_INT_ARGB);
            BufferedImage heightImage = new BufferedImage(512, 512, BufferedImage.TYPE_INT_ARGB);
            for (Map.Entry<ChunkCoordPair, int[]> chunk : entry.getValue().entrySet()) {
                // If the chunk isn't present, we don't need to write any data (as it should be transparent)
                if (chunk.getValue().length == 0) continue;

                // Copy pixels
                image.setRGB(
                        ((chunk.getKey().chunkX() & 31) << 4), // Place our chunk inside the region (512x512)
                        ((chunk.getKey().chunkZ() & 31) << 4),
                        16, // Each chunk is 16x16
                        16,
                        chunk.getValue(), // ARGB array
                        0, // Starts from the initial value
                        16 // Size of each Y
                );
                short[] chunkHeight = chunkHeights.get(region).get(chunk.getKey());
                int[] encodedHeight = new int[256];
                for (int i = 0; i < chunkHeight.length; i++) {
                    int height = chunkHeight[i] + 32768;
                    encodedHeight[i] = 0xFF000000 | ((height >> 8) << 16) | ((height & 0xFF) << 8);
                }
                heightImage.setRGB(
                        ((chunk.getKey().chunkX() & 31) << 4),
                        ((chunk.getKey().chunkZ() & 31) << 4),
                        16, 16,
                        encodedHeight,
                        0, 16
                );
            }

            String name = worldData.dimension.getIdentifier().replace(":", "_");
            // Write the region PNG
            File outputFile = new File(outputFolder, name + "." + region.regionX() + "." + region.regionZ() + ".png");
            try {
                ImageIO.write(image, "png", outputFile);
                ImageIO.write(heightImage, "png", new File(outputFolder,
                        name + "." + region.regionX() + "." + region.regionZ() + ".height.png"));
                VoxelData voxels = regionVoxels.get(region);
                if (voxels != null) voxels.write(new File(outputFolder,
                        name + "." + region.regionX() + "." + region.regionZ() + ".blocks.bin"));
            } catch (IOException e) {
                throw new RuntimeException(e);
            }
        }
    }

    private static class VoxelData {
        private final File records;
        private final Map<String, Integer> palette = new LinkedHashMap<>();
        private int count;

        VoxelData(File records) {
            this.records = records;
            try {
                Files.createDirectories(records.toPath().getParent());
                try (OutputStream ignored = new FileOutputStream(records)) {
                    // Truncate any previous preview without keeping a file handle open per region.
                }
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }

        synchronized void add(DataOutputStream output, int x, int y, int z, int rgb, String identifier) {
            try {
                output.writeShort(x);
                output.writeShort(y);
                output.writeShort(z);
                output.writeInt(rgb);
                output.writeShort(palette.computeIfAbsent(identifier, ignored -> palette.size()));
                count++;
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }

        synchronized void append(ByteArrayOutputStream bytes) {
            try (OutputStream target = new FileOutputStream(records, true)) {
                bytes.writeTo(target);
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }

        synchronized void write(File file) throws IOException {
            try (DataOutputStream target = new DataOutputStream(new BufferedOutputStream(new FileOutputStream(file)))) {
                target.writeInt(count);
                target.writeShort(palette.size());
                for (String identifier : palette.keySet()) {
                    byte[] identifierBytes = identifier.getBytes(StandardCharsets.UTF_8);
                    target.writeInt(identifierBytes.length);
                    target.write(identifierBytes);
                }
                Files.copy(records.toPath(), target);
            }
            Files.delete(records.toPath());
        }
    }
}
