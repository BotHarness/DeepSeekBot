import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { describe, expect, it } from 'vitest';
import {
  MAX_PART_FILE_BYTES,
  decodePartFile,
  decodePartFiles,
  encodePartFile,
  encodePartLibrary,
} from '../src/bots/part-file.js';
import {
  DEFAULT_ILLUSTRATED_RECIPE,
  customPartId,
  withAvatarCustomPart,
  withAvatarSpecies,
  type PixelCustomPart,
} from '../src/bots/avatar-appearance.js';
import { exportBotZip, readBotZip } from '../src/bots/bot-zip.js';
import { writeZip } from '../src/bots/zip-archive.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

const agents: BotAgentAdapter = {
  async runOrchestrator() {},
  async runAssignment() {},
  requestAssignment() {
    throw new Error('Unexpected Assignment');
  },
  async close() {},
};

const crown: PixelCustomPart = {
  slot: 'headpiece',
  front: [
    [13, 2, '#efb93f', 1],
    [14, 3, 'hairColor', -1],
  ],
  back: [[15, 6, 'skinColor', 2]],
};
const fringe: PixelCustomPart = {
  slot: 'bangs',
  front: [
    [12, 5, 'hairColor', 0],
    [13, 5, 'hairColor', 0],
  ],
  back: [],
};

async function withCore(test: (core: ReturnType<typeof createCore>) => Promise<void> | void) {
  const core = createCore({ dshHome: createTempRoot('bh-part-file-'), agents });
  try {
    await test(core);
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
}

describe('Custom Part files', () => {
  it('round-trips a part, its name and author through a PNG that previews anywhere', () => {
    const png = encodePartFile({ part: crown, name: 'Crown', author: 'Ada' });
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(32 * 8);
    expect(png.readUInt32BE(20)).toBe(16 * 8);
    const file = decodePartFile(png);
    expect(file).toEqual({
      part: { ...crown, front: [...crown.front] },
      name: 'Crown',
      author: 'Ada',
    });
    expect(typeof file !== 'string' && customPartId(file.part)).toBe(customPartId(crown));
  });

  it('refuses malformed, unrelated, tampered and oversized files', () => {
    const png = encodePartFile({ part: crown, name: 'Crown' });
    expect(decodePartFile(Buffer.from('not a png'))).toBe('not-png');
    const plain = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    );
    expect(decodePartFile(plain)).toBe('no-part-data');
    const tampered = Buffer.from(png);
    tampered[tampered.length - 20] = tampered[tampered.length - 20]! ^ 0xff;
    expect(decodePartFile(tampered)).toBe('not-png');
    const invalid = encodePartFile({
      part: { ...crown, front: [[40, 0, 'hairColor', 0]] } as unknown as PixelCustomPart,
      name: 'Bad',
    });
    expect(decodePartFile(invalid)).toBe('invalid-part');
    expect(decodePartFile(Buffer.alloc(MAX_PART_FILE_BYTES + 1))).toBe('too-large');
  });

  it('round-trips the library as a zip and reports files it cannot read', () => {
    const zip = encodePartLibrary([
      { part: crown, name: 'Crown' },
      { part: fringe, name: '' },
    ]);
    const decoded = decodePartFiles(zip);
    expect(typeof decoded !== 'string' && decoded.files.map((f) => customPartId(f.part))).toEqual([
      customPartId(crown),
      customPartId(fringe),
    ]);
    const mixed = writeZip([
      { path: 'ok.png', data: encodePartFile({ part: crown, name: 'Crown' }) },
      { path: 'plain.png', data: Buffer.from('nope') },
      { path: 'readme.txt', data: Buffer.from('ignored') },
    ]);
    const result = decodePartFiles(mixed);
    expect(result).toMatchObject({ refused: [{ name: 'plain.png', reason: 'not-png' }] });
    expect(typeof result !== 'string' && result.files).toHaveLength(1);
  });
});

describe('Part Library sharing through the public Host bridge', () => {
  it('exports single parts and the library, and imports them back merged by content', async () => {
    await withCore((core) => {
      const bridge = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core });
      const added = bridge.partLibraryAdd({ part: crown, name: 'Crown' });
      if (!added.ok) throw new Error('add failed');
      const single = bridge.partLibraryExport({ id: added.value.entry.id });
      expect(single).toMatchObject({
        ok: true,
        value: { fileName: expect.stringMatching(/^crown-[\da-f]{8}\.png$/u) },
      });
      const all = bridge.partLibraryExport({});
      if (!single.ok || !all.ok) throw new Error('export failed');
      expect(all.value.fileName).toBe('part-library.zip');
      const again = bridge.partLibraryImport({ data: single.value.data });
      expect(again).toMatchObject({ ok: true, value: { added: [{ id: added.value.entry.id }] } });
      const listed = bridge.partLibraryList();
      expect(listed.ok && listed.value.parts).toHaveLength(1);
      expect(listed.ok && listed.value.parts[0]!.origins).toEqual(['drawn', 'imported-file']);
      expect(bridge.partLibraryImport({ data: Buffer.from('nope').toString('base64') }).ok).toBe(
        false,
      );
      expect(bridge.partLibraryExport({ id: 'missing' }).ok).toBe(false);
      const unsaved = bridge.partLibraryExport({ part: fringe });
      expect(unsaved).toMatchObject({
        ok: true,
        value: { fileName: expect.stringMatching(/^part-/u) },
      });
      const decoded = unsaved.ok ? decodePartFile(Buffer.from(unsaved.value.data, 'base64')) : '';
      expect(typeof decoded !== 'string' && customPartId(decoded.part)).toBe(customPartId(fringe));
      expect(bridge.partLibraryExport({ part: { slot: 'bangs' } }).ok).toBe(false);
    });
  });

  it('carries worn parts through Bot export and import into the importer’s library', async () => {
    await withCore(async (core) => {
      const bridge = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core });
      expect(core.registry.create({ slug: 'ada', displayName: 'Ada', workspaces: [] }).ok).toBe(
        true,
      );
      const recipe = withAvatarCustomPart(
        withAvatarCustomPart(
          withAvatarSpecies(DEFAULT_ILLUSTRATED_RECIPE, 'human'),
          'headpiece',
          crown,
        ),
        'bangs',
        fringe,
      );
      const set = core.registry.setAppearance('ada', recipe);
      expect(set.ok).toBe(true);
      const contents = readBotZip(exportBotZip(core.registry.memoryDirFor('ada')!));
      const imported = await core.registry.createFromFiles({
        slug: 'ada-copy',
        displayName: 'Ada copy',
        files: contents.files,
      });
      expect(imported.ok).toBe(true);
      const copy = core.registry.get('ada-copy')?.appearance;
      expect(copy && 'recipe' in copy && copy.recipe).toMatchObject({
        assetVersion: 3,
        headpiece: { slot: 'headpiece' },
        bangsPart: { slot: 'bangs' },
      });
      const original = core.registry.get('ada')?.appearance;
      expect(copy && 'revision' in copy && copy.revision).toBe(
        original && 'revision' in original && original.revision,
      );
      const listed = bridge.partLibraryList();
      expect(listed.ok && listed.value.parts.map((entry) => entry.origins)).toEqual([
        ['imported-bot'],
        ['imported-bot'],
      ]);
      expect(listed.ok && listed.value.parts.every((entry) => entry.author === 'Ada copy')).toBe(
        true,
      );
    });
  });
});
