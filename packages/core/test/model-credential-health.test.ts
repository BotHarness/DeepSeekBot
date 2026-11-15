import { describe, expect, it, vi } from 'vitest';

import { createModelCatalog } from '../src/models/catalog.js';
import { createProviderCredentialHealth } from '../src/models/credential-health.js';
import { createCredentialReadiness } from '../src/models/credential-readiness.js';

function fakeLlm(): Parameters<typeof createModelCatalog>[0] {
  return {
    listProviders: () => [
      { id: 'deepseek', name: 'DeepSeek' },
      { id: 'opencode-go', name: 'OpenCode Go' },
    ],
    listModels: async (provider: string) =>
      provider === 'deepseek'
        ? [{ provider, id: 'deepseek-chat', name: 'Chat' }]
        : [{ provider, id: 'deepseek-v4.1-flash', name: 'Flash' }],
    resolveModelInfo: async (provider, model) => ({ provider, id: model, name: model }),
    resolveCallConfig: vi.fn(async (config) => config),
  };
}

describe('provider credential health', () => {
  it('shares one current settings read across a catalog and refreshes it for the next request', async () => {
    let configured = false;
    const settings = vi.fn(() => [{ ns: 'native', value: { apiKeyEnv: 'KEY' } }]);
    const describe = vi.fn(async () => ({ configured }));
    const catalog = createModelCatalog(fakeLlm(), {
      credentialReadiness: createCredentialReadiness({
        providers: () =>
          ['deepseek', 'opencode-go'].map((provider) => ({
            provider,
            settingsNs: 'native',
            settingsPath: [],
          })),
        settings,
        describe,
      }),
    });
    expect((await catalog.list()).map((model) => model.credential)).toEqual(['missing', 'missing']);
    expect(settings).toHaveBeenCalledTimes(1);
    expect(describe).toHaveBeenCalledTimes(1);
    configured = true;
    expect((await catalog.list()).map((model) => model.credential)).toEqual([undefined, undefined]);
    expect(settings).toHaveBeenCalledTimes(2);
    expect(describe).toHaveBeenCalledTimes(2);
  });
  it('marks a provider after a credential failure and forgets it on reset', async () => {
    const health = createProviderCredentialHealth();
    const llm = fakeLlm();
    const catalog = createModelCatalog(llm, {
      credentials: health,
      defaultRoute: () => ({
        provider: 'opencode-go',
        model: 'deepseek-v4.1-flash',
      }),
    });

    health.observe('opencode-go', 'RATE_LIMITED');
    health.observe('deepseek', 'MISSING_CREDENTIAL');
    expect((await catalog.list()).map((entry) => [entry.provider, entry.credential])).toEqual([
      ['deepseek', 'missing'],
      ['opencode-go', undefined],
    ]);
    await expect(
      catalog.validate({ provider: 'deepseek', model: 'deepseek-chat' }),
    ).rejects.toThrow('Provider deepseek has no API key');
    await catalog.validate({
      provider: 'opencode-go',
      model: 'deepseek-v4.1-flash',
    });
    expect(catalog.defaultRoute?.()).toEqual({
      provider: 'opencode-go',
      model: 'deepseek-v4.1-flash',
    });

    health.observe('deepseek', 'INVALID_CREDENTIAL');
    await expect(
      catalog.validate({ provider: 'deepseek', model: 'deepseek-chat' }),
    ).rejects.toThrow('has an invalid API key');

    health.reset();
    expect((await catalog.list()).every((entry) => entry.credential === undefined)).toBe(true);
    await catalog.validate({ provider: 'deepseek', model: 'deepseek-chat' });
  });
});
