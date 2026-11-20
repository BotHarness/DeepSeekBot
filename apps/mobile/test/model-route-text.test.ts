import { describe, expect, it } from 'vitest';

import type { ModelSettingsState } from '@botharness/host-client/model-settings';
import {
  effortChoices,
  groupEffortChoices,
  groupEffortLabel,
  groupEffortOf,
  keptEffort,
  keptGroupEffort,
  routeEffortLabel,
  presetDetail,
  presetFront,
  routeLabel,
  shortModelName,
} from '../src/ui/chat/model-route-text';

const flash = { provider: 'opencode-go', model: 'deepseek-v4.1-flash' };
const glm = { provider: 'opencode-go', model: 'glm-5.2' };
const value = {
  revision: 1,
  models: [
    {
      ...flash,
      providerName: 'opencode-go',
      modelName: 'DeepSeek V4.1 Flash',
      efforts: [
        { id: 'high', name: 'High' },
        { id: 'max', name: 'Max' },
      ],
      defaultEffort: 'high',
    },
    { ...glm, providerName: 'opencode-go', modelName: 'GLM-5.2' },
  ],
  presets: [],
  groups: [{ id: 'daily', name: 'Daily', routes: [glm, flash] }],
} as unknown as ModelSettingsState;

describe('phone model rows', () => {
  it('name a model by its short label without the provider, like the desktop chip', () => {
    expect(routeLabel(value, flash)).toBe('V4.1 Flash');
    expect(routeLabel(value, { provider: 'other', model: 'unknown-1' })).toBe('unknown-1');
    expect(
      shortModelName({ provider: 'opencode-go', model: 'minimax-m3', modelName: 'MiniMax-M3' }),
    ).toBe('MiniMax-M3');
    expect(
      shortModelName({
        provider: 'opencode-go',
        model: 'qwen3.8-flash',
        modelName: 'Qwen3.8 Flash',
      }),
    ).toBe('Qwen3.8 Flash');
  });

  it('describe a Preset with short labels and Routing Group names', () => {
    expect(
      presetDetail(value, {
        id: 'p',
        name: 'Writer',
        orchestrator: flash,
        assignmentDefault: glm,
        assignmentModels: [],
      } as never),
    ).toBe('Main: V4.1 Flash · Assignments: GLM-5.2');
    const grouped = {
      id: 'g',
      name: 'Grouped',
      orchestratorGroupId: 'daily',
      assignmentDefault: flash,
      assignmentModels: [],
    } as never;
    expect(presetDetail(value, grouped)).toBe('Main: Daily · Assignments: V4.1 Flash');
    expect(presetFront(value, grouped)).toEqual(glm);
  });

  it('shows model and effort as one choice and keeps the same effort across models', () => {
    expect(routeEffortLabel(value, { ...flash, reasoningEffort: 'max' })).toBe('V4.1 Flash · Max');
    expect(routeEffortLabel(value, flash)).toBe('V4.1 Flash');
    const [flashEntry, glmEntry] = value.models;
    expect(effortChoices(flashEntry).map((option) => option.label)).toEqual([
      'Default',
      'High',
      'Max',
    ]);
    expect(effortChoices(glmEntry)).toEqual([]);
    expect(keptEffort(flashEntry!, { ...glm, reasoningEffort: 'max' })).toBe('max');
    expect(keptEffort(flashEntry!, { ...glm, reasoningEffort: 'low' })).toBe('high');
    expect(keptEffort(flashEntry!, flash)).toBe('');
    expect(keptEffort(glmEntry!, { ...flash, reasoningEffort: 'max' })).toBe('');
  });

  it('lets a Routing Group pick one effort its reasoning members share', () => {
    const daily = value.groups![0]!;
    expect(groupEffortChoices(value, daily).map((option) => option.label)).toEqual([
      'Default',
      'High',
      'Max',
    ]);
    expect(groupEffortLabel(value, daily, 'max')).toBe('Max');
    expect(groupEffortLabel(value, daily, '')).toBe('Default');
    expect(keptGroupEffort(value, daily, 'max')).toBe('max');
    expect(keptGroupEffort(value, daily, 'low')).toBe('');
    expect(groupEffortChoices(value, { ...daily, routes: [glm] })).toEqual([]);
    expect(
      groupEffortOf({ orchestratorGroupId: 'daily', orchestratorGroupEffort: 'max' }, false),
    ).toBe('max');
    expect(
      groupEffortOf(
        {
          assignmentDefaultGroupId: 'daily',
          assignmentGroupOptions: [{ group: 'daily', defaultEffort: 'high' }],
        },
        true,
      ),
    ).toBe('high');
  });
});
