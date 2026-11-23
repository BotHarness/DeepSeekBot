import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { PrivateAdmission } from '@botharness/host-client/hosts';
import type { RelationshipCredentialProvider } from '../../src/devices/relationship-admission.js';
import { createNoiseIdentity } from '../../src/devices/noise-identity.js';
import {
  noiseFingerprint,
  noisePublicKey,
  NOISE_PROTOCOL,
} from '@botharness/host-protocol/noise/xk';
import { CONNECT_PROTOCOL } from '@botharness/host-protocol/noise/channel';
import { createDevicePairing } from '../../src/devices/pairing.js';
import { createHostRelationships } from '../../src/devices/relationships.js';
import { createRelationshipControl } from '../../src/devices/relationship-control.js';
import { createEncryptedGateway } from '../../src/devices/encrypted-gateway.js';
import { pairingLink } from '../../src/devices/http.js';
import { attachOperationalModule, mountOperationalDatabase } from '../../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../../src/database/schema-plan.js';
import { createTempRoot, trackTestOwner } from '../helpers.js';

interface RelationshipHost {
  disposeAuthority: () => void;
  retained: { home: string; privateKey: Uint8Array; port: number };
  pairing: ReturnType<typeof createDevicePairing>;
  relationships: ReturnType<typeof createHostRelationships>;
  control: ReturnType<typeof createRelationshipControl>;
  publicKey: string;
  routes: string[];
  advertisedRoutes: string[];
  link: () => Promise<string>;
  close: () => Promise<void>;
}

export async function host(
  name: string,
  clock: () => number = Date.now,
  options: {
    credentials?: RelationshipCredentialProvider;
    privateAdmission?: () => PrivateAdmission | undefined;
    retained?: { home: string; privateKey: Uint8Array; port: number };
    beforeReceive?: () => Promise<void>;
    account?: Parameters<typeof createRelationshipControl>[0]['account'];
    beforeReply?: (input: unknown, response: Record<string, unknown>) => Promise<void>;
  } = {},
): Promise<RelationshipHost> {
  const retained = options.retained;
  const home = retained?.home ?? createTempRoot('relationship-wire-');
  const owner = trackTestOwner(
    mountOperationalDatabase({
      dshHome: home,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    }),
  );
  const pairing = createDevicePairing({
    database: attachOperationalModule(owner, 'device-pairing'),
    hostName: name,
  });
  const relationships = createHostRelationships({
    database: attachOperationalModule(owner, 'host-relationships'),
    pairing,
    now: clock,
  });
  const privateKey = retained ? Buffer.from(retained.privateKey) : randomBytes(32);
  const publicKey = noisePublicKey(privateKey);
  const identity: Pick<ReturnType<typeof createNoiseIdentity>, 'key' | 'publicIdentity'> = {
    key: async () => Uint8Array.from(privateKey),
    publicIdentity: async () => ({
      protocol: CONNECT_PROTOCOL,
      noise: NOISE_PROTOCOL,
      required: true,
      publicKey: Buffer.from(publicKey).toString('hex'),
      fingerprint: noiseFingerprint(publicKey),
    }),
  };
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(retained?.port ?? 0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const routes = [`http://127.0.0.1:${port}`];
  const advertisedRoutes = [...routes];
  const control = createRelationshipControl({
    relationships,
    pairing,
    identity,
    routes: async () => advertisedRoutes,
    now: clock,
    ...(options.account ? { account: options.account } : {}),
    ...(options.credentials ? { credentials: () => options.credentials } : {}),
    ...(options.privateAdmission ? { privateAdmission: options.privateAdmission } : {}),
  });
  const gateway = createEncryptedGateway({
    pairing,
    key: identity.key,
    port: () => port,
    relationship: async (peerKey, input) => {
      await options.beforeReceive?.();
      const response = await control.receive(peerKey, input);
      await options.beforeReply?.(input, response);
      return response;
    },
  });
  server.on('upgrade', (request, socket, head) => {
    void gateway.upgrade(request, socket, head);
  });
  return {
    disposeAuthority: () => owner.close(),
    retained: { home, privateKey: Uint8Array.from(privateKey), port },
    pairing,
    relationships,
    control,
    publicKey: Buffer.from(publicKey).toString('hex'),
    routes,
    advertisedRoutes,
    async link() {
      const offer = pairing.createOffer();
      return pairingLink({
        v: 2,
        encryption: { ...(await identity.publicIdentity()), loopback: 'encrypted' },
        host: pairing.host(),
        offer: offer.offer,
        expiresAt: offer.expiresAt,
        routes,
      });
    },
    async close() {
      control.close();
      gateway.close();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      privateKey.fill(0);
      owner.close();
    },
  };
}
