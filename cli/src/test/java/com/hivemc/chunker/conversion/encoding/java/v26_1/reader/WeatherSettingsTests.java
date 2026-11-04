package com.hivemc.chunker.conversion.encoding.java.v26_1.reader;

import com.hivemc.chunker.conversion.WorldConverter;
import com.hivemc.chunker.conversion.encoding.base.Version;
import com.hivemc.chunker.nbt.tags.collection.CompoundTag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

class WeatherSettingsTests {
    @Test
    void readsCompactAndIntegerWeatherTimers(@TempDir Path directory) throws Exception {
        LevelReader reader = new LevelReader(directory.toFile(), new Version(26, 1, 0), new WorldConverter(UUID.randomUUID()));
        CompoundTag weather = new CompoundTag();
        weather.put("clear_weather_time", (byte) 0);
        weather.put("rain_time", (short) 120);
        weather.put("thunder_time", 123456);
        CompoundTag level = new CompoundTag();
        level.put("weather_data", weather);
        CompoundTag prepared = reader.prepareNBTForLevelSettings(level);
        assertEquals(0, prepared.getInt("clearWeatherTime"));
        assertEquals(120, prepared.getInt("rainTime"));
        assertEquals(123456, prepared.getInt("thunderTime"));
        assertEquals((byte) 0, level.getCompound("weather_data").getByte("clear_weather_time"));
    }
}
