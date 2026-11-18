import { describe, expect, it } from 'vitest';

import type { ModelSettingsState } from '@botharness/host-client/model-settings';
import {
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
    { ...flash, providerName: 'opencode-go', modelName: 'DeepSeek V4.1 Flash' },
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
});
