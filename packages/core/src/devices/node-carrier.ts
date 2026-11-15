import { randomBytes } from 'node:crypto';
import { WebSocket } from 'ws';
import type { HostCarrier } from '../../../../apps/mobile/src/host/carrier.js';
import { requestConnectIdentity } from './connect-identity-fetch.js';
import { createTunnelLookup } from './tunnel-dns.js';
import { networkDiagnosticReason } from '../../../../apps/mobile/src/host/connection-diagnostic.js';

export function nodeDeviceCarrier(): HostCarrier {
  return {
    randomBytes: () => randomBytes(32),
    request: async (url, init) => {
      const response = await requestConnectIdentity(url, {
        ...init,
        redirect: 'error',
        credentials: 'omit',
      });
      return {
        status: response.status,
        text: () => response.text(),
        bytes: async () => new Uint8Array(await response.arrayBuffer()),
      };
    },
    openSocket: (url, events, headers) => {
      const socket = new WebSocket(url, {
        headers,
        maxPayload: 70_000,
        followRedirects: false,
        lookup: createTunnelLookup(),
      });
      socket.on('open', events.open);
      socket.on('message', (data) => events.message(data.toString()));
      let done = false;
      const closed = (reason: string) => {
        if (!done) {
          done = true;
          events.closed(reason);
        }
      };
      socket.on('close', () => closed('channel-disconnected'));
      socket.on('error', (error) => closed(networkDiagnosticReason(error)));
      return {
        send: (text) => socket.send(text),
        close: () => socket.terminate(),
        get bufferedAmount() {
          return socket.bufferedAmount;
        },
      };
    },
  };
}
