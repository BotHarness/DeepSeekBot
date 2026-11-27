import type { HostRoleRevision } from '@botharness/host-protocol/team-roles';
import { count, record } from './host-answer';

export { STALE_HOST_ROLE } from '@botharness/host-protocol/team-roles';
export type {
  HostRoleRevision,
  HostRoleUpdatePrecondition,
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
