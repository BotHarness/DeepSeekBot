import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { CredentialProvider, CredentialRecord } from '@deepseek-ai/dsh-credentials';
import { expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { createPrivateRelay } from '../../../deploy/private-relay/server.mjs';
import { createPrivateConnection } from '../src/devices/private-relay.js';
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
import { createDevicesHttp, DEVICES_PATH } from '../src/devices/http.js';
import { deviceRelayToken } from '@botharness/host-protocol/private-relay';

const mapping = vi.hoisted(() => ({ relay: '' }));
it('keeps a damaged private configuration in error rather than exposing default pairing routes', async () => {
  const credentials: Pick<CredentialProvider, 'readRecord' | 'modifyRecord' | 'deleteRecord'> = {
    readRecord: async () => ({ kind: 'grant', payload: { origin: 'https://relay.example.com' } }),
    modifyRecord: async () => undefined,
    deleteRecord: async () => {},
  };
  const connection = createPrivateConnection({
    credentials: () => credentials,
    port: () => 1,
    log: () => {},
  });
  try {
    await connection.restore();
    expect(connection.status()).toMatchObject({
      state: 'error',
      issue: 'private-relay-credential-invalid',
    });
    expect(connection.admission()).toBeUndefined();
  } finally {
    connection.close();
  }
});
vi.mock('ws', async (original) => {
  const actual = await original<typeof import('ws')>();
  return {
    ...actual,
    WebSocket: class extends actual.WebSocket {
      constructor(url: string | URL, options?: import('ws').ClientOptions) {
        super(String(url).replace('wss://relay.example.com', mapping.relay), options);
      }
    },
  };
});

async function testRelay(binary: string | undefined) {
  const directory = createTempRoot('private-relay-');
  if (binary) {
    writeFileSync(join(directory, 'bootstrap.secret'), 'a'.repeat(64), { mode: 0o600 });
    const reservation = createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const address = `127.0.0.1:${(reservation.address() as AddressInfo).port}`;
    await new Promise<void>((resolve) => reservation.close(() => resolve()));
    const origin = 'http://' + address;
    const relay = spawn(
      binary,
      [
        'serve',
        '--tls=off',
        '--listen=' + address,
        '--config-dir',
        directory,
        '--data',
        join(directory, 'data'),
      ],
      { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
    );
    const exited = once(relay, 'exit');
    void exited.catch(() => {});
    relay.stderr.resume();
    try {
      await Promise.race([
        exited.then(() => {
          throw new Error('Go relay exited before listening');
        }),
        vi.waitFor(
          async () => {
            const response = await fetch(origin + '/health', { signal: AbortSignal.timeout(1000) });
            expect(await response.json()).toMatchObject({
              protocols: expect.arrayContaining(['botharness-private-v3']),
            });
          },
          { timeout: 10_000 },
        ),
      ]);
      return {
        origin,
        close: async () => {
          relay.kill();
          await exited;
        },
      };
    } catch (error) {
      relay.kill();
      await exited.catch(() => {});
      throw error;
    }
  }
  const relay = createPrivateRelay({ directory, bootstrap: 'a'.repeat(64) });
  relay.server.listen(0, '127.0.0.1');
  await once(relay.server, 'listening');
  return {
    origin: `http://127.0.0.1:${(relay.server.address() as AddressInfo).port}`,
    close: () => relay.close(),
  };
}

const relayImplementations: { name: string; binary?: string }[] = [{ name: 'legacy Node' }];
if (process.env.BOTHARNESS_TEST_GO_RELAY)
  relayImplementations.push({ name: 'v3 Go', binary: process.env.BOTHARNESS_TEST_GO_RELAY });

it.each(relayImplementations)(
  'pairs, exchanges encrypted data and enforces revoke through $name',
  async ({ binary }) => {
    const owner = trackTestOwner(
      mountOperationalDatabase({
        dshHome: createTempRoot('private-host-'),
        schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
      }),
    );
    let connection: ReturnType<typeof createPrivateConnection> | undefined;
    const pairing = createDevicePairing({
      database: attachOperationalModule(owner, 'device-pairing'),
      hostName: 'Private Host',
      onPaired: () => void connection?.syncAdmissions(),
      onRevoked: () => void connection?.invalidateInvites(),
    });
    const relay = await testRelay(binary);
    const hostKey = randomBytes(32);
    const http = createServer(
      requestListener(async (request, response) => {
        let text = '';
        for await (const chunk of request) text += String(chunk);
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
      void gateway.upgrade(request, socket, head);
    });
    const relayHttp = relay.origin;
    mapping.relay = relayHttp.replace('http', 'ws');
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', (url: string, init: RequestInit) =>
      realFetch(url.replace('https://relay.example.com', relayHttp), init),
    );
    const records = new Map<string, CredentialRecord>();
    const credentials: Pick<CredentialProvider, 'readRecord' | 'modifyRecord' | 'deleteRecord'> = {
      readRecord: async (key) => records.get(key),
      modifyRecord: async (key, mutate) => {
        const next = await mutate(records.get(key));
        if (next) records.set(key, next);
        else records.delete(key);
        return next;
      },
      deleteRecord: async (key) => {
        records.delete(key);
      },
    };
    connection = createPrivateConnection({
      credentials: () => credentials,
      port: () => port,
      log: () => {},
      deviceTokens: pairing.relayTokens,
    });
    const carriers = new Set<HostCarrier>();
    try {
      expect(await connection.claim('https://relay.example.com', 'a'.repeat(64))).toMatchObject({
        ok: true,
      });
      await vi.waitFor(() => expect(connection?.status().state).toBe('connected'));
      const admission = connection.admission()!;
      const raw: HostCarrier = {
        randomBytes: () => randomBytes(32),
        request: async () => {
          throw new Error('No plaintext or official requests permitted');
        },
        openSocket: (url, events, headers) => {
          expect(url).toBe('wss://relay.example.com/botharness-device/channel');
          if (!binary)
            expect(headers).toEqual({
              Authorization: 'Bearer ' + admission.token,
              'X-BotHarness-Admission': admission.token,
            });
          const socket = new WebSocket(url, { headers });
          socket.on('open', events.open);
          socket.on('message', (data) => events.message(data.toString()));
          socket.on('close', () => events.closed('closed'));
          socket.on('error', () => events.closed('error'));
          return { send: (text) => socket.send(text), close: () => socket.terminate() };
        },
      };
      const register = async (name: string) => {
        const offer = pairing.createOffer();
        const invitation = await connection?.pairingAdmission(offer.expiresAt);
        expect(invitation).toBeDefined();
        const result = await redeemPairing({
          deviceName: name,
          carrier: raw,
          payload: {
            host: pairing.host(),
            routes: [admission.origin],
            offer: offer.offer,
            expiresAt: offer.expiresAt,
            encryption: {
              protocol: 'connect-noise-xk-v1',
              publicKey: Buffer.from(noisePublicKey(hostKey)).toString('hex'),
              privateRelay: invitation!,
            },
          },
          confirmFingerprint: async () => true,
          onPending: () => {
            const pending = pairing.pendingKeys().find((p) => p.receipt === offer.receipt);
            if (pending) pairing.approveKey(pending.receipt, pending.publicKey);
          },
        });
        if (!result.ok) throw new Error(result.code);
        return result.host;
      };
      const first = await register('Phone A');
      const second = await register('Phone B');
      const dial = (host: typeof first, existingPairing = false) => {
        const carrier = encryptedCarrier({
          raw,
          hostId: host.hostId,
          credential: host.credential,
          encryption: existingPairing
            ? { ...host.encryption!, privateRelay: admission }
            : host.encryption!,
        });
        carriers.add(carrier);
        return carrier;
      };
      const request = (carrier: HostCarrier) =>
        carrier.request(admission.origin + '/botharness-device/api/botharness/privateInputSubmit', {
          method: 'POST',
          body: 'private-sentinel',
          signal: AbortSignal.timeout(3000),
        });
      expect(await (await request(dial(first))).text()).toBe('private-sentinel');
      const secondCarrier = dial(second, !!binary);
      expect(await (await request(secondCarrier)).text()).toBe('private-sentinel');
      secondCarrier.close?.();
      const management = createDevicesHttp({
        pairing,
        routes: vi.fn(),
        privateConnection: connection,
      });
      const result = await management(
        new Request('http://localhost' + DEVICES_PATH + '/revoke', {
          method: 'POST',
          body: JSON.stringify({ deviceId: first.deviceId }),
        }),
      );
      expect(await result.json()).toMatchObject({
        revoked: true,
        relayAdmission: binary ? 'removed' : 'legacy',
      });
      await expect(request(dial(first))).rejects.toThrow();
      expect(await (await request(dial(second, !!binary))).text()).toBe('private-sentinel');
      if (binary) {
        for (const token of [
          admission.token,
          deviceRelayToken(admission.origin, first.credential),
        ]) {
          const socket = new WebSocket(mapping.relay + '/botharness-device/channel', {
            headers: { Authorization: 'Bearer ' + token },
          });
          socket.on('error', () => {});
          const [, refusal] = await once(socket, 'unexpected-response');
          expect(refusal.statusCode).toBe(403);
          refusal.resume();
          socket.terminate();
        }
      }
    } finally {
      for (const carrier of carriers) carrier.close?.();
      connection.close();
      gateway.close();
      await relay.close();
      http.closeAllConnections();
      http.close();
      vi.unstubAllGlobals();
    }
  },
);
