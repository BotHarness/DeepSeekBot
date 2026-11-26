import { expect, it, vi } from 'vitest';
import { hostSettingsScope } from '../src/host-settings-scope';

function fakeHost(refuse = false) {
  let revision = 4;
  let value: Record<string, unknown> = { nativeSessionAttention: true };
  const call = vi.fn(async (method: string, args: Record<string, unknown> = {}) => {
    if (method === 'settings/describe')
      return { namespaces: [{ ns: 'botharness-client', revision, value }] };
    if (refuse) throw new Error('stale-setting');
    value = { ...value, ...(args['patch'] as Record<string, unknown>) };
    revision += 1;
    return { ns: 'botharness-client', revision, value };
  });
  return { call };
}

it('reads one namespace and writes at the revision it read', async () => {
  const host = fakeHost();
  const scope = hostSettingsScope(host, 'botharness-client');
  const seen: string[] = [];
  scope.subscribe(() => seen.push(scope.getSnapshot().status));
  expect(scope.getSnapshot()).toEqual({ status: 'loading' });
  await scope.refresh();
  expect(scope.getSnapshot()).toEqual({
    status: 'ready',
    revision: 4,
    value: { nativeSessionAttention: true },
  });
  await expect(
    scope.write('settings/update', { patch: { nativeSessionAttention: false } }),
  ).resolves.toBe(true);
  expect(host.call).toHaveBeenLastCalledWith('settings/update', {
    ns: 'botharness-client',
    expectedRevision: 4,
    patch: { nativeSessionAttention: false },
  });
  expect(scope.getSnapshot()).toEqual({
    status: 'ready',
    revision: 5,
    value: { nativeSessionAttention: false },
  });
  expect(seen).toEqual(['ready', 'ready']);
});

it('reads the Host value again after a refused write and reports it', async () => {
  const host = fakeHost(true);
  const scope = hostSettingsScope(host, 'botharness-client');
  await scope.refresh();
  await expect(
    scope.write('settings/update', { patch: { nativeSessionAttention: false } }),
  ).resolves.toBe(false);
  expect(host.call.mock.calls.map(([method]) => method)).toEqual([
    'settings/describe',
    'settings/update',
    'settings/describe',
  ]);
  expect(scope.getSnapshot()).toMatchObject({ value: { nativeSessionAttention: true } });
});

it('is unavailable when the Host has no such namespace or cannot be read', async () => {
  const missing = hostSettingsScope(fakeHost(), 'other');
  await missing.refresh();
  expect(missing.getSnapshot()).toEqual({ status: 'unavailable' });
  const broken = hostSettingsScope(
    { call: async () => Promise.reject(new Error('offline')) },
    'botharness-client',
  );
  await broken.refresh();
  expect(broken.getSnapshot()).toEqual({ status: 'unavailable' });
});
