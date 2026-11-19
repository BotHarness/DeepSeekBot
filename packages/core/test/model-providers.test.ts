import { expect, it, vi } from 'vitest';
import type { SettingsPathOp } from '@deepseek-ai/dsh-settings';
import { createModelProviders } from '../src/models/providers.js';

const settingsNs = 'llm-pi-ai';
const secret = 'test-secret-1234';

function fixture() {
  const providers: Record<string, unknown> = {};
  const keys = new Map<string, string>();
  let revision = 0;
  const mutate = vi.fn(async (_ns: string, ops: readonly SettingsPathOp[], expected?: number) => {
    if (expected !== revision) throw new Error('Stale revision');
    for (const op of ops) {
      const [, id, field] = op.path;
      if (id === undefined) throw new Error('Expected provider path');
      if (op.op === 'unset') Reflect.deleteProperty(providers, id);
      else if (field === undefined) providers[id] = op.value;
      else {
        const provider = providers[id];
        if (typeof provider !== 'object' || provider === null) throw new Error('Missing provider');
        Object.assign(provider, { [field]: op.value });
      }
    }
    revision++;
  });
  const uses = vi.fn((_id: string): string[] => []);
  const probe = vi.fn(async (_id: string, _model: string) => true);
  const modelProviders = createModelProviders({
    settings: {
      describe: () => [{ ns: settingsNs, value: { providers }, user: { providers }, revision }],
      mutate,
    },
    credentials: {
      describe: async (ref) => ({ configured: keys.has(ref), writable: true }),
      resolve: async (ref) => {
        const value = keys.get(ref);
        return value === undefined ? undefined : { value, source: 'test' };
      },
      set: async (ref, value) => void keys.set(ref, value),
      unset: async (ref) => void keys.delete(ref),
    },
    directory: () =>
      [...new Set(['opencode-go', ...Object.keys(providers)])].map((provider) => ({
        provider,
        settingsNs,
        settingsPath: ['providers', provider],
        defaultBaseURL: 'https://opencode.ai/inference/go/v1',
      })),
    activeProviders: () => Object.keys(providers).map((id) => ({ id, name: id })),
    models: async (id) => (id in providers ? [{ id: 'deepseek-v4.1-flash' }] : []),
    rests: () => [],
    uses,
    probe,
  });
  return { modelProviders, settings: providers, keys, mutate, uses, probe };
}

it('stores a separate key and explicit model route for each OpenCode Go provider', async () => {
  const { modelProviders, settings, keys, probe } = fixture();
  const first = await modelProviders.add({
    template: 'opencode-go',
    name: 'Primary',
    key: secret,
    expectedRevision: 0,
  });
  const second = await modelProviders.add({
    template: 'opencode-go',
    name: 'Backup',
    key: secret,
    expectedRevision: 1,
  });

  expect(first).toMatchObject({
    id: 'opencode-go',
    keyStored: true,
    modelCount: 1,
    testReply: 'ok',
  });
  expect(second).toMatchObject({
    id: 'opencode-go-2',
    keyStored: true,
    modelCount: 1,
    testReply: 'ok',
  });
  expect(probe).toHaveBeenLastCalledWith('opencode-go-2', 'deepseek-v4.1-flash');
  expect(keys.size).toBe(2);
  expect(settings['opencode-go-2']).toMatchObject({
    api: 'openai-completions',
    baseURL: 'https://opencode.ai/inference/go/v1',
    models: expect.arrayContaining([expect.objectContaining({ id: 'deepseek-v4.1-flash' })]),
  });
  const listed = await modelProviders.list();
  expect(listed.providers).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'Primary', keyLast4: '1234' }),
      expect.objectContaining({ name: 'Backup', keyLast4: '1234' }),
    ]),
  );
  expect(JSON.stringify({ first, second, listed, settings })).not.toContain(secret);
});

it('fences edits and deletion and refuses to remove a provider in use', async () => {
  const { modelProviders, uses, keys } = fixture();
  await modelProviders.add({
    template: 'opencode-go',
    name: 'Primary',
    key: secret,
    expectedRevision: 0,
  });
  await expect(
    modelProviders.edit({
      id: 'opencode-go',
      name: 'Stale',
      key: 'wrong-key-9999',
      expectedRevision: 0,
    }),
  ).rejects.toMatchObject({ code: 'provider-conflict' });
  expect([...keys.values()]).toEqual([secret]);
  await modelProviders.edit({
    id: 'opencode-go',
    name: 'Renamed',
    key: 'new-key-7890',
    expectedRevision: 1,
  });
  expect((await modelProviders.list()).providers).toEqual([
    expect.objectContaining({ name: 'Renamed', keyLast4: '7890', revision: 2 }),
  ]);
  uses.mockReturnValue(['routing-group']);
  await expect(
    modelProviders.remove({ id: 'opencode-go', expectedRevision: 2 }),
  ).rejects.toMatchObject({ code: 'provider-in-use' });
  uses.mockReturnValue([]);
  await expect(
    modelProviders.remove({ id: 'opencode-go', expectedRevision: 1 }),
  ).rejects.toMatchObject({ code: 'provider-conflict' });
  await modelProviders.remove({ id: 'opencode-go', expectedRevision: 2 });
  expect((await modelProviders.list()).providers).toEqual([]);
  expect(keys.size).toBe(0);
});

it('unsets a staged key if the Settings service refuses a concurrent revision', async () => {
  const { modelProviders, settings, keys, mutate } = fixture();
  mutate.mockRejectedValueOnce(
    Object.assign(new Error('Settings changed'), { code: 'SETTINGS_CONFLICT' }),
  );
  await expect(
    modelProviders.add({
      template: 'opencode-go',
      name: 'Primary',
      key: secret,
      expectedRevision: 0,
    }),
  ).rejects.toMatchObject({ code: 'provider-conflict' });
  expect(keys.size).toBe(0);
  expect(settings).toEqual({});
});

it('returns independent save outcomes and does not probe without any listed model', async () => {
  const { modelProviders, probe, keys } = fixture();
  probe.mockRejectedValueOnce(new Error(secret));
  const result = await modelProviders.add({
    template: 'opencode-go',
    name: 'Primary',
    key: secret,
    expectedRevision: 0,
  });
  expect(result).toEqual({
    id: 'opencode-go',
    keyStored: true,
    modelCount: 1,
    testReply: 'failed',
  });
  expect(keys.size).toBe(1);
});
