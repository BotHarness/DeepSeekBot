import type { PersonaBotRegistry } from '../bots/registry.js';
import type { OperationalDatabaseOwner } from '../database/owner.js';
import type { SessionOwnership } from '../sessions/ownership.js';
import type { TeamService } from '../team/service.js';
import { createUsageProjection, type UsageProjection } from './usage.js';

export function createHostUsage({
  operationalDatabase,
  ownership,
  team,
  registry,
}: {
  operationalDatabase: OperationalDatabaseOwner;
  ownership: SessionOwnership;
  team: Pick<TeamService, 'ownerContext'>;
  registry: Pick<PersonaBotRegistry, 'getHistorical'>;
}): UsageProjection | undefined {
  return operationalDatabase.mode === 'ready'
    ? createUsageProjection({
        ownership,
        database: operationalDatabase,
        ownerHumanId: () => team.ownerContext().humanId,
        botOwner: (slug) =>
          registry.getHistorical(slug)?.ownerHumanId ?? team.ownerContext().humanId,
        botCreatedAt: (slug) => registry.getHistorical(slug)?.createdAt,
      })
    : undefined;
}
