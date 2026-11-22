import { expect, it } from 'vitest';
import { host, invoke } from './cli-models-usage-fixture.js';

it('previews the Default preset against the legacy Host using read-only calls', async () => {
  const main = { provider: 'go', model: 'flash', reasoningEffort: 'high' };
  const live = await host((method) => ({
    ok: true,
    value:
      method === 'modelPresets'
        ? { presets: [{ id: 'user-preset', name: 'Default' }] }
        : { default: main, defaultGroupId: 'routes', defaultGroupEffort: 'max' },
  }));
  const result = await invoke(['model-default', '--migration-dry-run'], live.url);
  expect(result.code).toBe(0);
  expect(result.json).toMatchObject({
    status: 'would-migrate',
    preset: {
      id: 'default',
      orchestrator: main,
      orchestratorGroupId: 'routes',
      orchestratorGroupEffort: 'max',
      assignmentFollowsMain: true,
    },
  });
  expect(live.calls).toEqual([
    { method: 'modelPresets', args: {} },
    { method: 'modelCatalog', args: {} },
  ]);
});

it.each([
  ['model-preset-update', 'default', '--assignment-model', 'pro'],
  ['model-preset-delete', 'default', '--expected-revision', '3', '--confirm'],
  ['settings', 'botharness-client'],
  ['list'],
])('rejects migration dry run on %s before connecting', async (...argv) => {
  const live = await host(() => ({ ok: true, value: {} }));
  const result = await invoke([...argv, '--migration-dry-run'], live.url);
  expect(result.code).toBe(2);
  expect(result.json.error.message).toContain('--migration-dry-run requires model-default');
  expect(live.calls).toEqual([]);
});

it('reads, updates sub, and surfaces pinned deletion from the Default preset', async () => {
  const main = { provider: 'go', model: 'flash' };
  const preset = {
    id: 'default',
    name: 'Default',
    revision: 3,
    orchestrator: main,
    assignmentDefault: main,
    assignmentFollowsMain: true,
  };
  const live = await host((method) => {
    if (method === 'modelPresetDelete')
      return { ok: false, error: { code: 'default-preset-pinned', message: 'Default is pinned' } };
    return { ok: true, value: { preset, presets: [preset], defaultPresetId: 'default' } };
  });
  expect((await invoke(['model-default'], live.url)).json).toEqual({ preset });
  expect((await invoke(['model-default', '--migration-dry-run'], live.url)).json).toEqual({
    preset,
    status: 'already-migrated',
  });
  expect(
    (await invoke(['model-preset-update', 'default', '--assignment-model', 'pro'], live.url)).code,
  ).toBe(0);
  expect(live.calls.at(-1)).toMatchObject({
    method: 'modelPresetUpdate',
    args: {
      expectedRevision: 3,
      assignmentDefault: { provider: 'go', model: 'pro' },
      assignmentFollowsMain: false,
    },
  });
  expect(
    (await invoke(['model-preset-update', 'default', '--assignment-follows-main'], live.url)).code,
  ).toBe(0);
  expect(live.calls.at(-1)).toMatchObject({
    method: 'modelPresetUpdate',
    args: { assignmentFollowsMain: true },
  });
  expect(
    (
      await invoke(
        ['model-preset-delete', 'default', '--expected-revision', '3', '--confirm'],
        live.url,
      )
    ).json.error.code,
  ).toBe('default-preset-pinned');
});

it('lists and replaces sub choices through the Host without a local fallback', async () => {
  const id = 'default';
  const choices = [
    {
      kind: 'model',
      provider: 'go',
      model: 'flash',
      allowedEfforts: ['low'],
      defaultEffort: 'low',
    },
    { kind: 'group', group: 'fallback' },
  ];
  const sub = { choices, default: { kind: 'group', group: 'fallback' } };
  const live = await host((method) =>
    method === 'modelPresetSubSet'
      ? { ok: false, error: { code: 'stale-setting', message: 'read again' } }
      : { ok: true, value: { id, sub, revision: 3 } },
  );
  expect((await invoke(['model-preset-sub', id], live.url)).json).toEqual({ id, sub, revision: 3 });
  const argv = ['model-preset-sub-set', id, '--expected-revision', '3', '--plan-stdin'];
  expect((await invoke(argv, live.url, JSON.stringify(sub))).json.error.code).toBe('stale-setting');
  expect(live.calls).toEqual([
    { method: 'modelPresetSub', args: { id } },
    { method: 'modelPresetSubSet', args: { id, expectedRevision: 3, sub } },
  ]);
  expect((await invoke(argv, live.url, '{"choices":[]}')).json.error.code).toBe('usage');
  expect(live.calls).toHaveLength(2);
});
