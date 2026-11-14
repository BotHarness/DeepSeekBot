import { TeamRoles } from './roles.js';
import type { DevicePairing } from '../devices/pairing.js';
import { TeamError } from './error.js';
export { TeamError } from './error.js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import type { PeerScope, Principal } from '@deepseek-ai/dsh-typert-protocol';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { humanContext, type HumanContext } from '../humans/context.js';
import type { ChannelStore } from '../channels/store.js';
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  passwordHashSchema,
  strongPassword,
  verifyPassword,
} from './password.js';
import { SignInRateLimit } from './rate-limit.js';
import { memberUrls } from './member-urls.js';

export interface MemberPrincipal {
  readonly kind: 'botharness-member';
  readonly humanId: string;
  readonly grantId: string;
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface PrincipalMap {
    'botharness-member': MemberPrincipal;
  }
}

const memberSchema = z.object({
  humanId: z.string(),
  username: z.string(),
  displayName: z.string(),
  status: z.enum(['active', 'suspended']),
  mustChangePassword: z.coerce.boolean(),
  createdAt: z.string(),
  owner: z.coerce.boolean(),
  roleIds: z.string().transform((value) => z.array(z.string()).parse(JSON.parse(value))),
  deviceCount: z.number().int().nonnegative(),
});
export type TeamMember = z.infer<typeof memberSchema>;
export interface TeamModeView {
  enabled: boolean;
  ownerPasswordSet: boolean;
  insecureHttpAllowed: boolean;
  memberUrls: string[];
  viewer: {
    humanId: string;
    kind: 'owner' | 'member';
    displayName: string;
    mustChangePassword: boolean;
    permissions: string[];
    roleIds: string[];
    owner: boolean;
  };
}
export interface PublicChannel {
  channelId: string;
  name: string;
  description?: string;
  memberCount: number;
  joined: boolean;
}
const fields = `h.human_id AS humanId, COALESCE(c.username, 'owner') AS username,
  h.display_name AS displayName, h.status, COALESCE(c.must_change, 0) AS mustChangePassword,
  h.created_at AS createdAt, h.human_id = (SELECT owner_human_id FROM team_settings) AS owner,
  (SELECT json_group_array(role_id) FROM (SELECT role_id FROM human_roles WHERE human_id = h.human_id ORDER BY role_id)) AS roleIds,
  (SELECT COUNT(*) FROM member_grants g WHERE g.human_id = h.human_id AND g.revoked_at IS NULL) +
  (SELECT COUNT(*) FROM paired_devices d WHERE d.human_id = h.human_id AND d.revoked_at IS NULL) AS deviceCount`;
const credentialPasswordSchema = passwordHashSchema.extend({
  ownerIssuerHumanId: z.string().min(1).optional(),
});
function credentialPasswordJson(
  hash: z.infer<typeof passwordHashSchema>,
  ownerIssuerHumanId?: string,
): string {
  return JSON.stringify(ownerIssuerHumanId === undefined ? hash : { ...hash, ownerIssuerHumanId });
}
const credentialSchema = z.object({
  password_json: z.string(),
  history_json: z.string(),
  must_change: z.coerce.boolean(),
});
const grantSchema = z.object({
  grant_id: z.string(),
  human_id: z.string(),
  last_seen_at: z.string(),
});
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export class TeamService {
  readonly roles: TeamRoles;
  private pairing: Pick<DevicePairing, 'revoke' | 'clearOffers'> | undefined;

  bindPairing(pairing: Pick<DevicePairing, 'revoke' | 'clearOffers'>): () => void {
    this.pairing = pairing;
    return () => {
      this.pairing = undefined;
    };
  }

  ownerContext(): HumanContext {
    return this.roles.ownerContext();
  }
  isOwner(human: HumanContext): boolean {
    return this.roles.isOwner(human);
  }
  private readonly passwordCaller = new AsyncLocalStorage<{
    principal: MemberPrincipal;
    ip: string | undefined;
  }>();
  private readonly peers = new Map<string, PeerScope>();
  private readonly limiter: SignInRateLimit;
  private peerFactory: ((principal: MemberPrincipal) => PeerScope) | undefined;
  private invalidate: () => void = () => {};
  private urls: () => string[] = () => [];
  private readonly now: () => number;
  private readonly log: (phase: string, facts: Record<string, string | number | boolean>) => void;

  constructor(
    private readonly db: OperationalDatabaseModulePort,
    private readonly channels: ChannelStore,
    options: {
      now?: () => number;
      log?: (phase: string, facts: Record<string, string | number | boolean>) => void;
    } = {},
  ) {
    this.roles = new TeamRoles(db, () => this.invalidate());
    this.now = options.now ?? Date.now;
    this.log = options.log ?? (() => {});
    this.limiter = new SignInRateLimit(this.now);
  }

  bindRuntime(runtime: {
    createPeer: (principal: MemberPrincipal) => PeerScope;
    invalidate: () => void;
    urls: () => string[];
  }): () => Promise<void> {
    this.peerFactory = runtime.createPeer;
    this.invalidate = runtime.invalidate;
    this.urls = runtime.urls;
    this.log('carrier-ready', { initiator: 'host' });
    return async () => {
      this.peerFactory = undefined;
      await this.disposePeers();
      this.invalidate();
      this.invalidate = () => {};
      this.urls = () => [];
    };
  }

  private settings() {
    return z
      .object({ enabled: z.coerce.boolean(), insecure_http_allowed: z.coerce.boolean() })
      .parse(
        this.db.read((db) =>
          db
            .prepare('SELECT enabled, insecure_http_allowed FROM team_settings WHERE singleton = 1')
            .get(),
        ),
      );
  }

  member(humanId: string): TeamMember | undefined {
    const row = this.db.read((db) =>
      db
        .prepare(
          `SELECT ${fields} FROM humans h LEFT JOIN member_credentials c USING(human_id) WHERE h.human_id = ?`,
        )
        .get(humanId),
    );
    return row === undefined ? undefined : memberSchema.parse(row);
  }

  members(human: HumanContext): TeamMember[] {
    this.roles.require(human, 'members.manage');
    return z
      .array(memberSchema)
      .parse(
        this.db.read((db) =>
          db
            .prepare(
              `SELECT ${fields} FROM humans h LEFT JOIN member_credentials c USING(human_id) ORDER BY h.created_at, h.human_id`,
            )
            .all(),
        ),
      );
  }

  private hasCredential(humanId: string): boolean {
    return (
      this.db.read((db) =>
        db.prepare('SELECT 1 FROM member_credentials WHERE human_id = ?').get(humanId),
      ) !== undefined
    );
  }

  private credential(humanId: string) {
    const row = this.db.read((db) =>
      db
        .prepare(
          'SELECT password_json, history_json, must_change FROM member_credentials WHERE human_id = ?',
        )
        .get(humanId),
    );
    if (row === undefined) return undefined;
    const parsed = credentialSchema.parse(row);
    const password = credentialPasswordSchema.parse(JSON.parse(parsed.password_json));
    return {
      hash: passwordHashSchema.parse(password),
      ownerIssuerHumanId: password.ownerIssuerHumanId,
      history: z.array(passwordHashSchema).parse(JSON.parse(parsed.history_json)),
      mustChange: parsed.must_change,
    };
  }

  mode(human: HumanContext): TeamModeView {
    const settings = this.settings();
    const member = this.member(human.humanId);
    if (!member) throw new TeamError('credentials-invalid');
    return {
      enabled: settings.enabled,
      insecureHttpAllowed: settings.insecure_http_allowed,
      ownerPasswordSet: this.hasCredential(this.ownerContext().humanId),
      memberUrls: memberUrls(this.urls(), settings.insecure_http_allowed),
      viewer: {
        humanId: member.humanId,
        kind: member.owner ? 'owner' : 'member',
        displayName: member.owner
          ? this.channels.humanIdentity(human).displayName
          : member.displayName,
        mustChangePassword: member.mustChangePassword,
        permissions: this.roles.permissions(human),
        roleIds: member.roleIds,
        owner: member.owner,
      },
    };
  }

  private owner(human: HumanContext): void {
    if (!this.isOwner(human))
      throw new TeamError('permission-required', undefined, { permission: 'owner' });
  }

  async setMode(human: HumanContext, enabled: boolean): Promise<TeamModeView> {
    this.roles.require(human, 'team.settings');
    if (enabled && !this.hasCredential(this.ownerContext().humanId))
      throw new TeamError('owner-password-required');
    this.db.transaction(
      (db) => {
        db.prepare('UPDATE team_settings SET enabled = ? WHERE singleton = 1').run(Number(enabled));
        if (!enabled)
          db.prepare('UPDATE member_grants SET revoked_at = ? WHERE revoked_at IS NULL').run(
            new Date(this.now()).toISOString(),
          );
      },
      ['team'],
    );
    this.invalidate();
    if (!enabled) await this.disposePeers();
    this.log('mode-changed', { initiator: 'owner', enabled });
    return this.mode(human);
  }

  setInsecureHttp(human: HumanContext, allowed: boolean): TeamModeView {
    this.roles.require(human, 'team.settings');
    this.db.transaction(
      (db) =>
        db
          .prepare('UPDATE team_settings SET insecure_http_allowed = ? WHERE singleton = 1')
          .run(Number(allowed)),
      ['team'],
    );
    this.invalidate();
    return this.mode(human);
  }

  async setOwnerPassword(
    human: HumanContext,
    password: string,
    current?: string,
  ): Promise<TeamModeView> {
    this.owner(human);
    const previous = this.credential(human.humanId);
    if (previous && !(await verifyPassword(current ?? '', previous.hash)))
      throw new TeamError('credentials-invalid');
    this.owner(human);
    if (!strongPassword(password)) throw new TeamError('password-weak');
    const hash = await hashPassword(password);
    this.owner(human);
    if (this.credential(human.humanId)?.hash.hash !== previous?.hash.hash)
      throw new TeamError('credentials-invalid');
    this.db.transaction(
      (db) => {
        if (previous)
          db.prepare(
            'UPDATE member_credentials SET password_json = ?, must_change = 0 WHERE human_id = ?',
          ).run(credentialPasswordJson(hash, human.humanId), human.humanId);
        else
          db.prepare("INSERT INTO member_credentials VALUES (?, 'owner', ?, '[]', 0)").run(
            human.humanId,
            credentialPasswordJson(hash, human.humanId),
          );
      },
      ['team'],
    );
    this.invalidate();
    return this.mode(human);
  }

  async createMember(
    human: HumanContext,
    username: string,
    displayName: string,
    roleIds: string[] = ['member'],
  ): Promise<{ member: TeamMember; initialPassword: string }> {
    this.roles.require(human, 'members.manage');
    this.roles.validateAssignments(human, roleIds);
    if (!this.settings().enabled) throw new TeamError('team-mode-off');
    if (!/^[a-z0-9][a-z0-9._-]{1,31}$/u.test(username)) throw new TeamError('username-invalid');
    if (displayName.trim().length === 0 || displayName.length > 128)
      throw new TeamError('invalid-input');
    if (this.byUsername(username)) throw new TeamError('username-taken');
    const initialPassword = randomBytes(18).toString('base64url');
    const hash = await hashPassword(initialPassword);
    const humanId = randomUUID();
    if (!this.settings().enabled) throw new TeamError('team-mode-off');
    if (this.byUsername(username)) throw new TeamError('username-taken');
    this.roles.require(human, 'members.manage');
    const ids = this.roles.validateAssignments(human, roleIds);
    const ownerIssuerHumanId = this.isOwner(human) ? human.humanId : undefined;
    this.db.transaction(
      (db) => {
        db.prepare(`INSERT INTO humans VALUES (?, ?, 'active', ?)`).run(
          humanId,
          displayName.trim(),
          new Date(this.now()).toISOString(),
        );
        db.prepare('INSERT INTO member_credentials VALUES (?, ?, ?, ?, 1)').run(
          humanId,
          username,
          credentialPasswordJson(hash, ownerIssuerHumanId),
          '[]',
        );
        db.prepare('INSERT INTO local_human_names VALUES (?, ?)').run(humanId, displayName.trim());
        for (const id of ids) db.prepare('INSERT INTO human_roles VALUES (?, ?)').run(humanId, id);
      },
      ['team', 'human-identity'],
    );
    this.invalidate();
    return { member: this.member(humanId)!, initialPassword };
  }

  private byUsername(username: string): TeamMember | undefined {
    const row = this.db.read((db) =>
      db
        .prepare(
          `SELECT ${fields} FROM humans h JOIN member_credentials c USING(human_id) WHERE c.username = ?`,
        )
        .get(username),
    );
    return row === undefined ? undefined : memberSchema.parse(row);
  }

  private active(member: TeamMember | undefined): asserts member is TeamMember {
    if (!this.settings().enabled) throw new TeamError('team-mode-off');
    if (!member) throw new TeamError('credentials-invalid');
    if (member.status !== 'active') throw new TeamError('member-suspended');
  }

  private passwordAttempt(username: string, ip?: string): void {
    const retry = this.limiter.admit(username, ip);
    if (retry) throw new TeamError('rate-limited', retry);
  }

  async signIn(
    username: string,
    password: string,
    ip: string,
  ): Promise<{ token: string; member: TeamMember; peer: PeerScope }> {
    if (!this.settings().enabled) throw new TeamError('team-mode-off');
    this.passwordAttempt(username, ip);
    const member = this.byUsername(username);
    const credential = member ? this.credential(member.humanId) : undefined;
    const valid = await verifyPassword(password, credential?.hash ?? DUMMY_PASSWORD_HASH);
    if (!valid || !member) throw new TeamError('credentials-invalid');
    if (this.credential(member.humanId)?.hash.hash !== credential?.hash.hash)
      throw new TeamError('credentials-invalid');
    this.active(member);
    return { ...this.createGrant(member), member };
  }

  private createGrant(member: TeamMember): { token: string; peer: PeerScope } {
    this.active(this.member(member.humanId));
    if (!this.peerFactory) throw new TeamError('unavailable');
    const token = randomBytes(32).toString('base64url');
    const grantId = randomUUID();
    const at = new Date(this.now()).toISOString();
    this.db.transaction(
      (db) =>
        db
          .prepare('INSERT INTO member_grants VALUES (?, ?, ?, ?, ?, NULL)')
          .run(grantId, tokenHash(token), member.humanId, at, at),
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

  resolve(principal: Principal): HumanContext | undefined {
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

  admit(token: string): PeerScope | undefined {
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

  assertCall(principal: Principal, method: string): void {
    if (principal.kind !== 'botharness-member') return;
    if (!this.resolve(principal)) throw new TeamError('credentials-invalid');
    if (
      this.member(principal.humanId)?.mustChangePassword &&
      !['teamMode', 'memberPasswordChange'].includes(method)
    )
      throw new TeamError('password-change-required');
  }

  async revoke(grantId: string): Promise<void> {
    this.db.transaction(
      (db) =>
        db
          .prepare(
            'UPDATE member_grants SET revoked_at = COALESCE(revoked_at, ?) WHERE grant_id = ?',
          )
          .run(new Date(this.now()).toISOString(), grantId),
      ['team'],
    );
    this.invalidate();
    const peer = this.peers.get(grantId);
    this.peers.delete(grantId);
    await peer?.dispose();
    this.log('grant-revoked', { initiator: 'host', grantId });
  }

  async suspend(human: HumanContext, humanId: string): Promise<void> {
    this.owner(human);
    if (humanId === human.humanId) throw new TeamError('forbidden');
    this.db.transaction(
      (db) => {
        db.prepare(`UPDATE humans SET status = 'suspended' WHERE human_id = ?`).run(humanId);
        db.prepare(
          'UPDATE member_grants SET revoked_at = ? WHERE human_id = ? AND revoked_at IS NULL',
        ).run(new Date(this.now()).toISOString(), humanId);
      },
      ['team'],
    );
    this.invalidate();
    await this.disposePeers(humanId);
  }

  async asMember<T>(username: string, run: (peer: PeerScope) => Promise<T>): Promise<T> {
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

  async changePassword(human: HumanContext, current: string, next: string): Promise<null> {
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
    this.db.transaction(
      (db) => {
        db.prepare(
          'UPDATE member_credentials SET password_json = ?, history_json = ?, must_change = 0 WHERE human_id = ?',
        ).run(
          credentialPasswordJson(hash, previous.ownerIssuerHumanId),
          JSON.stringify([previous.hash, ...previous.history]),
          human.humanId,
        );
        if (previous.mustChange)
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
    if (previous.mustChange) await this.disposePeers(human.humanId, keepGrant);
    return null;
  }

  withPasswordCaller<T>(
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

  async changeWebPassword(
    principal: Principal,
    current: string,
    next: string,
    ip: string,
  ): Promise<null> {
    const human = this.resolve(principal);
    const member = human ? this.member(human.humanId) : undefined;
    if (!human || !member || principal.kind !== 'botharness-member')
      throw new TeamError('credentials-invalid');
    return this.withPasswordCaller(principal, ip, () => this.changePassword(human, current, next));
  }

  async resetPassword(human: HumanContext, humanId: string): Promise<{ initialPassword: string }> {
    this.owner(human);
    if (this.isOwner(humanContext(humanId))) throw new TeamError('owner-protected');
    if (!this.member(humanId) || !this.credential(humanId)) throw new TeamError('member-not-found');
    const initialPassword = randomBytes(18).toString('base64url');
    const hash = await hashPassword(initialPassword);
    this.owner(human);
    if (this.isOwner(humanContext(humanId))) throw new TeamError('owner-protected');
    const previous = this.credential(humanId);
    if (!this.member(humanId) || !previous) throw new TeamError('member-not-found');
    this.db.transaction(
      (db) => {
        db.prepare(
          'UPDATE member_credentials SET password_json = ?, history_json = ?, must_change = 1 WHERE human_id = ?',
        ).run(
          credentialPasswordJson(hash, human.humanId),
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
    await this.disposePeers(humanId);
    return { initialPassword };
  }

  publicChannels(human: HumanContext): PublicChannel[] {
    return z
      .array(
        z.object({
          channelId: z.string(),
          name: z.string(),
          memberCount: z.number().int().nonnegative(),
          joined: z.coerce.boolean(),
        }),
      )
      .parse(
        this.db.read((db) =>
          db
            .prepare(`SELECT c.channel_id AS channelId,
        json_extract(c.record_json, '$.name') AS name,
        COALESCE(json_array_length(c.record_json, '$.members'), 0) +
          (SELECT COUNT(*) FROM channel_human_members m WHERE m.channel_id = c.channel_id AND m.left_at IS NULL) AS memberCount,
        EXISTS(SELECT 1 FROM channel_human_members m WHERE m.channel_id = c.channel_id AND m.human_id = ? AND m.left_at IS NULL) AS joined
        FROM channel_records c WHERE c.public = 1 AND json_extract(c.record_json, '$.type') = 'group'
        AND json_extract(c.record_json, '$.deletedAt') IS NULL ORDER BY c.channel_id`)
            .all(human.humanId),
        ),
      );
  }

  joinPublic(human: HumanContext, channelId: string): null {
    const channel = this.channels.get(channelId);
    if (!channel || channel.deletedAt) throw new TeamError('channel-not-found');
    const member = this.member(human.humanId);
    if (!member) throw new TeamError('credentials-invalid');
    if (
      channel.type !== 'group' ||
      !this.db.read((db) =>
        db
          .prepare('SELECT 1 FROM channel_records WHERE channel_id = ? AND public = 1')
          .get(channelId),
      )
    )
      throw new TeamError('channel-not-public');
    this.db.transaction(
      (db) => {
        db.prepare(`INSERT INTO channel_human_members(channel_id, human_id, display_name, visible_from_revision, joined_at)
        VALUES (?, ?, ?, 1, ?) ON CONFLICT(channel_id, human_id) DO UPDATE SET left_at = NULL`).run(
          channelId,
          human.humanId,
          member.displayName,
          new Date(this.now()).toISOString(),
        );
      },
      ['channels', 'team'],
    );
    this.invalidate();
    return null;
  }

  setPublic(human: HumanContext, channelId: string, value: boolean): null {
    this.roles.require(human, 'team.settings');
    const channel = this.channels.get(channelId);
    if (!channel || channel.deletedAt) throw new TeamError('channel-not-found');
    if (channel.type !== 'group') throw new TeamError('channel-not-public');
    this.db.transaction(
      (db) =>
        db
          .prepare('UPDATE channel_records SET public = ? WHERE channel_id = ?')
          .run(Number(value), channelId),
      ['channels', 'team'],
    );
    this.invalidate();
    return null;
  }

  memberDevices(human: HumanContext, humanId: string, currentGrantId?: string) {
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
      SELECT grant_id AS grantId, '' AS label, 'browser' AS kind, created_at AS createdAt,
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

  async memberDeviceRevoke(human: HumanContext, humanId: string, grantId: string): Promise<null> {
    if (human.humanId !== humanId) this.roles.require(human, 'members.manage');
    const device = this.memberDevices(human, humanId).find((entry) => entry.grantId === grantId);
    if (!device) throw new TeamError('device-not-found');
    if (device.kind === 'browser') await this.revoke(grantId);
    else {
      if (!this.pairing) throw new TeamError('unavailable');
      this.pairing.revoke(grantId);
      this.invalidate();
    }
    return null;
  }

  async transferOwner(human: HumanContext, humanId: string, password: string): Promise<null> {
    this.owner(human);
    const previous = this.credential(human.humanId);
    if (!previous || !(await verifyPassword(password, previous.hash)))
      throw new TeamError('credentials-invalid');
    this.owner(human);
    if (this.credential(human.humanId)?.hash.hash !== previous.hash.hash)
      throw new TeamError('credentials-invalid');
    const target = this.member(humanId);
    if (!target) throw new TeamError('member-not-found');
    if (target.status !== 'active') throw new TeamError('member-suspended');
    if (target.owner) throw new TeamError('owner-protected');
    const targetCredential = this.credential(humanId);
    if (targetCredential?.ownerIssuerHumanId !== human.humanId || targetCredential.mustChange)
      throw new TeamError('owner-transfer-target-unverified');
    const oldDevices = this.memberDevices(human, human.humanId).filter(
      (device) => device.kind === 'paired-device',
    );
    if (oldDevices.length && !this.pairing) throw new TeamError('unavailable');
    this.db.transaction(
      (db) => {
        db.prepare('DELETE FROM human_roles WHERE human_id IN (?, ?)').run(human.humanId, humanId);
        db.prepare("INSERT INTO human_roles VALUES (?, 'admin')").run(human.humanId);
        db.prepare('UPDATE team_settings SET owner_human_id = ? WHERE singleton = 1').run(humanId);
      },
      ['team'],
    );
    this.pairing?.clearOffers();
    this.invalidate();
    for (const device of oldDevices) this.pairing?.revoke(device.grantId);
    this.log('owner-transferred', { initiator: 'owner', humanId });
    return null;
  }

  belongs(human: HumanContext, channelId: string): boolean {
    return (
      this.db.read((db) =>
        db
          .prepare(`SELECT 1 FROM channel_human_members m
      JOIN channel_records c USING(channel_id) WHERE m.channel_id = ? AND m.human_id = ?
      AND m.left_at IS NULL AND json_extract(c.record_json, '$.type') = 'group'
      AND json_extract(c.record_json, '$.deletedAt') IS NULL`)
          .get(channelId, human.humanId),
      ) !== undefined
    );
  }

  async disposePeers(humanId?: string, keepGrant?: string): Promise<void> {
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
      disposals.push(peer.dispose());
    }
    await Promise.all(disposals);
    if (disposals.length)
      this.log('peers-disposed', { initiator: 'host', count: disposals.length });
  }
}
