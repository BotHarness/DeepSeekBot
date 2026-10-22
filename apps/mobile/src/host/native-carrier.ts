import { getRandomBytes } from 'expo-crypto';
import type { HostCarrier } from './carrier';
import { isLanRoute } from './route';
import { openLanSocket } from './native-lan-socket';

type NativeWebSocket = new (
  url: string,
  protocols: undefined,
  options: { headers: Record<string, string> },
) => WebSocket;

export function nativeCarrier(): HostCarrier {
  return {
    randomBytes: () => getRandomBytes(32),
    async request(url, init) {
      if (isLanRoute(new URL(url).origin)) throw new Error('encrypted-channel-required');
      const response = await fetch(url, {
        method: init.method,
        signal: init.signal,
        credentials: 'omit',
        headers: {
          ...(typeof init.body === 'string' ? { 'content-type': 'application/json' } : {}),
          ...init.headers,
        },
        ...(init.body === undefined ? {} : { body: init.body }),
      });
      return {
        status: response.status,
        contentType: response.headers.get('content-type') ?? 'application/octet-stream',
        text: () => response.text(),
        bytes: async () => new Uint8Array(await response.arrayBuffer()),
      };
    },
    openSocket(url, events, headers = {}) {
      if (isLanRoute(url.replace(/^ws:/u, 'http:'))) {
        if (Object.keys(headers).length > 0) throw new Error('encrypted-channel-required');
        return openLanSocket(url, events);
      }
      const socket = new (WebSocket as unknown as NativeWebSocket)(url, undefined, { headers });
      let done = false;
      const closed = (reason: string): void => {
        if (done) return;
        done = true;
        events.closed(reason);
      };
      socket.onopen = () => events.open();
      socket.onmessage = (event) => events.message(String(event.data));
      socket.onerror = (event) => closed((event as { message?: string }).message ?? 'socket error');
      socket.onclose = (event) => closed(event.reason);
      return {
        get bufferedAmount() {
          return socket.bufferedAmount;
        },
        send: (text) => socket.send(text),
        close: () => socket.close(),
      };
    },
  };
}
