import { describe, expect, it } from 'vitest';

import { loadGlobalModel } from '@botharness/host-client/bot-settings';
import { parseModelCatalog } from '@botharness/host-client/model-catalog';
import { loadModelCatalog } from '../src/client/bridge.js';

const answer = {
  models: [
    {
      provider: 'deepseek',
      providerName: 'DeepSeek',
      model: 'deepseek-v4-flash',
      modelName: 'DeepSeek V4 Flash',
      efforts: [{ id: 'high', name: 'High' }],
      defaultEffort: 'high',
    },
    { provider: 'opencode-go', model: 'deepseek-v4.1-flash', efforts: [] },
    { provider: 'custom', providerName: ' ', model: 'qwen3-max', modelName: '', efforts: [] },
    { provider: 'custom', providerName: 'Custom', model: '', modelName: 'No route' },
  ],
  default: { provider: 'opencode-go', model: 'deepseek-v4.1-flash' },
};

const routes = (models: readonly { provider: string; model: string; modelName: string }[]) =>
  models.map((entry) => `${entry.provider}/${entry.model} ${entry.modelName}`);

describe('model catalog parity between the desktop Client and the mobile app', () => {
  it('lists the same models from one Host answer', async () => {
    const desktop = await loadModelCatalog(async () => ({ ok: true, value: answer }));
    const mobile = await loadGlobalModel({
      call: async (method) => (method === 'modelCatalog' ? answer : { presets: [] }),
    });
    expect(routes(desktop.models)).toEqual([
      'deepseek/deepseek-v4-flash DeepSeek V4 Flash',
      'opencode-go/deepseek-v4.1-flash deepseek-v4.1-flash',
      'custom/qwen3-max qwen3-max',
    ]);
    expect(routes(mobile.models)).toEqual(routes(desktop.models));
    expect(mobile.fallback).toEqual(desktop.default);
  });

  it('names a provider or model by its id when the Host sends no name', () => {
    const [, opencode, custom] = parseModelCatalog(answer).models;
    expect(opencode).toMatchObject({
      providerName: 'opencode-go',
      modelName: 'deepseek-v4.1-flash',
    });
    expect(custom).toMatchObject({ providerName: 'custom', modelName: 'qwen3-max' });
  });
});
