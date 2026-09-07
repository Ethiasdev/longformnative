import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const fixtureDirectory = join(process.cwd(), "e2e", "fixtures");
await mkdir(fixtureDirectory, { recursive: true });

function crc32(value) {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type);
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  name.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return output;
}

const width = 16;
const height = 16;
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
ihdr.set([8, 6, 0, 0, 0], 8);
const scanlines = Buffer.alloc(height * (1 + width * 4));
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const offset = y * (1 + width * 4) + 1 + x * 4;
    scanlines.set([80 + x * 5, 40 + y * 6, 180, 255], offset);
  }
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  pngChunk("IHDR", ihdr),
  pngChunk("IDAT", deflateSync(scanlines)),
  pngChunk("IEND", Buffer.alloc(0)),
]);
await writeFile(join(fixtureDirectory, "background.png"), png);

const sampleRate = 44_100;
const seconds = 1;
const samples = sampleRate * seconds;
const pcm = Buffer.alloc(samples * 2);
for (let index = 0; index < samples; index += 1) {
  const fade = Math.min(1, index / 1000, (samples - index) / 1000);
  pcm.writeInt16LE(Math.round(Math.sin((index / sampleRate) * 440 * Math.PI * 2) * 5000 * fade), index * 2);
}
const wav = Buffer.alloc(44 + pcm.length);
wav.write("RIFF", 0);
wav.writeUInt32LE(36 + pcm.length, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(pcm.length, 40);
pcm.copy(wav, 44);
await writeFile(join(fixtureDirectory, "narration.wav"), wav);

console.log(`Generated original test fixtures in ${fixtureDirectory}`);
