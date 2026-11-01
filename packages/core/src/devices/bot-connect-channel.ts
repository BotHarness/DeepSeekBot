import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import type { ConnectBotMembership } from '../channels/channel.js';
import { BotNetworkDeliveryError } from '../runtime/bot-network.js';
import {
  botNetworkHandshake,
  finishBotHandshake,
  encodeBotPayload,
  decodeBotPayload,
} from './bot-network-noise.js';
import { noisePublicKey, type NoiseXk, type NoiseTransport } from './noise/xk.js';
import type {
  createConnectBotNetwork,
  ConnectBotGrant,
  ConnectBotPeer,
  AuthenticatedConnectBotPeer,
} from './connect-bot-network.js';

export const BOT_CONNECT_PATH = '/botharness-device/bots/v1';
const LIMIT = 192 * 1024;
class PeerRefusal extends Error {}
const flight = z
  .string()
  .min(1)
  .max(1000)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/u);
const reply = z.object({ session: z.string().regex(/^[a-f0-9]{48}$/u), flight });
const grant = z
  .object({ payload: z.string().max(8192), signature: z.string().regex(/^[A-Za-z0-9_-]{43}$/u) })
  .strict();
const first = z.object({ grant, flight }).strict();
const sealed = reply.extend({ frames: z.array(z.string().max(87_380)).min(1).max(3) }).strict();

async function readIncoming(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  const deadline = setTimeout(() => request.destroy(), 5000);
  deadline.unref();
  try {
    for await (const chunk of request) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > LIMIT) throw new Error('network-body-limit');
      chunks.push(bytes);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    clearTimeout(deadline);
  }
}

async function readResponse(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('network-response-missing');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > LIMIT) {
        await reader.cancel();
        throw new Error('network-body-limit');
      }
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    reader.releaseLock();
  }
}

export function createBotConnectChannel(options: {
  hostId: string;
  key(): Promise<Uint8Array>;
  account: Pick<ReturnType<typeof createConnectBotNetwork>, 'grant' | 'verify' | 'membership'>;
  receive(peer: AuthenticatedConnectBotPeer, payload: unknown): Promise<unknown>;
  record?(event: { phase: string; durationMs: number; code?: string }): void;
  fetch?: typeof fetch;
}) {
  const fetcher = options.fetch ?? fetch;
  const cancellation = new AbortController();
  const pending = new Map<
    string,
    {
      noise: NoiseXk;
      peer: ConnectBotPeer;
      grant: ConnectBotGrant;
      expiry: ReturnType<typeof setTimeout>;
    }
  >();
  let closed = false;
  let active = 0;
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
  function respond(response: ServerResponse, status: number, body: unknown) {
    response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify(body));
  }
  async function exchange(peer: ConnectBotPeer, path: string, body: unknown) {
    if (closed) throw new BotNetworkDeliveryError('unable-to-deliver');
    const response = await fetcher(`https://${peer.hostname}${BOT_CONNECT_PATH}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.any([cancellation.signal, AbortSignal.timeout(5000)]),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new BotNetworkDeliveryError(
        response.status === 403 ? 'network-denied' : 'unable-to-deliver',
      );
    }
    return readResponse(response);
  }
  return {
    async request(
      peer: ConnectBotPeer & { membership?: ConnectBotMembership },
      payload: unknown,
      committing = false,
    ): Promise<unknown> {
      let noise: NoiseXk | undefined;
      let transport: NoiseTransport | undefined;
      let dispatched = false;
      try {
        if (closed) throw new BotNetworkDeliveryError('unable-to-deliver');
        const identity = await own();
        const authorization = await options.account.grant(identity, peer);
        noise = await botNetworkHandshake({
          role: 'initiator',
          key: options.key,
          senderHost: options.hostId,
          receiverHost: peer.hostId,
          remotePublicKey: peer.publicKey,
        });
        const handshake = reply.parse(
          await exchange(peer, 'handshake', {
            grant: authorization,
            flight: Buffer.from(noise.write()).toString('base64'),
          }),
        );
        noise.read(Buffer.from(handshake.flight, 'base64'));
        const finalFlight = Buffer.from(noise.write()).toString('base64');
        transport = finishBotHandshake(noise, peer.publicKey);
        const frames = encodeBotPayload(transport, payload);
        if (
          peer.membership !== undefined &&
          (await options.account.membership(peer.hostId, peer.membership, peer.publicKey)) !==
            'member'
        )
          throw new BotNetworkDeliveryError('network-denied');
        if (closed) throw new BotNetworkDeliveryError('unable-to-deliver');
        dispatched = true;
        const response = await exchange(peer, 'request', {
          session: handshake.session,
          flight: finalFlight,
          frames,
        });
        const parsed = z
          .object({ frames: z.array(z.string()).min(1).max(3) })
          .strict()
          .parse(response);
        const result = decodeBotPayload(transport, parsed.frames);
        if (
          z
            .object({ refused: z.literal('network-denied') })
            .strict()
            .safeParse(result).success
        )
          throw new PeerRefusal();
        return result;
      } catch (error) {
        if (error instanceof PeerRefusal) throw new BotNetworkDeliveryError('network-denied');
        if (committing && dispatched) throw new BotNetworkDeliveryError('delivery-unknown');
        throw error instanceof BotNetworkDeliveryError
          ? error
          : new BotNetworkDeliveryError('unable-to-deliver');
      } finally {
        noise?.close();
        transport?.close();
      }
    },
    async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
      const started = Date.now();
      if (closed || active >= 32) {
        options.record?.({
          phase: 'connect-receive-refused',
          durationMs: Date.now() - started,
          code: 'network-denied',
        });
        request.resume();
        respond(response, 403, { code: 'network-denied' });
        return;
      }
      active++;
      let noise: NoiseXk | undefined;
      let transport: NoiseTransport | undefined;
      let admitted = false;
      try {
        if (
          closed ||
          request.method !== 'POST' ||
          request.headers.origin ||
          request.headers.authorization ||
          request.headers.cookie
        )
          throw new Error('network-peer-denied');
        const identity = await own();
        if (request.url === `${BOT_CONNECT_PATH}/handshake`) {
          if (pending.size >= 32) throw new Error('network-handshake-capacity');
          const input = first.parse(await readIncoming(request));
          const peer = await options.account.verify(identity, input.grant);
          noise = await botNetworkHandshake({
            role: 'responder',
            key: options.key,
            senderHost: peer.hostId,
            receiverHost: options.hostId,
          });
          noise.read(Buffer.from(input.flight, 'base64'));
          const flight = Buffer.from(noise.write()).toString('base64');
          if (closed || pending.size >= 32) throw new Error('network-handshake-capacity');
          const session = randomBytes(24).toString('hex');
          const held = noise;
          const expiry = setTimeout(() => {
            pending.delete(session);
            held.close();
          }, 30_000);
          expiry.unref();
          pending.set(session, { noise: held, peer, grant: input.grant, expiry });
          noise = undefined;
          respond(response, 200, { session, flight });
          return;
        }
        if (request.url !== `${BOT_CONNECT_PATH}/request`) throw new Error('network-method-denied');
        const input = sealed.parse(await readIncoming(request));
        const held = pending.get(input.session);
        if (!held) throw new Error('network-handshake-unavailable');
        pending.delete(input.session);
        clearTimeout(held.expiry);
        noise = held.noise;
        noise.read(Buffer.from(input.flight, 'base64'));
        transport = finishBotHandshake(noise, held.peer.publicKey);
        const payload = decodeBotPayload(transport, input.frames);
        const peer = await options.account.verify(identity, held.grant);
        if (closed || peer.hostId !== held.peer.hostId || peer.publicKey !== held.peer.publicKey)
          throw new Error('network-peer-denied');
        admitted = true;
        const result = await options.receive(peer, payload);
        options.record?.({ phase: 'connect-receive-accepted', durationMs: Date.now() - started });
        respond(response, 200, { frames: encodeBotPayload(transport, result) });
      } catch (error) {
        options.record?.({
          phase: 'connect-receive-refused',
          durationMs: Date.now() - started,
          code:
            error instanceof BotNetworkDeliveryError
              ? error.code
              : admitted
                ? 'delivery-unknown'
                : 'network-denied',
        });
        request.resume();
        if (
          !response.headersSent &&
          transport !== undefined &&
          error instanceof BotNetworkDeliveryError &&
          error.code === 'network-denied'
        ) {
          respond(response, 200, {
            frames: encodeBotPayload(transport, { refused: 'network-denied' }),
          });
        } else if (!response.headersSent)
          respond(response, admitted ? 500 : 403, {
            code: admitted ? 'delivery-unknown' : 'network-denied',
          });
        else response.end();
      } finally {
        active--;
        noise?.close();
        transport?.close();
      }
    },
    close() {
      closed = true;
      cancellation.abort();
      for (const held of pending.values()) {
        clearTimeout(held.expiry);
        held.noise.close();
      }
      pending.clear();
    },
  };
}
