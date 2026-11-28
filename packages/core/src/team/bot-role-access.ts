import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import type { ChannelStore } from '../channels/store.js';
import type { TeamChannels } from './channels.js';
import {
  STALE_HOST_ROLE,
  type BotAccessRolesView,
  type BotInternalMembersView,
  type RoleBotScopeUpdate,
  type RoleBotScopeView,
  type TeamAccessBot,
} from '@botharness/host-protocol/team-roles';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { CommittedOperationInterruptedError } from '../database/owner-errors.js';
import type { HumanContext } from '../humans/context.js';
import {
  activeBotHumanSql,
  botAudienceAccessSql,
  publicBotRoleSourceSql,
  selectedBotRoleIdsSql,
} from '../team-policy/bot-access.js';
import { botVisibilitySchema, type BotVisibility } from '../team-policy/bot-contract.js';
import { TeamError } from '../team-policy/error.js';
import type { ReplaceBotMemory, TeamBots } from './bots.js';
import type { TeamRoles } from './roles.js';

const botSummary = z.object({ slug: z.string(), displayName: z.string() });
const botRow = botSummary.extend({
  ownerHumanId: z.string(),
  visibility: z.string(),
  availableToMembers: z.coerce.boolean(),
});
const memberSummary = z.object({ humanId: z.string(), displayName: z.string() });
const RECENT_DM_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const RECENT_DM_LIMIT = 20;
const roleSource = z.enum(['everyone', 'all', 'selected']);

const manageableBotSql = `(b.owner_human_id = viewer.human_id
  OR (? = 1 AND json_extract(b.visibility_json, '$.kind') = 'public'))`;
const liveBotSql = `json_extract(b.body, '$.deletedAt') IS NULL
  AND NOT EXISTS (SELECT 1 FROM persona_bot_deletions d WHERE d.slug = b.slug)`;
const visibleBotFrom = `FROM persona_bots b
  JOIN humans principal ON principal.human_id = b.owner_human_id
  CROSS JOIN team_settings s
  JOIN humans viewer ON viewer.human_id = ? AND ${activeBotHumanSql({ human: 'viewer', settings: 's' })}`;

function editableBotsRevision(
  bots: readonly { slug: string; selected: boolean; editable: boolean }[],
): string {
  return createHash('sha256')
    .update(
      JSON.stringify(
        bots.filter((bot) => bot.editable).map(({ slug, selected }) => [slug, selected]),
      ),
    )
    .digest('hex');
}

export class TeamBotRoleAccess {
  constructor(
    private readonly db: OperationalDatabaseModulePort,
    private readonly roles: TeamRoles,
    private readonly bots: TeamBots,
    private readonly channels: ChannelStore,
    private readonly channelAccess: TeamChannels,
    private readonly now: () => number,
    private readonly replaceBotMemory?: ReplaceBotMemory,
  ) {}

  private permissions(human: HumanContext) {
    if (human.caller === 'bot') throw new TeamError('permission-required');
    return this.roles.permissions(human);
  }

  directory(human: HumanContext): TeamAccessBot[] {
    const manageAll = this.permissions(human).includes('bots.manageAll');
    return this.db.read((db) =>
      botSummary.array().parse(
        db
          .prepare(`SELECT b.slug, json_extract(b.body, '$.displayName') AS displayName
        ${visibleBotFrom} WHERE ${liveBotSql} AND ${manageableBotSql} ORDER BY b.slug`)
          .all(human.humanId, Number(manageAll)),
      ),
    );
  }

  private manageableBot(db: DatabaseSync, human: HumanContext, slug: string, manageAll: boolean) {
    const raw = db
      .prepare(`SELECT b.slug, json_extract(b.body, '$.displayName') AS displayName,
        b.owner_human_id AS ownerHumanId, b.visibility_json AS visibility,
        s.enabled = 1 AND principal.status = 'active' AS availableToMembers
        ${visibleBotFrom} WHERE b.slug = ? AND ${liveBotSql} AND ${manageableBotSql}`)
      .get(human.humanId, slug, Number(manageAll));
    if (!raw) throw new TeamError('bot-not-found');
    return botRow.parse(raw);
  }

  internalMembers(human: HumanContext, slug: string): BotInternalMembersView {
    const permissions = this.permissions(human);
    const { displayName, ownerHumanId, dmMembers } = this.db.read((db) => {
      const bot = this.manageableBot(db, human, slug, permissions.includes('bots.manageAll'));
      const dmMembers = memberSummary.array().parse(
        db
          .prepare(`
        SELECT candidate.human_id AS humanId, candidate.display_name AS displayName
        FROM humans candidate CROSS JOIN team_settings s
        JOIN humans principal ON principal.human_id = ?
        CROSS JOIN (SELECT ? AS visibility) input
        WHERE (? = 1 OR candidate.human_id = ?)
          AND ${activeBotHumanSql({ human: 'candidate', settings: 's' })}
          AND ${activeBotHumanSql({ human: 'principal', settings: 's' })}
          AND ${botAudienceAccessSql({
            visibility: 'input.visibility',
            viewer: 'candidate.human_id',
            principal: 'principal.human_id',
          })}
        ORDER BY candidate.human_id
      `)
          .all(
            bot.ownerHumanId,
            bot.visibility,
            Number(permissions.includes('members.manage')),
            human.humanId,
          ),
      );
      return { displayName: bot.displayName, ownerHumanId: bot.ownerHumanId, dmMembers };
    });

    const visible = this.channelAccess.visibleIds(human, false);
    const channels = this.channels
      .list()
      .filter((channel) => visible.has(channel.id) && channel.members.includes(slug))
      .sort((a, b) => a.id.localeCompare(b.id));
    const now = this.now();
    const cutoff = now - RECENT_DM_WINDOW_MS;
    const recentInteractions = channels.flatMap((channel) => {
      if (channel.type !== 'dm' || channel.botSlug !== slug || channel.remoteBot) return [];
      const humanId = channel.dmHumanId ?? ownerHumanId;
      if (humanId !== human.humanId) return [];
      const at = this.channels.latestMessage(channel.id)?.at;
      if (!at) return [];
      const time = Date.parse(at);
      return time >= cutoff && time <= now ? [{ humanId, channelId: channel.id, at, time }] : [];
    });
    recentInteractions.sort((a, b) => b.time - a.time);
    return {
      slug,
      displayName,
      dmMembers,
      recentInteractions: recentInteractions
        .slice(0, RECENT_DM_LIMIT)
        .map(({ humanId, channelId, at }) => ({ humanId, channelId, at })),
      channels: channels.map(({ id, name, type }) => ({ channelId: id, name, type })),
    };
  }

  botRoles(human: HumanContext, slug: string): BotAccessRolesView {
    const permissions = this.permissions(human);
    const manageAll = permissions.includes('bots.manageAll');
    return this.db.read((db) => {
      const { visibility, ...bot } = this.manageableBot(db, human, slug, manageAll);
      const access = botVisibilitySchema.parse(JSON.parse(visibility));
      if (access.kind === 'private')
        return {
          ...bot,
          audience: 'private',
          availableToMembers: false,
          roles: [],
          invitedMembers: [],
        };
      const roles = z
        .object({ roleId: z.string(), name: z.string(), source: roleSource })
        .array()
        .parse(
          db
            .prepare(`SELECT roleId, name, source FROM (
          SELECT r.role_id AS roleId, r.name, ${publicBotRoleSourceSql({
            visibility: 'input.visibility',
            allPublic: 'r.all_public_bots',
            selected: `r.role_id IN (${selectedBotRoleIdsSql('input.visibility')})`,
          })} AS source
          FROM host_roles r CROSS JOIN (SELECT ? AS visibility) input
          ) WHERE source <> 'none' ORDER BY roleId`)
            .all(visibility),
        );
      const invitedMembers =
        access.audience.kind === 'members' && permissions.includes('members.manage')
          ? z
              .object({ humanId: z.string(), displayName: z.string() })
              .array()
              .parse(
                db
                  .prepare(`
          SELECT human_id AS humanId, display_name AS displayName FROM humans
          WHERE status = 'active' AND human_id IN (SELECT value FROM json_each(?)) ORDER BY human_id`)
                  .all(JSON.stringify(access.audience.humanIds)),
              )
          : [];
      return { ...bot, audience: access.audience.kind, roles, invitedMembers };
    });
  }

  private roleBots(
    human: HumanContext,
    roleId: string,
    allPublic: boolean,
    canSetSelected: boolean,
  ) {
    const permissions = this.permissions(human);
    const manageAll = permissions.includes('bots.manageAll');
    const canShare = permissions.includes('bots.createPublic');
    return this.db
      .read((db) =>
        botRow
          .extend({
            selected: z.coerce.boolean(),
            manageable: z.coerce.boolean(),
            source: roleSource.or(z.literal('none')),
            audience: z.enum(['everyone', 'roles', 'members']),
          })
          .array()
          .parse(
            db
              .prepare(`SELECT candidate.*, ${publicBotRoleSourceSql({
                visibility: 'candidate.visibility',
                allPublic: '?',
                selected: 'candidate.selected',
              })} AS source FROM (
        SELECT b.slug, json_extract(b.body,'$.displayName') AS displayName,
        b.owner_human_id AS ownerHumanId, b.visibility_json AS visibility,
        s.enabled = 1 AND principal.status = 'active' AS availableToMembers,
        json_extract(b.visibility_json, '$.audience.kind') AS audience,
        ? IN (${selectedBotRoleIdsSql('b.visibility_json')}) AS selected,
        ${manageableBotSql} AS manageable
        ${visibleBotFrom} WHERE ${liveBotSql}
        AND json_extract(b.visibility_json, '$.kind') = 'public'
        AND (manageable OR (${activeBotHumanSql({ human: 'principal', settings: 's' })}
          AND ${botAudienceAccessSql({
            visibility: 'b.visibility_json',
            viewer: 'viewer.human_id',
            principal: 'b.owner_human_id',
          })}))
        ) candidate ORDER BY slug`)
              .all(Number(allPublic), roleId, Number(manageAll), human.humanId),
          ),
      )
      .map((bot) => ({
        ...bot,
        editable:
          canSetSelected &&
          bot.audience === 'roles' &&
          bot.manageable &&
          (bot.selected || canShare),
      }));
  }

  scope(human: HumanContext, roleId: string): RoleBotScopeView {
    const { role, canSetAll, canSetSelected } = this.roles.botScopeTarget(human, roleId);
    const bots = this.roleBots(human, roleId, role.allPublicBots, canSetSelected).map(
      ({ slug, displayName, selected, editable, source, audience, availableToMembers }) => ({
        slug,
        displayName,
        selected,
        editable,
        source,
        audience,
        availableToMembers,
      }),
    );
    return {
      roleId,
      revision: role.revision,
      editableBotsRevision: editableBotsRevision(bots),
      kind: role.allPublicBots ? 'all' : 'selected',
      canSetAll,
      canSetSelected,
      bots,
    };
  }

  private requireScopeEdit(human: HumanContext, input: RoleBotScopeUpdate) {
    const { roleId, expectedRevision, scope } = input;
    const { role, canSetAll, canSetSelected } = this.roles.botScopeTarget(human, roleId);
    if (scope.kind === 'all' ? !canSetAll : !canSetSelected)
      throw new TeamError('permission-required');
    if (expectedRevision !== role.revision) throw new TeamError(STALE_HOST_ROLE);
    return role;
  }

  async setScope(human: HumanContext, input: RoleBotScopeUpdate): Promise<RoleBotScopeView> {
    const { roleId, expectedRevision, scope } = input;
    const allPublic = scope.kind === 'all';
    const plan = () => {
      const role = this.requireScopeEdit(human, input);
      const updates = scope.kind === 'selected' ? this.selectedUpdates(human, roleId, scope) : [];
      return {
        scopeChanged: allPublic !== role.allPublicBots,
        changes: this.bots
          .planVisibilityChanges(human, updates)
          .filter((change) => change.needsWrite),
      };
    };
    const planned = plan();
    const moves = (current: typeof planned) =>
      current.changes.flatMap(({ bot, memory }) =>
        memory && memory.source !== memory.target
          ? [
              {
                slug: bot.slug,
                source: memory.source,
                target: memory.target,
              },
            ]
          : [],
      );
    const plannedMoves = moves(planned);
    const commit = (current: typeof planned) => {
      if (!current.scopeChanged && !current.changes.length) return this.scope(human, roleId);
      this.bots.commitVisibilityChanges(human, current.changes, {
        ...(current.scopeChanged && !allPublic ? { revokeAllPublicForRole: roleId } : {}),
        write: (db) => {
          this.requireScopeEdit(human, input);
          const result = db
            .prepare(`UPDATE host_roles SET all_public_bots = ?, revision = revision + ?
        WHERE role_id = ? AND revision = ?`)
            .run(Number(allPublic), Number(current.scopeChanged), roleId, expectedRevision);
          if (!result.changes) throw new TeamError(STALE_HOST_ROLE);
        },
      });
      try {
        return this.scope(human, roleId);
      } catch (error) {
        throw new CommittedOperationInterruptedError(
          'Reading the committed Bot scope failed',
          error,
        );
      }
    };

    const replaceBotMemory = this.replaceBotMemory;
    if (!replaceBotMemory || !plannedMoves.length) return commit(planned);
    const apply = plannedMoves.reduceRight<() => RoleBotScopeView | Promise<RoleBotScopeView>>(
      (next, move) => () => replaceBotMemory(move.slug, next, () => move.target),
      () => {
        const current = plan();
        if (JSON.stringify(moves(current)) !== JSON.stringify(plannedMoves))
          throw new TeamError(STALE_HOST_ROLE);
        return commit(current);
      },
    );
    return apply();
  }

  private selectedUpdates(
    human: HumanContext,
    roleId: string,
    scope: Extract<RoleBotScopeUpdate['scope'], { kind: 'selected' }>,
  ) {
    const { botSlugs, expectedEditableBotsRevision } = scope;
    const editable = this.roleBots(human, roleId, false, true).filter((bot) => bot.editable);
    if (editableBotsRevision(editable) !== expectedEditableBotsRevision)
      throw new TeamError(STALE_HOST_ROLE);
    const desired = new Set(botSlugs);
    const editableSlugs = new Set(editable.map((bot) => bot.slug));
    if (botSlugs.some((slug) => !editableSlugs.has(slug))) throw new TeamError('bot-not-editable');
    return editable
      .filter((bot) => bot.selected || desired.has(bot.slug))
      .map((bot) => {
        const current = botVisibilitySchema.parse(JSON.parse(bot.visibility));
        if (current.kind !== 'public' || current.audience.kind !== 'roles')
          throw new TeamError(STALE_HOST_ROLE);
        if (bot.selected === desired.has(bot.slug)) return { slug: bot.slug, visibility: current };
        const roleIds = bot.selected
          ? current.audience.roleIds.filter((id) => id !== roleId)
          : [...current.audience.roleIds, roleId];
        return {
          slug: bot.slug,
          visibility: {
            kind: 'public',
            audience: { kind: 'roles', roleIds: z.string().array().max(1000).parse(roleIds) },
          } satisfies BotVisibility,
        };
      });
  }
}
