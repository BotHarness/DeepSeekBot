import { describe, expect, it } from 'vitest';

import type { BotModel } from '@botharness/host-client/bot-settings';
import { headerModel, modelEntryLabel, modelFamilyKey } from '../src/ui/chat/composer-labels';

const model = (value: Partial<BotModel>): BotModel => ({
  revision: 1,
  models: [],
  presets: [],
  ...value,
});

describe('chat header model', () => {
  it('shows the family logo and the name without its family prefix, like the desktop chip', () => {
    expect(
      headerModel({
        status: 'ready',
        value: model({
          models: [
            {
              provider: 'opencode-go',
              providerName: 'OpenCode Go',
              model: 'deepseek-v4.1-flash',
              modelName: 'DeepSeek V4.1 Flash',
            },
          ],
          fallback: { provider: 'opencode-go', model: 'deepseek-v4.1-flash' },
        }),
      }),
    ).toEqual({ brand: 'deepseek', short: 'V4.1 Flash', name: 'DeepSeek V4.1 Flash' });
  });

  it('falls back to the model id and the generic symbol for an unknown family', () => {
    expect(
      headerModel({
        status: 'ready',
        value: model({
          plan: {
            revision: 1,
            sourcePresetId: '',
            sourcePresetName: '',
            orchestrator: { provider: 'lab', model: 'house-model' },
          },
        }),
      }),
    ).toEqual({ brand: undefined, short: 'house-model', name: 'house-model' });
  });

  it('shows nothing while loading, after a failure or with no model', () => {
    expect(headerModel({ status: 'loading' })).toBeUndefined();
    expect(headerModel({ status: 'failed', error: 'offline' })).toBeUndefined();
    expect(headerModel({ status: 'ready', value: model({}) })).toBeUndefined();
  });
});

describe('model picker rows', () => {
  it('names each model by its family logo and short name and groups it by family', () => {
    const gpt = { provider: 'openai', model: 'gpt-6.1', modelName: 'GPT-6.1' };
    const lab = { provider: 'lab', model: 'house-model', modelName: 'house-model' };
    expect(modelEntryLabel(gpt)).toEqual({ brand: 'openai', short: '6.1', name: 'GPT-6.1' });
    expect(modelFamilyKey(gpt)).toBe('openai');
    expect(modelFamilyKey(lab)).toBe('other');
  });
});
