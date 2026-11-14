import type { BotHarnessTranslate } from './locale.js';
import type { ChannelAccess, ChannelVisibility, RoleChoice } from './team-channels-bridge.js';

export function visibilitySummary(
  t: BotHarnessTranslate,
  visibility: ChannelVisibility,
  roles: readonly RoleChoice[],
): string {
  if (visibility.kind === 'public') return t('channelAccess.publicHint');
  if (visibility.kind === 'private') return t('channelAccess.privateHint');
  const names = visibility.roleIds.map((roleId) => {
    const role = roles.find((candidate) => candidate.roleId === roleId);
    return role === undefined ? roleId : roleChoiceLabel(t, role);
  });
  return t('channelAccess.rolesHint', { roles: names.join(', ') });
}

export function postRestricted(access: ChannelAccess | undefined): boolean {
  return access !== undefined && access.role === 'member' && access.policy.post === 'admins';
}

export function filterDirectory<T extends { readonly displayName: string }>(
  people: readonly T[],
  query: string,
): T[] {
  const needle = query.trim().toLocaleLowerCase();
  const sorted = [...people].sort((a, b) => a.displayName.localeCompare(b.displayName));
  return needle.length === 0
    ? sorted
    : sorted.filter((person) => person.displayName.toLocaleLowerCase().includes(needle));
}

export function roleChoiceLabel(t: BotHarnessTranslate, role: RoleChoice): string {
  if (role.roleId === 'admin') return t('team.role.admin');
  if (role.roleId === 'member') return t('team.role.member');
  return role.name;
}
