import { privateBotRegistry } from '../features/team/private-bot-registry.js';
import { TeamRoles } from '../team/roles.js';
import { join } from 'node:path';
import { createSqliteChannelStore } from '../channels/sqlite-store.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../database/schema-plan.js';
import {
  attachOperationalModule,
  mountOperationalDatabase,
  OperationalDatabaseError,
  type OperationalDatabaseOwner,
} from '../database/owner.js';
import { resolveDshHome } from '../im/config-store.js';
import { cloneMemoryRepository } from '../memory/clone.js';
import { ensureMemoryRepository } from '../memory/repository.js';
import { syncBotDescriptor } from '../bots/bot-descriptor-sync.js';
import type { PersonaBotRecord } from '../bots/persona-bot.js';
import { createPersonaBotRegistry, type PersonaBotRegistry } from '../bots/registry.js';
import type { BotCreateCliIo, CreateValues } from '../kernel/cli-io.js';
import { CliFailure } from '../kernel/cli-errors.js';
import { createSessionOwnership } from '../sessions/ownership.js';
import { createMemoryService } from '../memory/service.js';
import { createModelPresetStore } from '../models/presets.js';
import { createBotPairing } from '../messaging/pairing.js';
import { createBotScheduleStore } from '../schedules/bot-schedules.js';
import { WorkspaceSpaces } from '../workspaces/spaces.js';
import { createGrants } from '../features/workspaces/plugin.js';
import { botMetadata, type BotMetadataResult } from '../features/team/bot-administration.js';
import { ownsBot } from '../team-policy/bot-access.js';

export { OperationalDatabaseError, type OperationalDatabaseOwner } from '../database/owner.js';

export function trimmed(value: string | undefined): string | undefined {
  const next = value?.trim();
  return next !== undefined && next.length > 0 ? next : undefined;
}

export function resolveHome(values: CreateValues, io: BotCreateCliIo): string {
  return trimmed(values.home) ?? trimmed(io.env['DSH_HOME']) ?? resolveDshHome(io.env);
}

export function openRegistry(
  dshHome: string,
  administration = false,
): {
  owner: OperationalDatabaseOwner;
  registry: PersonaBotRegistry;
} {
  let owner: OperationalDatabaseOwner;
  try {
    owner = mountOperationalDatabase({ dshHome, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  } catch (error) {
    if (error instanceof OperationalDatabaseError) {
      throw new CliFailure(error.code, error.message, 1);
    }
    throw error;
  }
  if (owner.mode !== 'ready') {
    const recovery = owner.recovery;
    owner.close();
    throw new CliFailure(
      recovery?.code ?? 'recovery-mode',
      recovery?.message ?? 'The operational database is unavailable.',
      1,
    );
  }
  try {
    const registry = createPersonaBotRegistry({
      rootDir: join(dshHome, 'botharness', 'bots'),
      database: owner,
      cloneMemory: (destination, url) => cloneMemoryRepository({ destination, url }),
      initializeMemory: (memoryDir) => {
        const repository = ensureMemoryRepository({ memoryDir });
        return repository.ok
          ? { ok: true }
          : {
              ok: false,
              ...(repository.code === 'git-not-found' ? { code: 'git-not-found' as const } : {}),
              message: `${repository.code}: ${repository.message}`,
            };
      },
      syncDescriptor: (memoryDir, record, sync) => {
        try {
          syncBotDescriptor(memoryDir, record, sync);
        } catch {}
      },
    });
    const human = offlineOwnerContext(owner);
    return { owner, registry: administration ? registry : privateBotRegistry(registry, human) };
  } catch (error) {
    try {
      owner.close();
    } catch {}
    throw error;
  }
}

export function openChannels(
  dshHome: string,
  owner: OperationalDatabaseOwner,
  registry: PersonaBotRegistry,
) {
  return createSqliteChannelStore({
    database: attachOperationalModule(owner, 'messaging'),
    rootDir: join(dshHome, 'botharness', 'channels'),
    botDisplayName: (botSlug) => registry.getHistorical(botSlug)?.displayName,
  });
}

export function requireBotRecord(registry: PersonaBotRegistry, slug: string): PersonaBotRecord {
  const record = registry.get(slug.trim());
  if (record === undefined) {
    throw new CliFailure('unknown-bot', `Unknown bot: ${slug.trim()}`, 1);
  }
  return record;
}

export function openSchedules(owner: OperationalDatabaseOwner, registry: PersonaBotRegistry) {
  return createBotScheduleStore({
    database: attachOperationalModule(owner, 'bot-schedules'),
    isBotActive: (botSlug) => {
      const bot = registry.get(botSlug);
      return bot !== undefined && bot.paused !== true;
    },
    onAdmitted: () => {},
  });
}

export function openGrants(owner: OperationalDatabaseOwner, dshHome: string) {
  const roles = new TeamRoles(attachOperationalModule(owner, 'team'), () => {});
  const spaces = new WorkspaceSpaces(
    attachOperationalModule(owner, 'workspace-spaces'),
    dshHome,
    roles,
    undefined,
    false,
  );
  return createGrants(owner, spaces, {});
}

export function offlineOwnerContext(owner: OperationalDatabaseOwner) {
  return new TeamRoles(attachOperationalModule(owner, 'team'), () => {}).ownerContext();
}

export function offlineBotMetadata(
  owner: OperationalDatabaseOwner,
  record: PersonaBotRecord,
): BotMetadataResult | undefined {
  const human = offlineOwnerContext(owner);
  if (!ownsBot(human, record)) return { metadataOnly: true, bot: botMetadata(human, record) };
}

export function openPairings(owner: OperationalDatabaseOwner, registry: PersonaBotRegistry) {
  return createBotPairing(attachOperationalModule(owner, 'messaging'), (botSlug) => {
    const bot = registry.get(botSlug);
    return bot !== undefined && bot.paused !== true;
  });
}

export function openOfflineMemory(owner: OperationalDatabaseOwner, registry: PersonaBotRegistry) {
  const ownership = createSessionOwnership(attachOperationalModule(owner, 'session-ownership'));
  return createMemoryService({ registry, ownership, database: owner });
}

export function openOfflineModelPresets(dshHome: string, owner: OperationalDatabaseOwner) {
  return createModelPresetStore({ rootDir: join(dshHome, 'botharness'), database: owner });
}
