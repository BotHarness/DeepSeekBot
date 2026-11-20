import { Context } from '@deepseek-ai/cordis';
import { Peer } from '@deepseek-ai/dsh-client-connection';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { actors, cleanup } from './team-mode-fixtures.js';

afterEach(cleanup);

class NativeProviderKeys extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'nativeProviderKeys', { namespace: 'settings' });
  }
  describe() {
    return { apiKey: 'test-secret-only' };
  }
}

Object.defineProperty(
  NativeProviderKeys.prototype,
  '@deepseek-ai/dsh-typert-protocol/remote-methods',
  {
    value: { version: 1, methods: [{ method: 'describe', invocation: { kind: 'direct' } }] },
  },
);

describe('M3 Host Roles and devices', { timeout: 60_000 }, () => {
  it('refuses every credentials and provider-key method on both existing member devices', async () => {
    const f = await actors();
    const second = await f.team.signIn('bob', 'member-password-1', 'second-device');
    new NativeProviderKeys(f.ctx);
    const ownerPeer = new Peer(f.ctx, { principal: { kind: 'owner' } });
    await expect(
      f.gateway.invoke({ namespace: 'settings', method: 'describe', args: {}, peer: ownerPeer }),
    ).resolves.toEqual({ apiKey: 'test-secret-only' });
    const sensitive = [
      'privateInputStatus',
      'privateInputSubmit',
      'privateInputCancel',
      'privateAccountStatus',
      'privateInputReplace',
      'privateAccountRevoke',
      'privateAccounts',
      'privateMcpServerRemove',
      'privateMcpServerEnable',
      'voiceProviderAdd',
      'voiceProviderRemove',
      'voiceProviderTest',
    ];
    for (const peer of [f.bobLogin.peer, second.peer]) {
      await expect(f.invoke('voiceProviders', {}, peer)).rejects.toMatchObject({
        code: 'voice-unavailable',
      });
      for (const method of sensitive)
        await expect(f.invoke(method, {}, peer), method).rejects.toMatchObject({
          code: 'remote-access/denied',
        });
      await expect(
        f.gateway.invoke({ namespace: 'settings', method: 'describe', args: {}, peer }),
      ).rejects.toMatchObject({ code: 'remote-access/denied' });
    }
  });

  it('lists only the target grants, marks the authenticated grant, and revokes its Peer immediately', async () => {
    const f = await actors();
    const principal = f.bobLogin.peer.principal;
    if (principal.kind !== 'botharness-member') throw new Error('missing grant');
    await expect(
      f.invoke('memberDevices', { humanId: f.human.humanId, currentGrantId: f.aliceLogin.peer.id }),
    ).rejects.toMatchObject({ code: 'gateway/arguments-invalid' });
    expect(await f.invoke('memberDevices', { humanId: f.human.humanId })).toEqual([
      {
        grantId: principal.grantId,
        label: '',
        kind: 'browser',
        createdAt: '2026-11-14T00:00:00.000Z',
        lastSeenAt: '2026-11-14T00:00:00.000Z',
        current: true,
      },
    ]);
    await expect(
      f.invoke('memberDevices', { humanId: f.alice.member.humanId }),
    ).rejects.toMatchObject({
      code: 'permission-required',
      details: { permission: 'members.manage' },
    });
    await expect(
      f.invoke('memberDeviceRevoke', {
        humanId: f.alice.member.humanId,
        grantId: principal.grantId,
      }),
    ).rejects.toMatchObject({ code: 'permission-required' });
    await expect(
      f.invoke('memberDeviceRevoke', { humanId: f.human.humanId, grantId: 'absent' }),
    ).rejects.toMatchObject({ code: 'device-not-found' });
    await f.invoke('memberDeviceRevoke', { humanId: f.human.humanId, grantId: principal.grantId });
    expect(f.bobLogin.peer.signal.aborted).toBe(true);
    expect(f.team.admit(f.bobLogin.token)).toBeUndefined();
    expect(f.team.memberDevices(owner, f.human.humanId)).toEqual([]);
    expect(f.aliceLogin.peer.signal.aborted).toBe(false);
    expect(f.team.member(f.human.humanId)?.deviceCount).toBe(0);
  });

  it('uses the pairing authority to revoke paired devices and excludes revoked rows from counts', async () => {
    const f = await actors();
    f.database.transaction((db) =>
      db
        .prepare(
          `INSERT INTO paired_devices(device_id, name, secret_hash, paired_at, human_id) VALUES ('paired-bob', 'Bob phone', 'hash', ?, ?)`,
        )
        .run('2026-11-14T00:00:00.000Z', f.human.humanId),
    );
    const revoke = vi.fn((deviceId: string) => {
      f.database.transaction((db) =>
        db
          .prepare('UPDATE paired_devices SET revoked_at = ? WHERE device_id = ?')
          .run('2026-11-14T00:00:01.000Z', deviceId),
      );
      return { revoked: true, closedStreams: 1 };
    });
    const off = f.team.bindPairing({ revoke, clearOffers: vi.fn() });
    expect(f.team.member(f.human.humanId)?.deviceCount).toBe(2);
    expect(f.team.memberDevices(f.human, f.human.humanId)).toContainEqual(
      expect.objectContaining({ grantId: 'paired-bob', kind: 'paired-device', label: 'Bob phone' }),
    );
    await f.invoke('memberDeviceRevoke', { humanId: f.human.humanId, grantId: 'paired-bob' });
    expect(revoke).toHaveBeenCalledWith('paired-bob');
    expect(f.team.member(f.human.humanId)?.deviceCount).toBe(1);
    off();
  });
});
