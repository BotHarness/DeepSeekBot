import { describe, expect, it, vi } from 'vitest';

import { createModelCatalog } from '../src/models/catalog.js';

describe('model catalog names', () => {
  it('names a provider or model by its id when DSH gives no display name', async () => {
    const catalog = createModelCatalog({
      listProviders: () => [
        { id: 'deepseek', name: 'DeepSeek' },
        { id: 'opencode-go', name: '' },
      ],
      listModels: async (provider: string) =>
        provider === 'deepseek'
          ? [{ provider, id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' }]
          : [{ provider, id: 'deepseek-v4.1-flash', name: '  ' }],
      resolveModelInfo: async (provider, model) => ({ provider, id: model, name: model }),
      resolveCallConfig: vi.fn(async (config) => config),
    });
    expect(
      (await catalog.list()).map(({ providerName, modelName }) => [providerName, modelName]),
    ).toEqual([
      ['DeepSeek', 'DeepSeek V4 Flash'],
      ['opencode-go', 'deepseek-v4.1-flash'],
    ]);
  });
});
