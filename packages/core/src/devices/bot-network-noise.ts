import { randomBytes, timingSafeEqual } from 'node:crypto';
import { NoiseXk, type NoiseTransport } from './noise/xk.js';

const MAX_PAYLOAD = 128 * 1024;
const FRAME_BYTES = 48 * 1024;

function publicKey(value: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/u.test(value)) throw new Error('network-host-key-invalid');
  return Buffer.from(value, 'hex');
}

export async function botNetworkHandshake(options: {
  role: 'initiator' | 'responder';
  key(): Promise<Uint8Array>;
  senderHost: string;
  receiverHost: string;
  remotePublicKey?: string;
}): Promise<NoiseXk> {
  const secret = await options.key();
  const ephemeral = randomBytes(32);
  try {
    return new NoiseXk({
      role: options.role,
      staticKey: secret,
      ephemeralKey: ephemeral,
      ...(options.remotePublicKey === undefined
        ? {}
        : { remoteStatic: publicKey(options.remotePublicKey) }),
      prologue: Buffer.from(
        JSON.stringify(['botharness-bot-dm', 1, options.senderHost, options.receiverHost]),
      ),
    });
  } finally {
    secret.fill(0);
    ephemeral.fill(0);
  }
}

export function finishBotHandshake(handshake: NoiseXk, expectedPublicKey: string): NoiseTransport {
  try {
    if (!timingSafeEqual(handshake.peerKey(), publicKey(expectedPublicKey)))
      throw new Error('network-host-key-mismatch');
    return handshake.split();
  } catch (error) {
    handshake.close();
    throw error;
  }
}

export function encodeBotPayload(transport: NoiseTransport, value: unknown): string[] {
  const bytes = Buffer.from(JSON.stringify(value));
  if (bytes.length > MAX_PAYLOAD) throw new Error('network-body-too-large');
  const frames: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += FRAME_BYTES)
    frames.push(
      Buffer.from(transport.encrypt(bytes.subarray(offset, offset + FRAME_BYTES))).toString(
        'base64',
      ),
    );
  return frames;
}

export function decodeBotPayload(transport: NoiseTransport, value: unknown): unknown {
  if (!Array.isArray(value) || value.length === 0 || value.length > 3)
    throw new Error('network-frame-invalid');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (const frame of value) {
    if (
      typeof frame !== 'string' ||
      frame.length > 87_380 ||
      !/^[A-Za-z0-9+/]+={0,2}$/u.test(frame)
    )
      throw new Error('network-frame-invalid');
    const plaintext = transport.decrypt(Buffer.from(frame, 'base64'));
    size += plaintext.length;
    if (size > MAX_PAYLOAD) throw new Error('network-body-too-large');
    chunks.push(plaintext);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
