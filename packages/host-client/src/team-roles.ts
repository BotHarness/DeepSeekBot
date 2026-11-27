import type {
  BotAccessRolesView,
  BotRoleAccessSource,
  HostRoleRevision,
  PublicBotAudience,
  RoleBotScopeUpdate,
  RoleBotScopeView,
  TeamAccessBot,
} from '@botharness/host-protocol/team-roles';
import { answer, count, record, type HostCall } from './host-answer';

export { STALE_HOST_ROLE } from '@botharness/host-protocol/team-roles';
export type {
  BotAccessRolesView,
  BotRoleAccessSource,
  HostRoleRevision,
  HostRoleUpdatePrecondition,
  PublicBotAudience,
  RoleBotScope,
  RoleBotScopeUpdate,
  RoleBotScopeView,
  TeamAccessBot,
} from '@botharness/host-protocol/team-roles';

export function parseHostRoleRevisions(value: unknown): HostRoleRevision[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const revisions: HostRoleRevision[] = [];
  for (const item of value) {
    const row = record(item);
    const roleId = row?.['roleId'];
    const revision = row?.['revision'];
    if (typeof roleId !== 'string' || !count(revision) || revision === 0) return undefined;
    revisions.push({ roleId, revision });
  }
  return revisions;
}

function isTeamAccessBot(value: unknown): value is TeamAccessBot {
  const row = record(value);
  return typeof row?.slug === 'string' && typeof row.displayName === 'string';
}

function isBotRoleAccessSource(value: unknown): value is BotRoleAccessSource {
  return value === 'everyone' || value === 'all' || value === 'selected';
}

function isPublicBotAudience(value: unknown): value is PublicBotAudience {
  return value === 'everyone' || value === 'roles' || value === 'members';
}

function isRoleBotScopeView(value: unknown): value is RoleBotScopeView {
  const row = record(value);
  return (
    typeof row?.roleId === 'string' &&
    count(row.revision) &&
    row.revision > 0 &&
    (row.kind === 'all' || row.kind === 'selected') &&
    typeof row.canSetAll === 'boolean' &&
    typeof row.canSetSelected === 'boolean' &&
    Array.isArray(row.bots) &&
    row.bots.every((value: unknown) => {
      const bot = record(value);
      return (
        isTeamAccessBot(bot) &&
        typeof bot.selected === 'boolean' &&
        typeof bot.editable === 'boolean' &&
        typeof bot.availableToMembers === 'boolean' &&
        isPublicBotAudience(bot.audience) &&
        (bot.source === 'none' || isBotRoleAccessSource(bot.source))
      );
    })
  );
}

function isBotAccessRolesView(value: unknown): value is BotAccessRolesView {
  const row = record(value);
  if (!row || !isTeamAccessBot(row)) return false;
  const audience = row.audience;
  return (
    (audience === 'private' || isPublicBotAudience(audience)) &&
    typeof row.ownerHumanId === 'string' &&
    typeof row.availableToMembers === 'boolean' &&
    Array.isArray(row.roles) &&
    row.roles.every((value: unknown) => {
      const role = record(value);
      return (
        typeof role?.roleId === 'string' &&
        typeof role.name === 'string' &&
        isBotRoleAccessSource(role.source)
      );
    }) &&
    Array.isArray(row.invitedMembers) &&
    row.invitedMembers.every((value: unknown) => {
      const member = record(value);
      return typeof member?.humanId === 'string' && typeof member.displayName === 'string';
    })
  );
}

export async function readRoleBotScope(host: HostCall, roleId: string): Promise<RoleBotScopeView> {
  return answer(await host.call('roleBotScope', { roleId }), isRoleBotScopeView, 'roleBotScope');
}

export async function setRoleBotScope(
  host: HostCall,
  patch: RoleBotScopeUpdate,
): Promise<RoleBotScopeView> {
  return answer(
    await host.call('roleBotScopeSet', { ...patch }),
    isRoleBotScopeView,
    'roleBotScopeSet',
  );
}

export async function readBotAccessDirectory(host: HostCall): Promise<TeamAccessBot[]> {
  return answer(
    await host.call('botAccessDirectory'),
    (value): value is TeamAccessBot[] => Array.isArray(value) && value.every(isTeamAccessBot),
    'botAccessDirectory',
  );
}

export async function readBotAccessRoles(
  host: HostCall,
  slug: string,
): Promise<BotAccessRolesView> {
  return answer(
    await host.call('botAccessRoles', { slug }),
    isBotAccessRolesView,
    'botAccessRoles',
  );
}
