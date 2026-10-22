import { bytesToHex, hexToBytes, concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { NoiseXk, NOISE_PROTOCOL, type NoiseTransport } from './xk.js';

export const CONNECT_PROTOCOL = 'connect-noise-xk-v1';
export const CONNECT_CHANNEL_PATH = '/botharness-device/channel';
export const CONNECT_MESSAGE_LIMIT = 8 * 1024 * 1024;
const CHUNK = 32 * 1024;
const HEADER = 15;
const DOMAIN = utf8ToBytes(`${CONNECT_PROTOCOL}/frame`);
const MAX_FRAMES = 1n << 32n;

export interface ChannelResult {
  reply?: string;
  message?: string;
  ready?: true;
}

export class ConnectChannel {
  private readonly noise: NoiseXk;
  private readonly role: 'initiator' | 'responder';
  private stage = 0;
  private closed = false;
  private transport: NoiseTransport | undefined;
  private binding: Uint8Array | undefined;
  private peer: Uint8Array | undefined;
  private outgoing = 0n;
  private incoming = 0n;
  private chunks: Uint8Array[] = [];
  private size = 0;

  constructor(options: {
    role: 'initiator' | 'responder';
    hostId: string;
    staticKey: Uint8Array;
    ephemeralKey: Uint8Array;
    hostKey: Uint8Array;
    route?: 'connect' | 'lan';
  }) {
    this.role = options.role;
    this.noise = new NoiseXk({
      ...options,
      remoteStatic: options.hostKey,
      prologue: utf8ToBytes(
        JSON.stringify([
          CONNECT_PROTOCOL,
          NOISE_PROTOCOL,
          options.hostId,
          options.route ?? 'connect',
        ]),
      ),
    });
  }
  start(): string {
    if (this.closed || this.stage !== 0 || this.role !== 'initiator')
      throw new Error('channel-state-invalid');
    this.stage = 1;
    return `h${bytesToHex(this.noise.write())}`;
  }
  peerKey(): Uint8Array {
    if (this.closed || !this.peer) throw new Error('channel-not-ready');
    return this.peer.slice();
  }
  private finish(): void {
    this.binding = this.noise.handshakeHash();
    this.peer = this.noise.peerKey();
    this.transport = this.noise.split();
  }
  receive(wire: string): ChannelResult {
    try {
      if (
        this.closed ||
        wire.length > 2 * (HEADER + CHUNK + 17) + 1 ||
        !/^[hd][0-9a-f]+$/u.test(wire) ||
        wire.length % 2 !== 1
      )
        throw new Error('channel-frame-invalid');
      if (!this.transport) {
        const expected = this.role === 'responder' && this.stage === 1 ? 64 : 48;
        if (
          wire[0] !== 'h' ||
          wire.length !== expected * 2 + 1 ||
          (this.role === 'initiator' && this.stage !== 1)
        )
          throw new Error('channel-handshake-invalid');
        if (this.noise.read(hexToBytes(wire.slice(1))).length !== 0)
          throw new Error('channel-early-payload');
        if (this.role === 'responder' && this.stage === 0) {
          this.stage = 1;
          return { reply: `h${bytesToHex(this.noise.write())}` };
        }
        const reply = this.role === 'initiator' ? `h${bytesToHex(this.noise.write())}` : undefined;
        this.finish();
        return { ...(reply === undefined ? {} : { reply }), ready: true };
      }
      if (wire[0] !== 'd') throw new Error('channel-frame-invalid');
      const frame = hexToBytes(wire.slice(1));
      if (frame.length < HEADER + 17) throw new Error('channel-length-invalid');
      const header = frame.subarray(0, HEADER);
      const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
      if (
        header[0] !== 1 ||
        header[1] !== 1 ||
        header[2] !== (this.role === 'initiator' ? 1 : 0) ||
        this.incoming >= MAX_FRAMES ||
        view.getBigUint64(3, true) !== this.incoming ||
        view.getUint32(11, false) !== frame.length - HEADER
      )
        throw new Error('channel-sequence-invalid');
      const plaintext = this.transport.decrypt(
        frame.subarray(HEADER),
        concatBytes(DOMAIN, this.binding!, header),
      );
      this.incoming++;
      const flag = plaintext[0];
      if (
        (flag !== 0 && flag !== 1 && flag !== 2 && flag !== 3) ||
        ((flag === 1 || flag === 2) && plaintext.length !== CHUNK + 1) ||
        (flag === 3 && plaintext.length < 2) ||
        (flag === 0 || flag === 1) !== (this.chunks.length === 0)
      )
        throw new Error('channel-chunk-invalid');
      this.size += plaintext.length - 1;
      if (this.size > CONNECT_MESSAGE_LIMIT) throw new Error('channel-message-too-large');
      this.chunks.push(plaintext.subarray(1));
      if (flag === 1 || flag === 2) return {};
      const body = concatBytes(...this.chunks);
      for (const chunk of this.chunks) chunk.fill(0);
      this.chunks = [];
      this.size = 0;
      try {
        return { message: new TextDecoder('utf-8', { fatal: true }).decode(body) };
      } finally {
        body.fill(0);
      }
    } catch (error) {
      this.close();
      throw error;
    }
  }
  send(message: string): string[] {
    try {
      if (this.closed || !this.transport) throw new Error('channel-not-ready');
      if (message.length > CONNECT_MESSAGE_LIMIT) throw new Error('channel-message-too-large');
      const body = utf8ToBytes(message);
      if (body.length > CONNECT_MESSAGE_LIMIT) throw new Error('channel-message-too-large');
      const result: string[] = [];
      try {
        for (
          let offset = 0;
          offset < body.length || (offset === 0 && body.length === 0);
          offset += CHUNK
        ) {
          if (this.outgoing >= MAX_FRAMES) throw new Error('channel-counter-exhausted');
          const part = body.subarray(offset, offset + CHUNK);
          const last = offset + CHUNK >= body.length;
          const flag = offset === 0 ? (last ? 0 : 1) : last ? 3 : 2;
          const header = new Uint8Array(HEADER);
          header.set([1, 1, this.role === 'initiator' ? 0 : 1]);
          const view = new DataView(header.buffer);
          view.setBigUint64(3, this.outgoing, true);
          view.setUint32(11, part.length + 17, false);
          const encrypted = this.transport.encrypt(
            concatBytes(new Uint8Array([flag]), part),
            concatBytes(DOMAIN, this.binding!, header),
          );
          this.outgoing++;
          result.push(`d${bytesToHex(concatBytes(header, encrypted))}`);
        }
        return result;
      } finally {
        body.fill(0);
      }
    } catch (error) {
      this.close();
      throw error;
    }
  }
  close(): void {
    this.closed = true;
    this.noise.close();
    this.transport?.close();
    for (const chunk of this.chunks) chunk.fill(0);
    this.chunks = [];
    this.size = 0;
  }
}
