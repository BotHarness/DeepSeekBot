import { describe, expect, it } from 'vitest';
import { createHostClient, type HostClient } from '../../../apps/mobile/src/host/client.js';
import { FakeHost } from '../../../apps/mobile/test/fake-host.js';
import { botSettings } from '../../../apps/mobile/src/host/bot-settings.js';
import {
  createHostSettingsDrafts,
  type HostDraftChoice,
} from '../src/client/host-settings-drafts.js';
import {
  createRemoteBotSettingsTarget,
  remoteBotSettingsClient,
  type RemoteBotSettingsTarget,
} from '../src/client/remote-bot-settings-target.js';

function fixture(hostId: string) {
  const host = new FakeHost();
  let connected = true;
  const transport = createHostClient({
    routes: [`https://${hostId}.example.ts.net`],
    credential: host.credential,
    carrier: host.carrier,
  });
  const client: HostClient = {
    ...transport,
    getSnapshot: () => ({
      connection: connected ? { status: 'connected', route: '' } : { status: 'stopped', route: '' },
    }),
  };
  const target: RemoteBotSettingsTarget = {
    hostId,
    hostName: 'Same name',
    slug: 'same-bot',
    name: 'Same Bot',
    client,
  };
  return {
    host,
    client,
    target,
    offline: () => {
      connected = false;
    },
  };
}

describe('exact remote Bot settings target', () => {
  it('keeps the original same-name Bot until its draft saves or is explicitly discarded', async () => {
    const drafts = createHostSettingsDrafts();
    const settings = createRemoteBotSettingsTarget(drafts.prepare);
    const a = fixture('host-a');
    const b = fixture('host-b');
    let dirty = true;
    let saveWorks = false;
    let decision: HostDraftChoice = 'cancel';
    const releases = [
      drafts.register('host-a', {
        dirty: () => dirty,
        save: async () => {
          if (saveWorks) dirty = false;
          return saveWorks;
        },
        discard: () => {
          dirty = false;
        },
      }),
      drafts.prompt('host-a', async () => decision),
    ];
    try {
      await settings.open(a.target);
      expect(await settings.open(b.target)).toBe(false);
      expect(settings.getSnapshot()?.hostId).toBe('host-a');
      decision = 'save';
      expect(await settings.close()).toBe(false);
      expect(settings.getSnapshot()?.client).toBe(a.client);
      saveWorks = true;
      expect(await settings.open(b.target)).toBe(true);
      expect(settings.getSnapshot()).toMatchObject({ hostId: 'host-b', slug: 'same-bot' });
      const oldSession = settings.getSnapshot()?.session;
      await settings.close();
      await settings.open(b.target);
      expect(settings.getSnapshot()?.session).not.toBe(oldSession);
      await settings.open(a.target);
      dirty = true;
      decision = 'discard';
      expect(await settings.close()).toBe(true);
      expect(dirty).toBe(false);
    } finally {
      releases.forEach((release) => release());
    }
  });

  it('reads and changes Workspace and approval settings on the captured Host only', async () => {
    const a = fixture('host-a');
    const b = fixture('host-b');
    const grant = {
      id: 'grant',
      workspaceId: 'workspace',
      workspacePath: '/remote',
      workspaceTitle: 'Remote',
      orchestratorWrite: false,
    };
    b.host.methods.set('grants', () => ({ grants: [grant] }));
    b.host.methods.set('grantCreate', () => ({ grant }));
    b.host.methods.set('grantRevoke', () => ({ grant: { ...grant, revokedAt: 'now' } }));
    b.host.methods.set('approvalTemplates', () => ({ templates: [], selected: null }));
    b.host.methods.set('botApprovalTemplateSet', () => ({ bot: { slug: 'same-bot' } }));
    const client = remoteBotSettingsClient(b.target, (id) =>
      id === 'host-b' ? b.client : a.client,
    );
    const settings = botSettings(client, 'same-bot');
    expect(await settings.loadGrants()).toEqual([grant]);
    await settings.authorizeFolder('/remote', 'workspace');
    await settings.revokeGrant('grant');
    await settings.loadTemplates();
    await settings.setTemplate('cautious');
    expect(b.host.calls.map(({ method }) => method)).toEqual([
      'grants',
      'grantCreate',
      'grantRevoke',
      'approvalTemplates',
      'botApprovalTemplateSet',
    ]);
    expect(b.host.calls.at(-1)?.args).toEqual({ slug: 'same-bot', template: 'cautious' });
    expect(a.host.calls).toEqual([]);
  });

  it('rejects old reads and writes after disconnection or a same-id replacement client', async () => {
    const original = fixture('host-b');
    const replacement = fixture('host-b');
    let current: HostClient | undefined = original.client;
    let resolve: (value: unknown) => void = () => {};
    original.host.methods.set(
      'get',
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const client = remoteBotSettingsClient(original.target, () => current);
    const pending = client.call('get', { slug: 'same-bot' });
    await new Promise<void>((done) => setTimeout(done, 0));
    current = replacement.client;
    resolve({ bot: { slug: 'same-bot' } });
    await expect(pending).rejects.toThrow('remote-bot-settings-unavailable');
    await expect(
      client.call('update', { slug: 'same-bot', patch: { displayName: 'Must not write' } }),
    ).rejects.toThrow('remote-bot-settings-unavailable');
    expect(replacement.host.calls).toEqual([]);
    expect(original.host.calls.map(({ method }) => method)).toEqual(['get']);
    current = original.client;
    original.offline();
    await expect(client.call('update', { slug: 'same-bot' })).rejects.toThrow(
      'remote-bot-settings-unavailable',
    );
  });
});
