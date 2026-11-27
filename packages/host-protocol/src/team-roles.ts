export const STALE_HOST_ROLE = 'stale-role';

export interface HostRoleRevision {
  readonly roleId: string;
  readonly revision: number;
}

export interface HostRoleUpdatePrecondition {
  readonly roleId: string;
  readonly expectedRevision: number;
}
