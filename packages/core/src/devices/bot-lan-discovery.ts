import { createSocket } from 'node:dgram';
import { networkInterfaces } from 'node:os';
import { z } from 'zod';
import { hostId } from './bot-network-wire.js';
import type { LanBotCandidate } from './bot-lan-membership.js';
import type { LanBotPeer } from './bot-lan-bridge.js';
import { isLanAddress } from './lan-address.js';

const GROUP = '239.255.42.87';
const PORT = 43288;
const LIFETIME = 30_000;
const announcement = z
  .object({
    protocol: z.literal('botharness-lan-bots-v1'),
    hostId,
    publicKey: z.string().regex(/^[a-f0-9]{64}$/u),
    name: z.string().max(128),
    port: z.number().int().min(1).max(65535),
  })
  .strict();
interface DatagramPort {
  send(packet: Uint8Array): void;
  close(): void;
}
type DiscoveryFailureCode =
  | 'lan-identity-unavailable'
  | 'lan-advertisement-invalid'
  | 'lan-interface-unavailable'
  | 'lan-bind-failed'
  | 'lan-multicast-setup-failed'
  | 'lan-socket-failed'
  | 'lan-send-failed';
class DiscoveryFailure extends Error {
  constructor(readonly code: DiscoveryFailureCode) {
    super(code);
  }
}
type OpenPort = (
  receive: (packet: Uint8Array, address: string) => void,
  failed: (code?: DiscoveryFailureCode) => void,
) => Promise<DatagramPort>;

const openMulticast: OpenPort = (receive, failed) =>
  new Promise((resolve, reject) => {
    const socket = createSocket({ type: 'udp4', reuseAddr: true });
    let listening = false;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      try {
        socket.close();
      } catch {
        return;
      }
    };
    socket.on('error', () => {
      close();
      if (listening) failed('lan-socket-failed');
      else reject(new DiscoveryFailure('lan-bind-failed'));
    });
    socket.on('message', (packet, remote) => {
      if (!closed) receive(packet, remote.address);
    });
    socket.bind(PORT, '0.0.0.0', () => {
      try {
        const addresses = Object.values(networkInterfaces()).flatMap(
          (entries) =>
            entries
              ?.filter(
                (entry) =>
                  !entry.internal && entry.family === 'IPv4' && isLanAddress(entry.address),
              )
              .map((entry) => entry.address) ?? [],
        );
        if (!addresses.length) throw new DiscoveryFailure('lan-interface-unavailable');
        const interfaces = [...new Set(addresses)];
        for (const address of interfaces) socket.addMembership(GROUP, address);
        socket.setMulticastTTL(1);
        socket.setMulticastLoopback(true);
        socket.unref();
        listening = true;
        let sending = false;
        resolve({
          send(packet) {
            if (closed || sending) return;
            sending = true;
            const next = (index: number) => {
              const address = interfaces[index];
              if (closed || address === undefined) {
                sending = false;
                return;
              }
              try {
                socket.setMulticastInterface(address);
                socket.send(packet, PORT, GROUP, (error) => {
                  if (closed) return;
                  if (error) {
                    sending = false;
                    failed('lan-send-failed');
                  } else next(index + 1);
                });
              } catch {
                sending = false;
                failed('lan-send-failed');
              }
            };
            next(0);
          },
          close,
        });
      } catch (error) {
        close();
        reject(
          error instanceof DiscoveryFailure
            ? error
            : new DiscoveryFailure('lan-multicast-setup-failed'),
        );
      }
    });
  });

export function createLanBotDiscovery(options: {
  identity(): Promise<LanBotCandidate>;
  open?: OpenPort;
  now?(): number;
  record?(event: {
    phase: 'lan-discovery-started' | 'lan-discovery-stopped' | 'lan-discovery-failed';
    durationMs: number;
    code?: DiscoveryFailureCode;
  }): void;
}) {
  const now = options.now ?? Date.now;
  const observed = new Map<string, { peer: LanBotPeer; expires: number }>();
  let self: LanBotCandidate | undefined;
  let transport: DatagramPort | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  let starting: Promise<void> | undefined;
  let state: 'off' | 'listening' | 'error' = 'off';
  let startedAt = 0;
  function prune() {
    const instant = now();
    for (const [id, candidate] of observed) if (candidate.expires <= instant) observed.delete(id);
  }
  function stop() {
    clearInterval(timer);
    timer = undefined;
    transport?.close();
    transport = undefined;
    observed.clear();
  }
  function failed(code: DiscoveryFailureCode = 'lan-socket-failed') {
    if (closed || state === 'error') return;
    state = 'error';
    stop();
    options.record?.({
      phase: 'lan-discovery-failed',
      durationMs: Math.round(performance.now() - startedAt),
      code,
    });
  }
  function receive(bytes: Uint8Array, address: string) {
    if (closed || state !== 'listening' || bytes.byteLength > 1024 || !isLanAddress(address))
      return;
    try {
      const parsed = announcement.safeParse(JSON.parse(Buffer.from(bytes).toString('utf8')));
      if (!parsed.success || parsed.data.hostId === self?.hostId) return;
      const { protocol: _protocol, port, ...peer } = parsed.data;
      const id = `${peer.hostId}:${peer.publicKey}:${address}`;
      prune();
      if (!observed.has(id) && observed.size >= 256) return;
      observed.set(id, {
        peer: { ...peer, origin: `http://${address}:${port}` },
        expires: now() + LIFETIME,
      });
    } catch {
      return;
    }
  }
  return {
    status: () => state,
    start(port: number): Promise<void> {
      if (closed) return Promise.resolve();
      starting ??= (async () => {
        const started = performance.now();
        startedAt = started;
        let failureCode: DiscoveryFailureCode = 'lan-identity-unavailable';
        try {
          self = await options.identity();
          failureCode = 'lan-advertisement-invalid';
          const packet = Buffer.from(
            JSON.stringify(
              announcement.parse({ ...self, protocol: 'botharness-lan-bots-v1', port }),
            ),
          );
          if (packet.byteLength > 1024) throw new Error('lan-advertisement-too-large');
          if (closed) return;
          failureCode = 'lan-bind-failed';
          const opened = await (options.open ?? openMulticast)(receive, failed);
          if (closed || state === 'error') {
            opened.close();
            return;
          }
          transport = opened;
          state = 'listening';
          opened.send(packet);
          if (state !== 'listening' || closed) return;
          timer = setInterval(() => {
            prune();
            transport?.send(packet);
          }, 10_000);
          timer.unref();
          options.record?.({
            phase: 'lan-discovery-started',
            durationMs: Math.round(performance.now() - started),
          });
        } catch (error) {
          failed(error instanceof DiscoveryFailure ? error.code : failureCode);
        }
      })();
      return starting;
    },
    candidates(): readonly LanBotPeer[] {
      if (closed || state !== 'listening') return [];
      prune();
      const hosts = new Map<string, LanBotPeer>();
      const conflicts = new Set<string>();
      for (const { peer } of observed.values()) {
        const previous = hosts.get(peer.hostId);
        if (previous && previous.publicKey !== peer.publicKey) conflicts.add(peer.hostId);
        if (!previous || peer.origin < previous.origin) hosts.set(peer.hostId, peer);
      }
      return [...hosts.values()].filter((peer) => !conflicts.has(peer.hostId));
    },
    close() {
      if (closed) return;
      closed = true;
      state = 'off';
      stop();
      options.record?.({ phase: 'lan-discovery-stopped', durationMs: 0 });
    },
  };
}
