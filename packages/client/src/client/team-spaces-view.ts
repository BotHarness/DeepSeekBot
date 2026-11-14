import type { BotHarnessTranslate } from './locale.js';
import type { TeamMember } from './team-bridge.js';
import type { TeamRole } from './team-roles-bridge.js';

function roleName(t: BotHarnessTranslate, role: TeamRole): string {
  if (role.builtin === 'admin') return t('team.role.admin');
  if (role.builtin === 'member') return t('team.role.member');
  return role.name;
}
import type { SpaceAudience } from './team-spaces-bridge.js';

export function audienceSummary(
  t: BotHarnessTranslate,
  audience: SpaceAudience | undefined,
  roles: readonly TeamRole[],
  members: readonly TeamMember[],
): string {
  if (audience === undefined || audience.kind === 'everyone')
    return t('team.spaces.audienceEveryone');
  const names =
    audience.kind === 'roles'
      ? audience.roleIds.flatMap((id) => {
          const role = roles.find((item) => item.roleId === id);
          return role === undefined ? [] : [roleName(t, role)];
        })
      : audience.humanIds.flatMap((id) => {
          const member = members.find((item) => item.humanId === id);
          return member === undefined ? [] : [member.displayName];
        });
  if (names.length === 0)
    return t(
      audience.kind === 'roles'
        ? 'team.spaces.audienceSomeRoles'
        : 'team.spaces.audienceSomePeople',
    );
  return t('team.spaces.audienceList', { names: names.join(', ') });
}
