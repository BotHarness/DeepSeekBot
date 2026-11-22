import * as memberAuth from './member-auth.js';
import type { MemberAuthHost } from './member-auth.js';
import * as memberLifecycle from './member-lifecycle.js';
import type { MemberLifecycleHost } from './member-lifecycle.js';
import { credentialPasswordJson, fields, memberSchema, type TeamMember } from './member-auth.js';
export type { TeamMember } from './member-auth.js';
import { audienceContains, type BotVisibility } from './bot-contract.js';
import { TeamBots } from './bots.js';
import { SpeakerPolicy } from './speaker-policy.js';
import { TeamPrivateContent } from './private-content.js';
import type { ConfinementStatus } from '../execution/linux-confinement.js';
import type { WorkspaceSpaces } from '../workspaces/spaces.js';
import { TeamApprovals } from './approvals.js';
import type { UsageProjection } from '../usage/usage.js';
import type { UsageByMemberResult, UsageOverviewPeriod } from '../usage/overview.js';
import { TeamChannels } from './channels.js';
import { channelRoleMembershipEntrySql, channelRoleMembershipExitSql } from './channel-contract.js';
import type { ContentPurge } from '../purge/contracts.js';
import { TeamRoles } from './roles.js';
import type { DevicePairing } from '../devices/pairing.js';
import { TeamError } from './error.js';
export { TeamError } from './error.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import type { PeerScope, Principal } from '@deepseek-ai/dsh-typert-protocol';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { humanContext, type HumanContext } from '../humans/context.js';
import type { ChannelStore } from '../channels/store.js';
import { hashPassword, passwordHashSchema, verifyPassword } from './password.js';
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

export interface TeamModeView {
  isolation: 'trial' | 'enforced';
  confinement?: ConfinementStatus;
  enabled: boolean;
  privateAccessNotice?: true;
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

const credentialPasswordSchema = passwordHashSchema.extend({
  ownerIssuerHumanId: z.string().min(1).optional(),
});

const credentialSchema = z.object({
  username: z.string(),
  password_json: z.string(),
  history_json: z.string(),
  must_change: z.coerce.boolean(),
});

export class TeamService {
  readonly bots: TeamBots;
  readonly speakerPolicy: SpeakerPolicy;
  readonly privateAccess: TeamPrivateContent;
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
    this.privateAccess.closeViews();
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
  spaceAudienceDirectory(human: HumanContext) {
    this.roles.require(human, 'workspaces.manageShared');
    return this.db.read((connection) => ({
      roles: z
        .array(
          z
            .object({
              roleId: z.string(),
              name: z.string(),
              builtin: z.enum(['admin', 'member']).nullable(),
            })
            .strict(),
        )
        .parse(
          connection
            .prepare('SELECT role_id AS roleId, name, builtin FROM host_roles ORDER BY role_id')
            .all(),
        ),
      members: z
        .array(z.object({ humanId: z.string(), displayName: z.string() }).strict())
        .parse(
          connection
            .prepare(
              "SELECT human_id AS humanId, display_name AS displayName FROM humans WHERE status = 'active' ORDER BY human_id",
            )
            .all(),
        ),
    }));
  }
  private readonly passwordCaller = new AsyncLocalStorage<{
    principal: MemberPrincipal;
    ip: string | undefined;
  }>();
  private readonly purge: ContentPurge | undefined;
  private readonly spaceProvider: (() => WorkspaceSpaces) | undefined;
  get spaces(): WorkspaceSpaces {
    const spaces = this.spaceProvider?.();
    if (!spaces) throw new TeamError('unavailable');
    return spaces;
  }
  private readonly replaceBotMemory: (<T>(slug: string, action: () => T) => Promise<T>) | undefined;
  private readonly stopBots: ((slugs: readonly string[]) => Promise<void>) | undefined;
  private readonly settleBotPreparations: ((humanId: string) => Promise<void>) | undefined;
  private readonly peers = new Map<string, PeerScope>();
  private readonly limiter: SignInRateLimit;
  private peerFactory: ((principal: MemberPrincipal) => PeerScope) | undefined;
  private invalidate: () => void = () => {};
  private devices:
    | {
        routes(): Promise<string[]>;
        invitation(humanId: string): Promise<import('./devices.js').MemberInvitation>;
        pairingOffer(humanId: string): Promise<import('./devices.js').MemberPairingOffer>;
      }
    | undefined;
  private urls: () => string[] = () => [];
  private confinement: () => ConfinementStatus | undefined = () => undefined;
  private readonly ensureTob: ((human: HumanContext) => Promise<unknown>) | undefined;
  private readonly now: () => number;
  private readonly log: (phase: string, facts: Record<string, string | number | boolean>) => void;

  readonly #memberOperations = this.#createMemberOperations();

  #createMemberOperations(): MemberAuthHost & MemberLifecycleHost {
    const service = this;
    return {
      accessChanged: (...args) => service.accessChanged(...args),
      active: (...args) => service.active(...args),
      admit: (...args) => service.admit(...args),
      assertRevocationAvailable: (...args) => service.assertRevocationAvailable(...args),
      byUsername: (...args) => service.byUsername(...args),
      changePassword: (...args) => service.changePassword(...args),
      createGrant: (...args) => service.createGrant(...args),
      credential: (...args) => service.credential(...args),
      get db() {
        return service.db;
      },
      device: (...args) => service.device(...args),
      deviceGrantResult: (...args) => service.deviceGrantResult(...args),
      disposePeers: (...args) => service.disposePeers(...args),
      get ensureTob() {
        return service.ensureTob?.bind(service);
      },
      invalidate: (...args) => service.invalidate(...args),
      isOwner: (...args) => service.isOwner(...args),
      get limiter() {
        return service.limiter;
      },
      log: (...args) => service.log(...args),
      manageTarget: (...args) => service.manageTarget(...args),
      member: (...args) => service.member(...args),
      memberDevices: (...args) => service.memberDevices(...args),
      now: (...args) => service.now(...args),
      ownedBots: (...args) => service.ownedBots(...args),
      owner: (...args) => service.owner(...args),
      pairedIds: (...args) => service.pairedIds(...args),
      get pairing() {
        return service.pairing;
      },
      passwordAttempt: (...args) => service.passwordAttempt(...args),
      get passwordCaller() {
        return service.passwordCaller;
      },
      get peerFactory() {
        return service.peerFactory?.bind(service);
      },
      get peers() {
        return service.peers;
      },
      get privateAccess() {
        return service.privateAccess;
      },
      get purge() {
        return service.purge;
      },
      purgeTarget: (...args) => service.purgeTarget(...args),
      resolve: (...args) => service.resolve(...args),
      revoke: (...args) => service.revoke(...args),
      revokeMember: (...args) => service.revokeMember(...args),
      get roles() {
        return service.roles;
      },
      settings: (...args) => service.settings(...args),
      get settleBotPreparations() {
        return service.settleBotPreparations?.bind(service);
      },
      get spaceProvider() {
        return service.spaceProvider?.bind(service);
      },
      get spaces() {
        return service.spaces;
      },
      get stopBots() {
        return service.stopBots?.bind(service);
      },
      transferPreview: (...args) => service.transferPreview(...args),
      withPasswordCaller: (...args) => service.withPasswordCaller(...args),
    };
  }

  constructor(
    private readonly db: OperationalDatabaseModulePort,
    private readonly channels: ChannelStore,
    options: {
      purge?: ContentPurge;
      spaces?: () => WorkspaceSpaces;
      replaceBotMemory?: <T>(slug: string, action: () => T) => Promise<T>;
      stopBots?: (slugs: readonly string[]) => Promise<void>;
      settleBotPreparations?: (humanId: string) => Promise<void>;
      now?: () => number;
      ensureTob?: (human: HumanContext) => Promise<unknown>;
      log?: (phase: string, facts: Record<string, string | number | boolean>) => void;
    } = {},
  ) {
    this.purge = options.purge;
    this.spaceProvider = options.spaces;
    this.replaceBotMemory = options.replaceBotMemory;
    this.stopBots = options.stopBots;
    this.settleBotPreparations = options.settleBotPreparations;
    this.ensureTob = options.ensureTob;
    this.roles = new TeamRoles(db, (revoke) => this.accessChanged(revoke));
    this.channelAccess = new TeamChannels(db, channels, this.roles, (revoke) =>
      this.accessChanged(revoke),
    );
    this.bots = new TeamBots(
      db,
      channels,
      this.roles,
      this.channelAccess,
      (revoke) => this.accessChanged(revoke),
      (human, bot) => this.privateAccess.recordBotAction(human, bot, 'botVisibilitySet'),
      this.spaceProvider,
    );

    this.speakerPolicy = new SpeakerPolicy(db, this.roles);
    this.approvals = new TeamApprovals(db, channels, this.roles, this.bots);
    channels.bindHumanAccess?.({
      searchText: (human, channelId, messageId, text) =>
        this.approvals.searchText(human, channelId, messageId, text),
      canRead: (human, id) => this.channelAccess.canRead(human, id),
      requirePolicy: (human, id, key) => this.channelAccess.requirePolicy(human, id, key),
      requireBotPost: (slug, channel) =>
        this.bots.available && this.bots.requireChannel(slug, channel, true),
      requireBotJoin: (slug, id) => {
        if (this.bots.available) this.bots.requireJoin(slug, id);
      },
      requireDm: (human, slug) => this.bots.available && this.bots.requireReach(human, slug),
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
        if (channel?.botSlug && this.bots.available) this.bots.requireDmPost(human, channel);
        if (channel?.type !== 'group' && !channel?.humanParticipants) return;
        this.channelAccess.requirePolicy(human, id, 'post');
        if (all) this.channelAccess.requirePolicy(human, id, 'mentionAll');
      },
    });
    this.now = options.now ?? Date.now;
    this.log = options.log ?? (() => {});
    this.limiter = new SignInRateLimit(this.now);
    this.privateAccess = new TeamPrivateContent(
      db,
      channels,
      this.roles,
      this.channelAccess,
      this.now,
    );
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

  async modeStatus(human: HumanContext): Promise<TeamModeView> {
    const view = this.mode(human);
    if (!this.devices) return view;
    return {
      ...view,
      memberUrls: (await this.devices.routes()).map(
        (origin) => `${origin}/botharness-device/team/`,
      ),
    };
  }

  bindDevices(devices: NonNullable<TeamService['devices']>): () => void {
    this.devices = devices;
    return () => {
      if (this.devices === devices) this.devices = undefined;
    };
  }

  invitation(human: HumanContext, humanId: string) {
    this.roles.requireManagementTarget(human, humanId);
    this.active(this.member(humanId));
    if (!this.devices) throw new TeamError('unavailable');
    return this.devices.invitation(humanId);
  }

  pairingOffer(human: HumanContext) {
    const member = this.member(human.humanId);
    this.active(member);
    if (member.owner) throw new TeamError('credentials-invalid');
    if (member.mustChangePassword) throw new TeamError('password-change-required');
    if (!this.devices) throw new TeamError('unavailable');
    return this.devices.pairingOffer(human.humanId);
  }

  bindConfinement(status: () => ConfinementStatus | undefined): void {
    this.confinement = status;
  }

  enabled(): boolean {
    return this.settings().enabled;
  }

  isolation(): 'trial' | 'enforced' {
    return this.confinement()?.enforcement === 'full' ? 'enforced' : 'trial';
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
          'SELECT username, password_json, history_json, must_change FROM member_credentials WHERE human_id = ?',
        )
        .get(humanId),
    );
    if (row === undefined) return undefined;
    const parsed = credentialSchema.parse(row);
    const password = credentialPasswordSchema.parse(JSON.parse(parsed.password_json));
    return {
      username: parsed.username,
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
    const confinement = this.confinement();
    return {
      isolation: confinement?.enforcement === 'full' ? 'enforced' : 'trial',
      ...(confinement === undefined || !this.isOwner(human) ? {} : { confinement }),
      enabled: settings.enabled,
      ...(settings.enabled ? { privateAccessNotice: true as const } : {}),
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
      memberUrls: memberUrls(this.urls()),
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

  ownerPasswordSignIn(human: HumanContext) {
    return memberAuth.ownerPasswordSignIn.call(this.#memberOperations, human);
  }

  ownerPasswordSignInSet(
    human: HumanContext,
    input: Parameters<typeof memberAuth.ownerPasswordSignInSet>[1],
  ) {
    return memberAuth.ownerPasswordSignInSet.call(this.#memberOperations, human, input);
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
          db.prepare(channelRoleMembershipEntrySql('all')).run(new Date(this.now()).toISOString());
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
    await memberAuth.setOwnerPassword.call(this.#memberOperations, human, password, {
      kind: 'settings',
      current,
    });
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
        db.prepare(channelRoleMembershipEntrySql('human')).run(
          new Date(this.now()).toISOString(),
          humanId,
        );
      },
      ['team', 'human-identity'],
    );
    this.spaceProvider?.().ensureAccount(humanId);
    this.invalidate();
    return { member: this.member(humanId)!, initialPassword, isolation: this.isolation() };
  }

  private byUsername(username: string): TeamMember | undefined {
    return memberAuth.byUsername.call(this.#memberOperations, username);
  }

  private active(member: TeamMember | undefined): asserts member is TeamMember {
    return memberAuth.active.call(this.#memberOperations, member);
  }

  private passwordAttempt(username: string, ip?: string): void {
    return memberAuth.passwordAttempt.call(this.#memberOperations, username, ip);
  }

  signIn(
    username: string,
    password: string,
    ip: string,
    device?: { kind: 'paired-device'; name: string; publicKey?: string },
  ): Promise<{ token: string; member: TeamMember; peer: PeerScope }> {
    return memberAuth.signIn.call(this.#memberOperations, username, password, ip, device);
  }

  signInOwnerDevice<T>(
    username: string,
    password: string,
    ip: string,
    issue: (humanId: string) => T,
  ): Promise<T> {
    return (memberAuth.signInOwnerDevice<T>).call(
      this.#memberOperations,
      username,
      password,
      ip,
      issue,
    );
  }

  passwordSignInAvailable(): boolean {
    return memberAuth.passwordSignInAvailable.call(this.#memberOperations);
  }

  signInPasswordDevice<T>(input: Parameters<typeof memberAuth.signInPasswordDevice<T>>[0]) {
    return (memberAuth.signInPasswordDevice<T>).call(this.#memberOperations, input);
  }

  private createGrant(
    member: TeamMember,
    device?: { kind: 'paired-device'; name: string; publicKey?: string },
  ): { token: string; peer: PeerScope } {
    return memberAuth.createGrant.call(this.#memberOperations, member, device);
  }

  createDeviceGrant(humanId: string, name: string, publicKey?: string) {
    return memberAuth.createDeviceGrant.call(this.#memberOperations, humanId, name, publicKey);
  }

  deviceGrantResult(grant: { token: string; peer: PeerScope }, member: TeamMember) {
    return memberAuth.deviceGrantResult.call(this.#memberOperations, grant, member);
  }

  admitDevice(authorization: string | undefined, publicKey?: string): PeerScope | undefined {
    return memberAuth.admitDevice.call(this.#memberOperations, authorization, publicKey);
  }

  deviceRefusal(authorization: string | undefined): 'sign-in-required' | 'member-suspended' {
    return memberAuth.deviceRefusal.call(this.#memberOperations, authorization);
  }

  device(deviceId: string) {
    return memberAuth.device.call(this.#memberOperations, deviceId);
  }

  attachDeviceStream(deviceId: string, close: () => void): () => void {
    return memberAuth.attachDeviceStream.call(this.#memberOperations, deviceId, close);
  }

  resolve(principal: Principal): HumanContext | undefined {
    return memberAuth.resolve.call(this.#memberOperations, principal);
  }

  admit(token: string): PeerScope | undefined {
    return memberAuth.admit.call(this.#memberOperations, token);
  }

  assertCall(principal: Principal | undefined, method: string): void {
    return memberAuth.assertCall.call(this.#memberOperations, principal, method);
  }

  revoke(grantId: string): Promise<void> {
    return memberAuth.revoke.call(this.#memberOperations, grantId);
  }

  suspend(human: HumanContext, humanId: string): Promise<void> {
    return memberLifecycle.suspend.call(this.#memberOperations, human, humanId);
  }

  asMember<T>(username: string, run: (peer: PeerScope) => Promise<T>): Promise<T> {
    return (memberAuth.asMember<T>).call(this.#memberOperations, username, run);
  }

  changePassword(
    human: HumanContext,
    current: string,
    next: string,
    signOutOthers = true,
  ): Promise<null> {
    return memberAuth.changePassword.call(
      this.#memberOperations,
      human,
      current,
      next,
      signOutOthers,
    );
  }

  withPasswordCaller<T>(
    principal: MemberPrincipal,
    ip: string | undefined,
    run: () => Promise<T>,
  ): Promise<T> {
    return (memberAuth.withPasswordCaller<T>).call(this.#memberOperations, principal, ip, run);
  }

  changeWebPassword(
    principal: Principal,
    current: string,
    next: string,
    ip: string,
    signOutOthers = true,
  ): Promise<null> {
    return memberAuth.changeWebPassword.call(
      this.#memberOperations,
      principal,
      current,
      next,
      ip,
      signOutOthers,
    );
  }

  resetPassword(human: HumanContext, humanId: string): Promise<{ initialPassword: string }> {
    return memberAuth.resetPassword.call(this.#memberOperations, human, humanId);
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
    return memberLifecycle.pairedIds.call(this.#memberOperations, humanId, keepGrant);
  }

  private assertRevocationAvailable(members: readonly TeamMember[], keepGrant?: string): void {
    return memberLifecycle.assertRevocationAvailable.call(
      this.#memberOperations,
      members,
      keepGrant,
    );
  }

  private revokeMember(humanId: string, keepGrant?: string): Promise<void> {
    return memberLifecycle.revokeMember.call(this.#memberOperations, humanId, keepGrant);
  }

  deactivate(human: HumanContext, humanId: string): Promise<null> {
    return memberLifecycle.deactivate.call(this.#memberOperations, human, humanId);
  }

  reactivate(human: HumanContext, humanId: string): Promise<null> {
    return memberLifecycle.reactivate.call(this.#memberOperations, human, humanId);
  }

  private ownedBots(humanId: string, transferable = false) {
    return memberLifecycle.ownedBots.call(this.#memberOperations, humanId, transferable);
  }

  transferPreview(human: HumanContext, humanId: string) {
    return memberLifecycle.transferPreview.call(this.#memberOperations, human, humanId);
  }

  async setBotVisibility(
    human: HumanContext,
    slug: string,
    visibility: BotVisibility,
    confirm?: boolean,
  ) {
    const preview = this.bots.setVisibility(human, slug, visibility, false);
    if (preview.applied || confirm === false) return preview;
    const current = this.bots.view(human, slug).visibility;
    const shrinking = !audienceContains(visibility, current);
    if (shrinking && !confirm) return preview;
    const action = () => this.bots.setVisibility(human, slug, visibility, true);
    const memory = preview.preview.memory;
    return this.replaceBotMemory && memory && memory.from !== memory.to
      ? this.replaceBotMemory(slug, action)
      : action();
  }

  transfer(human: HumanContext, humanId: string, toHumanId: string): Promise<null> {
    return memberLifecycle.transfer.call(this.#memberOperations, human, humanId, toHumanId);
  }

  private purgeTarget(human: HumanContext, humanId: string): TeamMember {
    return memberLifecycle.purgeTarget.call(this.#memberOperations, human, humanId);
  }

  purgePreview(human: HumanContext, humanId: string) {
    return memberLifecycle.purgePreview.call(this.#memberOperations, human, humanId);
  }

  purgeConfirm(
    human: HumanContext,
    humanId: string,
    token: string,
    username: string,
  ): Promise<null> {
    return memberLifecycle.purgeConfirm.call(
      this.#memberOperations,
      human,
      humanId,
      token,
      username,
    );
  }

  setPublic(human: HumanContext, channelId: string, value: boolean): null {
    return this.channelAccess.visibilitySet(human, channelId, {
      kind: value ? 'public' : 'private',
    });
  }

  memberDevices(human: HumanContext, humanId: string, currentGrantId?: string) {
    return memberAuth.memberDevices.call(this.#memberOperations, human, humanId, currentGrantId);
  }

  memberDeviceRevoke(human: HumanContext, humanId: string, grantId: string): Promise<null> {
    return memberAuth.memberDeviceRevoke.call(this.#memberOperations, human, humanId, grantId);
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
    const roleAccessEnded = this.db.transaction(
      (db) => {
        db.prepare('DELETE FROM human_roles WHERE human_id IN (?, ?)').run(human.humanId, humanId);
        db.prepare("INSERT INTO human_roles VALUES (?, 'admin')").run(human.humanId);
        db.prepare('UPDATE team_settings SET owner_human_id = ? WHERE singleton = 1').run(humanId);
        let roleAccessEnded = false;
        const at = new Date(this.now()).toISOString();
        for (const id of [human.humanId, humanId]) {
          if (db.prepare(channelRoleMembershipExitSql('human')).run(at, id).changes > 0)
            roleAccessEnded = true;
          db.prepare(channelRoleMembershipEntrySql('human')).run(at, id);
        }
        db.prepare('DELETE FROM tob_identity WHERE human_id IN (?, ?)').run(human.humanId, humanId);
        return roleAccessEnded;
      },
      ['team'],
    );
    this.pairing?.clearOffers();
    if (roleAccessEnded) {
      this.accessChanged(true);
      await this.accessSettled();
    } else this.invalidate();
    for (const device of oldDevices)
      await this.memberDeviceRevoke(human, human.humanId, device.grantId);
    this.log('owner-transferred', { initiator: 'owner', humanId });
    return null;
  }

  belongs(human: HumanContext, channelId: string): boolean {
    return this.channelAccess.canRead(human, channelId, true);
  }

  disposePeers(humanId?: string, keepGrant?: string): Promise<void> {
    return memberAuth.disposePeers.call(this.#memberOperations, humanId, keepGrant);
  }
}
