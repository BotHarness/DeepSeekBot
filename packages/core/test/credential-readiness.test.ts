import { expect, it, vi } from 'vitest';
import { createCredentialReadiness } from '../src/models/credential-readiness.js';

it('describes the current native reference without retrieving secrets or calling a model', async () => {
  const describe = vi.fn(async () => ({ configured: false }));
  let reference = 'EMPTY_KEY';
  const readiness = createCredentialReadiness({
    providers: () => [
      { provider: 'official', settingsNs: 'native', settingsPath: [] },
      { provider: 'gateway', settingsNs: 'pi', settingsPath: ['providers', 'custom'] },
    ],
    settings: () => [
      { ns: 'native', value: { apiKeyEnv: reference } },
      { ns: 'pi', value: { providers: { custom: { apiKeyEnv: 'GATEWAY_KEY' } } } },
    ],
    describe,
  });
  const snapshot = readiness();
  expect(await snapshot('official')).toBe('missing');
  expect(describe).toHaveBeenLastCalledWith('EMPTY_KEY');
  reference = 'CONFIGURED_KEY';
  describe.mockResolvedValue({ configured: true });
  expect(await readiness()('official')).toBeUndefined();
  expect(describe).toHaveBeenLastCalledWith('CONFIGURED_KEY');
  expect(await snapshot('gateway')).toBeUndefined();
  expect(describe).toHaveBeenLastCalledWith('GATEWAY_KEY');
  describe.mockClear();
  expect(await snapshot('ambient')).toBeUndefined();
  expect(describe).not.toHaveBeenCalled();
});

it('reads settings once per catalog snapshot and shares credential descriptions within it', async () => {
  const settings = vi.fn(() => [{ ns: 'native', value: { apiKeyEnv: 'SHARED_KEY' } }]);
  const providers = vi.fn(() =>
    ['a', 'b'].map((provider) => ({ provider, settingsNs: 'native', settingsPath: [] })),
  );
  const describe = vi.fn(async () => ({ configured: false }));
  const readiness = createCredentialReadiness({ settings, providers, describe });
  const snapshot = readiness();
  expect(await Promise.all([snapshot('a'), snapshot('b')])).toEqual(['missing', 'missing']);
  expect(settings).toHaveBeenCalledTimes(1);
  expect(providers).toHaveBeenCalledTimes(1);
  expect(describe).toHaveBeenCalledTimes(1);
  describe.mockResolvedValue({ configured: true });
  expect(await readiness()('a')).toBeUndefined();
  expect(settings).toHaveBeenCalledTimes(2);
  expect(describe).toHaveBeenCalledTimes(2);
});
