import { z } from 'zod';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import { BotNetworkDeliveryError } from '../runtime/bot-network.js';

export interface BotNetworkParticipationSnapshot {
  enabled: boolean;
  bots: Array<{ botSlug: string; displayName: string; enabled: boolean; effective: boolean }>;
}

export function createBotNetworkParticipation(options: {
  database: OperationalDatabaseModulePort;
  registry: Pick<PersonaBotRegistry, 'get' | 'list'>;
}) {
  const saved = (scope: string): boolean => {
    const row = options.database.read((db) =>
      db.prepare('SELECT enabled FROM bot_network_participation WHERE scope = ?').get(scope),
    );
    return row === undefined || z.object({ enabled: z.number() }).parse(row).enabled === 1;
  };
  const enabled = (botSlug?: string): boolean =>
    saved('host') && (botSlug === undefined || saved(`bot:${botSlug}`));
  const snapshot = (): BotNetworkParticipationSnapshot => ({
    enabled: saved('host'),
    bots: options.registry.list().map((bot) => ({
      botSlug: bot.slug,
      displayName: bot.displayName,
      enabled: saved(`bot:${bot.slug}`),
      effective: enabled(bot.slug),
    })),
  });
  return {
    enabled,
    snapshot,
    require(botSlug?: string) {
      if (!enabled(botSlug)) throw new BotNetworkDeliveryError('network-disabled');
    },
    set(input: { enabled: boolean; botSlug?: string }): BotNetworkParticipationSnapshot {
      const value = z
        .object({ enabled: z.boolean(), botSlug: z.string().optional() })
        .strict()
        .parse(input);
      if (value.botSlug !== undefined && options.registry.get(value.botSlug) === undefined)
        throw new Error('network-bot-not-found');
      options.database.transaction(
        (db) => {
          db.prepare(`INSERT INTO bot_network_participation (scope, enabled) VALUES (?, ?)
          ON CONFLICT(scope) DO UPDATE SET enabled = excluded.enabled`).run(
            value.botSlug === undefined ? 'host' : `bot:${value.botSlug}`,
            Number(value.enabled),
          );
        },
        ['bot-network-participation'],
      );
      return snapshot();
    },
  };
}

export type BotNetworkParticipation = ReturnType<typeof createBotNetworkParticipation>;
