import type { BotHarnessKey } from '../locale.js';
import type { TeamMember, TeamModeView } from '../team-bridge.js';
import { MANAGE_MEMBERS, MANAGE_ROLES, canManage, type TeamRole } from '../team-roles-bridge.js';

export type TeamSectionGroupId = 'people' | 'resources' | 'permissions' | 'settings';

export type TeamSectionId = 'members' | 'channels' | 'roles' | 'externalRoles' | 'imConnections';

export interface TeamSectionContext {
  readonly view: TeamModeView | undefined;
  readonly roles: readonly TeamRole[];
  readonly members: readonly TeamMember[];
  readonly imConnections?: boolean;
}

export interface TeamSectionGroup {
  readonly id: TeamSectionGroupId;
  readonly label: BotHarnessKey;
}

export interface TeamSection {
  readonly id: TeamSectionId;
  readonly group: TeamSectionGroupId;
  readonly icon: string;
  readonly label: BotHarnessKey;
  readonly priority: number;
  visible(context: TeamSectionContext): boolean;
  count(context: TeamSectionContext): number | undefined;
}

export const TEAM_SECTION_GROUPS: readonly TeamSectionGroup[] = [
  { id: 'people', label: 'team.workbench.section.people' },
  { id: 'resources', label: 'team.workbench.channels.resources' },
  { id: 'permissions', label: 'team.workbench.section.permissions' },
  { id: 'settings', label: 'team.workbench.section.settings' },
];

export const TEAM_SECTIONS: readonly TeamSection[] = [
  {
    id: 'members',
    group: 'people',
    icon: 'users',
    label: 'team.workbench.members',
    priority: 2,
    visible: ({ view }) => view !== undefined && canManage(view.viewer, MANAGE_MEMBERS),
    count: ({ members }) => members.length,
  },
  {
    id: 'channels',
    group: 'resources',
    icon: 'hash',
    label: 'team.workbench.channels.title',
    priority: 1,
    visible: ({ view }) => view?.enabled === true,
    count: () => undefined,
  },
  {
    id: 'roles',
    group: 'permissions',
    icon: 'lock',
    label: 'team.workbench.internalRoles',
    priority: 0,
    visible: ({ view }) => view === undefined || canManage(view.viewer, MANAGE_ROLES),
    count: ({ roles }) => roles.length,
  },
  {
    id: 'externalRoles',
    group: 'permissions',
    icon: 'globe',
    label: 'team.externalRoles.title',
    priority: 3,
    visible: ({ view }) => view?.viewer.owner === true,
    count: () => undefined,
  },
  {
    id: 'imConnections',
    group: 'settings',
    icon: 'messages-square',
    label: 'team.imConnections.title',
    priority: 4,
    visible: ({ view, imConnections }) => imConnections === true && view?.viewer.owner === true,
    count: () => undefined,
  },
];

export function visibleSections(context: TeamSectionContext): readonly TeamSection[] {
  return TEAM_SECTIONS.filter((section) => section.visible(context));
}

export function resolveSection(
  context: TeamSectionContext,
  requested: TeamSectionId | undefined,
): TeamSection | undefined {
  const sections = visibleSections(context);
  return (
    sections.find((section) => section.id === requested) ??
    [...sections].sort((left, right) => left.priority - right.priority)[0]
  );
}
