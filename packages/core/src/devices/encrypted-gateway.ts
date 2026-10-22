import type { IncomingMessage } from 'node:http';
import { request } from 'node:http';
import { randomBytes } from 'node:crypto';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { ConnectChannel, CONNECT_CHANNEL_PATH } from './noise/channel.js';
import { noisePublicKey } from './noise/xk.js';
import type { DevicePairing } from './pairing.js';

const BODY_LIMIT = 4 * 1024 * 1024;
const QUEUE_LIMIT = 20 * 1024 * 1024;
const DEADLINE = 10_000;
const field = (input: Record<string, unknown>, name: string): string | undefined =>
  typeof input[name] === 'string' ? input[name] : undefined;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('channel-message-invalid');
  return value as Record<string, unknown>;
}
function pathAllowed(path: string): boolean {
  if (
    !path.startsWith('/botharness-device/') ||
    path.includes('\\') ||
    path.includes('#') ||
    /%2f|%5c|%2e|\/\.{1,2}(?:\/|\?|$)/iu.test(path)
  )
    return false;
  const name = path.split('?')[0]!;
  return (
    (name.startsWith('/botharness-device/api/') &&
      !/\/(?:webrtc|web|browser|computer)(?:\/|$)/u.test(name)) ||
    name === '/botharness-device/push' ||
    name.startsWith('/botharness-device/push/') ||
    name === '/botharness-device/unpair' ||
    name === '/botharness-device/devices/remove'
  );
}

export function createEncryptedGateway(options: {
  pairing: DevicePairing;
  key(): Promise<Uint8Array>;
  port(): number;
  changed?: (state: { negotiating: number; encrypted: number }) => void;
  log?: (phase: string) => void;
  verifyEnrollment?: (
    body: string,
    signature: string,
  ) => Promise<{ ok: true; verifierHash: string; name?: string } | { ok: false }>;
}) {
  const server = new WebSocketServer({
    noServer: true,
    maxPayload: 70_000,
    perMessageDeflate: false,
  });
  const active = new Set<() => void>();
  let disposed = false;
  let negotiating = 0,
    encrypted = 0,
    upgrading = 0;
  const changed = () => options.changed?.({ negotiating, encrypted });
  const serve = (socket: WebSocket, key: Uint8Array) => {
    const channel = new ConnectChannel({
      role: 'responder',
      hostId: options.pairing.host().id,
      staticKey: key,
      ephemeralKey: randomBytes(32),
      hostKey: noisePublicKey(key),
    });
    key.fill(0);
    let credential: string | undefined,
      deviceId: string | undefined,
      closed = false,
      admitted = false;
    let enrollmentOffer: { body: string; offer: string } | undefined;
    let detach: (() => void) | undefined;
    const streams = new Map<string, WebSocket>();
    const requests = new Map<string, () => void>();
    const close = () => {
      if (closed) return;
      closed = true;
      clearTimeout(deadline);
      clearInterval(keepalive);
      detach?.();
      channel.close();
      for (const stream of streams.values()) stream.terminate();
      for (const cancel of requests.values()) cancel();
      streams.clear();
      requests.clear();
      active.delete(close);
      if (admitted) encrypted--;
      else negotiating--;
      changed();
      socket.terminate();
    };
    const deadline = setTimeout(close, DEADLINE);
    let lastMessage = Date.now();
    const keepalive = setInterval(() => {
      if (Date.now() - lastMessage > 60_000) close();
    }, 15_000);
    active.add(close);
    negotiating++;
    changed();
    const send = (value: unknown) => {
      if (closed || socket.readyState !== WebSocket.OPEN) return;
      try {
        for (const frame of channel.send(JSON.stringify(value))) {
          if (socket.bufferedAmount + frame.length > QUEUE_LIMIT) return close();
          socket.send(frame);
        }
      } catch {
        close();
      }
    };
    const refuse = (code: string) => {
      send({ type: 'refused', code });
      socket.close(1008, 'channel-refused');
      setTimeout(close, 100).unref();
    };
    const forward = (input: Record<string, unknown>) => {
      const id = field(input, 'id'),
        path = field(input, 'path'),
        method = field(input, 'method');
      if (
        !id ||
        id.length > 64 ||
        requests.has(id) ||
        requests.size >= 32 ||
        !path ||
        path.length > 8192 ||
        !pathAllowed(path) ||
        (method !== 'GET' && method !== 'POST')
      )
        throw new Error('channel-request-invalid');
      const body = field(input, 'body') ?? '';
      const bytes = Buffer.from(body, input['encoding'] === 'base64' ? 'base64' : 'utf8');
      if (bytes.length > BODY_LIMIT) throw new Error('channel-body-too-large');
      const upstream = request(
        {
          host: '127.0.0.1',
          port: options.port(),
          path,
          method,
          headers: {
            authorization: `Device ${credential!}`,
            'content-type':
              input['contentType'] === 'application/octet-stream'
                ? 'application/octet-stream'
                : 'application/json',
          },
          timeout: 30_000,
        },
        (response) => {
          const chunks: Buffer[] = [];
          let size = 0;
          response.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > BODY_LIMIT) {
              upstream.destroy();
              close();
            } else chunks.push(chunk);
          });
          response.on('end', () => {
            if (requests.get(id) !== cancel) return;
            requests.delete(id);
            if (!closed)
              send({
                type: 'response',
                id,
                status: response.statusCode ?? 502,
                contentType: response.headers['content-type'] ?? 'application/octet-stream',
                body: Buffer.concat(chunks).toString('base64'),
              });
          });
          response.on('error', close);
        },
      );
      const cancel = () => upstream.destroy();
      requests.set(id, cancel);
      upstream.on('timeout', () => upstream.destroy());
      upstream.on('error', () => {
        if (requests.get(id) !== cancel) return;
        requests.delete(id);
        if (!closed) send({ type: 'response', id, status: 502, body: '' });
      });
      upstream.end(bytes);
    };
    const message = async (input: Record<string, unknown>) => {
      const type = input['type'];
      if (!admitted) {
        const publicKey = Buffer.from(channel.peerKey()).toString('hex');
        if (type === 'pair') {
          let offer = field(input, 'offer');
          if (input['enrollment'] !== undefined) {
            const enrollment = record(input['enrollment']);
            const body = field(enrollment, 'body'),
              signature = field(enrollment, 'signature');
            if (!body || body.length > 4096 || !signature || signature.length > 256)
              throw new Error('enrollment-invalid');
            if (enrollmentOffer === undefined) {
              const verified = await options.verifyEnrollment?.(body, signature);
              if (closed || !verified?.ok) throw new Error('enrollment-refused');
              enrollmentOffer = { body, offer: options.pairing.createOffer(verified).offer };
            }
            if (enrollmentOffer.body !== body) throw new Error('enrollment-mismatch');
            offer = enrollmentOffer.offer;
          }
          if (!offer || offer.length > 128) throw new Error('channel-pair-invalid');
          const name = field(input, 'name'),
            verifier = field(input, 'verifier');
          const proposed = options.pairing.requestKey({
            offer,
            publicKey,
            ...(name === undefined ? {} : { name }),
            ...(verifier === undefined ? {} : { verifier }),
          });
          if (!proposed.ok) return refuse(proposed.code);
          const paired = options.pairing.redeem({
            offer,
            publicKey,
            ...(verifier === undefined ? {} : { verifier }),
          });
          if (!paired.ok) {
            if (paired.code === 'device-approval-required')
              return send({ type: 'pair-pending', receipt: proposed.receipt });
            return refuse(paired.code);
          }
          send({
            type: 'paired',
            host: paired.host,
            deviceId: paired.device.id,
            credential: paired.credential,
          });
          return;
        }
        if (type !== 'admit') throw new Error('channel-admission-required');
        credential = field(input, 'credential');
        const admission = options.pairing.admitKey(
          credential === undefined ? undefined : `Device ${credential}`,
          publicKey,
        );
        if (!admission.ok) return refuse(admission.code);
        admitted = true;
        negotiating--;
        encrypted++;
        changed();
        deviceId = admission.device.id;
        detach = options.pairing.attachStream(deviceId, close);
        send({ type: 'admitted' });
        return;
      }
      if (!options.pairing.check(deviceId!).ok) return close();
      if (type === 'ping') return send({ type: 'pong' });
      if (type === 'request') return forward(input);
      const id = field(input, 'id');
      if (!id || id.length > 64) throw new Error('channel-stream-invalid');
      if (type === 'cancel') {
        requests.get(id)?.();
        requests.delete(id);
        return;
      }
      if (type === 'open') {
        if (
          streams.has(id) ||
          streams.size >= 4 ||
          input['path'] !== '/botharness-device/api/remote.mux'
        )
          throw new Error('channel-stream-invalid');
        const stream = new WebSocket(
          `ws://127.0.0.1:${options.port()}/botharness-device/api/remote.mux`,
          {
            headers: { authorization: `Device ${credential!}` },
            maxPayload: BODY_LIMIT,
            perMessageDeflate: false,
            handshakeTimeout: DEADLINE,
          },
        );
        streams.set(id, stream);
        stream.on('open', () => {
          if (streams.get(id) === stream) send({ type: 'opened', id });
        });
        stream.on('message', (data) => {
          if (streams.get(id) === stream) send({ type: 'message', id, text: data.toString() });
        });
        stream.on('close', () => {
          if (streams.get(id) !== stream) return;
          streams.delete(id);
          send({ type: 'closed', id });
        });
        stream.on('error', () => {
          if (streams.get(id) === stream) close();
        });
      } else if (type === 'send') {
        const stream = streams.get(id),
          text = field(input, 'text');
        if (
          !stream ||
          stream.readyState !== WebSocket.OPEN ||
          text === undefined ||
          text.length > BODY_LIMIT ||
          stream.bufferedAmount + text.length > QUEUE_LIMIT
        )
          throw new Error('channel-stream-invalid');
        stream.send(text);
      } else if (type === 'close') {
        streams.get(id)?.terminate();
        streams.delete(id);
      } else throw new Error('channel-message-invalid');
    };
    let operations = Promise.resolve();
    let queued = 0,
      queuedBytes = 0;
    socket.on('message', (data, binary) => {
      try {
        if (binary) return close();
        lastMessage = Date.now();
        const result = channel.receive(data.toString());
        if (result.reply) socket.send(result.reply);
        if (result.ready) clearTimeout(deadline);
        if (result.message !== undefined) {
          const size = result.message.length;
          queuedBytes += size;
          if (++queued > 32 || queuedBytes > 16 * 1024 * 1024) return close();
          const input = record(JSON.parse(result.message));
          operations = operations
            .then(async () => {
              if (!closed) {
                const credit = input['credit'];
                if (
                  credit !== undefined &&
                  (!Number.isSafeInteger(credit) || Number(credit) < 1 || Number(credit) >= 2 ** 32)
                )
                  throw new Error('channel-credit-invalid');
                await message(input);
                if (!closed && credit !== undefined) send({ type: 'ack', credit });
              }
            })
            .catch(() => close())
            .finally(() => {
              queued--;
              queuedBytes -= size;
            });
        }
      } catch {
        options.log?.('refused');
        close();
      }
    });
    socket.on('close', close);
    socket.on('error', close);
  };
  return {
    async upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
      if (
        disposed ||
        request.url !== CONNECT_CHANNEL_PATH ||
        request.headers.authorization ||
        request.headers.cookie ||
        request.headers['sec-websocket-protocol'] ||
        active.size + upgrading >= 32
      ) {
        socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
        return;
      }
      upgrading++;
      let key: Uint8Array | undefined;
      try {
        key = await options.key();
        if (disposed || socket.destroyed) {
          socket.destroy();
          key.fill(0);
          return;
        }
        const identity = key;
        server.handleUpgrade(request, socket, head, (client) => serve(client, identity));
      } catch {
        socket.destroy();
      } finally {
        key?.fill(0);
        upgrading--;
      }
    },
    close(): void {
      disposed = true;
      for (const close of [...active]) close();
      server.close();
    },
  };
}
