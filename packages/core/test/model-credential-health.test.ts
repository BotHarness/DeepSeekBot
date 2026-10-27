import { describe, expect, it, vi } from 'vitest';

import { createModelCatalog } from '../src/models/catalog.js';
import { createProviderCredentialHealth } from '../src/models/credential-health.js';
import { createModelRouteReadiness } from '../src/models/readiness.js';

function fakeLlm() {
  return {
    listProviders: () => [
      { id: 'deepseek', name: 'DeepSeek' },
      { id: 'opencode-go', name: 'OpenCode Go' },
    ],
    listModels: async (provider: string) =>
      provider === 'deepseek'
        ? [{ id: 'deepseek-chat', name: 'Chat' }]
        : [{ id: 'deepseek-v4.1-flash', name: 'Flash' }],
    resolveModelInfo: async () => ({}),
    resolveCallConfig: vi.fn(async () => ({})),
  };
}

describe('provider credential health', () => {
  it('marks a provider after a credential failure and forgets it on reset', async () => {
    const health = createProviderCredentialHealth();
    const llm = fakeLlm();
    const catalog = createModelCatalog(llm as never, {
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

  it('re-checks a failure fixed outside DSH on the next Turn and after a short expiry', async () => {
    let now = 0;
    const health = createProviderCredentialHealth({ now: () => now });
    const route = { provider: 'deepseek', model: 'deepseek-chat' };
    const catalog = createModelCatalog(fakeLlm() as never, { credentials: health });
    const readiness = createModelRouteReadiness(
      {
        get: () => ({ modelPlan: { orchestrator: route } }) as never,
        migrateLegacyModel: () => {
          throw new Error('unexpected migration');
        },
      },
      catalog,
    );

    // The Turn failed without a key; the Human then supplies it through the environment or
    // an external store, which raises no credential, settings or adapter event.
    health.observe('deepseek', 'MISSING_CREDENTIAL');
    await expect(catalog.validate(route)).rejects.toThrow('Provider deepseek has no API key');

    await readiness.prepare('bot', 'orchestrator');

    now += 60_000;
    await catalog.validate(route);
    expect((await catalog.list()).every((entry) => entry.credential === undefined)).toBe(true);
  });
});
