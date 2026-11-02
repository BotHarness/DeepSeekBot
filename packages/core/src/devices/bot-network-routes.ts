import type { NetworkBotContact } from '../runtime/bot-contact-discovery.js';
import { BotNetworkDeliveryError, type BotNetworkPort } from '../runtime/bot-network.js';

export function createBotNetworkRoutes(
  options: {
    withdrawn?(hostId: string): Promise<void>;
  } = {},
): BotNetworkPort & {
  observeWithdrawal(hostId: string): Promise<void>;
  attach(provider: BotNetworkPort): () => void;
} {
  const providers = new Set<BotNetworkPort>();
  async function refresh() {
    await Promise.all([...providers].map((provider) => provider.refresh?.()));
  }
  function conflictingHosts() {
    const keys = new Map<string, string>();
    const conflicts = new Set<string>();
    for (const provider of providers) {
      for (const contact of provider.contacts()) {
        if (contact.hostKey === undefined) continue;
        const prior = keys.get(contact.hostId);
        if (prior !== undefined && prior !== contact.hostKey) conflicts.add(contact.hostId);
        keys.set(contact.hostId, contact.hostKey);
      }
    }
    return conflicts;
  }
  async function membership(hostId: string): Promise<'member' | 'withdrawn' | 'unavailable'> {
    if (conflictingHosts().has(hostId)) return 'unavailable';
    const states = await Promise.all(
      [...providers].map((provider) => provider.membership?.(hostId)),
    );
    if (states.includes('member')) return 'member';
    return states.includes('withdrawn') ? 'withdrawn' : 'unavailable';
  }
  return {
    async observeWithdrawal(hostId) {
      if ((await membership(hostId)) === 'withdrawn') await options.withdrawn?.(hostId);
    },
    attach(provider) {
      providers.add(provider);
      return () => {
        providers.delete(provider);
      };
    },
    refresh,
    membership,
    availability(hostId, botSlug) {
      if (conflictingHosts().has(hostId)) return 'unavailable';
      const states = [...providers].map((provider) => provider.availability?.(hostId, botSlug));
      if (states.includes('available')) return 'available';
      if (states.includes('bot-unavailable')) return 'bot-unavailable';
      return states.includes('withdrawn') ? 'withdrawn' : 'unavailable';
    },
    contacts() {
      const conflicts = conflictingHosts();
      const contacts = new Map<string, NetworkBotContact>();
      for (const provider of providers) {
        for (const contact of provider.contacts()) {
          if (conflicts.has(contact.hostId)) continue;
          const identity = JSON.stringify([contact.hostId, contact.botSlug]);
          if (!contacts.has(identity)) contacts.set(identity, contact);
        }
      }
      return [...contacts.values()];
    },
    async send(hostId, message) {
      await refresh();
      if (conflictingHosts().has(hostId)) throw new BotNetworkDeliveryError('network-denied');
      const provider = [...providers].find(
        (candidate) =>
          candidate
            .contacts()
            .some(
              (contact) =>
                contact.hostId === hostId && contact.botSlug === message.recipientBotSlug,
            ) &&
          (candidate.availability?.(hostId, message.recipientBotSlug) ?? 'available') ===
            'available',
      );
      if (provider === undefined) throw new BotNetworkDeliveryError('unable-to-deliver');
      await provider.send(hostId, message);
    },
  };
}
