import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { CredentialProvider, CredentialRecord } from '@deepseek-ai/dsh-credentials';
import { expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { RTCPeerConnection } from 'werift';
import { createPrivateRelay } from '../../../deploy/private-relay/server.mjs';
import { createPrivateConnection } from '../src/devices/private-relay.js';
import { createEncryptedGateway } from '../src/devices/encrypted-gateway.js';
import { createDirectPeers, DIRECT_LABEL } from '../src/devices/direct.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { noisePublicKey } from '../src/devices/noise/xk.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTempRoot, trackTestOwner } from './helpers.js';
import { redeemPairing } from '../../../apps/mobile/src/host/pairing.js';
import { encryptedCarrier } from '../../../apps/mobile/src/host/encrypted-carrier.js';
import type { HostCarrier } from '../../../apps/mobile/src/host/carrier.js';

const mapping = vi.hoisted(() => ({ relay: '' }));

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

it(
  'upgrades a paired phone from the private relay to a direct DataChannel and enforces revoke on it',
  { timeout: 60_000 },
  async () => {
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
    const opened: string[] = [];
    const directPeers = createDirectPeers({
      port: () => port,
      iceServers: [],
      log: (phase) => {
        if (phase === 'open') opened.push(phase);
      },
    });
    const gateway = createEncryptedGateway({
      pairing,
      key: async () => Uint8Array.from(hostKey),
      port: () => port,
      direct: (input) => directPeers.answer(input),
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
    let directCarrier: HostCarrier | undefined;
    let directCarrier2: HostCarrier | undefined;
    const peers: RTCPeerConnection[] = [];
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
        carrier!.request(
          admission.origin + '/botharness-device/api/botharness/privateInputSubmit',
          {
            method: 'POST',
            body: 'private-sentinel',
            signal: AbortSignal.timeout(3000),
          },
        );
      expect(await (await request()).text()).toBe('private-sentinel');
      const phone = new RTCPeerConnection({ iceServers: [] });
      peers.push(phone);
      const channel = phone.createDataChannel(DIRECT_LABEL, { ordered: true });
      await phone.setLocalDescription(await phone.createOffer());
      if (phone.iceGatheringState !== 'complete')
        await phone.iceGatheringStateChange.watch((state) => state === 'complete', 5000);
      const signaled = await carrier.request(admission.origin + '/botharness-device/direct', {
        method: 'POST',
        body: JSON.stringify({ offer: phone.localDescription!.sdp }),
        signal: AbortSignal.timeout(10_000),
      });
      const answer = JSON.parse(await signaled.text()) as { ok: boolean; answer: string };
      expect(answer.ok).toBe(true);
      await phone.setRemoteDescription({ type: 'answer', sdp: answer.answer });
      if (channel.readyState !== 'open')
        await channel.stateChanged.watch((state) => state === 'open', 10_000);
      await vi.waitFor(() => expect(directPeers.status()).toMatchObject({ peers: 1, open: 1 }));
      const direct: HostCarrier = {
        ...raw,
        openSocket: (_url, events) => {
          const unsubscribe = channel.onMessage.subscribe((data) => events.message(String(data)));
          channel.stateChanged.subscribe((state) => {
            if (state === 'closed') events.closed('direct-closed');
          });
          queueMicrotask(events.open);
          return {
            send: (text) => channel.send(text),
            close: () => unsubscribe.unSubscribe(),
          };
        },
      };
      directCarrier = encryptedCarrier({
        raw: direct,
        hostId: result.host.hostId,
        credential: result.host.credential,
        encryption: result.host.encryption!,
      });
      const viaDirect = () =>
        directCarrier!.request(
          admission.origin + '/botharness-device/api/botharness/privateInputSubmit',
          { method: 'POST', body: 'direct-sentinel', signal: AbortSignal.timeout(3000) },
        );
      expect(await (await viaDirect()).text()).toBe('direct-sentinel');
      const refused = await carrier.request(admission.origin + '/botharness-device/direct', {
        method: 'POST',
        body: JSON.stringify({ offer: 'not-sdp' }),
        signal: AbortSignal.timeout(3000),
      });
      expect(JSON.parse(await refused.text())).toEqual({ ok: false, code: 'direct-invalid' });
      const upgraded = encryptedCarrier({
        raw: {
          ...raw,
          openDirect: async (signal) => {
            const pc = new RTCPeerConnection({ iceServers: [] });
            peers.push(pc);
            const dc = pc.createDataChannel(DIRECT_LABEL, { ordered: true });
            await pc.setLocalDescription(await pc.createOffer());
            if (pc.iceGatheringState !== 'complete')
              await pc.iceGatheringStateChange.watch((state) => state === 'complete', 5000);
            await pc.setRemoteDescription({
              type: 'answer',
              sdp: await signal(pc.localDescription!.sdp),
            });
            if (dc.readyState !== 'open')
              await dc.stateChanged.watch((state) => state === 'open', 10_000);
            return (events) => {
              dc.onMessage.subscribe((data) => events.message(String(data)));
              dc.stateChanged.subscribe((state) => {
                if (state === 'closed') events.closed('direct-closed');
              });
              queueMicrotask(events.open);
              return { send: (text) => dc.send(text), close: () => dc.close() };
            };
          },
        },
        hostId: result.host.hostId,
        credential: result.host.credential,
        encryption: result.host.encryption!,
      });
      directCarrier2 = upgraded;
      const viaUpgraded = () =>
        upgraded.request(
          admission.origin + '/botharness-device/api/botharness/privateInputSubmit',
          {
            method: 'POST',
            body: 'upgraded-sentinel',
            signal: AbortSignal.timeout(3000),
          },
        );
      expect(await (await viaUpgraded()).text()).toBe('upgraded-sentinel');
      await vi.waitFor(() => expect(opened).toHaveLength(2), { timeout: 15_000 });
      await vi.waitFor(() => expect(directPeers.status()).toMatchObject({ peers: 1, open: 1 }));
      expect(await (await viaUpgraded()).text()).toBe('upgraded-sentinel');
      pairing.revoke(result.host.deviceId);
      await expect(viaUpgraded()).rejects.toThrow();
      await expect(request()).rejects.toThrow();
      await vi.waitFor(() => expect(directPeers.status().open).toBe(0));
    } finally {
      directCarrier?.close?.();
      directCarrier2?.close?.();
      for (const peer of peers) await peer.close();
      directPeers.close();
      carrier?.close?.();
      connection.close();
      gateway.close();
      relay.close();
      http.closeAllConnections();
      http.close();
      vi.unstubAllGlobals();
    }
  },
);
