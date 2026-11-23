import type { TeamService } from '../team/service.js';
import { botOwner } from '../team/bot-access.js';
import { type PersonaBotRecord } from '../bots/persona-bot.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import { type ChannelRecord } from './channel.js';
import type { ChannelStore } from './store.js';
import { type OperationalDatabaseModulePort } from '../database/owner.js';

interface RuntimeMembershipPorts {
  channels: ChannelStore;
  database: OperationalDatabaseModulePort;
  registry: PersonaBotRegistry;
  team: TeamService | undefined;
}

export function createRuntimeMembership(ports: RuntimeMembershipPorts) {
  const { channels, database, registry, team } = ports;

  function memberBotEnabled(bot: PersonaBotRecord): boolean {
    const current = registry.get(bot.slug);
    if (!current || botOwner(current) !== botOwner(bot)) return false;
    return (
      database.read((db) =>
        db
          .prepare(`SELECT 1 FROM humans h, team_settings s
          WHERE h.human_id = ? AND h.status = 'active' AND s.singleton = 1
            AND (s.enabled = 1 OR s.owner_human_id = h.human_id)`)
          .get(botOwner(current)),
      ) !== undefined
    );
  }

  function isMember(botSlug: string, channel: ChannelRecord): boolean {
    if (team) return channel.members.includes(botSlug) && team.bots.canRead(botSlug, channel);
    return (
      channel.members.includes(botSlug) &&
      (channel.type !== 'dm' || channel.botSlug === undefined || channel.botSlug === botSlug)
    );
  }

  function requireTurnAccess(botSlug: string, ids: Iterable<string>): void {
    if (!team) return;
    team.bots.requireActive(botSlug);
    for (const id of ids) {
      const row = database.read((db) =>
        db.prepare('SELECT channel_id FROM source_events WHERE source_event_id = ?').get(id),
      );
      if (typeof row?.['channel_id'] !== 'string') continue;
      const channel = channels.get(row['channel_id']);
      if (channel) team.bots.requireChannel(botSlug, channel);
    }
  }

  function requireMembership(botSlug: string, channelId: string): ChannelRecord {
    const channel = channels.get(channelId);
    if (channel === undefined) throw new Error(`Unknown Channel: ${channelId}`);
    if (!isMember(botSlug, channel)) {
      throw new Error(`PersonaBot ${botSlug} is not a member of Channel ${channelId}`);
    }
    return channel;
  }

  function dmChannel(botSlug: string): ChannelRecord | undefined {
    return channels.list().find((channel) => channel.type === 'dm' && channel.botSlug === botSlug);
  }

  return { memberBotEnabled, isMember, requireTurnAccess, requireMembership, dmChannel };
}
