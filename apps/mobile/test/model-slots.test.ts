import { describe, expect, it } from 'vitest';
import type { ModelPreset } from '@botharness/host-client/model-plans';
import type { ModelSettingsState } from '@botharness/host-client/model-settings';

import {
  linkedPreset,
  mainChoice,
  ownSlots,
  presetMainChoice,
  sessionChoiceOfSub,
  slotEffortOptions,
  subChoiceOf,
  withEffort,
} from '../src/ui/chat/model-slots';

const flash = { provider: 'opencode-go', model: 'deepseek-v4.1-flash' };
const glm = { provider: 'opencode-go', model: 'glm-5.3-flash' };
const efforts = [
  { id: 'low', name: 'Low' },
  { id: 'high', name: 'High' },
];
const models = [
  { ...flash, providerName: 'OpenCode Go', modelName: 'DeepSeek V4.1 Flash', efforts },
  { ...glm, providerName: 'OpenCode Go', modelName: 'GLM-5.3 Flash' },
];
const preset = (id: string, extra: Partial<ModelPreset> = {}): ModelPreset =>
  ({
    id,
    name: id,
    revision: 1,
    orchestrator: flash,
    assignmentDefault: flash,
    ...extra,
  }) as ModelPreset;
const state = (extra: Partial<ModelSettingsState> = {}): ModelSettingsState => ({
  revision: 1,
  models,
  presets: [
    preset('default'),
    preset('work', { orchestrator: { ...glm, reasoningEffort: 'high' } }),
  ],
  ...extra,
});

describe('model slots', () => {
  it('follows the linked preset main until the Bot sets its own', () => {
    const value = state({ presetId: 'work', plan: { orchestrator: flash } as never });
    expect(linkedPreset(value)?.id).toBe('work');
    expect(mainChoice(value, { kind: 'bot', slug: 'tob' })).toEqual({
      kind: 'model',
      ...glm,
      effort: 'high',
    });
    const own = state({
      presetId: 'work',
      overrides: ['main'],
      plan: { orchestrator: flash } as never,
    });
    expect(ownSlots(own)).toEqual(['main']);
    expect(mainChoice(own, { kind: 'bot', slug: 'tob' })).toEqual({ kind: 'model', ...flash });
  });

  it('falls back to the Default preset when the linked one is gone', () => {
    expect(linkedPreset(state({ presetId: 'deleted' }))?.id).toBe('default');
  });

  it('reads a preset subscription or Routing Group main', () => {
    expect(
      presetMainChoice(
        preset('subs', { orchestratorEngine: { engine: 'claude', model: 'opus', accountId: 'a' } }),
      ),
    ).toEqual({ kind: 'engine', engine: 'claude', model: 'opus', accountId: 'a' });
    expect(
      presetMainChoice(
        preset('g', { orchestratorGroupId: 'steady', orchestratorGroupEffort: 'high' }),
      ),
    ).toEqual({ kind: 'group', id: 'steady', effort: 'high' });
  });

  it('offers the provider default plus the model efforts', () => {
    expect(slotEffortOptions({ models }, { kind: 'model', ...flash }, 'Default')).toEqual([
      { id: '', label: 'Default' },
      { id: 'low', label: 'Low' },
      { id: 'high', label: 'High' },
    ]);
    expect(slotEffortOptions({ models }, { kind: 'model', ...glm }, 'Default')).toEqual([]);
  });

  it('turns picked rows into sub choices with their effort', () => {
    const value = state();
    expect(subChoiceOf(value, { kind: 'model', ...flash, effort: 'high' })).toEqual({
      kind: 'model',
      ...flash,
      allowedEfforts: ['', 'low', 'high'],
      defaultEffort: 'high',
    });
    expect(subChoiceOf(value, { kind: 'group', id: 'steady' })).toEqual({
      kind: 'group',
      group: 'steady',
    });
    expect(withEffort({ kind: 'model', ...flash }, 'low')).toEqual({
      kind: 'model',
      ...flash,
      effort: 'low',
    });
    expect(withEffort({ kind: 'model', ...flash, effort: 'low' }, '')).toEqual({
      kind: 'model',
      ...flash,
    });
  });

  it('maps existing sub choices back to picker rows', () => {
    expect(sessionChoiceOfSub({ kind: 'group', group: 'g' })).toEqual({ kind: 'group', id: 'g' });
  });
});
