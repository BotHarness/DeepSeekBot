import type { BotHarnessKey, BotHarnessTranslate } from '../locale.js';
import type { TeamModeView } from '../team-bridge.js';
import {
  MANAGE_ROLES,
  canGrant,
  canManage,
  type PermissionEntry,
  type PermissionSource,
  type TeamRole,
} from '../team-roles-bridge.js';

export type PermissionChoice = 'allow' | 'unset' | 'deny';

export const WORKBENCH_GROUPS: readonly (readonly [string, readonly string[]])[] = [
  ['membersRoles', ['members.manage', 'roles.manage', 'team.settings']],
  ['create', ['bots.createPrivate', 'bots.createPublic', 'channels.create']],
  ['manage', ['bots.manageAll', 'channels.manageAll', 'bots.manageGrants', 'im.bind']],
  [
    'compute',
    [
      'models.use',
      'models.configure',
      'modelSources.manage',
      'workspaces.manageShared',
      'workspaces.createFolder',
    ],
  ],
  ['communicate', ['dm.humans']],
  ['oversight', ['approvals.opaqueTools', 'usage.view', 'audit.view', 'privateContent.view']],
];

export const HIGH_RISK: ReadonlySet<string> = new Set([
  'approvals.opaqueTools',
  'privateContent.view',
]);

const OWNER_GRANTED: ReadonlySet<string> = new Set([
  'privateContent.view',
  'modelSources.manage',
  'bots.manageGrants',
]);

export function groupCatalog(
  catalog: readonly PermissionEntry[],
): readonly (readonly [string, readonly string[]])[] {
  const known = new Set(catalog.map((entry) => entry.id));
  const listed = new Set(WORKBENCH_GROUPS.flatMap(([, ids]) => ids));
  const groups = WORKBENCH_GROUPS.map(
    ([group, ids]) => [group, ids.filter((id) => known.has(id))] as const,
  );
  const other = catalog.map((entry) => entry.id).filter((id) => !listed.has(id));
  return [...groups, ['other', other] as const].filter(([, ids]) => ids.length > 0);
}

export function choiceOf(role: TeamRole, id: string): PermissionChoice {
  return role.denied.includes(id) ? 'deny' : role.permissions.includes(id) ? 'allow' : 'unset';
}

export function withChoice(
  role: TeamRole,
  id: string,
  choice: PermissionChoice,
): { permissions: string[]; denied: string[] } {
  const permissions = role.permissions.filter((item) => item !== id);
  const denied = role.denied.filter((item) => item !== id);
  if (choice === 'allow') permissions.push(id);
  if (choice === 'deny') denied.push(id);
  return { permissions, denied };
}

export function optionalText(t: BotHarnessTranslate, key: string): string | undefined {
  const value = t(key as BotHarnessKey);
  return value === key ? undefined : value;
}

export function sourceName(t: BotHarnessTranslate, source: PermissionSource): string {
  if (source.builtin === 'admin') return t('team.role.admin');
  if (source.builtin === 'member') return t('team.role.member');
  return source.name;
}

export function groupTitle(t: BotHarnessTranslate, group: string): string {
  return t(`team.workbench.group.${group}` as BotHarnessKey);
}

export function lockReason(
  t: BotHarnessTranslate,
  view: TeamModeView,
  role: TeamRole,
  id: string,
): string | undefined {
  if (!canManage(view.viewer, MANAGE_ROLES)) return t('team.workbench.readOnly');
  if (role.builtin === 'admin' && OWNER_GRANTED.has(id)) return t('team.workbench.adminExcluded');
  if (!view.viewer.owner && OWNER_GRANTED.has(id)) return t('team.workbench.ownerOnly');
  if (!canGrant(view.viewer, id)) return t('team.workbench.notHeld');
  return undefined;
}
