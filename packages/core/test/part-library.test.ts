import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { describe, expect, it } from 'vitest';
import { OperationalDatabaseError, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { createCore } from '../src/plugin.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import {
  DEFAULT_ILLUSTRATED_RECIPE,
  customPartId,
  withAvatarHeadpiece,
  withAvatarSpecies,
  type PixelCustomPart,
} from '../src/bots/avatar-appearance.js';
import { readSharedPresentation } from '../src/bots/shared-presentation.js';
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
    [18, 2, '#efb93f', 1],
    [13, 3, 'hairColor', 0],
    [18, 3, 'hairColor', 0],
  ],
  back: [],
};

async function withCore(
  dshHome: string,
  test: (core: ReturnType<typeof createCore>) => Promise<void> | void,
): Promise<void> {
  const core = createCore({ dshHome, agents });
  try {
    await test(core);
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
}

describe('Part Library through the public Host bridge', () => {
  it('adds drawn parts once by content and keeps them across restarts', async () => {
    const dshHome = createTempRoot('bh-part-library-');
    await withCore(dshHome, (core) => {
      const bridge = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core });
      expect(bridge.partLibraryList()).toEqual({ ok: true, value: { parts: [] } });
      const added = bridge.partLibraryAdd({ part: crown, name: '  Little crown  ' });
      expect(added).toMatchObject({
        ok: true,
        value: {
          entry: { id: customPartId(crown), name: 'Little crown', origins: ['drawn'] },
        },
      });
      const reordered = { ...crown, front: [...crown.front].reverse() };
      const again = bridge.partLibraryAdd({ part: reordered, name: 'Copy' });
      expect(again.ok && again.value.entry.name).toBe('Little crown');
      const parts = bridge.partLibraryList();
      expect(parts.ok && parts.value.parts).toHaveLength(1);
    });
    await withCore(dshHome, (core) => {
      const bridge = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core });
      const parts = bridge.partLibraryList();
      expect(parts.ok && parts.value.parts.map((entry) => entry.id)).toEqual([customPartId(crown)]);
    });
  });

  it('reports unavailable storage as a structured result', async () => {
    await withCore(createTempRoot('bh-part-library-storage-'), (core) => {
      const failing = {
        get: () => undefined,
        list: () => {
          throw new OperationalDatabaseError('closed', 'closed');
        },
        add: () => {
          throw new OperationalDatabaseError('closed', 'closed');
        },
      };
      const bridge = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core, partLibrary: failing });
      expect(bridge.partLibraryList()).toMatchObject({
        ok: false,
        error: { code: 'storage-unavailable' },
      });
      expect(bridge.partLibraryAdd({ part: crown, name: '' })).toMatchObject({
        ok: false,
        error: { code: 'storage-unavailable' },
      });
    });
  });

  it('rejects invalid parts, names and parents', async () => {
    await withCore(createTempRoot('bh-part-library-invalid-'), (core) => {
      const bridge = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core });
      expect(bridge.partLibraryAdd({ part: { ...crown, slot: 'mouth' }, name: '' }).ok).toBe(false);
      expect(
        bridge.partLibraryAdd({ part: { ...crown, front: [[40, 0, 'hairColor', 0]] }, name: '' })
          .ok,
      ).toBe(false);
      expect(bridge.partLibraryAdd({ part: crown, name: 'x'.repeat(61) }).ok).toBe(false);
      expect(bridge.partLibraryAdd({ part: crown, name: '', parent: 'abc' }).ok).toBe(false);
      const parts = bridge.partLibraryList();
      expect(parts.ok && parts.value.parts).toEqual([]);
    });
  });

  it('records an edit as a new part and never changes an applied copy', async () => {
    await withCore(createTempRoot('bh-part-library-apply-'), (core) => {
      const bridge = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core });
      expect(core.registry.create({ slug: 'ada', displayName: 'Ada', workspaces: [] }).ok).toBe(
        true,
      );
      const original = bridge.partLibraryAdd({ part: crown, name: 'Crown' });
      if (!original.ok) throw new Error('add failed');
      const recipe = withAvatarHeadpiece(
        withAvatarSpecies(DEFAULT_ILLUSTRATED_RECIPE, 'human'),
        original.value.entry.part,
      );
      const applied = core.registry.setAppearance('ada', recipe);
      expect(applied.ok).toBe(true);
      const edited: PixelCustomPart = { ...crown, back: [[15, 6, 'skinColor', -1]] };
      const derived = bridge.partLibraryAdd({
        part: edited,
        name: 'Crown with band',
        parent: original.value.entry.id,
      });
      expect(derived).toMatchObject({
        ok: true,
        value: { entry: { id: customPartId(edited), parent: customPartId(crown) } },
      });
      const parts = bridge.partLibraryList();
      expect(parts.ok && parts.value.parts.map((entry) => entry.name)).toEqual([
        'Crown with band',
        'Crown',
      ]);
      const stored = core.registry.get('ada')?.appearance;
      expect(stored && 'recipe' in stored && stored.recipe).toMatchObject({
        assetVersion: 3,
        headpiece: { front: original.value.entry.part.front, back: [] },
      });
      const memoryDir = core.registry.memoryDirFor('ada')!;
      expect(readSharedPresentation(memoryDir)?.appearance?.recipe).toMatchObject({
        assetVersion: 3,
        headpiece: original.value.entry.part,
      });
    });
  });
});

it('upgrades generation 72 with an empty Part Library', () => {
  const dshHome = createTempRoot('bh-part-library-upgrade-');
  const prior = mountOperationalDatabase({
    dshHome,
    schemaPlan: defineSchemaPlan(
      BOT_HARNESS_SCHEMA_PLAN.migrations.filter((m) => m.generation <= 72),
    ),
  });
  expect(prior.generation).toBe(72);
  prior.close();
  const upgraded = mountOperationalDatabase({ dshHome, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  try {
    expect(upgraded.mode).toBe('ready');
    expect(upgraded.generation).toBe(BOT_HARNESS_SCHEMA_PLAN.targetGeneration);
  } finally {
    upgraded.close();
  }
});
