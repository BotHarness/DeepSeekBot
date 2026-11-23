import type { TeamService } from '../../team/service.js';
import type { PersonaBotRegistry } from '../../bots/registry.js';
import {
  discoverBotContacts,
  networkBotId,
  BOT_CONTACT_OUTPUT_LIMIT,
  type BotContactQuery,
  type BotContactPage,
} from '../../runtime/bot-contact-discovery.js';
import type { BotNetworkPort } from '../../runtime/bot-network.js';

interface RuntimeBotContactsPorts {
  botNetwork: BotNetworkPort | undefined;
  registry: PersonaBotRegistry;
  team: TeamService | undefined;
}

export function createRuntimeBotContacts(ports: RuntimeBotContactsPorts) {
  const { botNetwork, registry, team } = ports;

  async function refreshBotContacts(): Promise<void> {
    await botNetwork?.refresh?.();
  }

  function networkBotAvailability(
    hostId: string,
    botSlug: string,
  ): import('../../runtime/bot-network.js').NetworkBotAvailability {
    return botNetwork?.availability?.(hostId, botSlug) ?? 'unavailable';
  }

  function botContacts(botSlug: string, query?: BotContactQuery): BotContactPage {
    const contacts = botNetwork?.contacts() ?? [];
    if (
      query?.botId?.startsWith('remote:') &&
      !contacts.some((contact) => networkBotId(contact.hostId, contact.botSlug) === query.botId)
    )
      return { outputLimit: BOT_CONTACT_OUTPUT_LIMIT, contacts: [] };
    return discoverBotContacts(
      registry,
      botSlug,
      query,
      contacts,
      team
        ? (target) => {
            try {
              team!.bots.requireBotTarget(botSlug, target.slug);
              return true;
            } catch {
              return false;
            }
          }
        : undefined,
    );
  }

  return { refreshBotContacts, networkBotAvailability, botContacts };
}
