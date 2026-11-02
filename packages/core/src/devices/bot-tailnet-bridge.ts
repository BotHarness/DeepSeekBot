import { randomBytes } from 'node:crypto';
import { NoiseXk, noisePublicKey, type NoiseTransport } from './noise/xk.js';
import {
  botNetworkHandshake,
  finishBotHandshake,
  encodeBotPayload,
  decodeBotPayload,
} from './bot-network-noise.js';
import { createServer, request, type IncomingMessage, type Server } from 'node:http';
import { z } from 'zod';
import { hostId, pageSchema, messageSchema } from './bot-network-wire.js';
import { createBotTailnet, type BotTailnet, type TailnetMember } from './bot-tailnet.js';
import type { TailnetChange } from './bot-tailnet-watch.js';
import type { NetworkBotContact } from '../runtime/bot-contact-discovery.js';
import {
  botNetworkScopes,
  type BotNetworkMembership,
  type TailnetBotMembership,
} from '../channels/channel.js';
import type { BotNetworkPort, NetworkBotMessage } from '../runtime/bot-network.js';
import { BotNetworkDeliveryError as DeliveryError } from '../runtime/bot-network.js';

const ROOT = '/botharness-bots/v1';
const PORTS = [43191, 43192, 43193, 43194, 43195, 43196, 43197, 43198];
const LIMIT = 192 * 1024;
const flightSchema = z
  .string()
  .min(1)
  .max(1000)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/u);
const handshakeReplySchema = z.object({
  session: z.string().regex(/^[a-f0-9]{48}$/u),
  flight: flightSchema,
});
const sealedSchema = handshakeReplySchema.extend({ frames: z.array(z.string()).min(1).max(3) });

async function readBody(message: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of message) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > LIMIT) throw new Error('network-body-too-large');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function exchange(
  address: string,
  port: number,
  localAddress: string,
  path: string,
  payload?: { senderHost: string; senderPort: number; body: unknown; committing?: boolean },
  signal?: AbortSignal,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let connected = false;
    const body = payload === undefined ? undefined : JSON.stringify(payload.body);
    const call = request(
      {
        hostname: address,
        port,
        localAddress,
        path,
        method: body === undefined ? 'GET' : 'POST',
        agent: false,
        timeout: 5000,
        signal:
          signal === undefined
            ? AbortSignal.timeout(5000)
            : AbortSignal.any([signal, AbortSignal.timeout(5000)]),
        headers:
          payload === undefined
            ? {}
            : {
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(body!),
                'x-bot-host': payload.senderHost,
                'x-bot-port': payload.senderPort,
              },
      },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(
            new DeliveryError(payload?.committing === true ? 'delivery-unknown' : 'network-denied'),
          );
          return;
        }
        void readBody(response).then(resolve, () =>
          reject(new DeliveryError(payload?.committing ? 'delivery-unknown' : 'unable-to-deliver')),
        );
      },
    );
    call.once('socket', (socket) =>
      socket.once('connect', () => {
        connected = true;
      }),
    );
    call.once('timeout', () => call.destroy(new Error('network-timeout')));
    call.once('error', () =>
      reject(
        new DeliveryError(
          payload?.committing && connected ? 'delivery-unknown' : 'unable-to-deliver',
        ),
      ),
    );
    call.end(body);
  });
}

interface Route {
  member: TailnetMember;
  port: number;
  contacts: NetworkBotContact[];
}

export function createTailnetBotBridge(options: {
  hostId: string;
  key(): Promise<Uint8Array>;
  knownKey?(hostId: string): string | undefined;
  trustKey?(hostId: string, publicKey: string, membership?: BotNetworkMembership): void;
  knownMemberships?(): readonly { hostId: string; membership: BotNetworkMembership }[];
  withdrawn?(hostId: string): Promise<void>;
  unbound?(hostId: string): Promise<void>;
  directory(): readonly NetworkBotContact[];
  receive(sender: NetworkBotContact, message: NetworkBotMessage): Promise<void>;
  tailnet?: BotTailnet;
  ports?: readonly number[];
  record?: (event: { phase: string; durationMs: number; code?: string; stage?: string }) => void;
}): BotNetworkPort & {
  start(): Promise<void>;
  discover(): Promise<void>;
  close(): Promise<void>;
  probeMembership(hostId: string): Promise<'member' | 'withdrawn' | 'unavailable'>;
} {
  const tailnet = options.tailnet ?? createBotTailnet();
  const ports = options.ports ?? PORTS;
  const routes = new Map<string, Route>();
  const handshakes = new Map<
    string,
    {
      noise: NoiseXk;
      peer: TailnetMember;
      senderHost: string;
      senderPort: number;
      publicKey: string;
      expiry: ReturnType<typeof setTimeout>;
    }
  >();
  let publicIdentity: string | undefined;
  async function ownPublicKey() {
    if (publicIdentity === undefined) {
      const secret = await options.key();
      try {
        publicIdentity = Buffer.from(noisePublicKey(secret)).toString('hex');
      } finally {
        secret.fill(0);
      }
    }
    return publicIdentity;
  }
  function checkKey(owner: string, key: string) {
    const known = options.knownKey?.(owner);
    if (known !== undefined && known !== key) throw new DeliveryError('network-denied');
  }
  let server: Server | undefined;
  let self: TailnetMember | undefined;
  let port: number | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let discovering: Promise<void> | undefined;
  let discoveryCancellation: AbortController | undefined;
  let refreshing: Promise<void> | undefined;
  let refreshRevision = 0;
  let closed = false;
  let lastSnapshot: Awaited<ReturnType<BotTailnet['snapshot']>> | undefined;
  const membershipChanges = new Map<string, Promise<void>>();
  const observedWithdrawn = new Set<string>();
  const observedPending = new Map<string, Promise<void>>();
  let stopWatching: (() => void | Promise<void>) | undefined;

  function retireObserved(host: string): Promise<void> {
    const pending = observedPending.get(host);
    if (pending !== undefined) return pending;
    if (!observedWithdrawn.has(host)) return Promise.resolve();
    const work = Promise.resolve()
      .then(async () => {
        if (closed) return;
        await options.withdrawn?.(host);
        observedWithdrawn.delete(host);
      })
      .finally(() => {
        observedPending.delete(host);
      });
    observedPending.set(host, work);
    return work;
  }

  function observe(change: TailnetChange) {
    if (closed) return;
    const hosts = new Set(
      memberships()
        .filter(
          ({ membership }) =>
            change.removedNodeIds.includes(membership.remoteNodeId) ||
            (change.selfNodeId !== undefined && change.selfNodeId !== membership.localNodeId),
        )
        .map(({ hostId }) => hostId),
    );
    for (const host of hosts) {
      observedWithdrawn.add(host);
      routes.delete(host);
      void retireObserved(host).catch(() =>
        options.record?.({
          phase: 'withdrawal-refused',
          durationMs: 0,
          code: 'network-withdrawal-unavailable',
        }),
      );
    }
  }

  function memberships() {
    return (options.knownMemberships?.() ?? []).flatMap(({ hostId, membership }) =>
      botNetworkScopes(membership)
        .filter((scope): scope is TailnetBotMembership => scope.kind === 'tailnet')
        .map((scope) => ({ hostId, membership: scope })),
    );
  }

  function membershipIn(host: string, current: Awaited<ReturnType<BotTailnet['snapshot']>>) {
    const known = memberships().filter((item) => item.hostId === host);
    if (known.length === 0) return 'unavailable' as const;
    const members = [current.self, ...current.peers, ...(current.offlinePeers ?? [])];
    return known.some(
      ({ membership }) =>
        membership.localNodeId === current.self.nodeId &&
        members.some((peer) => peer.nodeId === membership.remoteNodeId),
    )
      ? ('member' as const)
      : ('withdrawn' as const);
  }

  function authenticatedMembership(peer: TailnetMember): TailnetBotMembership {
    if (!self) throw new DeliveryError('unable-to-deliver');
    return { kind: 'tailnet', localNodeId: self.nodeId, remoteNodeId: peer.nodeId };
  }

  async function trustMembership(
    host: string,
    key: string,
    peer: TailnetMember,
    deferInitialPin = false,
  ) {
    const membership = authenticatedMembership(peer);
    const prior = membershipChanges.get(host) ?? Promise.resolve();
    const change = prior
      .catch(() => undefined)
      .then(async () => {
        await retireObserved(host);
        checkKey(host, key);
        const previousMemberships = memberships().filter((known) => known.hostId === host);
        if (
          options.knownKey?.(host) !== undefined &&
          !(options.knownMemberships?.() ?? []).some((known) => known.hostId === host)
        )
          await (options.unbound ?? options.withdrawn)?.(host);
        else if (
          previousMemberships.some(
            (known) =>
              known.membership.localNodeId !== membership.localNodeId ||
              known.membership.remoteNodeId !== membership.remoteNodeId,
          )
        )
          await options.withdrawn?.(host);
        if (closed || self?.nodeId !== membership.localNodeId)
          throw new DeliveryError('network-denied');
        if (!deferInitialPin) options.trustKey?.(host, key, membership);
      });
    membershipChanges.set(host, change);
    try {
      await change;
      return membership;
    } finally {
      if (membershipChanges.get(host) === change) membershipChanges.delete(host);
    }
  }

  async function directory(member: TailnetMember, targetPort: number, signal?: AbortSignal) {
    if (!self) throw new DeliveryError('unable-to-deliver');
    let offset = 0;
    let owner: string | undefined;
    let identity: string | undefined;
    const contacts: NetworkBotContact[] = [];
    do {
      const page = pageSchema.parse(
        await exchange(
          member.address,
          targetPort,
          self.address,
          `${ROOT}/contacts?offset=${offset}`,
          undefined,
          signal,
        ),
      );
      if (owner !== undefined && (page.hostId !== owner || page.publicKey !== identity))
        throw new Error('network-directory-changed');
      owner = page.hostId;
      identity = page.publicKey;
      checkKey(owner, identity);
      if (page.contacts.some((bot) => bot.hostId !== owner))
        throw new Error('network-directory-invalid');
      contacts.push(
        ...page.contacts.map(({ description, ...bot }) => ({
          ...bot,
          ...(description === undefined ? {} : { description }),
        })),
      );
      if (page.next === undefined) return { hostId: owner, publicKey: identity, contacts };
      if (page.next !== offset + 50 || page.contacts.length !== 50 || page.next > 1000)
        throw new Error('network-directory-limit');
      offset = page.next;
    } while (!closed);
    throw new Error('network-closed');
  }

  async function closeListener() {
    routes.clear();
    for (const pending of handshakes.values()) {
      clearTimeout(pending.expiry);
      pending.noise.close();
    }
    handshakes.clear();
    const current = server;
    server = undefined;
    port = undefined;
    current?.closeAllConnections();
    if (current) await new Promise<void>((resolve) => current.close(() => resolve()));
  }

  async function listen(nextSelf: TailnetMember) {
    if (closed) return;
    if (server && self?.nodeId === nextSelf.nodeId && self.address === nextSelf.address) return;
    await closeListener();
    self = nextSelf;
    await ownPublicKey();
    if (closed) return;
    for (const candidate of ports) {
      const listener = createServer(
        { maxHeaderSize: 4096, requestTimeout: 5000, headersTimeout: 5000 },
        async (incoming, response) => {
          const started = Date.now();
          let admissionStarted = false;
          let stage = 'peer';
          let transport: NoiseTransport | undefined;
          let activeHandshake: NoiseXk | undefined;
          try {
            if (
              closed ||
              server !== listener ||
              incoming.headers.origin ||
              incoming.headers.authorization ||
              incoming.headers.cookie
            )
              throw new Error('network-peer-denied');
            const peer = await tailnet.admit(incoming.socket.remoteAddress ?? '');
            const match = /^\/botharness-bots\/v1\/contacts\?offset=(\d{1,4})$/u.exec(
              incoming.url ?? '',
            );
            if (incoming.method === 'GET' && match) {
              const offset = Number(match[1]);
              const bots = options.directory();
              response.writeHead(200, {
                'content-type': 'application/json',
                'cache-control': 'no-store',
              });
              response.end(
                JSON.stringify(
                  pageSchema.parse({
                    hostId: options.hostId,
                    publicKey: await ownPublicKey(),
                    contacts: bots.slice(offset, offset + 50),
                    ...(bots.length > offset + 50 ? { next: offset + 50 } : {}),
                  }),
                ),
              );
              return;
            }
            if (
              incoming.method !== 'POST' ||
              ![`${ROOT}/handshake`, `${ROOT}/messages`].includes(incoming.url ?? '')
            )
              throw new Error('network-method-denied');
            const senderHost = hostId.parse(incoming.headers['x-bot-host']);
            const senderPort = Number(incoming.headers['x-bot-port']);
            if (!ports.includes(senderPort)) throw new Error('network-peer-denied');
            stage = 'sender';
            if (incoming.url === `${ROOT}/handshake`) {
              const flight = flightSchema.parse(
                ((await readBody(incoming)) as { flight?: unknown })?.flight,
              );
              if (handshakes.size >= 32) throw new Error('network-handshake-capacity');
              const origin = await directory(peer, senderPort);
              if (origin.hostId !== senderHost) throw new Error('network-sender-denied');
              activeHandshake = await botNetworkHandshake({
                role: 'responder',
                key: options.key,
                senderHost,
                receiverHost: options.hostId,
              });
              activeHandshake.read(Buffer.from(flight, 'base64'));
              const reply = activeHandshake.write();
              if (closed || server !== listener || handshakes.size >= 32)
                throw new Error('network-handshake-capacity');
              const session = randomBytes(24).toString('hex');
              const noise = activeHandshake;
              const expiry = setTimeout(() => {
                handshakes.delete(session);
                noise.close();
              }, 30_000);
              expiry.unref();
              handshakes.set(session, {
                noise,
                peer,
                senderHost,
                senderPort,
                publicKey: origin.publicKey,
                expiry,
              });
              activeHandshake = undefined;
              response.writeHead(200, {
                'content-type': 'application/json',
                'cache-control': 'no-store',
              });
              response.end(
                JSON.stringify({ session, flight: Buffer.from(reply).toString('base64') }),
              );
              return;
            }
            stage = 'sealed-message';
            const sealed = sealedSchema.parse(await readBody(incoming));
            const pending = handshakes.get(sealed.session);
            if (
              !pending ||
              pending.peer.nodeId !== peer.nodeId ||
              pending.peer.address !== peer.address ||
              pending.senderHost !== senderHost ||
              pending.senderPort !== senderPort
            )
              throw new Error('network-handshake-unavailable');
            handshakes.delete(sealed.session);
            clearTimeout(pending.expiry);
            activeHandshake = pending.noise;
            stage = 'decrypt';
            activeHandshake.read(Buffer.from(sealed.flight, 'base64'));
            transport = finishBotHandshake(activeHandshake, pending.publicKey);
            stage = 'message-schema';
            const input = messageSchema.parse(decodeBotPayload(transport, sealed.frames));
            stage = 'sender-directory';
            const origin = await directory(peer, senderPort);
            const sender = origin.contacts.find((bot) => bot.botSlug === input.senderBotSlug);
            if (origin.hostId !== senderHost || origin.publicKey !== pending.publicKey || !sender)
              throw new Error('network-sender-denied');
            checkKey(senderHost, pending.publicKey);
            if ((await tailnet.admit(incoming.socket.remoteAddress ?? '')).nodeId !== peer.nodeId)
              throw new Error('network-peer-denied');
            if (closed || server !== listener) throw new Error('network-closed');
            stage = 'membership';
            const initialRelationship =
              options.knownKey?.(senderHost) === undefined &&
              !memberships().some((known) => known.hostId === senderHost);
            const membership = await trustMembership(
              senderHost,
              pending.publicKey,
              peer,
              initialRelationship,
            );
            if (closed || server !== listener) throw new Error('network-closed');
            if ((await tailnet.admit(incoming.socket.remoteAddress ?? '')).nodeId !== peer.nodeId)
              throw new Error('network-peer-denied');
            if (closed || server !== listener) throw new Error('network-closed');
            admissionStarted = true;
            stage = 'admission';
            await options.receive(
              {
                ...sender,
                hostKey: pending.publicKey,
                membership,
              },
              input,
            );
            if (initialRelationship) options.trustKey?.(senderHost, pending.publicKey, membership);
            options.record?.({ phase: 'received', durationMs: Date.now() - started });
            response.writeHead(200, {
              'content-type': 'application/json',
              'cache-control': 'no-store',
            });
            response.end(
              JSON.stringify({ frames: encodeBotPayload(transport, { accepted: input.id }) }),
            );
          } catch {
            options.record?.({
              phase: 'receive-refused',
              stage,
              durationMs: Date.now() - started,
              code: admissionStarted ? 'delivery-unknown' : 'network-denied',
            });
            incoming.resume();
            if (!response.headersSent)
              response.writeHead(admissionStarted ? 500 : 403, {
                'content-type': 'application/json',
              });
            response.end(
              JSON.stringify({ code: admissionStarted ? 'delivery-unknown' : 'network-denied' }),
            );
          } finally {
            activeHandshake?.close();
            transport?.close();
          }
        },
      );
      listener.maxConnections = 32;
      listener.on('connection', (socket) => socket.setTimeout(10_000, () => socket.destroy()));
      try {
        await new Promise<void>((resolve, reject) => {
          listener.once('error', reject);
          listener.listen(candidate, self!.address, () => {
            listener.removeListener('error', reject);
            resolve();
          });
        });
        listener.on('error', () => {
          routes.clear();
          options.record?.({
            phase: 'listener-error',
            durationMs: 0,
            code: 'network-listener-unavailable',
          });
        });
        if (closed) {
          listener.closeAllConnections();
          listener.close();
          return;
        }
        server = listener;
        port = candidate;
        break;
      } catch (error) {
        listener.close();
        if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error;
      }
    }
    if (!server) throw new Error('network-listener-unavailable');
  }

  async function discoverNow(signal: AbortSignal) {
    const started = Date.now();
    lastSnapshot = undefined;
    try {
      const current = await tailnet.snapshot();
      if (signal.aborted || closed) return;
      lastSnapshot = current;
      for (const host of new Set(memberships().map((item) => item.hostId))) {
        await retireObserved(host);
        if (membershipIn(host, current) === 'withdrawn') await options.withdrawn?.(host);
      }
      await listen(current.self);
      if (closed) return;
      const targets = [current.self, ...current.peers]
        .slice(0, 65)
        .flatMap((member) => ports.map((targetPort) => ({ member, targetPort })))
        .filter((target) => target.member.address !== self!.address || target.targetPort !== port);
      const found = new Map<string, Route>();
      const collisions = new Set<string>();
      let index = 0;
      await Promise.all(
        Array.from({ length: Math.min(64, targets.length) }, async () => {
          while (index < targets.length && !closed && !signal.aborted) {
            const target = targets[index++]!;
            try {
              const result = await directory(target.member, target.targetPort, signal);
              if (result.hostId === options.hostId || found.has(result.hostId)) {
                collisions.add(result.hostId);
                continue;
              }
              found.set(result.hostId, {
                member: target.member,
                port: target.targetPort,
                contacts: result.contacts,
              });
            } catch {}
          }
        }),
      );
      if (signal.aborted || closed) return;
      routes.clear();
      if (!closed) for (const [id, route] of found) if (!collisions.has(id)) routes.set(id, route);
      options.record?.({ phase: 'discovery', durationMs: Date.now() - started });
    } catch {
      if (signal.aborted || closed) return;
      routes.clear();
      options.record?.({
        phase: 'discovery-refused',
        durationMs: Date.now() - started,
        code: 'tailnet-unavailable',
      });
    }
  }

  const bridge = {
    contacts: () => [...routes.values()].flatMap((route) => route.contacts),
    availability(host: string, botSlug: string) {
      if (observedWithdrawn.has(host)) return 'withdrawn' as const;
      if (!lastSnapshot || closed) return 'unavailable' as const;
      if (membershipIn(host, lastSnapshot) === 'withdrawn') return 'withdrawn' as const;
      const route = routes.get(host);
      if (
        !route ||
        ![lastSnapshot.self, ...lastSnapshot.peers].some(
          (member) =>
            member.nodeId === route.member.nodeId && member.address === route.member.address,
        )
      )
        return 'unavailable' as const;
      return route.contacts.some((contact) => contact.botSlug === botSlug)
        ? ('available' as const)
        : ('bot-unavailable' as const);
    },
    async refresh() {
      ++refreshRevision;
      discoveryCancellation?.abort();
      refreshing ??= (async () => {
        await discovering;
        while (!closed) {
          const revision = refreshRevision;
          await bridge.discover();
          if (revision === refreshRevision) break;
        }
      })().finally(() => {
        refreshing = undefined;
      });
      await refreshing;
    },
    async probeMembership(host: string) {
      if (closed) return 'unavailable' as const;
      if (observedWithdrawn.has(host)) return 'withdrawn' as const;
      try {
        return membershipIn(host, await tailnet.snapshot());
      } catch {
        return 'unavailable' as const;
      }
    },
    async membership(host: string) {
      try {
        await retireObserved(host);
        const state = membershipIn(host, await tailnet.snapshot());
        if (state === 'withdrawn') await options.withdrawn?.(host);
        return state;
      } catch {
        return observedWithdrawn.has(host) ? ('withdrawn' as const) : ('unavailable' as const);
      }
    },
    async discover() {
      if (closed) return;
      if (discovering === undefined) {
        discoveryCancellation = new AbortController();
        discovering = discoverNow(discoveryCancellation.signal).finally(() => {
          discovering = undefined;
          discoveryCancellation = undefined;
        });
      }
      await discovering;
    },
    async start() {
      if (closed) return;
      if (stopWatching === undefined && tailnet.watch !== undefined) {
        stopWatching = tailnet.watch(observe, (code) => {
          stopWatching = undefined;
          options.record?.({ phase: 'watch-stopped', durationMs: 0, code });
        });
        options.record?.({ phase: 'watch-started', durationMs: 0 });
      }
      await bridge.discover();
      if (closed) return;
      if (!server)
        throw new Error(
          lastSnapshot === undefined ? 'tailnet-unavailable' : 'network-listener-unavailable',
        );
      timer ??= setInterval(() => {
        void bridge.discover();
      }, 30_000);
      timer.unref();
    },
    async send(targetHost: string, input: NetworkBotMessage) {
      const started = Date.now();
      let noise: NoiseXk | undefined;
      let transport: NoiseTransport | undefined;
      let committing = false;
      try {
        const route = routes.get(targetHost);
        if (!route || !self || port === undefined || closed)
          throw new DeliveryError('unable-to-deliver');
        const local = self;
        const localPort = port;
        const current = await tailnet.snapshot();
        if (current.offlinePeers?.some((peer) => peer.nodeId === route.member.nodeId))
          throw new DeliveryError('unable-to-deliver');
        if (
          current.self.nodeId !== local.nodeId ||
          current.self.address !== local.address ||
          ![current.self, ...current.peers].some(
            (peer) => peer.nodeId === route.member.nodeId && peer.address === route.member.address,
          )
        )
          throw new DeliveryError('network-denied');
        const target = await directory(route.member, route.port);
        if (
          target.hostId !== targetHost ||
          !target.contacts.some((bot) => bot.botSlug === input.recipientBotSlug) ||
          !options.directory().some((bot) => bot.botSlug === input.senderBotSlug)
        )
          throw new DeliveryError('network-denied');
        const message = messageSchema.parse(input);
        noise = await botNetworkHandshake({
          role: 'initiator',
          key: options.key,
          senderHost: options.hostId,
          receiverHost: targetHost,
          remotePublicKey: target.publicKey,
        });
        const first = handshakeReplySchema.parse(
          await exchange(route.member.address, route.port, local.address, `${ROOT}/handshake`, {
            senderHost: options.hostId,
            senderPort: localPort,
            body: { flight: Buffer.from(noise.write()).toString('base64') },
          }),
        );
        noise.read(Buffer.from(first.flight, 'base64'));
        const flight = Buffer.from(noise.write()).toString('base64');
        transport = finishBotHandshake(noise, target.publicKey);
        checkKey(targetHost, target.publicKey);
        await trustMembership(targetHost, target.publicKey, route.member);
        const latest = await tailnet.snapshot();
        if (
          closed ||
          self !== local ||
          port !== localPort ||
          latest.self.nodeId !== local.nodeId ||
          latest.self.address !== local.address ||
          ![latest.self, ...latest.peers].some(
            (peer) => peer.nodeId === route.member.nodeId && peer.address === route.member.address,
          )
        )
          throw new DeliveryError('network-denied');
        const body = {
          session: first.session,
          flight,
          frames: encodeBotPayload(transport, message),
        };
        if (closed) throw new DeliveryError('unable-to-deliver');
        committing = true;
        const envelope = await exchange(
          route.member.address,
          route.port,
          local.address,
          `${ROOT}/messages`,
          {
            senderHost: options.hostId,
            senderPort: localPort,
            body,
            committing: true,
          },
        );
        const reply = decodeBotPayload(transport, (envelope as { frames?: unknown })?.frames);
        if (
          !reply ||
          typeof reply !== 'object' ||
          !('accepted' in reply) ||
          reply.accepted !== input.id
        )
          throw new DeliveryError('delivery-unknown');
        options.record?.({ phase: 'accepted', durationMs: Date.now() - started });
      } catch (error) {
        const code =
          error instanceof DeliveryError
            ? error.code
            : committing
              ? 'delivery-unknown'
              : 'unable-to-deliver';
        options.record?.({ phase: 'send-refused', durationMs: Date.now() - started, code });
        throw new DeliveryError(code);
      } finally {
        noise?.close();
        transport?.close();
      }
    },
    async close() {
      closed = true;
      discoveryCancellation?.abort();
      clearInterval(timer);
      await stopWatching?.();
      stopWatching = undefined;
      await Promise.allSettled(observedPending.values());
      await Promise.allSettled([discovering, refreshing]);
      await closeListener();
    },
  };
  return bridge;
}
