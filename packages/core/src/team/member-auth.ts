import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PeerScope, Principal } from '@deepseek-ai/dsh-typert-protocol';
import { humanContext, type HumanContext } from '../humans/context.js';
import { TeamError } from './error.js';
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  passwordHashSchema,
  strongPassword,
  verifyPassword,
} from './password.js';
import type { MemberPrincipal, TeamService } from './service.js';

export const memberSchema = z.object({
  humanId: z.string(),
  username: z.string(),
  displayName: z.string(),
  status: z.enum(['active', 'suspended', 'deactivated']),
  mustChangePassword: z.coerce.boolean(),
  createdAt: z.string(),
  owner: z.coerce.boolean(),
  roleIds: z.string().transform((value) => z.array(z.string()).parse(JSON.parse(value))),
  deviceCount: z.number().int().nonnegative(),
});
export type TeamMember = z.infer<typeof memberSchema>;
export const fields = `h.human_id AS humanId, COALESCE(c.username, 'owner') AS username,
  h.display_name AS displayName, h.status, COALESCE(c.must_change, 0) AS mustChangePassword,
  h.created_at AS createdAt, h.human_id = (SELECT owner_human_id FROM team_settings) AS owner,
  (SELECT json_group_array(role_id) FROM (SELECT role_id FROM human_roles WHERE human_id = h.human_id ORDER BY role_id)) AS roleIds,
  (SELECT COUNT(*) FROM member_grants g WHERE g.human_id = h.human_id AND g.revoked_at IS NULL) +
  (SELECT COUNT(*) FROM paired_devices d WHERE d.human_id = h.human_id AND d.revoked_at IS NULL) AS deviceCount`;
export function credentialPasswordJson(
  hash: z.infer<typeof passwordHashSchema>,
  ownerIssuerHumanId?: string,
): string {
  return JSON.stringify(ownerIssuerHumanId === undefined ? hash : { ...hash, ownerIssuerHumanId });
}
const grantSchema = z.object({
  grant_id: z.string(),
  human_id: z.string(),
  last_seen_at: z.string(),
});
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export type MemberAuthHost = {
  active: TeamService['active'];
  admit: TeamService['admit'];
  assertRevocationAvailable: TeamService['assertRevocationAvailable'];
  byUsername: TeamService['byUsername'];
  changePassword: TeamService['changePassword'];
  createGrant: TeamService['createGrant'];
  credential: TeamService['credential'];
  db: TeamService['db'];
  device: TeamService['device'];
  deviceGrantResult: TeamService['deviceGrantResult'];
  ensureTob: TeamService['ensureTob'];
  invalidate: TeamService['invalidate'];
  hasCredential: TeamService['hasCredential'];
  isOwner: TeamService['isOwner'];
  limiter: TeamService['limiter'];
  log: TeamService['log'];
  manageTarget: TeamService['manageTarget'];
  member: TeamService['member'];
  memberDevices: TeamService['memberDevices'];
  now: TeamService['now'];
  owner: TeamService['owner'];
  pairing: TeamService['pairing'];
  passwordAttempt: TeamService['passwordAttempt'];
  passwordCaller: TeamService['passwordCaller'];
  peerFactory: TeamService['peerFactory'];
  peers: TeamService['peers'];
  resolve: TeamService['resolve'];
  revoke: TeamService['revoke'];
  revokeMember: TeamService['revokeMember'];
  roles: TeamService['roles'];
  settings: TeamService['settings'];
  spaceProvider: TeamService['spaceProvider'];
  withPasswordCaller: TeamService['withPasswordCaller'];
};

export function byUsername(this: MemberAuthHost, username: string): TeamMember | undefined {
  const row = this.db.read((db) =>
    db
      .prepare(
        `SELECT ${fields} FROM humans h JOIN member_credentials c USING(human_id) WHERE c.username = ?`,
      )
      .get(username),
  );
  return row === undefined ? undefined : memberSchema.parse(row);
}
export function active(
  this: MemberAuthHost,
  member: TeamMember | undefined,
): asserts member is TeamMember {
  if (!member) throw new TeamError('credentials-invalid');
  if (!member.owner && !this.settings().enabled) throw new TeamError('team-mode-off');
  if (member.status !== 'active') throw new TeamError('member-suspended');
}
export function passwordAttempt(this: MemberAuthHost, username: string, ip?: string): void {
  const retry = this.limiter.admit(username, ip);
  if (retry) throw new TeamError('rate-limited', retry);
}
export async function signIn(
  this: MemberAuthHost,
  username: string,
  password: string,
  ip: string,
  device?: { kind: 'paired-device'; name: string; publicKey?: string },
): Promise<{ token: string; member: TeamMember; peer: PeerScope }> {
  if (!this.settings().enabled) throw new TeamError('team-mode-off');
  this.passwordAttempt(username, ip);
  const member = this.byUsername(username);
  const credential = member ? this.credential(member.humanId) : undefined;
  const valid = await verifyPassword(password, credential?.hash ?? DUMMY_PASSWORD_HASH);
  if (!valid || !member) throw new TeamError('credentials-invalid');
  if (this.credential(member.humanId)?.hash.hash !== credential?.hash.hash)
    throw new TeamError('credentials-invalid');
  this.active(this.member(member.humanId));
  this.spaceProvider?.().ensureAccount(member.humanId);
  if (member.owner) await this.ensureTob?.(humanContext(member.humanId));
  if (this.credential(member.humanId)?.hash.hash !== credential?.hash.hash)
    throw new TeamError('credentials-invalid');
  this.active(this.member(member.humanId));
  return { ...this.createGrant(member, device), member };
}

function ownerPasswordEnabled(db: MemberAuthHost['db']): boolean {
  return db.read(
    (db) =>
      db.prepare('SELECT owner_password_sign_in FROM team_settings WHERE singleton = 1').get()
        ?.owner_password_sign_in === 1,
  );
}

export function ownerPasswordSignIn(
  this: MemberAuthHost,
  human: HumanContext,
): { enabled: boolean; username?: string } {
  this.owner(human);
  const username = this.credential(human.humanId)?.username;
  return {
    enabled: ownerPasswordEnabled(this.db),
    ...(username === undefined ? {} : { username }),
  };
}

export async function ownerPasswordSignInSet(
  this: MemberAuthHost,
  human: HumanContext,
  input: { enabled: boolean; username?: string | undefined; password?: string | undefined },
): Promise<{ enabled: boolean; username?: string }> {
  const previous = ownerPasswordSignIn.call(this, human);
  const { enabled, username, password } = input;
  if (enabled && previous.username === undefined) {
    if (username === undefined || password === undefined)
      throw new TeamError('owner-password-required');
    if (!/^[a-z0-9][a-z0-9._-]{1,31}$/u.test(username)) throw new TeamError('username-invalid');
    if (!strongPassword(password)) throw new TeamError('password-weak');
    if (this.byUsername(username)) throw new TeamError('username-taken');
    const hash = await hashPassword(password);
    this.owner(human);
    if (this.hasCredential(human.humanId)) throw new TeamError('invalid-input');
    if (this.byUsername(username)) throw new TeamError('username-taken');
    this.db.transaction(
      (db) => {
        db.prepare('INSERT INTO member_credentials VALUES (?, ?, ?, ?, 0)').run(
          human.humanId,
          username,
          credentialPasswordJson(hash, human.humanId),
          '[]',
        );
        db.prepare('UPDATE team_settings SET owner_password_sign_in = 1 WHERE singleton = 1').run();
      },
      ['team'],
    );
  } else {
    if (username !== undefined || password !== undefined) throw new TeamError('invalid-input');
    if (previous.enabled === enabled) return previous;
    this.db.transaction(
      (db) =>
        db
          .prepare('UPDATE team_settings SET owner_password_sign_in = ? WHERE singleton = 1')
          .run(Number(enabled)),
      ['team'],
    );
  }
  this.invalidate();
  this.log('owner-password-sign-in-changed', { initiator: 'owner', enabled });
  return ownerPasswordSignIn.call(this, human);
}

export async function signInOwnerDevice<T>(
  this: MemberAuthHost,
  username: string,
  password: string,
  ip: string,
  issue: (humanId: string) => T,
): Promise<T> {
  if (!ownerPasswordEnabled(this.db)) throw new TeamError('owner-sign-in-disabled');
  this.passwordAttempt(username, ip);
  const { humanId } = this.roles.ownerContext();
  const credential = this.credential(humanId);
  const matches = credential?.username === username;
  const valid = await verifyPassword(password, matches ? credential.hash : DUMMY_PASSWORD_HASH);
  if (!matches || !valid) throw new TeamError('credentials-invalid');
  if (!ownerPasswordEnabled(this.db)) throw new TeamError('owner-sign-in-disabled');
  if (
    this.roles.ownerContext().humanId !== humanId ||
    this.credential(humanId)?.hash.hash !== credential.hash.hash
  )
    throw new TeamError('credentials-invalid');
  return issue(humanId);
}

export function createGrant(
  this: MemberAuthHost,
  member: TeamMember,
  device?: { kind: 'paired-device'; name: string; publicKey?: string },
): { token: string; peer: PeerScope } {
  this.active(this.member(member.humanId));
  if (!this.peerFactory) throw new TeamError('unavailable');
  const token = randomBytes(32).toString('base64url');
  const grantId = randomUUID();
  const at = new Date(this.now()).toISOString();
  this.db.transaction(
    (db) =>
      db
        .prepare(
          'INSERT INTO member_grants(grant_id, token_hash, human_id, created_at, last_seen_at, revoked_at, kind, device_name, public_key) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)',
        )
        .run(
          grantId,
          tokenHash(token),
          member.humanId,
          at,
          at,
          device?.kind ?? 'browser-session',
          device?.name ?? null,
          device?.publicKey ?? null,
        ),
    ['team'],
  );
  try {
    const peer = this.peerFactory({
      kind: 'botharness-member',
      humanId: member.humanId,
      grantId,
    });
    this.peers.set(grantId, peer);
    this.log('grant-created', { initiator: 'sign-in', humanId: member.humanId, grantId });
    this.invalidate();
    return { token, peer };
  } catch (error) {
    this.db.transaction(
      (db) =>
        db.prepare('UPDATE member_grants SET revoked_at = ? WHERE grant_id = ?').run(at, grantId),
      ['team'],
    );
    this.invalidate();
    throw error;
  }
}
export function createDeviceGrant(
  this: MemberAuthHost,
  humanId: string,
  name: string,
  publicKey?: string,
) {
  const member = this.member(humanId);
  this.active(member);
  if (member.mustChangePassword) throw new TeamError('password-change-required');
  return this.deviceGrantResult(
    this.createGrant(member, {
      kind: 'paired-device',
      name,
      ...(publicKey === undefined ? {} : { publicKey }),
    }),
    member,
  );
}
export function deviceGrantResult(
  this: MemberAuthHost,
  grant: { token: string; peer: PeerScope },
  member: TeamMember,
) {
  if (grant.peer.principal.kind !== 'botharness-member') throw new TeamError('forbidden');
  return {
    deviceId: grant.peer.principal.grantId,
    credential: `member.${grant.token}`,
    humanId: member.humanId,
    displayName: member.displayName,
    mustChangePassword: member.mustChangePassword,
  };
}
export function admitDevice(
  this: MemberAuthHost,
  authorization: string | undefined,
  publicKey?: string,
): PeerScope | undefined {
  if (publicKey !== undefined && !/^[a-f0-9]{64}$/u.test(publicKey)) return undefined;
  const match = /^Device member\.([A-Za-z0-9_-]{43})$/u.exec(authorization ?? '');
  if (!match) return undefined;
  const row = z
    .object({ public_key: z.string().nullable() })
    .optional()
    .parse(
      this.db.read((db) =>
        db
          .prepare(
            "SELECT public_key FROM member_grants WHERE token_hash = ? AND kind = 'paired-device' AND revoked_at IS NULL",
          )
          .get(tokenHash(match[1]!)),
      ),
    );
  if (!row || (publicKey !== undefined && row.public_key !== null && row.public_key !== publicKey))
    return undefined;
  const peer = this.admit(match[1]!);
  if (peer && publicKey !== undefined && row.public_key === null)
    this.db.transaction(
      (db) =>
        db
          .prepare(
            'UPDATE member_grants SET public_key = ? WHERE token_hash = ? AND public_key IS NULL',
          )
          .run(publicKey, tokenHash(match[1]!)),
      ['team'],
    );
  return peer;
}
export function deviceRefusal(
  this: MemberAuthHost,
  authorization: string | undefined,
): 'sign-in-required' | 'member-suspended' {
  const match = /^Device member\.([A-Za-z0-9_-]{43})$/u.exec(authorization ?? '');
  if (!match) return 'sign-in-required';
  const row = z
    .object({ status: z.string() })
    .optional()
    .parse(
      this.db.read((db) =>
        db
          .prepare(
            "SELECT h.status FROM member_grants g JOIN humans h ON h.human_id = g.human_id WHERE g.token_hash = ? AND g.kind = 'paired-device'",
          )
          .get(tokenHash(match[1]!)),
      ),
    );
  return row !== undefined && row.status !== 'active' ? 'member-suspended' : 'sign-in-required';
}
export function device(this: MemberAuthHost, deviceId: string) {
  const row = z
    .object({
      grant_id: z.string(),
      human_id: z.string(),
      device_name: z.string(),
      created_at: z.string(),
      last_seen_at: z.string(),
    })
    .optional()
    .parse(
      this.db.read((db) =>
        db
          .prepare(
            "SELECT grant_id, human_id, device_name, created_at, last_seen_at FROM member_grants WHERE grant_id = ? AND kind = 'paired-device' AND revoked_at IS NULL",
          )
          .get(deviceId),
      ),
    );
  if (
    !row ||
    !this.resolve({ kind: 'botharness-member', humanId: row.human_id, grantId: row.grant_id })
  )
    return undefined;
  return {
    id: row.grant_id,
    humanId: row.human_id,
    name: row.device_name,
    pairedAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  };
}
export function attachDeviceStream(
  this: MemberAuthHost,
  deviceId: string,
  close: () => void,
): () => void {
  const peer = this.peers.get(deviceId);
  if (!peer || peer.signal.aborted || !this.device(deviceId)) {
    close();
    return () => {};
  }
  peer.signal.addEventListener('abort', close, { once: true });
  return () => peer.signal.removeEventListener('abort', close);
}
export function resolve(this: MemberAuthHost, principal: Principal): HumanContext | undefined {
  if (principal.kind !== 'botharness-member') return undefined;
  const row = this.db.read((db) =>
    db
      .prepare(
        'SELECT grant_id, human_id FROM member_grants WHERE grant_id = ? AND human_id = ? AND revoked_at IS NULL',
      )
      .get(principal.grantId, principal.humanId),
  );
  if (!row) return undefined;
  const member = this.member(principal.humanId);
  try {
    this.active(member);
  } catch {
    return undefined;
  }
  return humanContext(principal.humanId);
}
export function admit(this: MemberAuthHost, token: string): PeerScope | undefined {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(token)) return undefined;
  const raw = this.db.read((db) =>
    db
      .prepare(
        'SELECT grant_id, human_id, last_seen_at FROM member_grants WHERE token_hash = ? AND revoked_at IS NULL',
      )
      .get(tokenHash(token)),
  );
  if (!raw) return undefined;
  const grant = grantSchema.parse(raw);
  const principal: MemberPrincipal = {
    kind: 'botharness-member',
    humanId: grant.human_id,
    grantId: grant.grant_id,
  };
  if (!this.resolve(principal)) return undefined;
  let peer = this.peers.get(grant.grant_id);
  if (!peer || peer.signal.aborted) {
    if (!this.peerFactory) return undefined;
    peer = this.peerFactory(principal);
    this.peers.set(grant.grant_id, peer);
  }
  if (Date.parse(grant.last_seen_at) <= this.now() - 60_000)
    this.db.transaction((db) =>
      db
        .prepare('UPDATE member_grants SET last_seen_at = ? WHERE grant_id = ?')
        .run(new Date(this.now()).toISOString(), grant.grant_id),
    );
  return peer;
}
export function assertCall(
  this: MemberAuthHost,
  principal: Principal | undefined,
  method: string,
): void {
  if (principal?.kind !== 'botharness-member') return;
  if (!this.resolve(principal)) throw new TeamError('credentials-invalid');
  if (
    this.member(principal.humanId)?.mustChangePassword &&
    !['teamMode', 'memberPasswordChange'].includes(method)
  )
    throw new TeamError('password-change-required');
}
export async function revoke(this: MemberAuthHost, grantId: string): Promise<void> {
  this.db.transaction(
    (db) =>
      db
        .prepare('UPDATE member_grants SET revoked_at = COALESCE(revoked_at, ?) WHERE grant_id = ?')
        .run(new Date(this.now()).toISOString(), grantId),
    ['team'],
  );
  this.invalidate();
  const peer = this.peers.get(grantId);
  this.peers.delete(grantId);
  await peer?.dispose();
  this.log('grant-revoked', { initiator: 'host', grantId });
}
export async function asMember<T>(
  this: MemberAuthHost,
  username: string,
  run: (peer: PeerScope) => Promise<T>,
): Promise<T> {
  const member = this.byUsername(username);
  this.active(member);
  const { peer } = this.createGrant(member);
  if (peer.principal.kind !== 'botharness-member') throw new TeamError('forbidden');
  try {
    return await run(peer);
  } finally {
    await this.revoke(peer.principal.grantId);
  }
}
export async function changePassword(
  this: MemberAuthHost,
  human: HumanContext,
  current: string,
  next: string,
  signOutOthers = true,
): Promise<null> {
  const caller = this.passwordCaller.getStore();
  const assertCaller = () => {
    if (caller && this.resolve(caller.principal)?.humanId !== human.humanId)
      throw new TeamError('credentials-invalid');
  };
  assertCaller();
  const member = this.member(human.humanId);
  if (!member) throw new TeamError('credentials-invalid');
  this.passwordAttempt(member.username, caller?.ip);
  const previous = this.credential(human.humanId);
  if (!previous || !(await verifyPassword(current, previous.hash)))
    throw new TeamError('credentials-invalid');
  if (!strongPassword(next)) throw new TeamError('password-weak');
  for (const hash of [previous.hash, ...previous.history])
    if (await verifyPassword(next, hash)) throw new TeamError('password-reused');
  const hash = await hashPassword(next);
  if (this.credential(human.humanId)?.hash.hash !== previous.hash.hash)
    throw new TeamError('credentials-invalid');
  assertCaller();
  const keepGrant = caller?.principal.grantId;
  const revokeOthers = previous.mustChange || signOutOthers;
  if (revokeOthers) this.assertRevocationAvailable([member], keepGrant);
  this.db.transaction(
    (db) => {
      db.prepare(
        'UPDATE member_credentials SET password_json = ?, history_json = ?, must_change = 0 WHERE human_id = ?',
      ).run(
        credentialPasswordJson(hash, previous.ownerIssuerHumanId),
        JSON.stringify([previous.hash, ...previous.history]),
        human.humanId,
      );
      if (revokeOthers)
        db.prepare(
          'UPDATE member_grants SET revoked_at = ? WHERE human_id = ? AND revoked_at IS NULL AND (? IS NULL OR grant_id != ?)',
        ).run(
          new Date(this.now()).toISOString(),
          human.humanId,
          keepGrant ?? null,
          keepGrant ?? null,
        );
    },
    ['team'],
  );
  this.invalidate();
  if (revokeOthers) await this.revokeMember(human.humanId, keepGrant);
  return null;
}
export function withPasswordCaller<T>(
  this: MemberAuthHost,
  principal: MemberPrincipal,
  ip: string | undefined,
  run: () => Promise<T>,
): Promise<T> {
  const current = this.passwordCaller.getStore();
  const inheritedIp =
    current?.principal.grantId === principal.grantId &&
    current.principal.humanId === principal.humanId
      ? current.ip
      : undefined;
  return this.passwordCaller.run({ principal, ip: ip ?? inheritedIp }, run);
}
export async function changeWebPassword(
  this: MemberAuthHost,
  principal: Principal,
  current: string,
  next: string,
  ip: string,
  signOutOthers = true,
): Promise<null> {
  const human = this.resolve(principal);
  const member = human ? this.member(human.humanId) : undefined;
  if (!human || !member || principal.kind !== 'botharness-member')
    throw new TeamError('credentials-invalid');
  return this.withPasswordCaller(principal, ip, () =>
    this.changePassword(human, current, next, signOutOthers),
  );
}
export async function resetPassword(
  this: MemberAuthHost,
  human: HumanContext,
  humanId: string,
): Promise<{ initialPassword: string }> {
  this.manageTarget(human, humanId);
  if (!this.member(humanId) || !this.credential(humanId)) throw new TeamError('member-not-found');
  this.assertRevocationAvailable([this.manageTarget(human, humanId)]);
  const initialPassword = randomBytes(18).toString('base64url');
  const hash = await hashPassword(initialPassword);
  this.manageTarget(human, humanId);
  this.assertRevocationAvailable([this.manageTarget(human, humanId)]);
  const previous = this.credential(humanId);
  if (!this.member(humanId) || !previous) throw new TeamError('member-not-found');
  this.db.transaction(
    (db) => {
      db.prepare(
        'UPDATE member_credentials SET password_json = ?, history_json = ?, must_change = 1 WHERE human_id = ?',
      ).run(
        credentialPasswordJson(hash, this.isOwner(human) ? human.humanId : undefined),
        JSON.stringify([previous.hash, ...previous.history]),
        humanId,
      );
      db.prepare(
        'UPDATE member_grants SET revoked_at = ? WHERE human_id = ? AND revoked_at IS NULL',
      ).run(new Date(this.now()).toISOString(), humanId);
    },
    ['team'],
  );
  this.invalidate();
  await this.revokeMember(humanId);
  return { initialPassword };
}
export function memberDevices(
  this: MemberAuthHost,
  human: HumanContext,
  humanId: string,
  currentGrantId?: string,
) {
  if (human.humanId !== humanId) this.roles.require(human, 'members.manage');
  return z
    .array(
      z.object({
        grantId: z.string(),
        label: z.string(),
        kind: z.enum(['browser', 'paired-device']),
        createdAt: z.string(),
        lastSeenAt: z.string(),
        current: z.coerce.boolean(),
      }),
    )
    .parse(
      this.db.read((db) =>
        db
          .prepare(`
      SELECT grant_id AS grantId, COALESCE(device_name, '') AS label,
        CASE kind WHEN 'paired-device' THEN 'paired-device' ELSE 'browser' END AS kind,
        created_at AS createdAt,
        last_seen_at AS lastSeenAt, grant_id = ? AS current FROM member_grants
        WHERE human_id = ? AND revoked_at IS NULL
      UNION ALL
      SELECT device_id AS grantId, name AS label, 'paired-device' AS kind, paired_at AS createdAt,
        COALESCE(last_seen_at, paired_at) AS lastSeenAt, device_id = ? AS current FROM paired_devices
        WHERE human_id = ? AND revoked_at IS NULL
      ORDER BY createdAt, grantId`)
          .all(currentGrantId ?? '', humanId, currentGrantId ?? '', humanId),
      ),
    );
}
export async function memberDeviceRevoke(
  this: MemberAuthHost,
  human: HumanContext,
  humanId: string,
  grantId: string,
): Promise<null> {
  if (human.humanId !== humanId) this.roles.require(human, 'members.manage');
  const device = this.memberDevices(human, humanId).find((entry) => entry.grantId === grantId);
  if (!device) throw new TeamError('device-not-found');
  if (
    this.db.read((db) =>
      db
        .prepare('SELECT 1 FROM member_grants WHERE grant_id = ? AND human_id = ?')
        .get(grantId, humanId),
    )
  )
    await this.revoke(grantId);
  else {
    if (!this.pairing) throw new TeamError('unavailable');
    this.pairing.revoke(grantId);
    this.invalidate();
  }
  return null;
}
export async function disposePeers(
  this: MemberAuthHost,
  humanId?: string,
  keepGrant?: string,
): Promise<void> {
  const disposals: Promise<void>[] = [];
  for (const [id, peer] of this.peers) {
    if (id === keepGrant) continue;
    if (
      humanId &&
      peer.principal.kind === 'botharness-member' &&
      peer.principal.humanId !== humanId
    )
      continue;
    this.peers.delete(id);
    try {
      disposals.push(peer.dispose());
    } catch (error) {
      disposals.push(
        Promise.reject(error instanceof Error ? error : new Error(String(error), { cause: error })),
      );
    }
  }
  const settled = await Promise.allSettled(disposals);
  const failure = settled.find((result) => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
  if (disposals.length) this.log('peers-disposed', { initiator: 'host', count: disposals.length });
}
