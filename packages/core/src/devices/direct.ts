import { RTCPeerConnection, type RTCDataChannel } from 'werift';
import { WebSocket } from 'ws';
import { CONNECT_CHANNEL_PATH } from './noise/channel.js';

export const DIRECT_PATH = '/direct';
export const DIRECT_LABEL = 'botharness-direct-v1';
export const DIRECT_STUN = ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'];
const FRAME_LIMIT = 70_000;
const QUEUE_LIMIT = 2 * 1024 * 1024;
const OFFER_LIMIT = 16_384;

export type DirectResult =
  | { ok: true; answer: string }
  | { ok: false; code: 'direct-invalid' | 'direct-busy' | 'direct-failed' };

export interface DirectPeers {
  answer(input: { deviceId: string; offer: unknown; signal?: AbortSignal }): Promise<DirectResult>;
  status(): { peers: number; open: number; devices: string[] };
  close(): void;
}

export function createDirectPeers(options: {
  port(): number;
  iceServers?: readonly string[];
  maxPeers?: number;
  openTimeoutMs?: number;
  gatherTimeoutMs?: number;
  log?: (phase: string, detail?: string) => void;
}): DirectPeers {
  const maxPeers = options.maxPeers ?? 8;
  const openTimeout = options.openTimeoutMs ?? 20_000;
  const gatherTimeout = options.gatherTimeoutMs ?? 3_000;
  const log = options.log ?? (() => {});
  const peers = new Map<string, { pc: RTCPeerConnection; open: boolean; close(): void }>();
  let closed = false;

  const bridge = (channel: RTCDataChannel, finish: () => void) => {
    const local = new WebSocket(`ws://127.0.0.1:${options.port()}${CONNECT_CHANNEL_PATH}`, {
      maxPayload: FRAME_LIMIT,
      handshakeTimeout: 10_000,
      followRedirects: false,
    });
    const queued: string[] = [];
    let bytes = 0;
    local.on('open', () => {
      for (const text of queued) local.send(text);
      queued.length = 0;
      bytes = 0;
    });
    local.on('message', (data, binary) => {
      if (binary || data.toString().length > FRAME_LIMIT || channel.readyState !== 'open') {
        finish();
        return;
      }
      channel.send(data.toString());
    });
    local.on('error', () => finish());
    local.on('close', () => finish());
    channel.onMessage.subscribe((data) => {
      if (typeof data !== 'string' || data.length > FRAME_LIMIT) {
        finish();
        return;
      }
      if (local.readyState === WebSocket.OPEN) {
        if (local.bufferedAmount > QUEUE_LIMIT) finish();
        else local.send(data);
      } else if (local.readyState === WebSocket.CONNECTING) {
        bytes += data.length;
        if (bytes > QUEUE_LIMIT) finish();
        else queued.push(data);
      } else finish();
    });
    return () => local.terminate();
  };

  return {
    async answer({ deviceId, offer, signal }) {
      if (closed) return { ok: false, code: 'direct-failed' };
      if (
        typeof offer !== 'string' ||
        offer.length === 0 ||
        offer.length > OFFER_LIMIT ||
        !offer.startsWith('v=0')
      )
        return { ok: false, code: 'direct-invalid' };
      peers.get(deviceId)?.close();
      if (peers.size >= maxPeers) return { ok: false, code: 'direct-busy' };
      const pc = new RTCPeerConnection({
        iceServers: (options.iceServers ?? DIRECT_STUN).map((urls) => ({ urls })),
      });
      let unbridge: (() => void) | undefined;
      let done = false;
      const entry = {
        pc,
        open: false,
        close: () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          unbridge?.();
          if (peers.get(deviceId) === entry) peers.delete(deviceId);
          void pc.close().catch(() => {});
          log('closed', entry.open ? 'after-open' : 'before-open');
        },
      };
      peers.set(deviceId, entry);
      const timer = setTimeout(() => {
        if (!entry.open) entry.close();
      }, openTimeout);
      timer.unref?.();
      pc.onDataChannel.subscribe((channel) => {
        if (channel.label !== DIRECT_LABEL || entry.open || done) {
          channel.close();
          return;
        }
        const start = () => {
          if (entry.open || done) return;
          entry.open = true;
          clearTimeout(timer);
          unbridge = bridge(channel, entry.close);
          log('open');
        };
        channel.stateChanged.subscribe((state) => {
          if (state === 'open') start();
          if (state === 'closed') entry.close();
        });
        if (channel.readyState === 'open') start();
      });
      pc.connectionStateChange.subscribe((state) => {
        if (state === 'failed' || state === 'closed') entry.close();
      });
      try {
        await pc.setRemoteDescription({ type: 'offer', sdp: offer });
        await pc.setLocalDescription(await pc.createAnswer());
        if (pc.iceGatheringState !== 'complete')
          await pc.iceGatheringStateChange
            .watch((state) => state === 'complete', gatherTimeout)
            .catch(() => undefined);
        if (signal?.aborted || done) {
          entry.close();
          return { ok: false, code: 'direct-failed' };
        }
        const answer = pc.localDescription?.sdp;
        if (!answer) {
          entry.close();
          return { ok: false, code: 'direct-failed' };
        }
        log('answered');
        return { ok: true, answer };
      } catch {
        entry.close();
        return { ok: false, code: 'direct-invalid' };
      }
    },
    status: () => {
      const open = [...peers.entries()].filter(([, peer]) => peer.open).map(([id]) => id);
      return { peers: peers.size, open: open.length, devices: open };
    },
    close() {
      closed = true;
      for (const peer of [...peers.values()]) peer.close();
    },
  };
}
