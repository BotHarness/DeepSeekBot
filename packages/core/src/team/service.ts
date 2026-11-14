import { TeamApprovals } from './approvals.js';
import type { UsageProjection } from '../usage/usage.js';
import type { UsageByMemberResult, UsageOverviewPeriod } from '../usage/overview.js';
import { TeamChannels } from './channels.js';
import type { ContentPurge } from '../purge/contracts.js';
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
  status: z.enum(['active', 'suspended', 'deactivated']),
  mustChangePassword: z.coerce.boolean(),
  createdAt: z.string(),
  owner: z.coerce.boolean(),
  roleIds: z.string().transform((value) => z.array(z.string()).parse(JSON.parse(value))),
  deviceCount: z.number().int().nonnegative(),
});
export type TeamMember = z.infer<typeof memberSchema>;
export interface TeamModeView {
  isolation: 'trial' | 'enforced';
  enabled: boolean;
  activeMembers: number;
  suspendedMembers?: number;
  ownerPasswordSet: boolean;
  insecureHttpAllowed: boolean;
  memberUrls: string[];
  viewer: {
    humanId: string;
    kind: 'owner' | 'member';
    displayName: string;
    mustChangePassword: boolean;
    models: import('./permissions.js').ModelsAllowed;
    permissions: string[];
    roleIds: string[];
    owner: boolean;
  };
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
  readonly approvals: TeamApprovals;
  readonly channelAccess: TeamChannels;
  private readonly accessListeners = new Set<() => void>();
  onAccessChanged(listener: () => void): () => void {
    this.accessListeners.add(listener);
    return () => {
      this.accessListeners.delete(listener);
    };
  }
  private pendingAccess: Promise<void> = Promise.resolve();
  accessSettled(): Promise<void> {
    return this.pendingAccess;
  }
  private accessChanged(revoke = false): void {
    this.invalidate();
    if (!revoke) return;
    for (const listener of this.accessListeners) listener();
    this.pairing?.closeStreams?.();
    this.db.transaction(
      (db) =>
        db
          .prepare(
            "INSERT INTO channel_changes(channel_id, message_id, kind) VALUES ('*', NULL, 'channel')",
          )
          .run(),
      ['channel'],
    );
    this.pendingAccess = Promise.allSettled([this.pendingAccess, this.disposePeers()]).then(
      (settled) => {
        if (settled.some((result) => result.status === 'rejected'))
          this.log('access-disposal-failed', { initiator: 'host', reason: 'peer-disposal-failed' });
      },
    );
  }
  private pairing:
    | (Pick<DevicePairing, 'revoke' | 'clearOffers'> & Partial<Pick<DevicePairing, 'closeStreams'>>)
    | undefined;

  bindPairing(
    pairing: Pick<DevicePairing, 'revoke' | 'clearOffers'> &
      Partial<Pick<DevicePairing, 'closeStreams'>>,
  ): () => void {
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
  private readonly purge: ContentPurge | undefined;
  private readonly stopBots: ((slugs: readonly string[]) => Promise<void>) | undefined;
  private readonly peers = new Map<string, PeerScope>();
  private readonly limiter: SignInRateLimit;
  private peerFactory: ((principal: MemberPrincipal) => PeerScope) | undefined;
  private invalidate: () => void = () => {};
  private urls: () => string[] = () => [];
  private readonly ensureTob: ((human: HumanContext) => Promise<unknown>) | undefined;
  private readonly now: () => number;
  private readonly log: (phase: string, facts: Record<string, string | number | boolean>) => void;

  constructor(
    private readonly db: OperationalDatabaseModulePort,
    private readonly channels: ChannelStore,
    options: {
      purge?: ContentPurge;
      stopBots?: (slugs: readonly string[]) => Promise<void>;
      now?: () => number;
      ensureTob?: (human: HumanContext) => Promise<unknown>;
      log?: (phase: string, facts: Record<string, string | number | boolean>) => void;
    } = {},
  ) {
    this.purge = options.purge;
    this.stopBots = options.stopBots;
    this.ensureTob = options.ensureTob;
    this.roles = new TeamRoles(db, (revoke) => this.accessChanged(revoke));
    this.channelAccess = new TeamChannels(db, channels, this.roles, (revoke) =>
      this.accessChanged(revoke),
    );
    this.approvals = new TeamApprovals(db, channels, this.roles);
    channels.bindHumanAccess?.({
      canRead: (human, id) => this.channelAccess.canRead(human, id),
      requirePolicy: (human, id, key) => this.channelAccess.requirePolicy(human, id, key),
      requirePost: (human, id, all, message) => {
        const decision =
          message?.toolApprovalDecision ??
          message?.userQuestionResolution ??
          message?.privateInputResolution;
        if (
          !all &&
          decision?.decidedBy?.humanId === human.humanId &&
          message?.replyTo === decision.requestMessageId
        ) {
          this.approvals.requireRequest(human, id, decision.requestMessageId);
          return;
        }
        const channel = channels.get(id);
        if (channel?.type !== 'group' && !channel?.humanParticipants) return;
        this.channelAccess.requirePolicy(human, id, 'post');
        if (all) this.channelAccess.requirePolicy(human, id, 'mentionAll');
      },
    });
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

  memberByUsername(username: string): TeamMember | undefined {
    const row = this.db.read((db) =>
      db
        .prepare('SELECT human_id FROM member_credentials WHERE username = ? COLLATE NOCASE')
        .get(username),
    );
    return row ? this.member(z.object({ human_id: z.string() }).parse(row).human_id) : undefined;
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

  usageByMember(
    human: HumanContext,
    period: UsageOverviewPeriod,
    usage: Pick<UsageProjection, 'byMember'> | undefined,
    botName: (slug: string) => string,
  ): UsageByMemberResult {
    this.roles.require(human, 'usage.view');
    if (!usage) throw new TeamError('unavailable');
    return usage.byMember(period, this.ownerContext().humanId, botName);
  }

  mode(human: HumanContext): TeamModeView {
    const settings = this.settings();
    const member = this.member(human.humanId);
    if (!member) throw new TeamError('credentials-invalid');
    return {
      isolation: 'trial',
      enabled: settings.enabled,
      activeMembers: this.db.read((db) =>
        Number(
          db
            .prepare(
              "SELECT COUNT(*) AS n FROM humans WHERE status = 'active' AND human_id <> (SELECT owner_human_id FROM team_settings)",
            )
            .get()?.n ?? 0,
        ),
      ),
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
        models: member.owner ? { all: true } : this.roles.modelsAllowed(human),
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
    const ownerId = this.ownerContext().humanId;
    const members = this.membersForMode();
    this.assertRevocationAvailable(members);
    const suspendedMembers = !enabled ? members.filter((m) => m.status === 'active').length : 0;
    this.db.transaction(
      (db) => {
        db.prepare('UPDATE team_settings SET enabled = ? WHERE singleton = 1').run(Number(enabled));
        if (!enabled) {
          db.prepare(`INSERT OR IGNORE INTO team_mode_suspensions
            SELECT human_id, status FROM humans WHERE human_id <> ? AND status IN ('active', 'deactivated')`).run(
            ownerId,
          );
          db.prepare("UPDATE humans SET status = 'suspended' WHERE human_id <> ?").run(ownerId);
          db.prepare(
            'UPDATE member_grants SET revoked_at = ? WHERE human_id <> ? AND revoked_at IS NULL',
          ).run(new Date(this.now()).toISOString(), ownerId);
        } else {
          db.prepare(`UPDATE humans SET status = (SELECT previous_status FROM team_mode_suspensions s WHERE s.human_id = humans.human_id)
            WHERE human_id IN (SELECT human_id FROM team_mode_suspensions) AND human_id <> ?`).run(
            ownerId,
          );
          db.prepare('DELETE FROM team_mode_suspensions').run();
        }
      },
      ['team'],
    );
    this.invalidate();
    if (!enabled) {
      await Promise.all(members.map((member) => this.revokeMember(member.humanId)));
      await this.stopBots?.(
        members.flatMap((member) => this.ownedBots(member.humanId).map((bot) => bot.slug)),
      );
    }

    this.log('mode-changed', { initiator: 'owner', enabled });
    return { ...this.mode(human), suspendedMembers };
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
  ): Promise<{ member: TeamMember; initialPassword: string; isolation: 'trial' | 'enforced' }> {
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
    return { member: this.member(humanId)!, initialPassword, isolation: 'trial' };
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
    if (!member) throw new TeamError('credentials-invalid');
    if (!member.owner && !this.settings().enabled) throw new TeamError('team-mode-off');
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
    this.active(this.member(member.humanId));
    await this.ensureTob?.(humanContext(member.humanId));
    if (this.credential(member.humanId)?.hash.hash !== credential?.hash.hash)
      throw new TeamError('credentials-invalid');
    this.active(this.member(member.humanId));
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

  async changePassword(
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

  async resetPassword(human: HumanContext, humanId: string): Promise<{ initialPassword: string }> {
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

  private manageTarget(human: HumanContext, humanId: string): TeamMember {
    this.roles.requireManagementTarget(human, humanId);
    const member = this.member(humanId);
    if (!member) throw new TeamError('member-not-found');
    return member;
  }

  private membersForMode(): TeamMember[] {
    return this.db
      .read((db) =>
        db
          .prepare(`SELECT ${fields} FROM humans h
      LEFT JOIN member_credentials c USING(human_id)
      WHERE h.human_id <> (SELECT owner_human_id FROM team_settings)`)
          .all(),
      )
      .map((row) => memberSchema.parse(row));
  }

  private pairedIds(humanId: string, keepGrant?: string): string[] {
    return this.db
      .read((db) =>
        db
          .prepare(`SELECT device_id FROM paired_devices
      WHERE human_id = ? AND revoked_at IS NULL AND device_id <> ?`)
          .all(humanId, keepGrant ?? ''),
      )
      .map((row) => String(row.device_id));
  }

  private assertRevocationAvailable(members: readonly TeamMember[], keepGrant?: string): void {
    if (!this.pairing && members.some((member) => this.pairedIds(member.humanId, keepGrant).length))
      throw new TeamError('unavailable');
  }

  private async revokeMember(humanId: string, keepGrant?: string): Promise<void> {
    const ids = this.pairedIds(humanId, keepGrant);
    if (ids.length && !this.pairing) throw new TeamError('unavailable');
    this.db.transaction(
      (db) =>
        db
          .prepare(`UPDATE member_grants SET revoked_at = ?
      WHERE human_id = ? AND revoked_at IS NULL AND grant_id <> ?`)
          .run(new Date(this.now()).toISOString(), humanId, keepGrant ?? ''),
      ['team'],
    );
    for (const id of ids) this.pairing?.revoke(id);
    this.invalidate();
    await this.disposePeers(humanId, keepGrant);
  }

  async deactivate(human: HumanContext, humanId: string): Promise<null> {
    const member = this.manageTarget(human, humanId);
    this.assertRevocationAvailable([member]);
    this.db.transaction(
      (db) => {
        db.prepare("UPDATE humans SET status = 'deactivated' WHERE human_id = ?").run(humanId);
        db.prepare('DELETE FROM team_mode_suspensions WHERE human_id = ?').run(humanId);
      },
      ['team'],
    );
    await this.revokeMember(humanId);
    await this.stopBots?.(this.ownedBots(humanId).map((bot) => bot.slug));
    this.log('member-deactivated', { initiator: human.humanId, humanId });
    return null;
  }

  async reactivate(human: HumanContext, humanId: string): Promise<null> {
    const member = this.manageTarget(human, humanId);
    if (!this.settings().enabled) throw new TeamError('team-mode-off');
    this.assertRevocationAvailable([member]);
    await this.revokeMember(humanId);
    this.manageTarget(human, humanId);
    if (!this.settings().enabled) throw new TeamError('team-mode-off');
    this.db.transaction(
      (db) => {
        db.prepare("UPDATE humans SET status = 'active' WHERE human_id = ?").run(humanId);
        db.prepare('DELETE FROM team_mode_suspensions WHERE human_id = ?').run(humanId);
      },
      ['team'],
    );
    this.invalidate();
    return null;
  }

  private ownedBots(humanId: string, transferable = false) {
    return z.array(z.object({ slug: z.string(), displayName: z.string() })).parse(
      this.db.read((db) =>
        db
          .prepare(`SELECT b.slug, json_extract(b.body, '$.displayName') AS displayName FROM persona_bots b
        WHERE b.owner_human_id = ?
        ${transferable ? 'AND NOT EXISTS (SELECT 1 FROM persona_bot_deletions d WHERE d.slug = b.slug) AND NOT EXISTS (SELECT 1 FROM tob_identity t WHERE t.bot_slug = b.slug)' : ''}
        ORDER BY b.slug`)
          .all(humanId),
      ),
    );
  }

  transferPreview(human: HumanContext, humanId: string) {
    this.manageTarget(human, humanId);
    const channels = z.array(z.object({ channelId: z.string(), name: z.string() })).parse(
      this.db.read((db) =>
        db
          .prepare(`SELECT channel_id AS channelId,
        json_extract(record_json, '$.name') AS name FROM channel_records
        WHERE json_extract(record_json, '$.type') = 'group'
        AND owner_human_id = ?
        ORDER BY channel_id`)
          .all(humanId),
      ),
    );
    const bots = this.ownedBots(humanId, true);
    return { channels, bots };
  }

  async transfer(human: HumanContext, humanId: string, toHumanId: string): Promise<null> {
    this.manageTarget(human, humanId);
    const target = this.member(toHumanId);
    if (!target) throw new TeamError('member-not-found');
    if (target.humanId === humanId || (!target.owner && target.status !== 'active'))
      throw new TeamError('transfer-target-invalid');
    const preview = this.transferPreview(human, humanId);
    const transferred = JSON.stringify(preview.channels.map((channel) => channel.channelId));
    this.db.transaction(
      (db) => {
        db.prepare(`UPDATE persona_bots SET owner_human_id = ?, body = json_set(body, '$.ownerHumanId', ?)
          WHERE slug IN (SELECT value FROM json_each(?)) AND owner_human_id = ?`).run(
          toHumanId,
          toHumanId,
          JSON.stringify(preview.bots.map((bot) => bot.slug)),
          humanId,
        );
        db.prepare(`UPDATE channel_records SET owner_human_id = ?, record_json = json_set(record_json, '$.ownerHumanId', ?)
        WHERE json_extract(record_json, '$.type') = 'group'
        AND owner_human_id = ?`).run(toHumanId, toHumanId, humanId);
        db.prepare(`INSERT INTO channel_human_members(channel_id, human_id, display_name, visible_from_revision, joined_at)
        SELECT channel_id, ?, ?, 1, ? FROM channel_records
        WHERE channel_id IN (SELECT value FROM json_each(?))
          OR (json_extract(record_json, '$.type') = 'group' AND EXISTS
            (SELECT 1 FROM json_each(record_json, '$.members') m
              WHERE m.value IN (SELECT value FROM json_each(?))))
        ON CONFLICT(channel_id, human_id) DO UPDATE SET left_at = NULL`).run(
          toHumanId,
          target.displayName,
          new Date(this.now()).toISOString(),
          transferred,
          JSON.stringify(preview.bots.map((bot) => bot.slug)),
        );
      },
      ['team', 'channel', 'bot-registry', 'bot-ownership'],
    );
    this.accessChanged(true);
    await this.stopBots?.(preview.bots.map((bot) => bot.slug));
    return null;
  }

  private purgeTarget(human: HumanContext, humanId: string): TeamMember {
    const member = this.manageTarget(human, humanId);
    if (member.status !== 'deactivated') throw new TeamError('member-active');
    const owned = this.transferPreview(human, humanId);
    if (owned.channels.length) throw new TeamError('transfer-required');
    if (!this.purge) throw new TeamError('unavailable');
    return member;
  }

  purgePreview(human: HumanContext, humanId: string) {
    this.purgeTarget(human, humanId);
    return this.purge!.memberPreview(human, humanId);
  }

  async purgeConfirm(
    human: HumanContext,
    humanId: string,
    token: string,
    username: string,
  ): Promise<null> {
    this.roles.requireManagementTarget(human, humanId);
    if (
      !this.member(humanId) &&
      this.db.read((db) =>
        db.prepare('SELECT 1 FROM deleted_humans WHERE human_id = ?').get(humanId),
      )
    )
      throw new TeamError('purge-token-invalid');
    const member = this.purgeTarget(human, humanId);
    if (username !== member.username) throw new TeamError('purge-token-invalid');
    this.purge!.memberConfirm(human, humanId, token);
    await this.purge!.memberSettled(humanId);
    this.invalidate();
    this.log('member-purged', { initiator: human.humanId, humanId });
    return null;
  }

  publicChannels(human: HumanContext) {
    return this.channelAccess.browse(human);
  }
  joinPublic(human: HumanContext, channelId: string): null {
    return this.channelAccess.join(human, channelId);
  }
  setPublic(human: HumanContext, channelId: string, value: boolean): null {
    return this.channelAccess.visibilitySet(human, channelId, {
      kind: value ? 'public' : 'private',
    });
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
    return this.channelAccess.canRead(human, channelId, true);
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
      try {
        disposals.push(peer.dispose());
      } catch (error) {
        disposals.push(Promise.reject(error));
      }
    }
    const settled = await Promise.allSettled(disposals);
    const failure = settled.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
    if (disposals.length)
      this.log('peers-disposed', { initiator: 'host', count: disposals.length });
  }
}
