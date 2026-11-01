import { z } from 'zod';
import type { NetworkBotContact } from '../runtime/bot-contact-discovery.js';
import { BotNetworkDeliveryError, type NetworkBotMessage } from '../runtime/bot-network.js';
import { botNetworkScopes, type BotNetworkMembership } from '../channels/channel.js';
import { createBotConnectChannel } from './bot-connect-channel.js';
import { contactSchema, messageSchema, pageSchema } from './bot-network-wire.js';
import { noisePublicKey } from './noise/xk.js';
import type {
  createConnectBotNetwork,
  AuthenticatedConnectBotPeer,
} from './connect-bot-network.js';

const inputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('contacts'), offset: z.number().int().min(0).max(1000) }).strict(),
  z.object({ kind: z.literal('message'), sender: contactSchema, message: messageSchema }).strict(),
]);

export function createConnectBotBridge(options: {
  hostId: string;
  key(): Promise<Uint8Array>;
  account: ReturnType<typeof createConnectBotNetwork>;
  directory(): readonly NetworkBotContact[];
  receive(sender: NetworkBotContact, message: NetworkBotMessage): Promise<void>;
  knownKey?(hostId: string): string | undefined;
  trustKey?(hostId: string, key: string, membership: BotNetworkMembership): void;
  knownMemberships?(): readonly { hostId: string; membership: BotNetworkMembership }[];
  withdrawn?(hostId: string): Promise<void>;
  unbound?(hostId: string): Promise<void>;
  record?(event: { phase: string; durationMs: number; code?: string }): void;
  fetch?: typeof fetch;
}) {
  const routes = new Map<
    string,
    { peer: AuthenticatedConnectBotPeer; contacts: NetworkBotContact[] }
  >();
  const verifiedPeers = new Map<string, AuthenticatedConnectBotPeer>();
  const withdrawn = new Set<string>();
  const receiving = new Map<string, Promise<void>>();
  let closed = false;
  let refreshing: Promise<void> | undefined;
  let refreshGeneration = 0;
  let publicKey: string | undefined;
  async function own() {
    if (publicKey === undefined) {
      const key = await options.key();
      try {
        publicKey = Buffer.from(noisePublicKey(key)).toString('hex');
      } finally {
        key.fill(0);
      }
    }
    return { hostId: options.hostId, publicKey };
  }
  function checkKey(hostId: string, key: string) {
    const known = options.knownKey?.(hostId);
    if (known !== undefined && known !== key) throw new BotNetworkDeliveryError('network-denied');
  }
  const channel = createBotConnectChannel({
    hostId: options.hostId,
    key: options.key,
    account: options.account,
    ...(options.record === undefined ? {} : { record: options.record }),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    receive: async (peer, payload) => {
      if (closed) throw new BotNetworkDeliveryError('network-denied');
      checkKey(peer.hostId, peer.publicKey);
      const parsed = inputSchema.safeParse(payload);
      if (!parsed.success) throw new BotNetworkDeliveryError('network-denied');
      const input = parsed.data;
      if (input.kind === 'contacts') {
        const identity = await own();
        const bots = options.directory();
        return pageSchema.parse({
          ...identity,
          contacts: bots.slice(input.offset, input.offset + 50),
          ...(bots.length > input.offset + 50 ? { next: input.offset + 50 } : {}),
        });
      }
      if (
        input.sender.hostId !== peer.hostId ||
        input.sender.botSlug !== input.message.senderBotSlug
      )
        throw new BotNetworkDeliveryError('network-denied');
      if (!options.directory().some((bot) => bot.botSlug === input.message.recipientBotSlug))
        throw new BotNetworkDeliveryError('network-denied');
      const { description, ...publicSender } = input.sender;
      const sender: NetworkBotContact = {
        ...publicSender,
        ...(description === undefined ? {} : { description }),
        hostKey: peer.publicKey,
        membership: peer.membership,
      };
      const prior = receiving.get(peer.hostId) ?? Promise.resolve();
      const work = prior
        .catch(() => undefined)
        .then(async () => {
          checkKey(peer.hostId, peer.publicKey);
          const known = (options.knownMemberships?.() ?? []).filter(
            (item) => item.hostId === peer.hostId,
          );
          const scopes = known.flatMap((item) => botNetworkScopes(item.membership));
          if (options.knownKey?.(peer.hostId) !== undefined && scopes.length === 0)
            await (options.unbound ?? options.withdrawn)?.(peer.hostId);
          else if (
            scopes.some(
              (scope) =>
                scope.kind === 'connect' &&
                (scope.accountId !== peer.membership.accountId ||
                  scope.localHostId !== peer.membership.localHostId ||
                  scope.remoteHostId !== peer.membership.remoteHostId),
            )
          )
            await options.withdrawn?.(peer.hostId);
          if (
            closed ||
            (await options.account.membership(peer.hostId, peer.membership, peer.publicKey)) !==
              'member'
          )
            throw new BotNetworkDeliveryError('network-denied');
          if (closed) throw new BotNetworkDeliveryError('network-denied');
          if (!options.directory().some((bot) => bot.botSlug === input.message.recipientBotSlug))
            throw new BotNetworkDeliveryError('network-denied');
          await options.receive(sender, input.message);
          options.trustKey?.(peer.hostId, peer.publicKey, peer.membership);
        });
      receiving.set(peer.hostId, work);
      try {
        await work;
      } finally {
        if (receiving.get(peer.hostId) === work) receiving.delete(peer.hostId);
      }
      return { accepted: input.message.id };
    },
  });
  async function discover(peer: AuthenticatedConnectBotPeer, current: () => boolean) {
    checkKey(peer.hostId, peer.publicKey);
    const contacts: NetworkBotContact[] = [];
    let offset = 0;
    for (;;) {
      const page = pageSchema.parse(await channel.request(peer, { kind: 'contacts', offset }));
      if (!current()) return [];
      if (
        page.hostId !== peer.hostId ||
        page.publicKey !== peer.publicKey ||
        page.contacts.some((bot) => bot.hostId !== peer.hostId)
      )
        throw new BotNetworkDeliveryError('network-denied');
      for (const { description, ...bot } of page.contacts)
        contacts.push({
          ...bot,
          ...(description === undefined ? {} : { description }),
          hostKey: peer.publicKey,
          membership: peer.membership,
        });
      if (page.next === undefined) return contacts;
      if (page.next !== offset + 50 || page.contacts.length !== 50 || page.next > 1000)
        throw new BotNetworkDeliveryError('network-denied');
      offset = page.next;
    }
  }
  async function membership(hostId: string): Promise<'member' | 'withdrawn' | 'unavailable'> {
    if (closed) return 'unavailable';
    const scopes = (options.knownMemberships?.() ?? [])
      .filter((item) => item.hostId === hostId)
      .flatMap((item) => botNetworkScopes(item.membership))
      .filter((scope) => scope.kind === 'connect');
    if (scopes.length === 0) {
      const discovered = verifiedPeers.get(hostId);
      if (discovered === undefined) return 'unavailable';
      const known = options.knownKey?.(hostId);
      if (known !== undefined && known !== discovered.publicKey) return 'unavailable';
      return options.account.membership(hostId, discovered.membership, discovered.publicKey);
    }
    const states = await Promise.all(
      scopes.map((scope) => options.account.membership(hostId, scope, options.knownKey?.(hostId))),
    );
    if (states.includes('member')) return 'member';
    return states.includes('withdrawn') ? 'withdrawn' : 'unavailable';
  }
  async function refreshNow(current: () => boolean) {
    routes.clear();
    if (closed) return;
    for (const hostId of new Set((options.knownMemberships?.() ?? []).map((item) => item.hostId))) {
      const state = await membership(hostId);
      if (!current()) return;
      if (state === 'withdrawn') {
        withdrawn.add(hostId);
        await options.withdrawn?.(hostId);
      } else if (state === 'member') withdrawn.delete(hostId);
    }
    await options.account.register(await own());
    if (!current()) return;
    const peers = await options.account.peers();
    if (!current()) return;
    const counts = new Map<string, number>();
    for (const peer of peers) counts.set(peer.hostId, (counts.get(peer.hostId) ?? 0) + 1);
    let failures = 0;
    let successes = 0;
    for (const peer of peers) {
      if (!current()) return;
      if (peer.hostId === options.hostId || counts.get(peer.hostId) !== 1) continue;
      const started = Date.now();
      try {
        const contacts = await discover(peer, current);
        if (current()) {
          successes++;
          routes.set(peer.hostId, { peer, contacts });
          if (!verifiedPeers.has(peer.hostId) && verifiedPeers.size >= 256)
            verifiedPeers.delete(verifiedPeers.keys().next().value!);
          verifiedPeers.set(peer.hostId, peer);
        }
      } catch (error) {
        if (!current()) return;
        failures++;
        options.record?.({
          phase: 'connect-discovery-refused',
          durationMs: Date.now() - started,
          code: error instanceof BotNetworkDeliveryError ? error.code : 'connect-unavailable',
        });
      }
    }
    return failures === 0
      ? 'connect-refreshed'
      : successes === 0
        ? 'connect-refresh-refused'
        : 'connect-refresh-partial';
  }
  return {
    handle: channel.handle,
    membership,
    contacts(): readonly NetworkBotContact[] {
      return [...routes.values()].flatMap((route) => route.contacts);
    },
    availability(hostId: string, botSlug: string) {
      const route = routes.get(hostId);
      return route === undefined
        ? withdrawn.has(hostId)
          ? ('withdrawn' as const)
          : ('unavailable' as const)
        : route.contacts.some((bot) => bot.botSlug === botSlug)
          ? ('available' as const)
          : ('bot-unavailable' as const);
    },
    async refresh(background = false) {
      if (closed) return;
      if (!background || refreshing === undefined) {
        const generation = ++refreshGeneration;
        const current = () => !closed && generation === refreshGeneration;
        const started = Date.now();
        refreshing = refreshNow(current)
          .then((phase) =>
            phase === undefined || !current()
              ? undefined
              : options.record?.({ phase, durationMs: Date.now() - started }),
          )
          .catch((error) => {
            if (!current()) return;
            routes.clear();
            options.record?.({
              phase: 'connect-refresh-refused',
              durationMs: Date.now() - started,
              code: error instanceof BotNetworkDeliveryError ? error.code : 'connect-unavailable',
            });
          })
          .finally(() => {
            if (current()) refreshing = undefined;
          });
      }
      await refreshing;
      while (!closed && refreshing !== undefined) await refreshing;
    },
    async send(hostId: string, message: NetworkBotMessage) {
      const started = Date.now();
      try {
        const route = routes.get(hostId);
        if (closed || !route) throw new BotNetworkDeliveryError('unable-to-deliver');
        checkKey(hostId, route.peer.publicKey);
        const fresh = (await options.account.peers()).filter((peer) => peer.hostId === hostId);
        const peer = fresh[0];
        if (
          closed ||
          fresh.length !== 1 ||
          !peer ||
          peer.id !== route.peer.id ||
          peer.publicKey !== route.peer.publicKey ||
          peer.membership.accountId !== route.peer.membership.accountId ||
          peer.membership.localHostId !== route.peer.membership.localHostId ||
          peer.membership.remoteHostId !== route.peer.membership.remoteHostId
        ) {
          routes.delete(hostId);
          throw new BotNetworkDeliveryError('network-denied');
        }
        const sender = options.directory().find((bot) => bot.botSlug === message.senderBotSlug);
        if (!sender || !route.contacts.some((bot) => bot.botSlug === message.recipientBotSlug))
          throw new BotNetworkDeliveryError('network-denied');
        const payload = inputSchema.parse({ kind: 'message', sender, message });
        const response = await channel.request(route.peer, payload, true);
        const accepted = z
          .object({ accepted: z.literal(message.id) })
          .strict()
          .safeParse(response);
        if (!accepted.success) throw new BotNetworkDeliveryError('delivery-unknown');
        options.trustKey?.(hostId, route.peer.publicKey, route.peer.membership);
        options.record?.({ phase: 'connect-send-accepted', durationMs: Date.now() - started });
      } catch (error) {
        options.record?.({
          phase: 'connect-send-refused',
          durationMs: Date.now() - started,
          code: error instanceof BotNetworkDeliveryError ? error.code : 'connect-unavailable',
        });
        throw error;
      }
    },
    close() {
      closed = true;
      routes.clear();
      verifiedPeers.clear();
      channel.close();
    },
  };
}
