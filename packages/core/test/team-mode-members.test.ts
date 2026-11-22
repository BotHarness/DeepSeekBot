import { Peer } from '@deepseek-ai/dsh-client-connection';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { TeamError } from '../src/team/service.js';
import { ARGON2_PARAMS, hashPassword, verifyPassword } from '../src/team/password.js';
import * as passwords from '../src/team/password.js';
import { SignInRateLimit } from '../src/team/rate-limit.js';
import { MEMBER_BOT_IMPORT_METHODS } from '../src/team/member-methods.js';
import { resolveInvocationHuman } from '../src/bridge/rpc.js';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { teamFixture, enabledFixture, NativeSession, cleanup } from './team-mode-fixtures.js';

afterEach(cleanup);

describe('Host members', { timeout: 60_000 }, () => {
  it('admits an owner call from a DSH release whose peers carry no principal', async () => {
    const f = await enabledFixture();
    expect(() => f.team.assertCall(undefined, 'create')).not.toThrow();
  });

  it('exposes only audience names through the Gateway to manageShared without member or role management', async () => {
    const f = await enabledFixture();
    const role = f.team.roles.create(owner, 'Space manager', ['workspaces.manageShared']).role;
    f.team.roles.set(owner, f.human.humanId, [role.roleId]);
    await f.team.changePassword(f.human, f.initialPassword, 'bob-password-2', false);
    const login = await f.team.signIn('bob', 'bob-password-2', 'ip');
    const call = (method: string, peer = login.peer) =>
      f.gateway.invoke({ namespace: 'botharness', method, args: {}, peer });
    const directory = z
      .object({
        roles: z.array(
          z
            .object({
              roleId: z.string(),
              name: z.string(),
              builtin: z.enum(['admin', 'member']).nullable(),
            })
            .strict(),
        ),
        members: z.array(z.object({ humanId: z.string(), displayName: z.string() }).strict()),
      })
      .strict()
      .parse(await call('spaceAudienceDirectory'));
    expect(directory.roles).toContainEqual({
      roleId: role.roleId,
      name: 'Space manager',
      builtin: null,
    });
    expect(directory.roles.map((item) => item.builtin)).toEqual(
      expect.arrayContaining(['admin', 'member']),
    );
    expect(directory.members).toContainEqual({ humanId: f.human.humanId, displayName: 'Bob' });
    await expect(call('members')).rejects.toMatchObject({ code: 'permission-required' });
    await expect(call('roles')).rejects.toMatchObject({ code: 'permission-required' });
    expect(
      await call('spaceAudienceDirectory', new Peer(f.ctx, { principal: { kind: 'owner' } })),
    ).toEqual(directory);
    const deniedRole = f.team.roles.create(owner, 'No spaces', []).role;
    f.team.roles.set(owner, f.human.humanId, [deniedRole.roleId]);
    const next = await f.team.signIn('bob', 'bob-password-2', 'ip');
    await expect(call('spaceAudienceDirectory', next.peer)).rejects.toMatchObject({
      code: 'permission-required',
      details: { permission: 'workspaces.manageShared' },
    });
  });

  it('recovers a committed member only as Owner and revokes every previous grant', async () => {
    const f = await enabledFixture();
    const login = await f.team.signIn('bob', f.initialPassword, 'ip');
    await expect(f.team.resetPassword(f.human, f.human.humanId)).rejects.toMatchObject({
      code: 'permission-required',
      details: { permission: 'members.manage' },
    });
    await expect(f.team.resetPassword(owner, owner.humanId)).rejects.toMatchObject({
      code: 'owner-protected',
    });
    await expect(f.team.resetPassword(owner, 'missing-member')).rejects.toMatchObject({
      code: 'member-not-found',
    });
    const reset = await f.gateway.invoke({
      namespace: 'botharness',
      method: 'memberPasswordReset',
      args: { humanId: f.human.humanId },
      peer: new Peer(f.ctx, { principal: { kind: 'owner' } }),
    });
    const result = z.object({ initialPassword: z.string() }).strict().parse(reset);
    expect(login.peer.signal.aborted).toBe(true);
    expect(f.team.admit(login.token)).toBeUndefined();
    expect(f.team.member(f.human.humanId)?.mustChangePassword).toBe(true);
    await expect(f.team.signIn('bob', f.initialPassword, 'another')).rejects.toMatchObject({
      code: 'credentials-invalid',
    });
    const fresh = await f.team.signIn('bob', result.initialPassword, 'another');
    expect(fresh.member.humanId).toBe(f.human.humanId);
    await expect(
      f.gateway.invoke({
        namespace: 'botharness',
        method: 'memberPasswordReset',
        args: { humanId: f.human.humanId },
        peer: fresh.peer,
      }),
    ).rejects.toMatchObject({ code: 'remote-access/denied' });
  });

  it.each(['reset', 'change'] as const)(
    'refuses a sign-in verified before a concurrent credential %s',
    async (kind) => {
      const f = await enabledFixture();
      let release!: () => void;
      let verified!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const reached = new Promise<void>((resolve) => {
        verified = resolve;
      });
      const realVerify = passwords.verifyPassword;
      let first = true;
      vi.spyOn(passwords, 'verifyPassword').mockImplementation(async (password, hash) => {
        const valid = await realVerify(password, hash);
        if (first) {
          first = false;
          verified();
          await held;
        }
        return valid;
      });
      const signIn = f.team.signIn('bob', f.initialPassword, 'ip');
      const refused = expect(signIn).rejects.toMatchObject({ code: 'credentials-invalid' });
      await reached;
      try {
        if (kind === 'reset') await f.team.resetPassword(owner, f.human.humanId);
        else await f.team.changePassword(f.human, f.initialPassword, 'changed-password-1');
      } finally {
        release();
      }
      await refused;
      expect(f.peers).toHaveLength(0);
    },
  );

  it('preserves only the changing initial-password grant and shares the account limiter for RPC', async () => {
    const f = await enabledFixture();
    const first = await f.team.signIn('bob', f.initialPassword, 'ip-a');
    const other = await f.team.signIn('bob', f.initialPassword, 'ip-b');
    await f.gateway.invoke({
      namespace: 'botharness',
      method: 'memberPasswordChange',
      args: { current: f.initialPassword, next: 'member-password-1' },
      peer: first.peer,
    });
    expect(first.peer.signal.aborted).toBe(false);
    expect(f.team.admit(first.token)).toBe(first.peer);
    expect(other.peer.signal.aborted).toBe(true);
    expect(f.team.admit(other.token)).toBeUndefined();
    for (let i = 0; i < 2; i++)
      await expect(
        f.gateway.invoke({
          namespace: 'botharness',
          method: 'memberPasswordChange',
          args: { current: 'wrong-password', next: 'member-password-2' },
          peer: first.peer,
        }),
      ).rejects.toMatchObject({ code: 'credentials-invalid' });
    await expect(
      f.gateway.invoke({
        namespace: 'botharness',
        method: 'memberPasswordChange',
        args: { current: 'wrong-password', next: 'member-password-2' },
        peer: first.peer,
      }),
    ).rejects.toMatchObject({ code: 'rate-limited' });
    const carol = await f.team.createMember(owner, 'carol', 'Carol');
    const login = await f.team.signIn('carol', carol.initialPassword, 'ip-c');
    await expect(
      f.gateway.invoke({
        namespace: 'botharness',
        method: 'memberPasswordChange',
        args: { current: carol.initialPassword, next: 'carol-password-1' },
        peer: login.peer,
      }),
    ).resolves.toBe(null);
  });
  it('does not let an IP-limited attacker consume buckets for unrelated accounts', () => {
    const limiter = new SignInRateLimit(() => 0);
    for (let i = 0; i < 20; i++) expect(limiter.admit(`seed-${i}`, 'attacker')).toBe(0);
    for (let i = 0; i < 5000; i++) expect(limiter.admit(`spam-${i}`, 'attacker')).toBe(60);
    expect(limiter.admit('unrelated-member', 'other-ip')).toBe(0);
  });
  it('hashes with Argon2id and random salts, verifies without retaining a plaintext password', async () => {
    const a = await hashPassword('member-password-1');
    const b = await hashPassword('member-password-1');
    expect(a).toMatchObject({ algorithm: 'argon2id', params: ARGON2_PARAMS });
    expect(a.salt).not.toBe(b.salt);
    expect(await verifyPassword('member-password-1', a)).toBe(true);
    expect(await verifyPassword('different-password', a)).toBe(false);
    expect(JSON.stringify(a)).not.toContain('member-password-1');
  });

  it('limits usernames across IPs and IPs across usernames, without forgetting full buckets', () => {
    let now = 0;
    const byUsername = new SignInRateLimit(() => now);
    for (let i = 0; i < 5; i++) expect(byUsername.admit('bob', String(i))).toBe(0);
    expect(byUsername.admit('bob', 'another-ip')).toBe(60);
    const byIp = new SignInRateLimit(() => now);
    for (let i = 0; i < 20; i++) expect(byIp.admit(String(i), 'one-ip')).toBe(0);
    expect(byIp.admit('fresh-user', 'one-ip')).toBe(60);
    now = 60_000;
    expect(byUsername.admit('bob', 'another-ip')).toBe(0);
    expect(byIp.admit('fresh-user', 'one-ip')).toBe(0);
  });

  it('requires an Owner password and rejects invalid or duplicate usernames and non-Owner management', async () => {
    const f = teamFixture();
    await expect(f.team.setMode(owner, true)).rejects.toMatchObject({
      code: 'owner-password-required',
    });
    await expect(f.team.setOwnerPassword(owner, 'short')).rejects.toMatchObject({
      code: 'password-weak',
    });
    await f.team.setOwnerPassword(owner, 'owner-password-1');
    await expect(
      f.team.setOwnerPassword(owner, 'owner-password-2', 'wrong-password'),
    ).rejects.toMatchObject({ code: 'credentials-invalid' });
    await f.team.setMode(owner, true);
    await expect(f.team.createMember(owner, 'B', 'Bob')).rejects.toMatchObject({
      code: 'username-invalid',
    });
    const created = await f.team.createMember(owner, 'bob', 'Bob');
    await expect(f.team.createMember(owner, 'bob', 'Another Bob')).rejects.toMatchObject({
      code: 'username-taken',
    });
    expect(() => f.team.members(humanContext(created.member.humanId))).toThrow(
      'permission-required',
    );
    expect(f.team.members(owner)).toHaveLength(2);
    const stored = f.database.read((db) =>
      db.prepare('SELECT password_json FROM member_credentials WHERE username = ?').get('bob'),
    );
    expect(JSON.stringify(stored)).not.toContain(created.initialPassword);
  });

  it('answers identically for an unknown user and a wrong password and rate limits both', async () => {
    const f = await enabledFixture();
    const unknown = await f.team
      .signIn('nobody', 'wrong-password', 'ip-a')
      .catch((error: unknown) => error);
    const wrong = await f.team
      .signIn('bob', 'wrong-password', 'ip-b')
      .catch((error: unknown) => error);
    expect(unknown).toBeInstanceOf(TeamError);
    expect(wrong).toMatchObject({ code: 'credentials-invalid', message: 'credentials-invalid' });
    expect(unknown).toMatchObject({ code: 'credentials-invalid', message: 'credentials-invalid' });
    for (let i = 0; i < 4; i++)
      await f.team.signIn('nobody', 'wrong-password', 'ip-a').catch(() => {});
    await expect(f.team.signIn('nobody', 'wrong-password', 'ip-a')).rejects.toMatchObject({
      code: 'rate-limited',
      retryAfterSeconds: 60,
    });
  });

  it('enforces first-password change and history, then denies native methods while allowing public browsing', async () => {
    const f = await enabledFixture();
    new NativeSession(f.ctx);
    const login = await f.team.signIn('bob', f.initialPassword, 'ip');
    expect(resolveInvocationHuman(login.peer, undefined, f.team)).toEqual(f.human);
    const invoke = (method: string, args = {}) =>
      f.gateway.invoke({ namespace: 'botharness', method, args, peer: login.peer });
    await expect(invoke('teamMode')).resolves.toMatchObject({
      viewer: { kind: 'member', mustChangePassword: true },
    });
    await expect(invoke('channels')).rejects.toMatchObject({
      code: 'remote-access/denied',
      details: { reason: 'password-change-required' },
    });
    await expect(
      invoke('memberPasswordChange', { current: 'wrong-password', next: 'member-password-1' }),
    ).rejects.toMatchObject({ code: 'credentials-invalid' });
    await expect(
      invoke('memberPasswordChange', { current: f.initialPassword, next: 'short' }),
    ).rejects.toMatchObject({ code: 'password-weak' });
    await invoke('memberPasswordChange', { current: f.initialPassword, next: 'member-password-1' });
    await expect(
      invoke('memberPasswordChange', { current: 'member-password-1', next: f.initialPassword }),
    ).rejects.toMatchObject({ code: 'password-reused' });
    await expect(invoke('channels')).resolves.toMatchObject({ channels: [] });
    await expect(
      f.gateway.invoke({ namespace: 'session', method: 'list', args: {}, peer: login.peer }),
    ).rejects.toMatchObject({ code: 'remote-access/denied', details: { reason: 'no-allow' } });
    const ownerPeer = new Peer(f.ctx, { principal: { kind: 'owner' } });
    await expect(
      f.gateway.invoke({ namespace: 'session', method: 'list', args: {}, peer: ownerPeer }),
    ).resolves.toEqual({ sessions: ['owner-session'] });
  });

  it('auto-joins every viewable Channel on create, grant and re-enable and leaves at once on revoke', async () => {
    const f = await enabledFixture();
    const members = (id: string) =>
      f.channels
        .listHumanMembers(owner, id)
        .map((member) => member.humanId)
        .sort();
    const finance = f.team.roles.create(owner, 'Finance', []).role;
    const lobby = f.channels.createGroup(owner, { name: 'Lobby', members: [] });
    const books = f.channels.createGroup(owner, { name: 'Books', members: [] });
    const secret = f.channels.createGroup(owner, { name: 'Secret', members: [] });
    f.team.setPublic(owner, lobby.id, true);
    f.team.channelAccess.visibilitySet(owner, books.id, {
      kind: 'roles',
      roleIds: [finance.roleId],
    });
    const ownerId = f.team.ownerContext().humanId;
    expect(members(lobby.id)).toEqual([ownerId, f.human.humanId].sort());
    expect(members(books.id)).toEqual([ownerId]);
    expect(members(secret.id)).toEqual([ownerId]);
    const carol = await f.team.createMember(owner, 'carol', 'Carol', [finance.roleId]);
    expect(members(lobby.id)).toContain(carol.member.humanId);
    expect(members(books.id)).toContain(carol.member.humanId);
    f.team.roles.set(owner, f.human.humanId, ['member', finance.roleId]);
    expect(members(books.id)).toContain(f.human.humanId);
    expect(f.team.channelAccess.visibleIds(f.human)).toEqual(new Set([lobby.id, books.id]));
    f.team.roles.set(owner, f.human.humanId, ['member']);
    expect(members(books.id)).not.toContain(f.human.humanId);
    expect(f.team.channelAccess.canRead(f.human, books.id)).toBe(false);
    await f.team.setMode(owner, false);
    const later = f.channels.createGroup(owner, { name: 'Later', members: [] });
    f.team.setPublic(owner, later.id, true);
    await f.team.setMode(owner, true);
    expect(members(later.id)).toEqual([ownerId, f.human.humanId, carol.member.humanId].sort());
    f.team.setPublic(owner, lobby.id, false);
    expect(members(lobby.id)).toEqual([ownerId]);
    expect(f.team.channelAccess.canRead(f.human, lobby.id)).toBe(false);
  });
  it('auto-joins only public groups, isolates reads and records each message author and Source Event Human', async () => {
    const f = await enabledFixture();
    const group = f.channels.createGroup(owner, { name: 'Public', members: [] });
    const privateGroup = f.channels.createGroup(owner, { name: 'Private', members: [] });
    expect(f.channels.listHumanMembers(owner, group.id)).toHaveLength(1);
    f.team.setPublic(owner, group.id, true);
    expect(f.channels.listHumanMembers(owner, group.id)).toHaveLength(2);
    await f.team.changePassword(f.human, f.initialPassword, 'member-password-1');
    const login = await f.team.signIn('bob', 'member-password-1', 'ip');
    const invoke = (method: string, args = {}) =>
      f.gateway.invoke({ namespace: 'botharness', method, args, peer: login.peer });
    await expect(invoke('channelMessages', { channelId: privateGroup.id })).rejects.toMatchObject({
      code: 'remote-access/denied',
    });
    await expect(invoke('channels')).resolves.toMatchObject({ channels: [{ id: group.id }] });
    const sent = await invoke('channelSend', { channelId: group.id, body: 'Hello from Bob' });
    expect(sent).toMatchObject({
      message: { author: { kind: 'human', humanId: f.human.humanId, displayName: 'Bob' } },
    });
    expect(
      f.database.read((db) =>
        db.prepare("SELECT human_id FROM source_events WHERE body = 'Hello from Bob'").get(),
      ),
    ).toMatchObject({ human_id: f.human.humanId });
    expect(f.channels.readMessages(group.id)[0]?.author).toMatchObject({
      humanId: f.human.humanId,
      displayName: 'Bob',
    });
    expect(f.channels.listHumanMembers(owner, privateGroup.id)).toHaveLength(1);
  });

  it('revokes only one signed-out grant and disposes all member Peers on suspension or Team mode off', async () => {
    const f = await enabledFixture();
    const a = await f.team.signIn('bob', f.initialPassword, 'ip-a');
    const b = await f.team.signIn('bob', f.initialPassword, 'ip-b');
    if (a.peer.principal.kind !== 'botharness-member') throw new Error('member principal required');
    await f.team.revoke(a.peer.principal.grantId);
    expect(a.peer.signal.aborted).toBe(true);
    expect(f.team.admit(a.token)).toBeUndefined();
    expect(f.team.admit(b.token)).toBe(b.peer);
    const committed = f.db.diagnostics().metrics.transactionsCommitted;
    for (let i = 0; i < 20; i++) expect(f.team.admit(b.token)).toBe(b.peer);
    expect(f.db.diagnostics().metrics.transactionsCommitted).toBe(committed);
    await f.team.suspend(owner, f.human.humanId);
    expect(b.peer.signal.aborted).toBe(true);
    await expect(f.team.signIn('bob', f.initialPassword, 'ip-a')).rejects.toMatchObject({
      code: 'member-suspended',
    });
    const carol = await f.team.createMember(owner, 'carol', 'Carol');
    const c = await f.team.signIn('carol', carol.initialPassword, 'ip-c');
    await f.team.setMode(owner, false);
    expect(c.peer.signal.aborted).toBe(true);
    expect(f.team.resolve(c.peer.principal)).toBeUndefined();
    await expect(f.team.signIn('carol', carol.initialPassword, 'ip-c')).rejects.toMatchObject({
      code: 'team-mode-off',
    });
    expect(f.team.mode(owner)).toMatchObject({ enabled: false, viewer: { kind: 'owner' } });
    await f.team.setMode(owner, true);
    expect(f.team.admit(c.token)).toBeUndefined();
    expect(f.team.members(owner)).toHaveLength(3);
  });
});

describe('M13 creation permission through the real member Gateway', () => {
  it('returns the private-creation permission for blank, Git, ZIP and Marketplace entry points', async () => {
    const f = await enabledFixture();
    await f.team.changePassword(f.human, f.initialPassword, 'member-password-1');
    const login = await f.team.signIn('bob', 'member-password-1', 'm13-gateway');
    for (const method of ['create', 'createLookup', ...MEMBER_BOT_IMPORT_METHODS]) {
      await expect(
        f.gateway.invoke({ namespace: 'botharness', method, args: {}, peer: login.peer }),
      ).rejects.toMatchObject({
        code: 'permission-required',
        details: { permission: 'bots.createPrivate' },
      });
    }
    expect(f.registry.list(f.human.humanId)).toEqual([]);
  });
});
