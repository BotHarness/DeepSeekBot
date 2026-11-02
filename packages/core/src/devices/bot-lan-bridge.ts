import { z } from 'zod';
import {
  botNetworkScopes,
  type BotNetworkMembership,
  type LanBotMembership,
} from '../channels/channel.js';
import type { NetworkBotContact } from '../runtime/bot-contact-discovery.js';
import { BotNetworkDeliveryError, type NetworkBotMessage } from '../runtime/bot-network.js';
import type { createLanBotMembership, LanBotCandidate } from './bot-lan-membership.js';
import { createBotPeerChannel } from './bot-peer-channel.js';
import { contactSchema, hostId, messageSchema, pageSchema } from './bot-network-wire.js';
import { noisePublicKey } from './noise/xk.js';

export const BOT_LAN_PATH = '/botharness-device/lan-bots/v1';
export interface LanBotPeer extends LanBotCandidate {
  origin: string;
}
interface ScopedPeer extends LanBotPeer {
  membership?: LanBotMembership;
}
interface AdmittedPeer extends LanBotPeer {
  membership: LanBotMembership;
}
const id = z.string().regex(/^[a-f0-9]{32}$/u);
const key = z.string().regex(/^[a-f0-9]{64}$/u);
const authorization = z
  .object({
    purpose: z.literal('bot-lan-admission-v1'),
    senderHost: hostId,
    senderKey: key,
    senderAdmissionId: id,
    recipientHost: hostId,
    recipientKey: key,
    recipientAdmissionId: id.optional(),
  })
  .strict();
const page = pageSchema.extend({ admissionId: id });
const proof = z.discriminatedUnion('admitted', [
  z.object({ admitted: z.literal(false) }).strict(),
  z.object({ admitted: z.literal(true), admissionId: id }).strict(),
]);
const inputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('membership') }).strict(),
  z.object({ kind: z.literal('contacts'), offset: z.number().int().min(0).max(1000) }).strict(),
  z.object({ kind: z.literal('message'), sender: contactSchema, message: messageSchema }).strict(),
]);

export function createLanBotBridge(options: {
  hostId: string;
  key(): Promise<Uint8Array>;
  peers(): readonly LanBotPeer[];
  admission: ReturnType<typeof createLanBotMembership>;
  directory(): readonly NetworkBotContact[];
  receive(sender: NetworkBotContact, message: NetworkBotMessage): Promise<void>;
  knownKey?(hostId: string): string | undefined;
  knownMemberships?(): readonly { hostId: string; membership: BotNetworkMembership }[];
  trustKey?(hostId: string, key: string, membership: BotNetworkMembership): void;
  withdrawn?(hostId: string): Promise<void>;
  unbound?(hostId: string): Promise<void>;
  record?(event: { phase: string; durationMs: number; code?: string }): void;
}) {
  const routes = new Map<string, { peer: AdmittedPeer; contacts: NetworkBotContact[] }>();
  const receiving = new Map<string, Promise<void>>();
  const withdrawn = new Set<string>();
  let generation = 0;
  let refreshing: Promise<void> | undefined;
  let closed = false;
  let publicKey: string | undefined;
  const denied = () => new BotNetworkDeliveryError('network-denied');
  function candidate(host: string, publicKey: string) {
    const peers = options.peers().filter((peer) => peer.hostId === host);
    const peer = peers[0];
    const pinned = options.knownKey?.(host);
    if (
      peers.length !== 1 ||
      !peer ||
      peer.publicKey !== publicKey ||
      (pinned !== undefined && pinned !== publicKey)
    )
      throw denied();
    return peer;
  }
  function current(peer: ScopedPeer) {
    candidate(peer.hostId, peer.publicKey);
    const admitted = options.admission.current(peer.hostId, peer.publicKey);
    if (
      closed ||
      !admitted ||
      (peer.membership && peer.membership.localAdmissionId !== admitted.id)
    )
      throw denied();
    return admitted;
  }
  async function own() {
    if (publicKey === undefined) {
      const secret = await options.key();
      try {
        publicKey = Buffer.from(noisePublicKey(secret)).toString('hex');
      } finally {
        secret.fill(0);
      }
    }
    return { hostId: options.hostId, publicKey };
  }
  const channel = createBotPeerChannel<ScopedPeer, AdmittedPeer, z.infer<typeof authorization>>({
    hostId: options.hostId,
    key: options.key,
    path: BOT_LAN_PATH,
    logPrefix: 'lan',
    origin: (peer: ScopedPeer) => candidate(peer.hostId, peer.publicKey).origin,
    parseGrant: (value) => authorization.parse(value),
    grant: async (identity, peer) => ({
      purpose: 'bot-lan-admission-v1' as const,
      senderHost: identity.hostId,
      senderKey: identity.publicKey,
      senderAdmissionId: current(peer).id,
      recipientHost: peer.hostId,
      recipientKey: peer.publicKey,
      ...(peer.membership ? { recipientAdmissionId: peer.membership.remoteAdmissionId } : {}),
    }),
    verify: async (identity, grant): Promise<AdmittedPeer> => {
      if (grant.recipientHost !== identity.hostId || grant.recipientKey !== identity.publicKey)
        throw denied();
      const peer = candidate(grant.senderHost, grant.senderKey);
      const admitted = options.admission.get(peer.hostId);
      if (!admitted || admitted.publicKey !== peer.publicKey) throw denied();
      if (grant.recipientAdmissionId !== undefined && grant.recipientAdmissionId !== admitted.id)
        throw denied();
      return {
        ...peer,
        membership: {
          kind: 'lan',
          localAdmissionId: admitted.id,
          remoteAdmissionId: grant.senderAdmissionId,
        },
      };
    },
    current: async (peer) => {
      current(peer);
      return true;
    },
    ...(options.record ? { record: options.record } : {}),
    receive: async (peer, payload) => {
      const input = inputSchema.parse(payload);
      if (input.kind === 'membership') {
        const admitted = options.admission.current(peer.hostId, peer.publicKey);
        return admitted ? { admitted: true, admissionId: admitted.id } : { admitted: false };
      }
      current(peer);
      if (input.kind === 'contacts') {
        const bots = options.directory();
        return page.parse({
          ...(await own()),
          admissionId: peer.membership.localAdmissionId,
          contacts: bots.slice(input.offset, input.offset + 50),
          ...(bots.length > input.offset + 50 ? { next: input.offset + 50 } : {}),
        });
      }
      if (
        input.sender.hostId !== peer.hostId ||
        input.sender.botSlug !== input.message.senderBotSlug ||
        !options.directory().some((bot) => bot.botSlug === input.message.recipientBotSlug)
      )
        throw denied();
      const { description, ...sender } = input.sender;
      const senderContact: NetworkBotContact = {
        ...sender,
        ...(description === undefined ? {} : { description }),
        hostKey: peer.publicKey,
        membership: peer.membership,
      };
      const prior = receiving.get(peer.hostId) ?? Promise.resolve();
      const work = prior
        .catch(() => undefined)
        .then(async () => {
          current(peer);
          const scopes = (options.knownMemberships?.() ?? [])
            .filter((item) => item.hostId === peer.hostId)
            .flatMap((item) => botNetworkScopes(item.membership));
          if (options.knownKey?.(peer.hostId) !== undefined && scopes.length === 0)
            await (options.unbound ?? options.withdrawn)?.(peer.hostId);
          else if (
            scopes.some(
              (scope) =>
                scope.kind === 'lan' &&
                (scope.localAdmissionId !== peer.membership.localAdmissionId ||
                  scope.remoteAdmissionId !== peer.membership.remoteAdmissionId),
            )
          )
            await options.withdrawn?.(peer.hostId);
          current(peer);
          if (!options.directory().some((bot) => bot.botSlug === input.message.recipientBotSlug))
            throw denied();
          await options.receive(senderContact, input.message);
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
  async function membership(host: string): Promise<'member' | 'withdrawn' | 'unavailable'> {
    if (closed) return 'unavailable';
    const scopes = (options.knownMemberships?.() ?? [])
      .filter((item) => item.hostId === host)
      .flatMap((item) => botNetworkScopes(item.membership))
      .filter((scope) => scope.kind === 'lan');
    const route = routes.get(host);
    if (scopes.length === 0 && route) scopes.push(route.peer.membership);
    if (scopes.length === 0) return 'unavailable';
    const admitted = options.admission.get(host);
    if (
      !admitted ||
      admitted.revokedAt !== null ||
      scopes.every((scope) => scope.localAdmissionId !== admitted.id)
    )
      return 'withdrawn';
    try {
      const peer = candidate(host, admitted.publicKey);
      const result = proof.parse(await channel.request(peer, { kind: 'membership' }));
      if (closed) return 'unavailable';
      const latest = options.admission.current(host, admitted.publicKey);
      if (latest?.id !== admitted.id) return 'withdrawn';
      return result.admitted &&
        scopes.some(
          (scope) =>
            scope.localAdmissionId === admitted.id &&
            scope.remoteAdmissionId === result.admissionId,
        )
        ? 'member'
        : 'withdrawn';
    } catch {
      return 'unavailable';
    }
  }
  return {
    handle: channel.handle,
    membership,
    contacts(): readonly NetworkBotContact[] {
      return [...routes.values()].flatMap((route) => {
        try {
          current(route.peer);
          return route.contacts;
        } catch {
          return [];
        }
      });
    },
    availability(host: string, bot: string) {
      return this.contacts().some((contact) => contact.hostId === host && contact.botSlug === bot)
        ? ('available' as const)
        : withdrawn.has(host)
          ? ('withdrawn' as const)
          : ('unavailable' as const);
    },
    async refresh(background = false) {
      if (closed) return;
      if (!background || refreshing === undefined) {
        const revision = ++generation;
        const started = performance.now();
        refreshing = (async () => {
          routes.clear();
          if (closed) return;
          for (const host of new Set(
            (options.knownMemberships?.() ?? []).map((item) => item.hostId),
          )) {
            const state = await membership(host);
            if (closed || revision !== generation) return;
            if (state === 'withdrawn') {
              withdrawn.add(host);
              await options.withdrawn?.(host);
            } else if (state === 'member') withdrawn.delete(host);
            if (closed || revision !== generation) return;
          }
          for (const peer of options.peers().slice(0, 256)) {
            try {
              const admitted = current(peer);
              const contacts: NetworkBotContact[] = [];
              let membership: LanBotMembership | undefined;
              for (let offset = 0; offset <= 1000; offset += 50) {
                const result = page.parse(
                  await channel.request(
                    { ...peer, ...(membership ? { membership } : {}) },
                    { kind: 'contacts', offset },
                  ),
                );
                if (closed || revision !== generation) return;
                current(peer);
                if (
                  result.hostId !== peer.hostId ||
                  result.publicKey !== peer.publicKey ||
                  (membership && result.admissionId !== membership.remoteAdmissionId)
                )
                  throw denied();
                membership = {
                  kind: 'lan',
                  localAdmissionId: admitted.id,
                  remoteAdmissionId: result.admissionId,
                };
                for (const contact of result.contacts) {
                  if (contact.hostId !== peer.hostId) throw denied();
                  const { description, ...profile } = contact;
                  contacts.push({
                    ...profile,
                    ...(description === undefined ? {} : { description }),
                    hostKey: peer.publicKey,
                    membership,
                  });
                }
                if (result.next === undefined) break;
                if (
                  result.next !== offset + 50 ||
                  result.contacts.length !== 50 ||
                  result.next > 1000
                )
                  throw denied();
              }
              if (membership) routes.set(peer.hostId, { peer: { ...peer, membership }, contacts });
            } catch {
              if (revision !== generation || closed) return;
            }
          }
        })()
          .catch(() => {
            if (closed || revision !== generation) return;
            routes.clear();
            options.record?.({
              phase: 'lan-refresh-refused',
              durationMs: Math.round(performance.now() - started),
              code: 'network-denied',
            });
          })
          .finally(() => {
            if (revision === generation) refreshing = undefined;
          });
      }
      await refreshing;
      while (!closed && refreshing !== undefined) await refreshing;
    },
    async send(host: string, message: NetworkBotMessage) {
      const route = routes.get(host);
      if (!route || closed) throw new BotNetworkDeliveryError('unable-to-deliver');
      current(route.peer);
      const sender = options.directory().find((bot) => bot.botSlug === message.senderBotSlug);
      if (!sender || !route.contacts.some((bot) => bot.botSlug === message.recipientBotSlug))
        throw denied();
      const result = await channel.request(
        route.peer,
        inputSchema.parse({ kind: 'message', sender, message }),
        true,
      );
      if (
        !z
          .object({ accepted: z.literal(message.id) })
          .strict()
          .safeParse(result).success
      )
        throw new BotNetworkDeliveryError('delivery-unknown');
      options.trustKey?.(host, route.peer.publicKey, route.peer.membership);
    },
    close() {
      closed = true;
      generation++;
      routes.clear();
      withdrawn.clear();
      channel.close();
    },
  };
}
