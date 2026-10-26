import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createAttachmentStore } from '../src/attachments/store.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createChannelStore } from '../src/channels/store.js';
import { mountOperationalDatabase, type OperationalDatabaseOwner } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createModelPresetStore } from '../src/models/presets.js';
import { defaultPromptText } from '../src/prompts/prompt-parts.js';
import { createPromptPresetLibrary } from '../src/prompts/prompt-presets.js';
import { createPromptSettings } from '../src/prompts/prompt-settings.js';
import { createBotStateTracker } from '../src/state/bot-state.js';
import { createTempRoot, createTestOwnership } from './helpers.js';
import { createTestRegistry } from './registry-fixture.js';
import { createTestRosterStore } from './roster-fixture.js';

const owners: OperationalDatabaseOwner[] = [];

afterEach(() => {
  for (const owner of owners.splice(0)) owner.close();
});

function setup() {
  const root = createTempRoot('botharness-prompt-methods-');
  const database = mountOperationalDatabase({ dshHome: root, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  owners.push(database);
  const registry = createTestRegistry({ rootDir: root, database });
  const ownership = createTestOwnership();
  const attachments = createAttachmentStore({ rootDir: join(root, 'attachments') });
  const prompts = createPromptSettings({
    library: createPromptPresetLibrary(join(root, 'prompt-presets')),
    registry,
    ownership,
  });
  registry.create({ slug: 'ada', displayName: 'Ada' });
  const methods = createBridgeMethods({
    registry,
    modelPresets: createModelPresetStore({ rootDir: root, database }),
    states: createBotStateTracker(),
    channels: createChannelStore({ rootDir: join(root, 'channels'), attachments }),
    attachments,
    ownership,
    roster: createTestRosterStore(),
    prompts,
  });
  return { methods, registry };
}

function value<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

describe('Prompt Preset bridge methods', () => {
  it('lists the editable parts with their defaults', () => {
    const { methods } = setup();
    const { parts } = value(methods.promptParts({}));
    expect(parts.find((part) => part.id === 'triage')).toMatchObject({
      kind: 'turn',
      defaultText: defaultPromptText('triage'),
    });
  });

  it('layers a global preset, a Bot preset and Bot overrides, and clears a deleted preset', () => {
    const { methods, registry } = setup();
    const global = value(
      methods.promptPresetCreate({ name: 'Team', parts: { attention: 'Team attention.' } }),
    ).preset;
    const quiet = value(
      methods.promptPresetCreate({ name: 'Quiet', parts: { triage: 'Close it.' } }),
    ).preset;
    expect(methods.promptPresetCreate({ name: 'Bad', parts: { nope: 'x' } })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    value(methods.promptGlobalSet({ presetId: global.id }));
    value(methods.botPromptSet({ slug: 'ada', presetId: quiet.id, parts: { silence: 'Mine.' } }));

    const view = value(methods.botPrompt({ slug: 'ada' }));
    const sources = Object.fromEntries(view.parts.map((part) => [part.id, part.source]));
    expect(view).toMatchObject({ presetId: quiet.id, globalPresetId: global.id, pending: false });
    expect(sources).toMatchObject({
      attention: 'global',
      triage: 'preset',
      silence: 'bot',
      coordination: 'built-in',
    });

    expect(
      methods.promptPresetUpdate({ id: quiet.id, name: 'Calm', expectedRevision: 9 }),
    ).toMatchObject({
      ok: false,
      error: { code: 'prompt-preset-stale-revision' },
    });
    expect(value(methods.promptPresetDelete({ id: quiet.id }))).toEqual({
      id: quiet.id,
      clearedBots: ['ada'],
    });
    expect(registry.get('ada')?.promptPreset).toBeUndefined();
    value(methods.botPromptSet({ slug: 'ada', parts: { silence: null } }));
    expect(registry.get('ada')?.promptOverrides).toBeUndefined();
    expect(methods.botPromptSet({ slug: 'ada', presetId: 'missing' })).toMatchObject({
      ok: false,
      error: { code: 'prompt-preset-not-found' },
    });
  });
});
