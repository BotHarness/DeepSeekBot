import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export function archiveHasher() {
  const hash = sha256.create();
  return {
    update(bytes: Uint8Array) {
      hash.update(bytes);
    },
    finish: () => bytesToHex(hash.digest()),
  };
}
