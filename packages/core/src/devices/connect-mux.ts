import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import WebSocket, { WebSocketServer, type RawData } from 'ws';

import { secretRouteRefusal } from '../bridge/secret-route.js';

const MAX_FRAME = 8 * 1024 * 1024;
const MAX_STREAMS = 256;

export function connectMux(
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  options: {
    url: string;
    headers: Record<string, string>;
    attach(close: () => void): () => void;
    refused(): void;
    sessionExpired(): void;
  },
): void {
  const server = new WebSocketServer({
    noServer: true,
    clientTracking: false,
    perMessageDeflate: false,
    maxPayload: MAX_FRAME,
  });
  const upstream = new WebSocket(options.url, {
    headers: options.headers,
    perMessageDeflate: false,
    maxPayload: MAX_FRAME,
    handshakeTimeout: 10_000,
  });
  let client: WebSocket | undefined;
  let detach = () => {};
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    detach();
    upstream.terminate();
    client?.terminate();
    socket.destroy();
    server.close();
  };
  detach = options.attach(close);
  if (closed) detach();
  socket.once('close', close);
  socket.once('error', close);
  upstream.once('error', close);
  upstream.once('close', close);
  upstream.once('unexpected-response', (_request, response) => {
    if (response.statusCode === 401) options.sessionExpired();
    response.resume();
    close();
  });
  const send = (target: WebSocket, data: RawData | string, binary = false) => {
    const size =
      typeof data === 'string'
        ? Buffer.byteLength(data)
        : Array.isArray(data)
          ? data.reduce((total, part) => total + part.byteLength, 0)
          : data.byteLength;
    if (target.readyState !== WebSocket.OPEN || target.bufferedAmount + size > MAX_FRAME) {
      close();
      return;
    }
    target.send(data, { binary }, (error) => {
      if (error) close();
    });
  };
  const streams = new Map<string, 'allowed' | 'refused'>();
  upstream.on('message', (data, binary) => {
    if (client === undefined) return close();
    if (!binary) {
      try {
        const frame = JSON.parse(data.toString()) as { type?: string; streamId?: string };
        if ((frame.type === 'end' || frame.type === 'error') && typeof frame.streamId === 'string')
          streams.delete(frame.streamId);
      } catch {
        return close();
      }
    }
    send(client, data, binary);
  });
  upstream.once('open', () => {
    if (closed) return;
    server.handleUpgrade(request, socket, head, (accepted) => {
      client = accepted;
      accepted.once('error', close);
      accepted.once('close', close);
      accepted.on('message', (data, binary) => {
        if (binary) return close();
        let frame: { type?: unknown; streamId?: unknown; endpoint?: unknown };
        try {
          const value: unknown = JSON.parse(data.toString());
          if (value === null || typeof value !== 'object' || Array.isArray(value)) return close();
          frame = value;
        } catch {
          return close();
        }
        if (typeof frame.streamId !== 'string' || frame.streamId.length > 256) return close();
        if (frame.type === 'open') {
          if (
            typeof frame.endpoint !== 'string' ||
            streams.has(frame.streamId) ||
            streams.size >= MAX_STREAMS
          )
            return close();
          const refusal = secretRouteRefusal(frame.endpoint);
          if (refusal !== undefined) {
            streams.set(frame.streamId, 'refused');
            options.refused();
            send(
              accepted,
              JSON.stringify({ type: 'error', streamId: frame.streamId, error: refusal }),
            );
            return;
          }
          streams.set(frame.streamId, 'allowed');
        } else if (streams.get(frame.streamId) === 'refused') {
          if (frame.type === 'cancel' || frame.type === 'end') streams.delete(frame.streamId);
          return;
        }
        send(upstream, data);
        if (frame.type === 'cancel') streams.delete(frame.streamId);
      });
    });
  });
}
