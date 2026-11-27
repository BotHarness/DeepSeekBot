import { LOCAL_HUMAN_ID } from '../kernel/local-human.js';

interface BotOwnership {
  ownerHumanId?: string | undefined;
}

export const botOwner = (bot: BotOwnership): string => bot.ownerHumanId ?? LOCAL_HUMAN_ID;

export function ownsBot(human: { humanId: string }, bot: BotOwnership | undefined): boolean {
  return bot !== undefined && botOwner(bot) === human.humanId;
}

export function allPublicBotsSql(humanId: string): string {
  return `EXISTS (SELECT 1 FROM human_roles bot_grant
    JOIN host_roles bot_role USING (role_id)
    WHERE bot_grant.human_id = ${humanId} AND bot_role.all_public_bots = 1)`;
}

export function selectedBotRoleIdsSql(visibility: string): string {
  return `SELECT value FROM json_each(${visibility}, '$.audience.roleIds')
    WHERE json_extract(${visibility}, '$.kind') = 'public'
      AND json_extract(${visibility}, '$.audience.kind') = 'roles'`;
}

export function publicBotRoleSourceSql(visibility: string, all: string, selected: string): string {
  return `CASE WHEN json_extract(${visibility}, '$.audience.kind') = 'everyone' THEN 'everyone'
    WHEN ${all} THEN 'all' WHEN ${selected} THEN 'selected' ELSE 'none' END`;
}

export function activeBotHumanSql(human: string, settings: string): string {
  return `(${human}.status = 'active' AND (${settings}.enabled = 1 OR ${settings}.owner_human_id = ${human}.human_id))`;
}

export function botAudienceAccessSql(
  visibility: string,
  viewer: string,
  principal: string,
): string {
  return `(${viewer} = ${principal} OR (json_extract(${visibility}, '$.kind') = 'public' AND (
    json_extract(${visibility}, '$.audience.kind') = 'everyone'
    OR (json_extract(${visibility}, '$.audience.kind') = 'members' AND ${viewer} IN (
      SELECT value FROM json_each(${visibility}, '$.audience.humanIds')))
    OR EXISTS (SELECT 1 FROM human_roles bot_grant JOIN host_roles bot_role USING (role_id)
      WHERE bot_grant.human_id = ${viewer}
        AND (bot_role.all_public_bots = 1 OR bot_grant.role_id IN (${selectedBotRoleIdsSql(visibility)})))
  )))`;
}
