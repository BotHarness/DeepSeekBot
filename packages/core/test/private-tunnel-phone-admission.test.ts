import {
  fakeCloudflared,
  memoryCredentials,
  resolveBinary,
  tunnels,
} from './private-tunnel-fixtures.js';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { browserAdmissionProtocols } from '../../../deploy/private-relay/admission.mjs';
import { createPrivateTunnel, PROBE_PREFIX } from '../src/devices/private-tunnel.js';
import { createEncryptedGateway } from '../src/devices/encrypted-gateway.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { noisePublicKey } from '@botharness/host-protocol/noise/xk';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTempRoot, trackTestOwner } from './helpers.js';
import { redeemPairing } from '@botharness/host-client/pairing';
import { encryptedCarrier } from '@botharness/host-client/encrypted-carrier';
import type { HostCarrier } from '@botharness/host-protocol/carrier';
import { requestListener } from './async-listener.js';

it.each([false, true])(
  'pairs one phone across two private origins, confines admission and revokes both without replay (browser=%s)',
  async (browser) => {
    const owner = trackTestOwner(
      mountOperationalDatabase({
        dshHome: createTempRoot('tunnel-host-'),
        schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
      }),
    );
    const pairing = createDevicePairing({
      database: attachOperationalModule(owner, 'device-pairing'),
      hostName: 'Tunnel Host',
    });
    const hostKey = randomBytes(32);
    let leakedAuthorization = false;
    const received: string[] = [];
    const http = createServer(
      requestListener(async (request, response) => {
        let text = '';
        for await (const chunk of request) text += String(chunk);
        received.push(text);
        response.end(text);
      }),
    );
    http.listen(0, '127.0.0.1');
    await once(http, 'listening');
    const port = (http.address() as AddressInfo).port;
    const gateway = createEncryptedGateway({
      pairing,
      key: async () => Uint8Array.from(hostKey),
      port: () => port,
    });
    http.on('upgrade', (request, socket, head) => {
      if (request.headers.authorization !== undefined) leakedAuthorization = true;
      void gateway.upgrade(request, socket, head);
    });
    const cloudflared = fakeCloudflared();
    const credentials = memoryCredentials();
    const tunnel = createPrivateTunnel({
      credentials: () => credentials,
      port: () => port,
      resolveBinary,
      spawn: cloudflared.spawn,
      fetch: (async (input: string, init?: RequestInit) => {
        const url = new URL(input);
        const route = tunnel.statuses().find((route) => route.origin === url.origin);
        if (!route?.originPort) throw new Error('missing-origin');
        return fetch(`http://127.0.0.1:${route.originPort}${url.pathname}`, init);
      }) as typeof fetch,
      probeIntervalMs: 10,
    });
    tunnels.push(tunnel);
    let carrier: HostCarrier | undefined;
    try {
      await tunnel.enable({ mode: 'quick' });
      await vi.waitFor(() => expect(tunnel.status().state).toBe('connected'));
      await tunnel.add({ mode: 'ingress', origin: 'https://custom.example.com' });
      await vi.waitFor(() => expect(tunnel.admissions()).toHaveLength(2));
      const admission = {
        ...tunnel.admission()!,
        additionalOrigins: ['https://custom.example.com'],
      };
      const local = `ws://127.0.0.1:${String(tunnel.status().originPort)}`;
      const refused = async (
        headers?: Record<string, string>,
        path = '/botharness-device/channel',
      ) => {
        const socket = new WebSocket(local + path, headers ? { headers } : {});
        const [error] = (await once(socket, 'error')) as [Error];
        return error.message;
      };
      expect(await refused()).toMatch(/404/u);
      expect(await refused({ Authorization: 'Bearer ' + 'f'.repeat(64) })).toMatch(/404/u);
      expect(
        await refused({ Authorization: 'Bearer ' + admission.token }, '/api/botharness/devices'),
      ).toMatch(/404/u);
      expect(
        (
          await fetch(
            `http://127.0.0.1:${String(tunnel.status().originPort)}/api/botharness/devices`,
          )
        ).status,
      ).toBe(404);
      expect(
        (await fetch(`http://127.0.0.1:${String(tunnel.status().originPort)}${PROBE_PREFIX}stale`))
          .status,
      ).toBe(404);

      const raw: HostCarrier = {
        randomBytes: () => randomBytes(32),
        request: async () => {
          throw new Error('No plaintext requests permitted');
        },
        openSocket: (url, events, headers) => {
          const origin = new URL(url).origin.replace('wss:', 'https:');
          const route = tunnel.statuses().find((route) => route.origin === origin);
          expect(route).toBeDefined();
          expect(headers?.['X-BotHarness-Admission']).toBe(admission.token);
          const address = `ws://127.0.0.1:${route!.originPort}/botharness-device/channel`;
          const socket = browser
            ? new WebSocket(address, browserAdmissionProtocols(admission.token))
            : new WebSocket(address, { headers });
          socket.on('open', events.open);
          socket.on('message', (data) => events.message(data.toString()));
          socket.on('close', () => events.closed('closed'));
          socket.on('error', () => events.closed('error'));
          return { send: (text) => socket.send(text), close: () => socket.terminate() };
        },
      };
      const offer = pairing.createOffer();
      const result = await redeemPairing({
        deviceName: 'Tunnel Phone',
        carrier: raw,
        payload: {
          host: pairing.host(),
          routes: [admission.origin],
          offer: offer.offer,
          expiresAt: offer.expiresAt,
          encryption: {
            protocol: 'connect-noise-xk-v1',
            publicKey: Buffer.from(noisePublicKey(hostKey)).toString('hex'),
            privateRelay: admission,
          },
        },
        confirmFingerprint: async () => true,
        onPending: () => {
          const pending = pairing.pendingKeys().find((p) => p.receipt === offer.receipt);
          if (pending) pairing.approveKey(pending.receipt, pending.publicKey);
        },
      });
      if (!result.ok) throw new Error(result.code);
      carrier = encryptedCarrier({
        raw,
        hostId: result.host.hostId,
        credential: result.host.credential,
        encryption: result.host.encryption!,
      });
      expect(result.host.routes).toEqual([admission.origin, 'https://custom.example.com']);
      const request = (origin = admission.origin) =>
        carrier!.request(origin + '/botharness-device/api/botharness/privateInputSubmit', {
          method: 'POST',
          body: 'tunnel-sentinel',
          signal: AbortSignal.timeout(3000),
        });
      expect(await (await request()).text()).toBe('tunnel-sentinel');
      expect(await (await request('https://custom.example.com')).text()).toBe('tunnel-sentinel');
      expect(received).toEqual(['tunnel-sentinel', 'tunnel-sentinel']);
      await expect(request('https://unpaired.example.com')).rejects.toMatchObject({
        code: 'route-invalid',
      });
      await tunnel.stop('quick');
      expect(await (await request('https://custom.example.com')).text()).toBe('tunnel-sentinel');
      expect(leakedAuthorization).toBe(false);
      pairing.revoke(result.host.deviceId);
      await expect(request('https://custom.example.com')).rejects.toThrow();
      await tunnel.start('quick');
      await vi.waitFor(() => expect(tunnel.admissions()).toHaveLength(2));
      const refreshed = tunnel.admissions().find((route) => route.id === 'quick')!;
      carrier.close?.();
      carrier = encryptedCarrier({
        raw,
        hostId: result.host.hostId,
        credential: result.host.credential,
        encryption: {
          ...result.host.encryption!,
          privateRelay: { ...admission, origin: refreshed.origin },
        },
      });
      await expect(request(refreshed.origin)).rejects.toThrow();
      expect(received).toEqual(['tunnel-sentinel', 'tunnel-sentinel', 'tunnel-sentinel']);
    } finally {
      carrier?.close?.();
      gateway.close();
      http.closeAllConnections();
      http.close();
    }
  },
);
