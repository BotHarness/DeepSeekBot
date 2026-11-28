export const STALE_HOST_ROLE = 'stale-role';

export interface HostRoleRevision {
  readonly roleId: string;
  readonly revision: number;
}

export interface HostRoleUpdatePrecondition {
  readonly roleId: string;
  readonly expectedRevision: number;
}

export type RoleBotScope =
  | { kind: 'all' }
  | { kind: 'selected'; botSlugs: string[]; expectedEditableBotsRevision: string };

export interface RoleBotScopeUpdate extends HostRoleUpdatePrecondition {
  scope: RoleBotScope;
}

export interface TeamAccessBot {
  slug: string;
  displayName: string;
}

export interface TeamWorkbenchBot extends TeamAccessBot {
  requiresAudit?: true;
}

export interface TeamWorkbenchChannel {
  id: string;
  name: string;
  visibility: 'public' | 'roles' | 'private';
  requiresAudit?: true;
}

export type BotRoleAccessSource = 'everyone' | 'all' | 'selected';

export type PublicBotAudience = 'everyone' | 'roles' | 'members';

export interface RoleBotScopeView extends HostRoleRevision {
  kind: RoleBotScope['kind'];
  editableBotsRevision: string;
  canSetAll: boolean;
  canSetSelected: boolean;
  bots: (TeamAccessBot & {
    selected: boolean;
    editable: boolean;
    source: BotRoleAccessSource | 'none';
    audience: PublicBotAudience;
    availableToMembers: boolean;
  })[];
}

export interface BotAccessRolesView extends TeamAccessBot {
  audience: 'private' | PublicBotAudience;
  ownerHumanId: string;
  availableToMembers: boolean;
  roles: { roleId: string; name: string; source: BotRoleAccessSource }[];
  invitedMembers: { humanId: string; displayName: string }[];
}
