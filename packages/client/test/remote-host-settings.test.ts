import { describe, expect, it } from 'vitest';
import { createHostClient } from '../../../apps/mobile/src/host/client.js';
import {
  modelSettingsResource,
  saveModelPreset,
  setModelRoute,
} from '../../../apps/mobile/src/host/model-settings.js';
import { FakeHost } from '../../../apps/mobile/test/fake-host.js';
import { remoteHostSettingsSource } from '../src/client/remote-host-settings-source.js';

function setup(name: string) {
  const host = new FakeHost();
  const client = createHostClient({
    routes: [`https://${name}.example.ts.net`],
    credential: host.credential,
    carrier: host.carrier,
  });
  const route = { provider: 'deepseek', model: name };
  host.methods.set('modelCatalog', () => ({
    models: [{ ...route, providerName: 'DeepSeek', modelName: name }],
    default: route,
  }));
  host.methods.set('modelPresets', () => ({
    presets: [{ id: 'same-id', name, revision: 3, orchestrator: route, assignmentDefault: route }],
  }));
  return { host, client, route, source: remoteHostSettingsSource(client) };
}

describe('Remote Host settings ownership', () => {
  it('isolates global and same-id preset resources, and writes only to their source Host', async () => {
    const a = setup('a');
    const b = setup('b');
    const scope = { kind: 'preset', id: 'same-id' } as const;
    const [local, remote] = await Promise.all([
      modelSettingsResource(a.client, scope).refresh(),
      modelSettingsResource(b.client, scope).refresh(),
    ]);
    expect(local).toMatchObject({ preset: { name: 'a' } });
    expect(remote).toMatchObject({ preset: { name: 'b' } });
    b.host.methods.set('modelPresetUpdate', () => ({ preset: { id: 'same-id' } }));
    await saveModelPreset(b.client, remote, 'Renamed remote', true);
    expect(b.host.calls.at(-1)).toMatchObject({
      method: 'modelPresetUpdate',
      args: { id: 'same-id', expectedRevision: 3, name: 'Renamed remote', orchestrator: b.route },
    });
    b.host.methods.set('onboardingModel', () => ({}));
    await setModelRoute(
      b.client,
      { kind: 'global' },
      await modelSettingsResource(b.client, { kind: 'global' }).refresh(),
      'orchestrator',
      b.route,
    );
    expect(b.host.calls.at(-1)).toMatchObject({
      method: 'onboardingModel',
      args: { globalDefault: true, route: b.route },
    });
    expect(a.host.calls.map((call) => call.method)).toEqual(['modelCatalog', 'modelPresets']);
  });

  it('reads usage and storage through the selected Host and preserves explicit cleanup preview scope', async () => {
    const a = setup('a');
    const b = setup('b');
    b.host.methods.set('overviewUsage', (args) => ({ source: 'b', ...args }));
    b.host.methods.set('overviewMemory', (args) => ({ source: 'b', ...args }));
    b.host.methods.set('storageUsage', () => ({ totalBytes: 12, chats: [], parts: [] }));
    const scope = {
      before: '2026-01-01T00:00:00.000Z',
      channelIds: ['same-channel'],
      kinds: ['image' as const],
    };
    const preview = {
      token: 'host-b-preview',
      scope,
      files: 1,
      messages: 1,
      bytes: 12,
      freedBytes: 12,
      kept: [],
    };
    b.host.methods.set('storageCleanupPreview', () => preview);
    b.host.methods.set('storageCleanupConfirm', () => ({ files: 1, messages: 1, freedBytes: 12 }));
    expect(await b.source.usage.overviewUsage('week', 'cursor')).toEqual({
      source: 'b',
      period: 'week',
      after: 'cursor',
    });
    expect(await b.source.usage.overviewMemory('cursor')).toEqual({ source: 'b', after: 'cursor' });
    expect(await b.source.storage.usage()).toMatchObject({ totalBytes: 12 });
    const result = await b.source.storage.previewMedia(scope);
    expect(b.host.calls.some((call) => call.method === 'storageCleanupConfirm')).toBe(false);
    await b.source.storage.confirmMedia(result);
    expect(b.host.calls.at(-1)).toEqual({
      method: 'storageCleanupConfirm',
      args: { ...scope, token: 'host-b-preview' },
    });
    expect(a.host.calls).toEqual([]);
  });

  it('keeps message deletion separate and propagates source Host refusals without retry or fallback', async () => {
    const a = setup('a');
    const b = setup('b');
    const scope = { before: '2026-01-01T00:00:00.000Z', channelIds: ['same-channel'] };
    const preview = {
      token: 'messages-b',
      scope,
      messages: 2,
      bytes: 12,
      files: 0,
      chats: [],
      kept: [],
      memoryReferences: 0,
      more: false,
    };
    b.host.methods.set('storageMessagesCleanupPreview', () => preview);
    b.host.failing.add('storageMessagesCleanupConfirm');
    await expect(b.source.storage.previewMessages(scope)).resolves.toEqual(preview);
    await expect(b.source.storage.confirmMessages(preview)).rejects.toThrow();
    expect(
      b.host.calls.filter((call) => call.method === 'storageMessagesCleanupConfirm'),
    ).toHaveLength(1);
    expect(a.host.calls).toEqual([]);
    b.host.revoked = true;
    await expect(b.source.storage.usage()).rejects.toThrow();
    await expect(modelSettingsResource(b.client, { kind: 'global' }).refresh()).rejects.toThrow();
    expect(a.host.calls).toEqual([]);
  });
});
