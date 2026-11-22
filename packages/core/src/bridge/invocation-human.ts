import { type TeamService } from '../team/service.js';
import { OWNER_HUMAN_CONTEXT, type HumanContext } from '../humans/context.js';
import { isAuthenticatedOwner } from './owner-compat.js';

export function resolveInvocationHuman(
  peer: unknown,
  connection: unknown,
  team?: TeamService,
): HumanContext | undefined {
  if (isAuthenticatedOwner(peer, connection)) return team?.ownerContext() ?? OWNER_HUMAN_CONTEXT;
  if (peer !== null && typeof peer === 'object' && 'principal' in peer) {
    const principal = peer.principal;
    if (
      principal !== null &&
      typeof principal === 'object' &&
      'kind' in principal &&
      principal.kind === 'botharness-member' &&
      'humanId' in principal &&
      typeof principal.humanId === 'string' &&
      'grantId' in principal &&
      typeof principal.grantId === 'string'
    )
      return team?.resolve({
        kind: 'botharness-member',
        humanId: principal.humanId,
        grantId: principal.grantId,
      });
  }
  return undefined;
}
