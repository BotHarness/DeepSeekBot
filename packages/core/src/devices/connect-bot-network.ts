import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { ConnectBotMembership } from '../channels/channel.js';
import { BotNetworkDeliveryError } from '../runtime/bot-network.js';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/u);
const publicKey = z.string().regex(/^[a-f0-9]{64}$/u);
const identity = z
  .object({ id: z.string().regex(/^h[a-z2-7]{12}$/u), hostId: id, publicKey })
  .strict();
const grantPayload = z
  .object({
    purpose: z.literal('bot-network-peer-v1'),
    account: id,
    sender: identity,
    recipient: identity,
    issuedAt: z.iso.datetime(),
    nonce: z.string().regex(/^[a-zA-Z0-9_-]{32,128}$/u),
  })
  .strict();
const directory = z.object({
  hosts: z
    .array(
      z.object({
        id: z.string().regex(/^h[a-z2-7]{12}$/u),
        hostname: z
          .string()
          .max(253)
          .regex(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u),
        botNetwork: z.object({ hostId: id, publicKey }).optional(),
      }),
    )
    .max(256),
});

export interface ConnectBotSession {
  relay: string;
  accountId: string;
  localId: string;
  relayKey: string;
  accessToken: string;
  current(): boolean;
  refresh?(): Promise<string | undefined>;
}
export interface ConnectBotIdentity {
  hostId: string;
  publicKey: string;
}
export interface ConnectBotGrant {
  payload: string;
  signature: string;
}
export interface ConnectBotPeer extends ConnectBotIdentity {
  id: string;
  hostname: string;
}

export interface AuthenticatedConnectBotPeer extends ConnectBotPeer {
  membership: ConnectBotMembership;
}

async function readJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (reader === undefined) throw new BotNetworkDeliveryError('unable-to-deliver');
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 65_536) {
        await reader.cancel();
        throw new Error('directory-limit');
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch {
    throw new BotNetworkDeliveryError('unable-to-deliver');
  } finally {
    reader.releaseLock();
  }
}

async function readDirectory(response: Response) {
  try {
    return directory.parse(await readJson(response));
  } catch {
    throw new BotNetworkDeliveryError('unable-to-deliver');
  }
}

export function createConnectBotNetwork(options: {
  session(): Promise<ConnectBotSession | undefined>;
  revoked?(): boolean;
  fetch?: typeof fetch;
  now?: () => number;
}) {
  const fetcher = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  async function accountFetch(
    current: ConnectBotSession,
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const response = await fetcher(url, { ...init, redirect: 'error' });
    if (response.status !== 401 || current.refresh === undefined) return response;
    await response.body?.cancel();
    if (!current.current()) return new Response(null, { status: 401 });
    const token = await current.refresh();
    if (token === undefined || !current.current()) return new Response(null, { status: 401 });
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${token}`);
    return fetcher(url, { ...init, headers, redirect: 'error' });
  }
  const grants = new Map<
    string,
    { value: ConnectBotGrant; expiresAt: number; current: () => boolean }
  >();
  return {
    async membership(
      hostId: string,
      scope: ConnectBotMembership,
      key?: string,
    ): Promise<'member' | 'withdrawn' | 'unavailable'> {
      if (options.revoked?.()) return 'withdrawn';
      try {
        const current = await options.session();
        if (!current?.current()) return options.revoked?.() ? 'withdrawn' : 'unavailable';
        if (current.accountId !== scope.accountId || current.localId !== scope.localHostId)
          return 'withdrawn';
        const response = await accountFetch(current, `${current.relay}/v1/hosts`, {
          headers: { authorization: `Bearer ${current.accessToken}` },
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) {
          await response.body?.cancel();
          return 'unavailable';
        }
        const listed = await readDirectory(response);
        if (!current.current()) return options.revoked?.() ? 'withdrawn' : 'unavailable';
        if (!listed.hosts.some((host) => host.id === current.localId)) return 'withdrawn';
        const peers = listed.hosts.filter(
          (host) =>
            host.id === scope.remoteHostId &&
            host.botNetwork?.hostId === hostId &&
            (key === undefined || host.botNetwork.publicKey === key),
        );
        return peers.length === 1 ? 'member' : 'withdrawn';
      } catch {
        return options.revoked?.() ? 'withdrawn' : 'unavailable';
      }
    },
    async register(own: ConnectBotIdentity): Promise<ConnectBotPeer> {
      const current = await options.session();
      const refuse = () => new BotNetworkDeliveryError('network-denied');
      if (
        !current?.current() ||
        !id.safeParse(own.hostId).success ||
        !publicKey.safeParse(own.publicKey).success
      )
        throw refuse();
      let initial: Response;
      try {
        initial = await accountFetch(current, `${current.relay}/v1/hosts`, {
          headers: { authorization: `Bearer ${current.accessToken}` },
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        throw new BotNetworkDeliveryError('unable-to-deliver');
      }
      if (initial.status === 401 || initial.status === 403) throw refuse();
      if (!initial.ok) throw new BotNetworkDeliveryError('unable-to-deliver');
      const registered = (await readDirectory(initial)).hosts.filter(
        (host) => host.id === current.localId,
      );
      if (!current.current() || registered.length !== 1) throw refuse();
      const existing = registered[0]!;
      if (existing.botNetwork !== undefined) {
        if (
          existing.botNetwork.hostId !== own.hostId ||
          existing.botNetwork.publicKey !== own.publicKey
        )
          throw refuse();
        return { id: existing.id, hostname: existing.hostname, ...own };
      }
      const issuedAt = new Date(now()).toISOString();
      const statement = JSON.stringify({
        purpose: 'bot-network-registration-v1',
        connectHostId: current.localId,
        hostId: own.hostId,
        publicKey: own.publicKey,
        issuedAt,
      });
      const proof = createHmac('sha256', current.relayKey).update(statement).digest('base64url');
      let response: Response;
      try {
        response = await accountFetch(
          current,
          `${current.relay}/v1/hosts/${current.localId}/bot-network`,
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${current.accessToken}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({ ...own, issuedAt, proof }),
            signal: AbortSignal.timeout(5000),
          },
        );
        await response.body?.cancel();
      } catch {
        throw new BotNetworkDeliveryError('unable-to-deliver');
      }
      if ([401, 403, 404, 409].includes(response.status) || !current.current()) throw refuse();
      if (!response.ok) throw new BotNetworkDeliveryError('unable-to-deliver');
      try {
        response = await accountFetch(current, `${current.relay}/v1/hosts`, {
          headers: { authorization: `Bearer ${current.accessToken}` },
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        throw new BotNetworkDeliveryError('unable-to-deliver');
      }
      if (response.status === 401 || response.status === 403) throw refuse();
      if (!response.ok) throw new BotNetworkDeliveryError('unable-to-deliver');
      const listed = await readDirectory(response);
      const local = listed.hosts.filter(
        (host) =>
          host.id === current.localId &&
          host.botNetwork?.hostId === own.hostId &&
          host.botNetwork.publicKey === own.publicKey,
      );
      if (!current.current() || local.length !== 1) throw refuse();
      return { id: current.localId, hostname: local[0]!.hostname, ...own };
    },
    async peers(): Promise<AuthenticatedConnectBotPeer[]> {
      const current = await options.session();
      if (!current?.current()) throw new BotNetworkDeliveryError('network-denied');
      let response: Response;
      try {
        response = await accountFetch(current, `${current.relay}/v1/hosts`, {
          headers: { authorization: `Bearer ${current.accessToken}` },
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        throw new BotNetworkDeliveryError('unable-to-deliver');
      }
      if (response.status === 401 || response.status === 403)
        throw new BotNetworkDeliveryError('network-denied');
      if (!response.ok) throw new BotNetworkDeliveryError('unable-to-deliver');
      const listed = await readDirectory(response);
      if (!current.current() || !listed.hosts.some((host) => host.id === current.localId)) {
        throw new BotNetworkDeliveryError('network-denied');
      }
      return listed.hosts.flatMap((host) =>
        host.id !== current.localId && host.botNetwork
          ? [
              {
                id: host.id,
                hostname: host.hostname,
                ...host.botNetwork,
                membership: {
                  kind: 'connect' as const,
                  accountId: current.accountId,
                  localHostId: current.localId,
                  remoteHostId: host.id,
                },
              },
            ]
          : [],
      );
    },
    async grant(
      own: ConnectBotIdentity,
      peer: ConnectBotPeer & { membership?: ConnectBotMembership },
    ): Promise<ConnectBotGrant> {
      const current = await options.session();
      const refuse = () => new BotNetworkDeliveryError('network-denied');
      if (
        !current?.current() ||
        !identity.safeParse({ id: peer.id, hostId: peer.hostId, publicKey: peer.publicKey }).success
      )
        throw refuse();
      if (
        peer.membership !== undefined &&
        (peer.membership.accountId !== current.accountId ||
          peer.membership.localHostId !== current.localId ||
          peer.membership.remoteHostId !== peer.id)
      )
        throw refuse();
      const cacheKey = JSON.stringify([
        current.relay,
        current.accountId,
        current.localId,
        own.hostId,
        own.publicKey,
        peer.id,
        peer.hostId,
        peer.publicKey,
      ]);
      for (const [key, value] of grants)
        if (value.expiresAt <= now() || !value.current()) grants.delete(key);
      const cached = grants.get(cacheKey);
      if (cached !== undefined) return { ...cached.value };
      const issuedAt = new Date(now()).toISOString();
      const nonce = randomBytes(24).toString('base64url');
      const statement = JSON.stringify({
        purpose: 'bot-network-grant-v1',
        connectHostId: current.localId,
        recipientId: peer.id,
        issuedAt,
        nonce,
      });
      const proof = createHmac('sha256', current.relayKey).update(statement).digest('base64url');
      let response: Response;
      try {
        response = await accountFetch(
          current,
          `${current.relay}/v1/hosts/${current.localId}/bot-network/grant`,
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${current.accessToken}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({ recipientId: peer.id, issuedAt, nonce, proof }),
            signal: AbortSignal.timeout(5000),
          },
        );
      } catch {
        throw new BotNetworkDeliveryError('unable-to-deliver');
      }
      if ([401, 403, 404, 409].includes(response.status)) throw refuse();
      if (!response.ok) throw new BotNetworkDeliveryError('unable-to-deliver');
      const result = z
        .object({
          grant: z
            .object({
              payload: z.string().max(8192),
              signature: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
            })
            .strict(),
        })
        .safeParse(await readJson(response));
      if (!result.success) throw refuse();
      let parsed: z.infer<typeof grantPayload>;
      try {
        parsed = grantPayload.parse(JSON.parse(result.data.grant.payload));
      } catch {
        throw refuse();
      }
      if (
        !current.current() ||
        parsed.account !== current.accountId ||
        parsed.sender.id !== current.localId ||
        parsed.sender.hostId !== own.hostId ||
        parsed.sender.publicKey !== own.publicKey ||
        parsed.recipient.id !== peer.id ||
        parsed.recipient.hostId !== peer.hostId ||
        parsed.recipient.publicKey !== peer.publicKey ||
        parsed.nonce !== nonce ||
        Math.abs(now() - Date.parse(parsed.issuedAt)) > 60_000
      )
        throw refuse();
      if (grants.size >= 256) grants.delete(grants.keys().next().value!);
      grants.set(cacheKey, {
        value: { ...result.data.grant },
        expiresAt: Math.min(now() + 50_000, Date.parse(parsed.issuedAt) + 50_000),
        current: current.current,
      });
      return result.data.grant;
    },
    async verify(
      own: ConnectBotIdentity,
      grant: ConnectBotGrant,
    ): Promise<AuthenticatedConnectBotPeer> {
      const current = await options.session();
      const refuse = () => new BotNetworkDeliveryError('network-denied');
      if (
        !current?.current() ||
        typeof grant.payload !== 'string' ||
        grant.payload.length > 8192 ||
        typeof grant.signature !== 'string' ||
        !/^[a-zA-Z0-9_-]{43}$/u.test(grant.signature)
      )
        throw refuse();
      const expected = createHmac('sha256', current.relayKey).update(grant.payload).digest();
      const actual = Buffer.from(grant.signature, 'base64url');
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw refuse();
      let parsed: z.infer<typeof grantPayload>;
      try {
        parsed = grantPayload.parse(JSON.parse(grant.payload));
      } catch {
        throw refuse();
      }
      if (
        parsed.account !== current.accountId ||
        parsed.recipient.id !== current.localId ||
        parsed.recipient.hostId !== own.hostId ||
        parsed.recipient.publicKey !== own.publicKey ||
        Math.abs(now() - Date.parse(parsed.issuedAt)) > 60_000
      )
        throw refuse();
      let response: Response;
      try {
        response = await accountFetch(current, `${current.relay}/v1/hosts`, {
          headers: { authorization: `Bearer ${current.accessToken}` },
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        throw new BotNetworkDeliveryError('unable-to-deliver');
      }
      if (response.status === 401 || response.status === 403) throw refuse();
      if (!response.ok) throw new BotNetworkDeliveryError('unable-to-deliver');
      const listed = await readDirectory(response);
      const matches = (peer: z.infer<typeof identity>) =>
        listed.hosts.filter(
          (host) =>
            host.id === peer.id &&
            host.botNetwork?.hostId === peer.hostId &&
            host.botNetwork.publicKey === peer.publicKey,
        );
      const senders = matches(parsed.sender);
      if (
        !current.current() ||
        Math.abs(now() - Date.parse(parsed.issuedAt)) > 60_000 ||
        matches(parsed.recipient).length !== 1 ||
        senders.length !== 1
      )
        throw refuse();
      return {
        ...parsed.sender,
        hostname: senders[0]!.hostname,
        membership: {
          kind: 'connect',
          accountId: current.accountId,
          localHostId: current.localId,
          remoteHostId: parsed.sender.id,
        },
      };
    },
  };
}
