import { TeamError } from './error.js';
export { TeamError } from './error.js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PeerScope, Principal } from '@deepseek-ai/dsh-typert-protocol';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { humanContext, OWNER_HUMAN_CONTEXT, type HumanContext } from '../humans/context.js';
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
  h.created_at AS createdAt, h.human_id = 'local-human' AS owner`;
const credentialSchema = z.object({ password_json: z.string(), history_json: z.string() });
const grantSchema = z.object({
  grant_id: z.string(),
  human_id: z.string(),
  last_seen_at: z.string(),
});
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export class TeamService {
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
      now?: () => number;
      ensureTob?: (human: HumanContext) => Promise<unknown>;
      log?: (phase: string, facts: Record<string, string | number | boolean>) => void;
    } = {},
  ) {
    this.ensureTob = options.ensureTob;
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
    this.owner(human);
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
        .prepare('SELECT password_json, history_json FROM member_credentials WHERE human_id = ?')
        .get(humanId),
    );
    if (row === undefined) return undefined;
    const parsed = credentialSchema.parse(row);
    return {
      hash: passwordHashSchema.parse(JSON.parse(parsed.password_json)),
      history: z.array(passwordHashSchema).parse(JSON.parse(parsed.history_json)),
    };
  }

  mode(human: HumanContext): TeamModeView {
    const settings = this.settings();
    const member = this.member(human.humanId);
    if (!member) throw new TeamError('credentials-invalid');
    return {
      enabled: settings.enabled,
      insecureHttpAllowed: settings.insecure_http_allowed,
      ownerPasswordSet: this.hasCredential(OWNER_HUMAN_CONTEXT.humanId),
      memberUrls: memberUrls(this.urls(), settings.insecure_http_allowed),
      viewer: {
        humanId: member.humanId,
        kind: member.owner ? 'owner' : 'member',
        displayName: member.owner
          ? this.channels.humanIdentity(human).displayName
          : member.displayName,
        mustChangePassword: member.mustChangePassword,
      },
    };
  }

  private owner(human: HumanContext): void {
    if (human.humanId !== OWNER_HUMAN_CONTEXT.humanId) throw new TeamError('forbidden');
  }

  async setMode(human: HumanContext, enabled: boolean): Promise<TeamModeView> {
    this.owner(human);
    if (enabled && !this.hasCredential(human.humanId))
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
    this.owner(human);
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
    if (!strongPassword(password)) throw new TeamError('password-weak');
    const hash = await hashPassword(password);
    this.db.transaction(
      (db) =>
        db
          .prepare(`INSERT INTO member_credentials(human_id, username, password_json, history_json, must_change)
      VALUES (?, 'owner', ?, '[]', 0) ON CONFLICT(human_id) DO UPDATE SET password_json = excluded.password_json, must_change = 0`)
          .run(human.humanId, JSON.stringify(hash)),
      ['team'],
    );
    this.invalidate();
    return this.mode(human);
  }

  async createMember(
    human: HumanContext,
    username: string,
    displayName: string,
  ): Promise<{ member: TeamMember; initialPassword: string }> {
    this.owner(human);
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
          JSON.stringify(hash),
          '[]',
        );
        db.prepare('INSERT INTO local_human_names VALUES (?, ?)').run(humanId, displayName.trim());
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
    if (!member || member.owner) throw new TeamError('credentials-invalid');
    if (member.status !== 'active') throw new TeamError('member-suspended');
  }

  private passwordAttempt(username: string, ip: string): void {
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
    if (!valid || !member || member.owner) throw new TeamError('credentials-invalid');
    this.active(member);
    await this.ensureTob?.(humanContext(member.humanId));
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
    const previous = this.credential(human.humanId);
    if (!previous || !(await verifyPassword(current, previous.hash)))
      throw new TeamError('credentials-invalid');
    if (!strongPassword(next)) throw new TeamError('password-weak');
    for (const hash of [previous.hash, ...previous.history])
      if (await verifyPassword(next, hash)) throw new TeamError('password-reused');
    const hash = await hashPassword(next);
    if (this.credential(human.humanId)?.hash.hash !== previous.hash.hash)
      throw new TeamError('credentials-invalid');
    this.db.transaction(
      (db) => {
        db.prepare(
          'UPDATE member_credentials SET password_json = ?, history_json = ?, must_change = 0 WHERE human_id = ?',
        ).run(
          JSON.stringify(hash),
          JSON.stringify([previous.hash, ...previous.history]),
          human.humanId,
        );
      },
      ['team'],
    );
    this.invalidate();
    return null;
  }

  async changeWebPassword(
    principal: Principal,
    current: string,
    next: string,
    ip: string,
  ): Promise<null> {
    const human = this.resolve(principal);
    const member = human ? this.member(human.humanId) : undefined;
    if (!human || !member) throw new TeamError('credentials-invalid');
    this.passwordAttempt(member.username, ip);
    return this.changePassword(human, current, next);
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
    this.owner(human);
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

  belongs(human: HumanContext, channelId: string): boolean {
    return (
      this.db.read((db) =>
        db
          .prepare(`SELECT 1 FROM channel_records c WHERE c.channel_id = ?
      AND json_extract(c.record_json, '$.deletedAt') IS NULL
      AND ((json_extract(c.record_json, '$.type') = 'group' AND EXISTS (
        SELECT 1 FROM channel_human_members m WHERE m.channel_id = c.channel_id AND m.human_id = ? AND m.left_at IS NULL))
        OR (json_extract(c.record_json, '$.type') = 'dm' AND EXISTS (
          SELECT 1 FROM persona_bots b WHERE b.slug = json_extract(c.record_json, '$.botSlug') AND b.owner_human_id = ?)))`)
          .get(channelId, human.humanId, human.humanId),
      ) !== undefined
    );
  }

  async disposePeers(humanId?: string): Promise<void> {
    const disposals: Promise<void>[] = [];
    for (const [id, peer] of this.peers) {
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
