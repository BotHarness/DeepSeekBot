import { privateBotRegistry } from '../../team/bot-access.js';
import { TeamRoles } from '../../team/roles.js';
import { join } from 'node:path';
import { createSqliteChannelStore } from '../../channels/sqlite-store.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../../database/schema-plan.js';
import {
  attachOperationalModule,
  mountOperationalDatabase,
  OperationalDatabaseError,
  type OperationalDatabaseOwner,
} from '../../database/owner.js';
import { resolveDshHome } from '../../im/config-store.js';
import { cloneMemoryRepository } from '../../memory/clone.js';
import { ensureMemoryRepository } from '../../memory/repository.js';
import { syncBotDescriptor } from '../../bots/bot-descriptor-sync.js';
import type { PersonaBotRecord } from '../../bots/persona-bot.js';
import { createPersonaBotRegistry, type PersonaBotRegistry } from '../../bots/registry.js';
import type { BotCreateCliIo, CreateValues } from './cli-types.js';
import { CliFailure } from './cli-errors.js';

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
  const human = new TeamRoles(attachOperationalModule(owner, 'team'), () => {}).ownerContext();
  return { owner, registry: administration ? registry : privateBotRegistry(registry, human) };
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
