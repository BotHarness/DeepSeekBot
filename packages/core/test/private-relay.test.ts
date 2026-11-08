import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { CredentialProvider, CredentialRecord } from '@deepseek-ai/dsh-credentials';
import { expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { createPrivateRelay } from '../../../deploy/private-relay/server.mjs';
import { createPrivateConnection } from '../src/devices/private-relay.js';
import { createEncryptedGateway } from '../src/devices/encrypted-gateway.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { noisePublicKey } from '../src/devices/noise/xk.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTempRoot, trackTestOwner } from './helpers.js';
import { redeemPairing } from '../../../apps/mobile/src/host/pairing.js';
import { encryptedCarrier } from '../../../apps/mobile/src/host/encrypted-carrier.js';
import type { HostCarrier } from '../../../apps/mobile/src/host/carrier.js';

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

it('pairs through the private outbound relay, authorizes exact device keys, carries encrypted RPC and enforces revoke', async () => {
  const owner = trackTestOwner(
    mountOperationalDatabase({
      dshHome: createTempRoot('private-host-'),
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    }),
  );
  const pairing = createDevicePairing({
    database: attachOperationalModule(owner, 'device-pairing'),
    hostName: 'Private Host',
  });
  const hostKey = randomBytes(32);
  const http = createServer(async (request, response) => {
    let text = '';
    for await (const chunk of request) text += String(chunk);
    response.end(text);
  });
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
  const relay = createPrivateRelay({
    directory: createTempRoot('private-relay-'),
    bootstrap: 'a'.repeat(64),
  });
  relay.server.listen(0, '127.0.0.1');
  await once(relay.server, 'listening');
  const relayHttp = `http://127.0.0.1:${(relay.server.address() as AddressInfo).port}`;
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
  const connection = createPrivateConnection({
    credentials: () => credentials,
    port: () => port,
    log: () => {},
  });
  let carrier: HostCarrier | undefined;
  try {
    expect(await connection.claim('https://relay.example.com', 'a'.repeat(64))).toMatchObject({
      ok: true,
    });
    await vi.waitFor(() => expect(connection.status().state).toBe('connected'));
    const admission = connection.admission()!;
    const raw: HostCarrier = {
      randomBytes: () => randomBytes(32),
      request: async () => {
        throw new Error('No plaintext or official requests permitted');
      },
      openSocket: (url, events, headers) => {
        expect(url).toBe('wss://relay.example.com/botharness-device/channel');
        expect(headers).toEqual({ Authorization: 'Bearer ' + admission.token });
        const socket = new WebSocket(url, { headers });
        socket.on('open', events.open);
        socket.on('message', (data) => events.message(data.toString()));
        socket.on('close', () => events.closed('closed'));
        socket.on('error', () => events.closed('error'));
        return { send: (text) => socket.send(text), close: () => socket.terminate() };
      },
    };
    const offer = pairing.createOffer();
    const result = await redeemPairing({
      deviceName: 'Private Phone',
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
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.code);
    carrier = encryptedCarrier({
      raw,
      hostId: result.host.hostId,
      credential: result.host.credential,
      encryption: result.host.encryption!,
    });
    const request = () =>
      carrier!.request(admission.origin + '/botharness-device/api/botharness/privateInputSubmit', {
        method: 'POST',
        body: 'private-sentinel',
        signal: AbortSignal.timeout(3000),
      });
    expect(await (await request()).text()).toBe('private-sentinel');
    pairing.revoke(result.host.deviceId);
    await expect(request()).rejects.toThrow();
  } finally {
    carrier?.close?.();
    connection.close();
    gateway.close();
    relay.close();
    http.closeAllConnections();
    http.close();
    vi.unstubAllGlobals();
  }
});
