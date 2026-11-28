import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { x25519 } from '@noble/curves/ed25519.js';

export const PRIVATE_RELAY_V3 = 'botharness-private-v3';

export function deviceRelayToken(origin: string, credential: string): string | undefined {
  const parts = /^([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/u.exec(credential);
  if (!parts) return;
  return storedDeviceRelayToken(origin, parts[1]!, bytesToHex(sha256(utf8ToBytes(parts[2]!))));
}

export function storedDeviceRelayToken(origin: string, id: string, secretHash: string): string {
  const key = hexToBytes(secretHash);
  try {
    return bytesToHex(
      hmac(sha256, key, utf8ToBytes(JSON.stringify([PRIVATE_RELAY_V3, origin, id]))),
    );
  } finally {
    key.fill(0);
  }
}

export function relationshipRelayToken(
  origin: string,
  relationshipId: string,
  secret: Uint8Array,
  peerKey: string,
): string {
  const shared = x25519.getSharedSecret(secret, hexToBytes(peerKey));
  try {
    return bytesToHex(
      hmac(
        sha256,
        shared,
        utf8ToBytes(JSON.stringify([PRIVATE_RELAY_V3, 'relationship', origin, relationshipId])),
      ),
    );
  } finally {
    shared.fill(0);
  }
}
