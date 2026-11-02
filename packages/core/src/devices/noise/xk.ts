import { x25519 } from '@noble/curves/ed25519.js';
import { chacha20poly1305 } from '@noble/ciphers/chacha.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';

export const NOISE_PROTOCOL = 'Noise_XK_25519_ChaChaPoly_SHA256';
export const NOISE_LIMIT = 65_535;
const EMPTY = new Uint8Array();
const MAX_NONCE = (1n << 64n) - 1n;

export function noisePublicKey(privateKey: Uint8Array): Uint8Array {
  return x25519.getPublicKey(privateKey);
}

export function noiseFingerprint(publicKey: Uint8Array): string {
  if (publicKey.length !== 32) throw new Error('noise-key-invalid');
  return Array.from(sha256(publicKey), (value) => value.toString(16).padStart(2, '0'))
    .join('')
    .match(/.{4}/gu)!
    .join(' ');
}

function derive(chainingKey: Uint8Array, input: Uint8Array): [Uint8Array, Uint8Array] {
  const output = hkdf(sha256, input, chainingKey, EMPTY, 64);
  const keys: [Uint8Array, Uint8Array] = [output.slice(0, 32), output.slice(32)];
  output.fill(0);
  return keys;
}

class Cipher {
  private key: Uint8Array;
  private nonce = 0n;
  private closed = false;
  constructor(key: Uint8Array) {
    this.key = key;
  }
  run(input: Uint8Array, aad: Uint8Array, decrypt: boolean): Uint8Array {
    if (this.closed || this.nonce >= MAX_NONCE) throw new Error('noise-closed');
    const nonce = new Uint8Array(12);
    new DataView(nonce.buffer).setBigUint64(4, this.nonce, true);
    try {
      const cipher = chacha20poly1305(this.key, nonce, aad);
      const output = decrypt ? cipher.decrypt(input) : cipher.encrypt(input);
      this.nonce++;
      return output;
    } catch {
      this.close();
      throw new Error('noise-authentication-failed');
    }
  }
  close(): void {
    this.key.fill(0);
    this.closed = true;
  }
}

export interface NoiseTransport {
  encrypt(plaintext: Uint8Array, aad?: Uint8Array): Uint8Array;
  decrypt(ciphertext: Uint8Array, aad?: Uint8Array): Uint8Array;
  close(): void;
}

export class NoiseXk {
  private readonly role: 'initiator' | 'responder';
  private readonly staticKey: Uint8Array;
  private readonly ephemeralKey: Uint8Array;
  private remoteStatic: Uint8Array | undefined;
  private remoteEphemeral: Uint8Array | undefined;
  private hash: Uint8Array;
  private chainingKey: Uint8Array;
  private cipher: Cipher | undefined;
  private flight = 0;
  private closed = false;
  private splitDone = false;

  constructor(options: {
    role: 'initiator' | 'responder';
    staticKey: Uint8Array;
    ephemeralKey: Uint8Array;
    remoteStatic?: Uint8Array;
    prologue: Uint8Array;
  }) {
    if (
      options.staticKey.length !== 32 ||
      options.ephemeralKey.length !== 32 ||
      (options.role === 'initiator' && options.remoteStatic?.length !== 32)
    )
      throw new Error('noise-key-invalid');
    this.role = options.role;
    this.staticKey = Uint8Array.from(options.staticKey);
    this.ephemeralKey = Uint8Array.from(options.ephemeralKey);
    this.remoteStatic =
      options.remoteStatic === undefined ? undefined : Uint8Array.from(options.remoteStatic);
    this.hash = utf8ToBytes(NOISE_PROTOCOL);
    this.chainingKey = this.hash.slice();
    this.mixHash(options.prologue);
    this.mixHash(this.role === 'initiator' ? this.remoteStatic! : noisePublicKey(this.staticKey));
  }

  private mixHash(value: Uint8Array): void {
    this.hash = sha256(concatBytes(this.hash, value));
  }
  private mixDh(local: Uint8Array, remote: Uint8Array): void {
    const shared = x25519.getSharedSecret(local, remote);
    try {
      const [chain, key] = derive(this.chainingKey, shared);
      this.chainingKey.fill(0);
      this.chainingKey = chain;
      this.cipher?.close();
      this.cipher = new Cipher(key);
    } finally {
      shared.fill(0);
    }
  }
  private crypt(value: Uint8Array, decrypt: boolean): Uint8Array {
    if (this.cipher === undefined) throw new Error('noise-state-invalid');
    const result = this.cipher.run(value, this.hash, decrypt);
    this.mixHash(decrypt ? value : result);
    return result;
  }
  private guard(write: boolean): void {
    const initiatorWrites = this.flight !== 1;
    if (
      this.closed ||
      this.flight >= 3 ||
      (this.role === 'initiator') !== (write === initiatorWrites)
    )
      throw new Error('noise-state-invalid');
  }
  write(payload: Uint8Array = EMPTY): Uint8Array {
    try {
      this.guard(true);
      const overhead = this.flight === 2 ? 64 : 48;
      if (payload.length > NOISE_LIMIT - overhead) throw new Error('noise-length-invalid');
      let prefix: Uint8Array;
      if (this.flight < 2) {
        prefix = noisePublicKey(this.ephemeralKey);
        this.mixHash(prefix);
        this.mixDh(
          this.ephemeralKey,
          this.flight === 0 ? this.remoteStatic! : this.remoteEphemeral!,
        );
      } else {
        prefix = this.crypt(noisePublicKey(this.staticKey), false);
        this.mixDh(this.staticKey, this.remoteEphemeral!);
      }
      const message = concatBytes(prefix, this.crypt(payload, false));
      this.flight++;
      return message;
    } catch (error) {
      this.close();
      throw error;
    }
  }
  read(message: Uint8Array): Uint8Array {
    try {
      this.guard(false);
      const prefixLength = this.flight === 2 ? 48 : 32;
      if (message.length < prefixLength + 16 || message.length > NOISE_LIMIT)
        throw new Error('noise-length-invalid');
      const prefix = message.slice(0, prefixLength);
      if (this.flight < 2) {
        this.remoteEphemeral = prefix;
        this.mixHash(prefix);
        this.mixDh(this.flight === 0 ? this.staticKey : this.ephemeralKey, prefix);
      } else {
        this.remoteStatic = this.crypt(prefix, true);
        this.mixDh(this.ephemeralKey, this.remoteStatic);
      }
      const payload = this.crypt(message.subarray(prefixLength), true);
      this.flight++;
      return payload;
    } catch (error) {
      this.close();
      throw error;
    }
  }
  handshakeHash(): Uint8Array {
    if (this.flight !== 3 || (this.closed && !this.splitDone)) throw new Error('noise-not-ready');
    return this.hash.slice();
  }
  peerKey(): Uint8Array {
    if (this.flight !== 3 || this.closed || !this.remoteStatic) throw new Error('noise-not-ready');
    return this.remoteStatic.slice();
  }
  split(): NoiseTransport {
    if (this.flight !== 3 || this.closed) throw new Error('noise-not-ready');
    const [first, second] = derive(this.chainingKey, EMPTY);
    const sending = new Cipher(this.role === 'initiator' ? first : second);
    const receiving = new Cipher(this.role === 'initiator' ? second : first);
    this.splitDone = true;
    this.close();
    const close = () => {
      sending.close();
      receiving.close();
    };
    const run = (input: Uint8Array, aad: Uint8Array, decrypt: boolean) => {
      try {
        if (
          input.length > (decrypt ? NOISE_LIMIT : NOISE_LIMIT - 16) ||
          (decrypt && input.length < 16)
        )
          throw new Error('noise-length-invalid');
        return (decrypt ? receiving : sending).run(input, aad, decrypt);
      } catch (error) {
        close();
        throw error;
      }
    };
    return {
      encrypt: (plaintext, aad = EMPTY) => run(plaintext, aad, false),
      decrypt: (ciphertext, aad = EMPTY) => run(ciphertext, aad, true),
      close,
    };
  }
  close(): void {
    this.closed = true;
    this.staticKey.fill(0);
    this.ephemeralKey.fill(0);
    this.chainingKey.fill(0);
    this.cipher?.close();
  }
}
