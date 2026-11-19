import { describe, expect, it } from 'vitest';

import { createHostClient } from '@botharness/host-client/client';
import type { RoutingGroupMember } from '@botharness/host-client/model-catalog';
import {
  createModelGroup,
  deleteModelGroup,
  loadModelGroup,
  modelGroupReferences,
  modelSettingsResource,
  updateModelGroup,
} from '@botharness/host-client/model-settings';
import { FakeHost } from '../../../packages/host-client/test/fake-host.js';

const flash = {
  kind: 'model',
  provider: 'deepseek',
  model: 'flash',
  reasoningEffort: 'high',
} as const;
const nested = { kind: 'group', id: 'backup' } as const;
const members: RoutingGroupMember[] = [flash, nested];
const group = { id: 'daily', name: 'Daily', revision: 2, members };
const catalog = {
  models: [flash],
  groups: [{ id: group.id, name: group.name, revision: group.revision, routes: [flash] }],
};

function setup() {
  const fake = new FakeHost();
  const client = createHostClient({
    routes: ['https://studio.tailnet-example.ts.net'],
    credential: fake.credential,
    carrier: fake.carrier,
  });
  fake.methods.set('modelCatalog', () => catalog);
  fake.methods.set('modelPresets', () => ({ presets: [] }));
  fake.methods.set('modelPlan', () => ({ revision: 0 }));
  fake.methods.set('modelGroup', () => ({ group, routes: [flash] }));
  fake.methods.set('modelGroupCreate', () => ({ group }));
  fake.methods.set('modelGroupUpdate', () => ({ group }));
  fake.methods.set('modelGroupDelete', () => ({ group }));
  return { client, fake };
}

describe('phone Routing Group editor', () => {
  it('loads canonical members even when the catalog has only flattened routes', async () => {
    const { client, fake } = setup();
    await expect(loadModelGroup(client, 'daily')).resolves.toEqual(group);
    expect(fake.calls).toEqual([{ method: 'modelGroup', args: { id: 'daily' } }]);

    fake.methods.set('modelGroup', () => ({ group: { ...group, members: [flash, {}] } }));
    await expect(loadModelGroup(client, 'daily')).rejects.toThrow('invalid Routing Group');
  });

  it('sends creation, rename and reorder, and revision-checked deletion', async () => {
    const { client, fake } = setup();
    await createModelGroup(client, { name: 'Daily', members });
    await updateModelGroup(client, 'daily', 2, { name: 'Work', members: [nested, flash] });
    await deleteModelGroup(client, 'daily', 3);
    expect(fake.calls).toEqual([
      { method: 'modelGroupCreate', args: { name: 'Daily', members } },
      {
        method: 'modelGroupUpdate',
        args: { id: 'daily', expectedRevision: 2, name: 'Work', members: [nested, flash] },
      },
      { method: 'modelGroupDelete', args: { id: 'daily', expectedRevision: 3 } },
    ]);
  });

  it.each([
    { method: 'modelGroupCreate', code: 'routing-group-empty-group', operation: 'create' },
    { method: 'modelGroupUpdate', code: 'routing-group-cycle', operation: 'update' },
    { method: 'modelGroupUpdate', code: 'routing-group-stale-revision', operation: 'update' },
    { method: 'modelGroupDelete', code: 'routing-group-in-use', operation: 'delete' },
    { method: 'modelGroupDelete', code: 'routing-group-stale-revision', operation: 'delete' },
  ] as const)('preserves the $code refusal from $method', async ({ method, code, operation }) => {
    const { client, fake } = setup();
    const references = ['Routing Group Backup', 'Model Preset Work', 'the default model'];
    const details = code === 'routing-group-in-use' ? { references } : {};
    fake.answers.set(method, () => ({
      ok: false,
      error: { code, message: 'Host refusal', details },
    }));
    const mutate = {
      create: () => createModelGroup(client, { name: 'Empty', members: [] }),
      update: () => updateModelGroup(client, 'daily', 2, { name: 'Daily', members }),
      delete: () => deleteModelGroup(client, 'daily', 2),
    };
    await expect(mutate[operation]()).rejects.toMatchObject({
      code,
      message: 'Host refusal',
      details,
    });
    if (code === 'routing-group-in-use') expect(modelGroupReferences(details)).toEqual(references);
  });

  it.each(['create', 'update', 'delete'] as const)(
    'invalidates all settings scopes after %s without starting extra reads',
    async (operation) => {
      const { client, fake } = setup();
      const global = modelSettingsResource(client, { kind: 'global' });
      const bot = modelSettingsResource(client, { kind: 'bot', slug: 'qa' });
      await Promise.all([global.refresh(), bot.refresh()]);
      let release: (value: unknown) => void = () => {};
      let start: () => void = () => {};
      const started = new Promise<void>((resolve) => {
        start = resolve;
      });
      fake.methods.set(
        'modelCatalog',
        () =>
          new Promise((resolve) => {
            release = resolve;
            start();
          }),
      );
      const staleRead = bot.refresh();
      await started;
      const catalogReads = () => fake.calls.filter((call) => call.method === 'modelCatalog').length;
      const before = catalogReads();
      const mutate = {
        create: () => createModelGroup(client, { name: 'Daily', members }),
        update: () => updateModelGroup(client, 'daily', 2, { name: 'Work', members }),
        delete: () => deleteModelGroup(client, 'daily', 2),
      };
      await mutate[operation]();
      expect(catalogReads()).toBe(before);
      expect(await staleRead).toEqual(bot.peek());

      const groups =
        operation === 'delete' ? [] : [{ ...catalog.groups[0], name: 'Work', revision: 3 }];
      fake.methods.set('modelCatalog', () => ({ ...catalog, groups }));
      await Promise.all([global.refresh(), bot.refresh()]);
      release({ ...catalog, groups: [] });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(global.peek()?.groups).toEqual(
        groups.map(({ routes, ...rest }) => ({
          ...rest,
          routes: routes?.map(({ provider, model, reasoningEffort }) => ({
            provider,
            model,
            reasoningEffort,
          })),
        })),
      );
      expect(bot.peek()?.groups).toEqual(global.peek()?.groups);
    },
  );
});
