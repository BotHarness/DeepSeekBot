import { randomBytes } from 'node:crypto';
import { credentialKey, type CredentialProvider } from '@deepseek-ai/dsh-credentials';
import { noiseFingerprint, noisePublicKey, NOISE_PROTOCOL } from './noise/xk.js';
import { CONNECT_PROTOCOL } from './noise/channel.js';

export interface EncryptionIdentity {
  protocol: typeof CONNECT_PROTOCOL;
  noise: typeof NOISE_PROTOCOL;
  required: true;
  publicKey: string;
  fingerprint: string;
}

export function createNoiseIdentity(
  credentials: () => Pick<CredentialProvider, 'modifyRecord'> | undefined,
) {
  let pending: Promise<Uint8Array> | undefined;
  let closed = false;
  const key = credentialKey('botharness-core', 'connect-noise-host-key');
  const load = (): Promise<Uint8Array> => {
    if (closed) return Promise.reject(new Error('channel-closed'));
    pending ??= (async () => {
      const provider = credentials();
      if (!provider) throw new Error('credential-unavailable');
      const stored = await provider.modifyRecord(
        key,
        async (current) =>
          current ?? {
            kind: 'grant',
            payload: { version: 1, privateKey: randomBytes(32).toString('hex') },
          },
      );
      const payload =
        stored?.kind === 'grant'
          ? (stored.payload as { version?: unknown; privateKey?: unknown })
          : undefined;
      if (
        payload?.version !== 1 ||
        typeof payload.privateKey !== 'string' ||
        !/^[0-9a-f]{64}$/u.test(payload.privateKey)
      )
        throw new Error('host-key-invalid');
      const secret = Uint8Array.from(Buffer.from(payload.privateKey, 'hex'));
      if (closed) {
        secret.fill(0);
        throw new Error('channel-closed');
      }
      return secret;
    })().catch((error) => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
  return {
    async key(): Promise<Uint8Array> {
      return (await load()).slice();
    },
    async publicIdentity(): Promise<EncryptionIdentity> {
      const publicKey = noisePublicKey(await load());
      return {
        protocol: CONNECT_PROTOCOL,
        noise: NOISE_PROTOCOL,
        required: true,
        publicKey: Buffer.from(publicKey).toString('hex'),
        fingerprint: noiseFingerprint(publicKey),
      };
    },
    close(): void {
      closed = true;
      void pending?.then(
        (value) => value.fill(0),
        () => {},
      );
    },
  };
}
