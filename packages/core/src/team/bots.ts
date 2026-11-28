import { isAvatarAppearance, isRetainedAvatarAppearance } from '../bots/avatar-appearance.js';
import { currentBotPrimaryColor, isBotPrimaryColor } from '../bots/primary-color.js';
import { dmChannelId } from '../channels/channel.js';
import { botAvatarUrl } from '../bots/avatar-http.js';
import type { WorkspaceSpaces } from '../workspaces/spaces.js';
import type { BotMemoryPlacement } from '../workspaces/bot-memory-placement.js';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { OperationalDatabaseError, type OperationalDatabaseModulePort } from '../database/owner.js';
import type { ChannelStore } from '../channels/store.js';
import type { ChannelRecord } from '../channels/channel.js';
import { humanContext, type HumanContext } from '../humans/context.js';
import type { TeamRoles } from './roles.js';
import type { TeamChannels } from './channels.js';
import { TeamError } from '../team-policy/error.js';
import { activeBotHumanSql, botAudienceAccessSql } from '../team-policy/bot-access.js';
import {
  audienceContains,
  botVisibilitySchema,
  botSwitchesSchema,
  type BotVisibility,
  type BotSwitches,
} from '../team-policy/bot-contract.js';

const botRow = z.object({
  slug: z.string(),
  owner: z.string(),
  body: z.string().transform((v) =>
    z
      .object({
        displayName: z.string(),
        avatar: z.unknown().optional(),
        paused: z.boolean().optional(),
        deletedAt: z.string().optional(),
      })
      .parse(JSON.parse(v)),
  ),
  visibility: z.string().transform((v) => botVisibilitySchema.parse(JSON.parse(v))),
  switches: z.string().transform((v) => botSwitchesSchema.parse(JSON.parse(v))),
});
type Bot = z.infer<typeof botRow>;
type VisibilityPlan = ReturnType<TeamBots['planVisibility']>;
type VisibilityChange = { slug: string; visibility: BotVisibility };
export type ReplaceBotMemory = <T>(
  slug: string,
  action: () => T | Promise<T>,
  nextCwd: () => string | undefined,
) => Promise<T>;
const fields =
  'slug, owner_human_id AS owner, body, visibility_json AS visibility, switches_json AS switches';

export class TeamBots {
  readonly available: boolean;
  constructor(
    private readonly db: OperationalDatabaseModulePort,
    private readonly channels: ChannelStore,
    private readonly roles: TeamRoles,
    private readonly channelAccess: TeamChannels,
    private readonly changed: (revoke?: boolean) => void,
    private readonly recordVisibilityChange: (
      human: HumanContext,
      bot: { slug: string; displayName: string; ownerHumanId: string },
      transaction: DatabaseSync,
    ) => void = () => {},
    private readonly memorySpaces?: () => WorkspaceSpaces,
  ) {
    try {
      this.available = !!this.db.read((db) =>
        db
          .prepare("SELECT 1 FROM pragma_table_info('persona_bots') WHERE name='visibility_json'")
          .get(),
      );
    } catch (error) {
      if (error instanceof OperationalDatabaseError && error.code === 'recovery-mode')
        this.available = false;
      else throw error;
    }
  }

  speakerContextEnabled(slug: string): boolean {
    return this.bot(slug).switches.speakerContext;
  }
  hasForeignDms(human: HumanContext, slug: string): boolean {
    return !!this.db.read((db) =>
      db
        .prepare(`SELECT 1 FROM channel_records c WHERE json_extract(c.record_json,'$.type')='dm'
      AND json_extract(c.record_json,'$.dmHumanId') IS NOT NULL AND json_extract(c.record_json,'$.dmHumanId') <> ?
      AND EXISTS (SELECT 1 FROM json_each(c.record_json,'$.members') m WHERE m.value=?) LIMIT 1`)
        .get(human.humanId, slug),
    );
  }
  privateSessions(human: HumanContext): ReadonlySet<string> {
    if (!this.available) return new Set();
    return new Set(
      z
        .array(z.object({ slug: z.string() }))
        .parse(
          this.db.read((db) =>
            db
              .prepare(`SELECT DISTINCT m.value AS slug FROM channel_records c, json_each(c.record_json,'$.members') m
      WHERE json_extract(c.record_json,'$.type')='dm' AND json_extract(c.record_json,'$.dmHumanId') IS NOT NULL
      AND json_extract(c.record_json,'$.dmHumanId') <> ?`)
              .all(human.humanId),
          ),
        )
        .map((row) => row.slug),
    );
  }
  proactiveOptOut(human: HumanContext, slug: string): boolean {
    return !!this.db.read((db) =>
      db
        .prepare('SELECT 1 FROM bot_proactive_opt_outs WHERE bot_slug=? AND human_id=?')
        .get(slug, human.humanId),
    );
  }
  private findBot(slug: string): Bot | undefined {
    const raw = this.db.read((db) =>
      db
        .prepare(
          `SELECT ${fields} FROM persona_bots WHERE slug = ? AND NOT EXISTS (SELECT 1 FROM persona_bot_deletions d WHERE d.slug=persona_bots.slug)`,
        )
        .get(slug),
    );
    if (!raw) return undefined;
    const bot = botRow.parse(raw);
    return bot.body.deletedAt ? undefined : bot;
  }
  private bot(slug: string): Bot {
    const bot = this.findBot(slug);
    if (!bot) throw new TeamError('bot-not-found', undefined, { slug });
    return bot;
  }
  private active(humanId: string): boolean {
    return !!this.db.read((db) =>
      db
        .prepare(`SELECT 1 FROM humans h, team_settings s
      WHERE h.human_id = ? AND ${activeBotHumanSql({ human: 'h', settings: 's' })}`)
        .get(humanId),
    );
  }
  requireActive(slug: string): void {
    const bot = this.bot(slug);
    if (!this.active(bot.owner) || bot.body.paused)
      throw new TeamError('bot-principal-inactive', undefined, { slug });
  }
  private audience(humanId: string, bot: Bot, visibility = bot.visibility): boolean {
    return !!this.db.read((db) =>
      db
        .prepare(`SELECT 1 FROM humans viewer, humans principal, team_settings s, (SELECT ? AS visibility) v
          WHERE viewer.human_id = ? AND principal.human_id = ?
          AND ${activeBotHumanSql({ human: 'viewer', settings: 's' })}
          AND ${activeBotHumanSql({ human: 'principal', settings: 's' })}
          AND ${botAudienceAccessSql({
            visibility: 'v.visibility',
            viewer: 'viewer.human_id',
            principal: 'principal.human_id',
          })}`)
        .get(JSON.stringify(visibility), humanId, bot.owner),
    );
  }
  requireJoin(slug: string, channelId: string): void {
    const channel = this.channels.get(channelId),
      bot = this.bot(slug);
    if (!channel || !this.groupEligible(bot, channel))
      throw new TeamError('bot-principal-channel-denied', undefined, { slug, channelId });
  }
  canReach(human: HumanContext, slug: string): boolean {
    try {
      const bot = this.bot(slug);
      return this.audience(human.humanId, bot);
    } catch (e) {
      if (e instanceof TeamError) return false;
      throw e;
    }
  }
  requireReach(human: HumanContext, slug: string): void {
    if (!this.canReach(human, slug)) throw new TeamError('bot-not-found');
  }
  private requireManage(human: HumanContext, bot: Bot): void {
    if (human.caller === 'bot')
      throw new TeamError('permission-required', undefined, { permission: 'bots.manageAll' });
    if (!this.active(human.humanId)) throw new TeamError('member-suspended');
    if (human.humanId !== bot.owner) this.roles.require(human, 'bots.manageAll');
  }
  view(human: HumanContext, slug: string) {
    const bot = this.bot(slug);
    this.requireManage(human, bot);
    const audienceDirectory = this.db.read((db) => ({
      roles: z
        .array(
          z.object({
            roleId: z.string(),
            name: z.string(),
            builtin: z.enum(['admin', 'member']).nullable(),
          }),
        )
        .parse(
          db
            .prepare('SELECT role_id AS roleId,name,builtin FROM host_roles ORDER BY role_id')
            .all(),
        ),
      members: z
        .array(z.object({ humanId: z.string(), displayName: z.string() }))
        .parse(
          db
            .prepare(
              "SELECT human_id AS humanId,display_name AS displayName FROM humans WHERE status='active' ORDER BY human_id",
            )
            .all(),
        ),
    }));
    return { visibility: bot.visibility, switches: bot.switches, audienceDirectory };
  }
  private reachableRows(human: HumanContext, history = false) {
    const reachable = `${activeBotHumanSql({ human: 'h', settings: 's' })}
      AND NOT EXISTS (SELECT 1 FROM persona_bot_deletions d WHERE d.slug=b.slug)
      AND json_extract(b.body,'$.deletedAt') IS NULL
      AND ${botAudienceAccessSql({
        visibility: 'b.visibility_json',
        viewer: 'viewer.human_id',
        principal: 'b.owner_human_id',
      })}`;
    return this.db.read((db) =>
      db
        .prepare(`
      SELECT b.slug, b.owner_human_id AS owner, b.body, b.visibility_json AS visibility, b.switches_json AS switches,
        coalesce(h.display_name,b.owner_human_id) AS principalDisplayName,
        CASE WHEN ${reachable} THEN 1 ELSE 0 END AS reachable,
        CASE WHEN EXISTS (SELECT 1 FROM persona_bot_deletions d WHERE d.slug=b.slug)
          OR json_extract(b.body,'$.deletedAt') IS NOT NULL THEN 1 ELSE 0 END AS deleted
      FROM persona_bots b LEFT JOIN humans h ON h.human_id=b.owner_human_id CROSS JOIN team_settings s
      JOIN humans viewer ON viewer.human_id=? AND ${activeBotHumanSql({ human: 'viewer', settings: 's' })}
      WHERE ((${reachable}) OR (? AND EXISTS (
        SELECT 1 FROM channel_records c WHERE json_extract(c.record_json,'$.type')='dm'
        AND json_extract(c.record_json,'$.botSlug')=b.slug
        AND json_extract(c.record_json,'$.dmHumanId')=viewer.human_id
        AND json_extract(c.record_json,'$.deletedAt') IS NULL)))
      ORDER BY b.slug`)
        .all(human.humanId, history ? 1 : 0),
    );
  }

  private allPublicGroupDepartures() {
    const groups = new Map<string, ChannelRecord[]>();
    for (const channel of this.channels.list()) {
      if (channel.type !== 'group') continue;
      for (const slug of channel.members) {
        const memberships = groups.get(slug);
        if (memberships) memberships.push(channel);
        else groups.set(slug, [channel]);
      }
    }
    return [...groups].flatMap(([botSlug, memberships]) => {
      const bot = this.findBot(botSlug);
      if (bot?.visibility.kind !== 'public') return [];
      return this.channelsLeaving(bot, bot.visibility, memberships).map(({ channelId }) => ({
        channelId,
        botSlug,
      }));
    });
  }
  reachable(human: HumanContext) {
    const bots = z
      .array(botRow.extend({ principalDisplayName: z.string() }))
      .parse(this.reachableRows(human));
    return bots.map((bot) => ({
      slug: bot.slug,
      displayName: bot.body.displayName,
      avatar: bot.body.avatar,
      visibility: bot.visibility.kind,
      principalDisplayName: bot.principalDisplayName,
    }));
  }
  sharedRoster(human: HumanContext) {
    const rows = z
      .array(
        z.object({
          slug: z.string(),
          owner: z.string(),
          body: z.string(),
          principalDisplayName: z.string(),
          reachable: z.union([z.literal(0), z.literal(1)]),
          deleted: z.union([z.literal(0), z.literal(1)]),
        }),
      )
      .parse(this.reachableRows(human, human.caller !== 'bot'));
    return rows
      .filter((row) => row.owner !== human.humanId)
      .map((row) => {
        const bot = z
          .object({
            displayName: z.string(),
            avatar: z.string().optional(),
            paused: z.boolean().optional(),
            appearance: z
              .custom<
                | import('../bots/avatar-appearance.js').AvatarAppearance
                | import('../bots/avatar-appearance.js').RetainedAvatarAppearance
              >((value) => isAvatarAppearance(value) || isRetainedAvatarAppearance(value))
              .optional(),
            primaryColor: z
              .custom<import('../bots/primary-color.js').BotPrimaryColor>(isBotPrimaryColor)
              .optional(),
          })
          .parse(JSON.parse(row.body));
        const color = currentBotPrimaryColor(bot.primaryColor);
        return {
          slug: row.slug,
          displayName: bot.displayName,
          ...(bot.avatar === undefined
            ? {}
            : {
                avatar: bot.avatar.startsWith('data:image/')
                  ? botAvatarUrl(row.slug, bot.avatar)
                  : bot.avatar,
              }),
          ...(bot.appearance === undefined ? {} : { appearance: bot.appearance }),
          ...(color === undefined ? {} : { primaryColor: color }),
          paused: bot.paused === true,
          deleted: row.deleted === 1,
          ...(row.reachable === 0 ? { readOnly: true as const } : {}),
          sharedBy: { humanId: row.owner, displayName: row.principalDisplayName },
          metadataOnly: true as const,
        };
      });
  }
  private planVisibility(
    human: HumanContext,
    { slug, visibility }: VisibilityChange,
    channels: readonly ChannelRecord[],
  ) {
    const bot = this.bot(slug);
    this.requireManage(human, bot);
    if (!audienceContains(bot.visibility, visibility))
      this.roles.require(human, 'bots.createPublic');
    if (visibility.kind === 'public') {
      const a = visibility.audience;
      for (const id of a.kind === 'roles' ? a.roleIds : a.kind === 'members' ? a.humanIds : []) {
        const exists = this.db.read((db) =>
          db
            .prepare(
              a.kind === 'roles'
                ? 'SELECT 1 FROM host_roles WHERE role_id = ?'
                : "SELECT 1 FROM humans WHERE human_id = ? AND status = 'active'",
            )
            .get(id),
        );
        if (!exists)
          throw new TeamError(a.kind === 'roles' ? 'role-not-found' : 'member-not-found');
      }
    }
    const shrinking = !audienceContains(visibility, bot.visibility);
    const dmsBecomingReadOnly = channels
      .filter(
        (c) =>
          c.type === 'dm' &&
          (c.botSlug === slug ||
            (!c.botSlug && !c.remoteBot && c.members.length === 2 && c.members.includes(slug))) &&
          this.audience(c.dmHumanId ?? bot.owner, bot) &&
          !this.audience(c.dmHumanId ?? bot.owner, bot, visibility),
      )
      .map((c) => ({ channelId: c.id, humanId: c.dmHumanId ?? bot.owner }));
    const channelsLeaving = this.channelsLeaving(bot, visibility, channels);
    const placement = this.memorySpaces?.().botMemory;
    const memory = placement?.plan(slug, bot.owner, visibility);
    const preview = {
      dmsBecomingReadOnly,
      channelsLeaving,
      ...(memory ? { memory: memory.preview } : {}),
    };
    const needsWrite =
      JSON.stringify(bot.visibility) !== JSON.stringify(visibility) ||
      channelsLeaving.length > 0 ||
      memory?.needsPlacement === true;
    return { bot, visibility, preview, shrinking, placement, memory, needsWrite };
  }

  planVisibilityChanges(human: HumanContext, changes: readonly VisibilityChange[]) {
    const channels = changes.length ? this.channels.list() : [];
    return changes.map((change) => this.planVisibility(human, change, channels));
  }

  private channelsLeaving(bot: Bot, visibility: BotVisibility, channels: readonly ChannelRecord[]) {
    return channels
      .filter(
        (c) =>
          c.type === 'group' &&
          c.members.includes(bot.slug) &&
          !this.groupEligible(bot, c, visibility),
      )
      .map((c) => ({ channelId: c.id }));
  }

  commitVisibilityChanges(
    human: HumanContext,
    plans: readonly VisibilityPlan[],
    scope?: { write: (db: DatabaseSync) => void; reconcileAllPublic: boolean },
  ): void {
    type Move = ReturnType<BotMemoryPlacement['prepare']>;
    const prepared: { plan: VisibilityPlan; move: Move | undefined }[] = [];
    let publishDepartures: (() => void)[];
    try {
      for (const plan of plans) {
        const move = plan.memory ? plan.placement?.prepare(plan.memory) : undefined;
        prepared.push({ plan, move });
      }
      publishDepartures = this.db.transaction(
        (db) => {
          scope?.write(db);
          for (const {
            plan: { bot, visibility },
            move,
          } of prepared) {
            if (human.humanId !== bot.owner)
              this.recordVisibilityChange(
                human,
                {
                  slug: bot.slug,
                  displayName: bot.body.displayName,
                  ownerHumanId: bot.owner,
                },
                db,
              );
            move?.commit(db);
            db.prepare('UPDATE persona_bots SET visibility_json=? WHERE slug=?').run(
              JSON.stringify(visibility),
              bot.slug,
            );
            if (visibility.kind === 'public')
              db.prepare(`UPDATE channel_records SET record_json=json_set(record_json,'$.dmHumanId',?)
        WHERE json_extract(record_json,'$.type')='dm' AND json_extract(record_json,'$.botSlug')=? AND json_extract(record_json,'$.dmHumanId') IS NULL`).run(
                bot.owner,
                bot.slug,
              );
          }
          const departures = scope?.reconcileAllPublic
            ? this.allPublicGroupDepartures()
            : plans.flatMap(({ bot, preview }) =>
                preview.channelsLeaving.map(({ channelId }) => ({ channelId, botSlug: bot.slug })),
              );
          return departures.map(
            ({ channelId, botSlug }) =>
              this.channels.removeGroupMemberIn(db, channelId, botSlug).publish,
          );
        },
        [
          'team',
          'bots',
          'channels',
          'bot-registry',
          'workspace-spaces',
          'private-audit',
          'channel',
          'bot-inbox',
        ],
      );
    } catch (error) {
      if (
        !(error instanceof OperationalDatabaseError && error.code === 'post-commit-interrupted')
      ) {
        const rollbackErrors: unknown[] = [];
        for (const { move } of prepared.reverse()) {
          try {
            move?.rollback();
          } catch (rollbackError) {
            rollbackErrors.push(rollbackError);
          }
        }
        if (rollbackErrors.length)
          throw new AggregateError(rollbackErrors, 'Bot Memory rollback failed', { cause: error });
      }
      if (error instanceof OperationalDatabaseError && error.cause instanceof TeamError)
        throw error.cause;
      throw error;
    }
    try {
      for (const { move } of prepared) move?.finish();
    } finally {
      try {
        for (const publish of publishDepartures) publish();
      } finally {
        this.changed(true);
      }
    }
  }

  setVisibility(human: HumanContext, slug: string, visibility: BotVisibility, confirm?: boolean) {
    const plan = this.planVisibility(human, { slug, visibility }, this.channels.list());
    const { preview } = plan;
    if (!plan.needsWrite) return { applied: true, visibility, preview };
    if (confirm === false || (plan.shrinking && !confirm)) return { applied: false, preview };
    this.commitVisibilityChanges(human, [plan]);
    return { applied: true, visibility, preview };
  }
  switches(human: HumanContext, slug: string, patch: Partial<BotSwitches> = {}) {
    const bot = this.bot(slug);
    if (!this.active(human.humanId) || human.caller === 'bot' || human.humanId !== bot.owner)
      throw new TeamError('bot-principal-required', undefined, { slug });
    const switches = { ...bot.switches, ...patch };
    if (Object.keys(patch).length) {
      this.db.transaction(
        (db) =>
          db
            .prepare('UPDATE persona_bots SET switches_json = ? WHERE slug = ?')
            .run(JSON.stringify(switches), slug),
        ['team', 'bots'],
      );
      if (!switches.joinPrincipalChannels)
        for (const c of this.channels.list())
          if (c.type === 'group' && c.members.includes(slug))
            this.channels.removeGroupMember(c.id, slug);
      this.changed(true);
    }
    return { switches };
  }
  optOut(human: HumanContext, slug: string, optOut: boolean): null {
    this.bot(slug);
    if (!this.active(human.humanId) || human.caller === 'bot')
      throw new TeamError('member-suspended');
    this.db.transaction(
      (db) =>
        optOut
          ? db
              .prepare('INSERT OR IGNORE INTO bot_proactive_opt_outs VALUES (?, ?)')
              .run(slug, human.humanId)
          : db
              .prepare('DELETE FROM bot_proactive_opt_outs WHERE bot_slug = ? AND human_id = ?')
              .run(slug, human.humanId),
      ['team'],
    );
    return null;
  }
  requireProactive(slug: string, humanId: string): void {
    const bot = this.bot(slug);
    this.requireActive(slug);
    if (humanId === bot.owner) return;
    if (
      !bot.switches.proactiveDms ||
      !this.audience(humanId, bot) ||
      this.db.read((db) =>
        db
          .prepare('SELECT 1 FROM bot_proactive_opt_outs WHERE bot_slug = ? AND human_id = ?')
          .get(slug, humanId),
      )
    )
      throw new TeamError('bot-proactive-denied', undefined, { slug, humanId });
  }
  private participantDmId(human: HumanContext, slug: string): string | undefined {
    const row = this.db.read((db) =>
      db
        .prepare(`SELECT channel_id FROM channel_records
        WHERE json_extract(record_json,'$.type')='dm' AND json_extract(record_json,'$.botSlug')=?
        AND json_extract(record_json,'$.dmHumanId')=? LIMIT 1`)
        .get(slug, human.humanId),
    );
    return typeof row?.channel_id === 'string' ? row.channel_id : undefined;
  }
  hasReadableDm(human: HumanContext, slug: string): boolean {
    if (human.caller === 'bot') return false;
    const id = this.participantDmId(human, slug);
    return id !== undefined && this.channelAccess.canRead(human, id);
  }
  dm(human: HumanContext, slug: string) {
    if (human.caller !== 'bot') {
      const participantDm = this.participantDmId(human, slug);
      const channel = this.channels.get(participantDm ?? dmChannelId(slug));
      if (channel?.botSlug === slug && this.channelAccess.canRead(human, channel.id))
        return { ...channel, ...(!this.canReach(human, slug) ? { readOnly: true as const } : {}) };
    }
    this.requireReach(human, slug);
    return this.channels.getOrCreateDm(human, slug, this.bot(slug).body.displayName);
  }
  requireDmPost(human: HumanContext, channel: ChannelRecord): void {
    if (channel.botSlug) {
      const bot = this.bot(channel.botSlug);
      if ((channel.dmHumanId ?? bot.owner) !== human.humanId || !this.audience(human.humanId, bot))
        throw new TeamError('bot-dm-read-only', undefined, {
          slug: bot.slug,
          channelId: channel.id,
        });
    }
  }
  private groupEligible(bot: Bot, channel: ChannelRecord, visibility = bot.visibility): boolean {
    if (
      !bot.switches.joinPrincipalChannels ||
      !this.active(bot.owner) ||
      !this.channelAccess.canRead(humanContext(bot.owner), channel.id, true)
    )
      return false;
    const row = this.db.read((db) =>
      db
        .prepare('SELECT human_id FROM bot_channel_adders WHERE bot_slug = ? AND channel_id = ?')
        .get(bot.slug, channel.id),
    );
    const adder = row ? z.object({ human_id: z.string() }).parse(row).human_id : bot.owner;
    if (this.audience(adder, bot, visibility)) return true;
    const candidates = z
      .array(z.object({ human_id: z.string() }))
      .parse(
        this.db.read((db) =>
          db
            .prepare(
              'SELECT human_id FROM channel_human_members WHERE channel_id=? AND left_at IS NULL',
            )
            .all(channel.id),
        ),
      );
    return candidates.some((candidate) => {
      if (!this.audience(candidate.human_id, bot, visibility)) return false;
      try {
        this.channelAccess.requirePolicy(humanContext(candidate.human_id), channel.id, 'addBots');
        return true;
      } catch (error) {
        if (error instanceof TeamError) return false;
        throw error;
      }
    });
  }
  groupInvitationCandidate(human: HumanContext, slug: string, channelId?: string) {
    const bot = this.bot(slug);
    if (
      !this.audience(human.humanId, bot) ||
      bot.body.paused ||
      !bot.switches.joinPrincipalChannels
    )
      return undefined;
    const ownerHasAccess =
      channelId === undefined
        ? bot.owner === human.humanId
        : this.channelAccess.canRead(humanContext(bot.owner), channelId, true);
    return ownerHasAccess ? {} : { requiredHumanId: bot.owner };
  }
  requireAdd(human: HumanContext, slug: string, channelId: string): void {
    const bot = this.bot(slug);
    this.channelAccess.requirePolicy(human, channelId, 'addBots');
    this.requireReach(human, slug);
    this.requireActive(slug);
    if (!bot.switches.joinPrincipalChannels)
      throw new TeamError('bot-channel-join-disabled', undefined, { slug });
    if (!this.channelAccess.canRead(humanContext(bot.owner), channelId, true))
      throw new TeamError('bot-principal-channel-denied', undefined, { slug, channelId });
  }
  recordAdder(human: HumanContext, slug: string, channelId: string): void {
    this.requireAdd(human, slug, channelId);
    this.db.transaction(
      (db) =>
        db
          .prepare('INSERT OR REPLACE INTO bot_channel_adders VALUES (?, ?, ?)')
          .run(slug, channelId, human.humanId),
      ['team'],
    );
  }
  canRead(slug: string, channel: ChannelRecord): boolean {
    try {
      const bot = this.bot(slug);
      this.requireActive(slug);
      if (channel.deletedAt) return false;
      if (channel.type === 'group')
        return (
          bot.switches.joinPrincipalChannels &&
          this.channelAccess.canRead(humanContext(bot.owner), channel.id, true)
        );
      if (channel.remoteBot)
        return channel.members.includes(slug) && this.roles.isOwner(humanContext(bot.owner));
      if (channel.botSlug === slug) return this.audience(channel.dmHumanId ?? bot.owner, bot);
      if (channel.botSlug || !channel.members.includes(slug) || channel.members.length !== 2)
        return false;
      const peer = this.bot(channel.members.find((id) => id !== slug)!);
      const participant = channel.dmHumanId ?? bot.owner;
      if (peer.visibility.kind === 'private' && bot.visibility.kind === 'public')
        return this.audience(participant, bot) && this.active(peer.owner);
      if (peer.visibility.kind === 'public')
        return this.audience(participant, bot) && this.audience(participant, peer);
      return participant === bot.owner && peer.owner === participant;
    } catch (e) {
      if (e instanceof TeamError) return false;
      throw e;
    }
  }
  requireChannel(slug: string, channel: ChannelRecord, write = false): void {
    const current = this.channels.get(channel.id);
    if (!current)
      throw new TeamError('bot-channel-access-denied', undefined, { slug, channelId: channel.id });
    channel = current;
    if (!this.canRead(slug, channel) || (write && !channel.members.includes(slug)))
      throw new TeamError('bot-channel-access-denied', undefined, { slug, channelId: channel.id });
    if (channel.type === 'group' && write) {
      const bot = this.bot(slug);
      if (!this.groupEligible(bot, channel))
        throw new TeamError('bot-channel-access-denied', undefined, {
          slug,
          channelId: channel.id,
        });
      try {
        this.channelAccess.requirePolicy(humanContext(bot.owner), channel.id, 'post');
      } catch (error) {
        if (error instanceof TeamError)
          throw new TeamError('bot-channel-access-denied', undefined, {
            slug,
            channelId: channel.id,
          });
        throw error;
      }
    }
  }
  requireBotTarget(senderSlug: string, targetSlug: string): void {
    this.requireActive(senderSlug);
    this.requireActive(targetSlug);
    const sender = this.bot(senderSlug),
      target = this.bot(targetSlug);
    if (sender.visibility.kind === 'public' && target.visibility.kind === 'private')
      throw new TeamError('bot-private-target-denied', undefined, { slug: targetSlug });
    if (!this.audience(sender.owner, target))
      throw new TeamError('bot-audience-denied', undefined, { slug: targetSlug });
  }
}
