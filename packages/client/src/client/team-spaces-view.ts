import type { BotHarnessTranslate } from './locale.js';
import type { AudienceDirectory, AudienceRole, SpaceAudience } from './team-spaces-bridge.js';

export function roleName(t: BotHarnessTranslate, role: AudienceRole): string {
  if (role.builtin === 'admin') return t('team.role.admin');
  if (role.builtin === 'member') return t('team.role.member');
  return role.name;
}

export function audienceSummary(
  t: BotHarnessTranslate,
  audience: SpaceAudience | undefined,
  { roles, members }: AudienceDirectory,
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

export function audienceOptions(
  t: BotHarnessTranslate,
  audience: SpaceAudience,
  stored: SpaceAudience | undefined,
  { roles, members }: AudienceDirectory,
): { id: string; label: string }[] {
  if (audience.kind === 'everyone') return [];
  const listed =
    audience.kind === 'roles'
      ? roles.map((role) => ({ id: role.roleId, label: roleName(t, role) }))
      : members.map((member) => ({ id: member.humanId, label: member.displayName }));
  const kept =
    stored?.kind === 'roles' && audience.kind === 'roles'
      ? stored.roleIds
      : stored?.kind === 'members' && audience.kind === 'members'
        ? stored.humanIds
        : [];
  const label = t(
    audience.kind === 'roles' ? 'team.spaces.unavailableRole' : 'team.spaces.inactiveMember',
  );
  return [
    ...listed,
    ...kept.filter((id) => !listed.some((option) => option.id === id)).map((id) => ({ id, label })),
  ];
}
