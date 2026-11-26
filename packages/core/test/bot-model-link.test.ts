import { describe, expect, it } from 'vitest';

import { attachOperationalModule } from '../src/database/owner.js';
import {
  linkFromCopiedPlan,
  resolveLinkedPlan,
  type BotModelLink,
} from '../src/models/bot-model-link.js';
import {
  ownsModelSlot,
  presetEngineFor,
  repeatsPresetEngine,
} from '../src/models/bot-model-engines.js';
import {
  createModelPresetStore,
  DEFAULT_MODEL_PRESET_ID,
  defaultPresetPlan,
  type ModelPreset,
} from '../src/models/presets.js';
import { createTempRoot } from './helpers.js';
import { createTestRegistry, registryDatabase } from './registry-fixture.js';

const pro = { provider: 'opencode-go', model: 'deepseek-v4-pro', reasoningEffort: 'high' };
const flash = { provider: 'opencode-go', model: 'deepseek-v4-flash' };
const kimi = { provider: 'opencode-go', model: 'kimi-k3' };
const flashChoice = {
  kind: 'model' as const,
  provider: flash.provider,
  model: flash.model,
  allowedEfforts: [''],
  defaultEffort: '',
};
const flashDefault = { kind: 'model' as const, provider: flash.provider, model: flash.model };

function setup() {
  const rootDir = createTempRoot('botharness-model-link-');
  const database = registryDatabase(rootDir);
  const presets = createModelPresetStore({ rootDir, database });
  presets.migrateDefault({ main: pro });
  const registry = createTestRegistry({ rootDir, database });
  expect(registry.create({ slug: 'tob', displayName: 'Tob' }).ok).toBe(true);
  return { rootDir, database, presets, registry };
}

function preset(id: string, orchestrator = pro): ModelPreset {
  return {
    id,
    name: id,
    revision: 1,
    createdAt: '2026-11-26T00:00:00.000Z',
    orchestrator,
    assignmentDefault: flash,
    sub: { choices: [flashChoice], default: flashDefault },
  };
}

describe('resolveLinkedPlan', () => {
  const link: BotModelLink = { presetId: 'work', linkedAt: '2026-11-26T01:00:00.000Z' };

  it('takes every slot from the preset when the Bot sets none', () => {
    const plan = resolveLinkedPlan(preset('work'), link, 4);
    expect(plan).toMatchObject({
      revision: 4,
      sourcePresetId: 'work',
      orchestrator: pro,
      assignmentDefault: flash,
      appliedAt: link.linkedAt,
    });
    expect(plan.overrides).toBeUndefined();
  });

  it('lays a main override over the preset and keeps the preset sub', () => {
    const plan = resolveLinkedPlan(preset('work'), { ...link, main: { orchestrator: kimi } }, 1);
    expect(plan.orchestrator).toEqual(kimi);
    expect(plan.assignmentDefault).toEqual(flash);
    expect(plan.overrides).toEqual(['main']);
  });

  it('keeps a sub that follows the preset main when the Bot changes only main', () => {
    const follows: ModelPreset = {
      ...preset('work'),
      assignmentDefault: pro,
      assignmentFollowsMain: true,
      sub: { choices: [], default: null },
    };
    const plan = resolveLinkedPlan(follows, { ...link, main: { orchestrator: kimi } }, 1);
    expect(plan.orchestrator).toEqual(kimi);
    expect(plan.assignmentDefault).toEqual(pro);
  });
});

describe('linkFromCopiedPlan', () => {
  it('follows the preset when the copy still matches it', () => {
    const copy = { ...defaultPresetPlan(preset('work')), revision: 3, appliedAt: 'then' };
    expect(linkFromCopiedPlan(copy, preset('work'), 'now')).toEqual({
      presetId: 'work',
      linkedAt: 'then',
    });
  });

  it('keeps a changed slot as the Bot override and follows the other', () => {
    const copy = { ...defaultPresetPlan(preset('work')), orchestrator: kimi, revision: 3 };
    const link = linkFromCopiedPlan(copy, preset('work'), 'now');
    expect(link.main).toEqual({ orchestrator: kimi });
    expect(link.sub).toBeUndefined();
  });
});

describe('Bot model link in the registry', () => {
  it('follows later changes to the linked preset live', () => {
    const { presets, registry } = setup();
    const work = presets.create({ name: 'Work', orchestrator: pro, assignmentDefault: flash });
    registry.applyModelPreset('tob', work);
    expect(registry.get('tob')?.modelPlan?.orchestrator).toEqual(pro);

    presets.update(work.id, {
      name: 'Work',
      orchestrator: kimi,
      assignmentDefault: flash,
      expectedRevision: work.revision,
    });
    const plan = registry.get('tob')?.modelPlan;
    expect(plan?.orchestrator).toEqual(kimi);
    expect(plan?.sourcePresetId).toBe(work.id);
    expect(registry.list()[0]?.modelPlan?.orchestrator).toEqual(kimi);
  });

  it('keeps a Bot main override across preset changes until it is reset', () => {
    const { presets, registry } = setup();
    const work = presets.create({ name: 'Work', orchestrator: pro, assignmentDefault: flash });
    registry.applyModelPreset('tob', work);
    const revision = registry.get('tob')!.modelPlan!.revision;
    expect(registry.customizeModelPlan('tob', kimi, revision).ok).toBe(true);
    const edited = presets.update(work.id, {
      name: 'Work',
      orchestrator: flash,
      assignmentDefault: pro,
      expectedRevision: work.revision,
    })!;
    let plan = registry.get('tob')!.modelPlan!;
    expect(plan.orchestrator).toEqual(kimi);
    expect(plan.assignmentDefault).toEqual(pro);
    expect(plan.overrides).toEqual(['main']);
    expect(plan.sourcePresetId).toBe(edited.id);

    expect(registry.resetModelSlots('tob', ['main'], plan.revision).ok).toBe(true);
    plan = registry.get('tob')!.modelPlan!;
    expect(plan.orchestrator).toEqual(flash);
    expect(plan.overrides).toBeUndefined();
  });

  it('keeps overrides when switching presets only on request', () => {
    const { presets, registry } = setup();
    const work = presets.create({ name: 'Work', orchestrator: pro, assignmentDefault: flash });
    const cheap = presets.create({ name: 'Cheap', orchestrator: flash, assignmentDefault: flash });
    registry.applyModelPreset('tob', work);
    registry.customizeModelPlan('tob', kimi, registry.get('tob')!.modelPlan!.revision);
    registry.applyModelPreset('tob', cheap, { keepOverrides: true });
    expect(registry.get('tob')?.modelPlan).toMatchObject({
      sourcePresetId: cheap.id,
      orchestrator: kimi,
      overrides: ['main'],
    });
    registry.applyModelPreset('tob', cheap);
    expect(registry.get('tob')?.modelPlan?.orchestrator).toEqual(flash);
  });

  it('stores only the link, not a copied plan', () => {
    const { database, presets, registry } = setup();
    const work = presets.create({ name: 'Work', orchestrator: pro, assignmentDefault: flash });
    registry.applyModelPreset('tob', work);
    const body = attachOperationalModule(database, 'bot-registry').read(
      (db) => db.prepare('SELECT body FROM persona_bots WHERE slug = ?').get('tob')!['body'],
    );
    const stored = JSON.parse(String(body));
    expect(stored.modelPlan).toBeUndefined();
    expect(stored.modelLink).toMatchObject({ presetId: work.id });
  });

  it('saves a Bot sub list with a Routing Group that has no effort options', () => {
    const { presets, registry } = setup();
    const work = presets.create({ name: 'Work', orchestrator: pro, assignmentDefault: flash });
    registry.applyModelPreset('tob', work);
    const group = { kind: 'group' as const, group: 'daily' };
    const result = registry.setModelPlanSub(
      'tob',
      { choices: [flashChoice, group], default: flashDefault },
      registry.get('tob')!.modelPlan!.revision,
    );
    expect(result.ok).toBe(true);
    const plan = registry.get('tob')!.modelPlan!;
    expect(plan.overrides).toEqual(['sub']);
    expect(plan.assignmentGroups).toEqual(['daily']);
    expect(plan).not.toHaveProperty('assignmentGroupOptions');
  });

  it('falls back to the Default preset when the linked preset is deleted', () => {
    const { presets, registry } = setup();
    const work = presets.create({ name: 'Work', orchestrator: kimi, assignmentDefault: flash });
    registry.applyModelPreset('tob', work);
    presets.delete(work.id, work.revision);
    expect(registry.get('tob')?.modelPlan).toMatchObject({
      sourcePresetId: DEFAULT_MODEL_PRESET_ID,
      orchestrator: pro,
    });
  });

  it('returns to the Default preset with no stored model on inherit', () => {
    const { presets, registry } = setup();
    const work = presets.create({ name: 'Work', orchestrator: kimi, assignmentDefault: flash });
    registry.applyModelPreset('tob', work);
    expect(registry.inheritModel('tob', registry.get('tob')!.modelPlan!.revision).ok).toBe(true);
    const bot = registry.get('tob')!;
    expect(bot.modelPlan).toBeUndefined();
    expect(bot.modelLink).toBeUndefined();
  });

  it('migrates copied plans: matching copies follow, changed slots stay as overrides', () => {
    const { database, presets, registry } = setup();
    expect(registry.create({ slug: 'coder', displayName: 'Coder' }).ok).toBe(true);
    const work = presets.create({ name: 'Work', orchestrator: pro, assignmentDefault: flash });
    const copy = { ...defaultPresetPlan(work), revision: 5, appliedAt: 'then' };
    const legacy = {
      tob: copy,
      coder: { ...copy, orchestrator: kimi, sourcePresetId: '', sourcePresetName: '' },
    };
    attachOperationalModule(database, 'bot-registry').transaction(
      (db) => {
        for (const [slug, plan] of Object.entries(legacy))
          db.prepare(
            "UPDATE persona_bots SET body = json_set(body, '$.modelPlan', json(?)) WHERE slug = ?",
          ).run(JSON.stringify(plan), slug);
      },
      ['bot-registry'],
    );

    expect(registry.migrateModelLinks({ dryRun: true })).toEqual([
      { slug: 'coder', presetId: DEFAULT_MODEL_PRESET_ID, overrides: ['main', 'sub'] },
      { slug: 'tob', presetId: work.id, overrides: [] },
    ]);
    expect(registry.get('tob')?.modelLink).toBeUndefined();

    registry.migrateModelLinks();
    expect(registry.get('tob')?.modelLink).toEqual({ presetId: work.id, linkedAt: 'then' });
    expect(registry.get('tob')?.modelPlan?.revision).toBe(5);
    expect(registry.get('coder')?.modelLink?.main).toEqual({ orchestrator: kimi });
    expect(registry.migrateModelLinks()).toEqual([]);

    presets.update(work.id, {
      name: 'Work',
      orchestrator: flash,
      assignmentDefault: flash,
      expectedRevision: work.revision,
    });
    expect(registry.get('tob')?.modelPlan?.orchestrator).toEqual(flash);
  });
});

describe('Subscription Engine follow', () => {
  const engine = { engine: 'claude' as const, accountId: 'claude-personal' };
  const withEngine = (id: string): ModelPreset => ({ ...preset(id), orchestratorEngine: engine });
  const presets = (id: string) => (id === 'work' ? withEngine('work') : preset(id));

  it('gives a following Bot the engine of its linked preset', () => {
    const bot = { modelLink: { presetId: 'work', linkedAt: 'now' } };
    expect(presetEngineFor(bot, 'orchestrator', presets)).toEqual(engine);
    expect(presetEngineFor({}, 'orchestrator', presets)).toBeUndefined();
  });

  it('gives no preset engine to a slot the Bot overrides', () => {
    const bot = { modelLink: { presetId: 'work', linkedAt: 'now', main: { orchestrator: kimi } } };
    expect(ownsModelSlot(bot, 'main')).toBe(true);
    expect(presetEngineFor(bot, 'orchestrator', presets)).toBeUndefined();
  });

  it('recognises a copied engine selection that only repeats the preset', () => {
    expect(
      repeatsPresetEngine({ engine: 'claude', choice: { accountId: 'claude-personal' } }, engine),
    ).toBe(true);
    expect(repeatsPresetEngine({ engine: 'codex', choice: {} }, engine)).toBe(false);
    expect(repeatsPresetEngine({ engine: null, choice: {} }, undefined)).toBe(true);
  });
});
