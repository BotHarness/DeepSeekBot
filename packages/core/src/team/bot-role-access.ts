import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import {
  STALE_HOST_ROLE,
  type BotAccessRolesView,
  type RoleBotScopeUpdate,
  type RoleBotScopeView,
  type TeamAccessBot,
} from '@botharness/host-protocol/team-roles';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { HumanContext } from '../humans/context.js';
import {
  activeBotHumanSql,
  botAudienceAccessSql,
  publicBotRoleSourceSql,
  selectedBotRoleIdsSql,
} from '../team-policy/bot-access.js';
import { botVisibilitySchema } from '../team-policy/bot-contract.js';
import { TeamError } from '../team-policy/error.js';
import { botMemorySpaceId } from '../workspaces/space-memory.js';
import type { TeamRoles } from './roles.js';

const botSummary = z.object({ slug: z.string(), displayName: z.string() });
const botRow = botSummary.extend({
  ownerHumanId: z.string(),
  visibility: z.string(),
  availableToMembers: z.coerce.boolean(),
});
const roleSource = z.enum(['everyone', 'all', 'selected']);

const manageableBotSql = `(b.owner_human_id = viewer.human_id
  OR (? = 1 AND json_extract(b.visibility_json, '$.kind') = 'public'))`;
const liveBotSql = `json_extract(b.body, '$.deletedAt') IS NULL
  AND NOT EXISTS (SELECT 1 FROM persona_bot_deletions d WHERE d.slug = b.slug)`;
const visibleBotFrom = `FROM persona_bots b
  JOIN humans principal ON principal.human_id = b.owner_human_id
  CROSS JOIN team_settings s
  JOIN humans viewer ON viewer.human_id = ? AND ${activeBotHumanSql('viewer', 's')}`;

export class TeamBotRoleAccess {
  constructor(
    private readonly db: OperationalDatabaseModulePort,
    private readonly roles: TeamRoles,
    private readonly changed: (revoked: ReadonlySet<string> | 'all-public') => void,
    private readonly recordVisibilityChange: (
      human: HumanContext,
      bot: TeamAccessBot & { ownerHumanId: string },
      db: DatabaseSync,
    ) => void,
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

  botRoles(human: HumanContext, slug: string): BotAccessRolesView {
    const manageAll = this.permissions(human).includes('bots.manageAll');
    return this.db.read((db) => {
      const raw = db
        .prepare(`SELECT b.slug, json_extract(b.body, '$.displayName') AS displayName,
        b.owner_human_id AS ownerHumanId, b.visibility_json AS visibility,
        s.enabled = 1 AND principal.status = 'active' AS availableToMembers
        ${visibleBotFrom} WHERE b.slug = ? AND ${liveBotSql} AND ${manageableBotSql}`)
        .get(human.humanId, slug, Number(manageAll));
      if (!raw) throw new TeamError('bot-not-found');
      const { visibility, ...bot } = botRow.parse(raw);
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
          SELECT r.role_id AS roleId, r.name, ${publicBotRoleSourceSql('input.visibility', 'r.all_public_bots', `r.role_id IN (${selectedBotRoleIdsSql('input.visibility')})`)} AS source
          FROM host_roles r CROSS JOIN (SELECT ? AS visibility) input
          ) WHERE source <> 'none' ORDER BY roleId`)
            .all(visibility),
        );
      const invitedMembers =
        access.audience.kind === 'members'
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
              .prepare(`SELECT candidate.*, ${publicBotRoleSourceSql('candidate.visibility', '?', 'candidate.selected')} AS source FROM (
        SELECT b.slug, json_extract(b.body,'$.displayName') AS displayName,
        b.owner_human_id AS ownerHumanId, b.visibility_json AS visibility,
        s.enabled = 1 AND principal.status = 'active' AS availableToMembers,
        json_extract(b.visibility_json, '$.audience.kind') AS audience,
        ? IN (${selectedBotRoleIdsSql('b.visibility_json')}) AS selected,
        ${manageableBotSql} AS manageable
        ${visibleBotFrom} WHERE ${liveBotSql}
        AND json_extract(b.visibility_json, '$.kind') = 'public'
        AND (manageable OR (${activeBotHumanSql('principal', 's')}
          AND ${botAudienceAccessSql('b.visibility_json', 'viewer.human_id', 'b.owner_human_id')}))
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
      kind: role.allPublicBots ? 'all' : 'selected',
      canSetAll,
      canSetSelected,
      bots,
    };
  }

  setScope(human: HumanContext, input: RoleBotScopeUpdate): RoleBotScopeView {
    const { roleId, expectedRevision, scope } = input;
    const { role, canSetAll, canSetSelected } = this.roles.botScopeTarget(human, roleId);
    const allPublic = scope.kind === 'all';
    if (allPublic ? !canSetAll : !canSetSelected) throw new TeamError('permission-required');
    if (expectedRevision !== role.revision) throw new TeamError(STALE_HOST_ROLE);

    const updates =
      scope.kind === 'selected' ? this.selectedUpdates(human, roleId, scope.botSlugs) : [];
    if (allPublic === role.allPublicBots && !updates.length) return this.scope(human, roleId);
    this.db.transaction(
      (db) => {
        const result = db
          .prepare(`UPDATE host_roles SET all_public_bots = ?, revision = revision + ?
        WHERE role_id = ? AND revision = ?`)
          .run(
            Number(allPublic),
            Number(allPublic !== role.allPublicBots),
            roleId,
            expectedRevision,
          );
        if (!result.changes) throw new TeamError(STALE_HOST_ROLE);
        for (const { bot, visibility } of updates) {
          if (bot.ownerHumanId !== human.humanId) this.recordVisibilityChange(human, bot, db);
          db.prepare('UPDATE persona_bots SET visibility_json = ? WHERE slug = ?').run(
            JSON.stringify(visibility),
            bot.slug,
          );
          db.prepare('UPDATE workspace_spaces SET audience_json = ? WHERE space_id = ?').run(
            JSON.stringify(visibility.audience),
            botMemorySpaceId(bot.slug),
          );
        }
      },
      ['team', 'bots', 'workspace-spaces', 'private-audit'],
    );
    this.changed(
      role.allPublicBots && !allPublic
        ? 'all-public'
        : new Set(updates.filter(({ bot }) => bot.selected).map(({ bot }) => bot.slug)),
    );
    return this.scope(human, roleId);
  }

  private selectedUpdates(human: HumanContext, roleId: string, botSlugs: string[]) {
    const editable = this.roleBots(human, roleId, false, true).filter((bot) => bot.editable);
    const desired = new Set(botSlugs);
    const editableSlugs = new Set(editable.map((bot) => bot.slug));
    if (botSlugs.some((slug) => !editableSlugs.has(slug))) throw new TeamError('bot-not-editable');
    return editable
      .filter((bot) => bot.selected !== desired.has(bot.slug))
      .map((bot) => {
        const current = botVisibilitySchema.parse(JSON.parse(bot.visibility));
        if (current.kind !== 'public' || current.audience.kind !== 'roles')
          throw new TeamError(STALE_HOST_ROLE);
        const roleIds = bot.selected
          ? current.audience.roleIds.filter((id) => id !== roleId)
          : [...current.audience.roleIds, roleId];
        return {
          bot,
          visibility: {
            kind: 'public',
            audience: { kind: 'roles', roleIds: z.string().array().max(1000).parse(roleIds) },
          },
        };
      });
  }
}
