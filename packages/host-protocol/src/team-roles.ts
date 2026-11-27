export const STALE_HOST_ROLE = 'stale-role';

export interface HostRoleRevision {
  readonly roleId: string;
  readonly revision: number;
}

export interface HostRoleUpdatePrecondition {
  readonly roleId: string;
  readonly expectedRevision: number;
}

export type RoleBotScope = { kind: 'all' } | { kind: 'selected'; botSlugs: string[] };

export interface RoleBotScopeUpdate extends HostRoleUpdatePrecondition {
  scope: RoleBotScope;
}

export interface TeamAccessBot {
  slug: string;
  displayName: string;
}

export type BotRoleAccessSource = 'everyone' | 'all' | 'selected';

export interface RoleBotScopeView extends HostRoleRevision {
  kind: RoleBotScope['kind'];
  canSetAll: boolean;
  canSetSelected: boolean;
  bots: (TeamAccessBot & {
    selected: boolean;
    editable: boolean;
    source: BotRoleAccessSource | 'none';
    availableToMembers: boolean;
  })[];
}

export interface BotAccessRolesView extends TeamAccessBot {
  audience: 'private' | 'everyone' | 'roles' | 'members';
  ownerHumanId: string;
  availableToMembers: boolean;
  roles: { roleId: string; name: string; source: BotRoleAccessSource }[];
  invitedMembers: { humanId: string; displayName: string }[];
}
