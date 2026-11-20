import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { MAX_PART_IMAGE_BYTES, partFromImage, readPartImage } from '../src/bots/part-image.js';
import { encodePartFile } from '../src/bots/part-file.js';
import { crc32 } from '../src/bots/zip-archive.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import type { PixelCustomPart } from '../src/bots/avatar-appearance.js';
import { createTempRoot } from './helpers.js';

type Pixel = readonly [number, number, number, number];

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

function png(
  width: number,
  height: number,
  pixel: (x: number, y: number) => Pixel,
  options: { filter?: number; interlace?: boolean } = {},
): Buffer {
  const rows: Buffer[] = [];
  let previous = Buffer.alloc(width * 4);
  for (let y = 0; y < height; y++) {
    const line = Buffer.alloc(width * 4);
    for (let x = 0; x < width; x++) Buffer.from(pixel(x, y)).copy(line, x * 4);
    const filter = options.filter ?? 0;
    const encoded = Buffer.alloc(width * 4);
    for (let i = 0; i < line.length; i++)
      encoded[i] = filter === 2 ? (line[i]! - previous[i]!) & 255 : line[i]!;
    rows.push(Buffer.from([filter]), encoded);
    previous = line;
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[12] = options.interlace ? 1 : 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function palettePng(): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(32, 0);
  header.writeUInt32BE(16, 4);
  header[8] = 4;
  header[9] = 3;
  const rows: Buffer[] = [];
  for (let y = 0; y < 16; y++) {
    const line = Buffer.alloc(16);
    for (let x = 0; x < 32; x++) {
      const index = y < 4 ? 0 : x < 16 ? 1 : 2;
      line[x >> 1]! |= index << (x % 2 === 0 ? 4 : 0);
    }
    rows.push(Buffer.from([0]), line);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('PLTE', Buffer.from([0, 0, 0, 0xef, 0xb9, 0x3f, 0x5a, 0x7b, 0xe0])),
    chunk('tRNS', Buffer.from([0])),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const crownPixels = (x: number, y: number): Pixel =>
  y === 2 && x >= 10 && x <= 21
    ? [0xef, 0xb9, 0x3f, 255]
    : y === 3 && x >= 10 && x <= 21
      ? [0xe2, 0x56, 0x5f, 255]
      : [0, 0, 0, 0];

const agents: BotAgentAdapter = {
  async runOrchestrator() {},
  async runAssignment() {},
  requestAssignment() {
    throw new Error('Unexpected Assignment');
  },
  async close() {},
};

describe('plain PNG parts', () => {
  it('reads slot-sized images, whole-number scales, palettes and transparency', () => {
    const full = readPartImage(png(32, 32, crownPixels));
    expect(full).toMatchObject({ width: 32, height: 32, scale: 1, colors: 2 });
    expect(typeof full !== 'string' && full.slots).toContain('outfit');
    expect(typeof full !== 'string' && full.slots).not.toContain('headpiece');
    const scaled = readPartImage(
      png(128, 64, (x, y) => crownPixels(Math.floor(x / 4), Math.floor(y / 4)), { filter: 2 }),
    );
    expect(scaled).toMatchObject({ scale: 4, slots: ['headpiece'], colors: 2 });
    expect(typeof scaled !== 'string' && scaled.cells).toHaveLength(24);
    const palette = readPartImage(palettePng());
    expect(palette).toMatchObject({ slots: ['headpiece'], colors: 2 });
    expect(typeof palette !== 'string' && palette.cells).toHaveLength(32 * 12);
  });

  it('refuses wrong sizes, too many colors, empty and unsupported images', () => {
    expect(readPartImage(png(30, 30, crownPixels))).toBe('wrong-size');
    expect(readPartImage(png(32, 20, crownPixels))).toBe('wrong-size');
    expect(readPartImage(png(32, 32, () => [0, 0, 0, 0]))).toBe('empty');
    expect(readPartImage(png(32, 32, (x, y) => [x * 8, y * 8, (x + y) % 2 ? 255 : 0, 255]))).toBe(
      'too-many-colors',
    );
    expect(readPartImage(png(32, 32, crownPixels, { interlace: true }))).toBe('unsupported');
    expect(readPartImage(Buffer.from('nope'))).toBe('not-png');
    expect(readPartImage(Buffer.alloc(MAX_PART_IMAGE_BYTES + 1))).toBe('too-large');
  });

  it('reduces the palette by nearest color without dithering, separately from remapping', () => {
    const image = readPartImage(
      png(32, 32, (x, y) => (y < 8 ? [x * 4, 100 + (x % 2), 50, 255] : [0, 0, 0, 0])),
    );
    if (typeof image === 'string') throw new Error(image);
    expect(image.colors).toBe(32);
    const part = partFromImage(image, 'outfit', 4);
    if (typeof part === 'string') throw new Error(part);
    const used = new Set(part.front.map(([, , color]) => color));
    expect(used.size).toBeLessThanOrEqual(4);
    expect(part.front.every(([, , color, tone]) => color.startsWith('#') && tone === 0)).toBe(true);
    expect(part.front).toHaveLength(32 * 8);
    expect(partFromImage(image, 'headpiece', 4)).toBe('wrong-size');
    expect(partFromImage(image, 'outfit', 33)).toBe('too-many-colors');
    const exact = partFromImage(image, 'outfit', 32);
    expect(typeof exact !== 'string' && new Set(exact.front.map(([, , c]) => c)).size).toBe(32);
  });
});

describe('plain PNG import and derived parts through the public Host bridge', () => {
  it('shows the color count first, imports as fixed colors and records derived parents', async () => {
    const core = createCore({ dshHome: createTempRoot('bh-part-image-'), agents });
    try {
      const bridge = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core });
      const data = png(32, 16, crownPixels).toString('base64');
      const inspected = bridge.partLibraryImport({ data });
      expect(inspected).toMatchObject({
        ok: true,
        value: { added: [], image: { width: 32, height: 16, colors: 2, slots: ['headpiece'] } },
      });
      const wrong = bridge.partLibraryImport({ data: png(31, 16, crownPixels).toString('base64') });
      expect(wrong).toMatchObject({ ok: false });
      expect(bridge.partLibraryImportImage({ data, slot: 'bangs', colors: 2 }).ok).toBe(false);
      const imported = bridge.partLibraryImportImage({
        data,
        slot: 'headpiece',
        colors: 1,
        name: 'Band',
      });
      if (!imported.ok) throw new Error('import failed');
      expect(imported.value.entry.origins).toEqual(['imported-image']);
      expect(new Set(imported.value.entry.part.front.map(([, , c]) => c)).size).toBe(1);

      const theirs: PixelCustomPart = {
        slot: 'headpiece',
        front: [[9, 1, '#f4f1ec', 0]],
        back: [],
      };
      const file = encodePartFile({ part: theirs, name: 'Wings', author: 'Mika' });
      const shared = bridge.partLibraryImport({ data: file.toString('base64') });
      if (!shared.ok) throw new Error('import failed');
      const parent = shared.value.added[0]!;
      const derived = bridge.partLibraryAdd({
        part: { ...theirs, front: [...theirs.front, [22, 1, '#f4f1ec', 0]] },
        name: 'Wider wings',
        parent: parent.id,
      });
      expect(derived).toMatchObject({
        ok: true,
        value: { entry: { parent: parent.id, parentAuthor: 'Mika', origins: ['derived'] } },
      });
      const listed = bridge.partLibraryList();
      const original = listed.ok ? listed.value.parts.find((p) => p.id === parent.id) : undefined;
      expect(original).toMatchObject({ part: theirs, author: 'Mika', origins: ['imported-file'] });
      const own = bridge.partLibraryAdd({ part: theirs, name: '' });
      expect(own.ok && own.value.entry.origins).toEqual(['imported-file', 'drawn']);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
