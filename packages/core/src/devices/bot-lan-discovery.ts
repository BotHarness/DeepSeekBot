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
type OpenPort = (
  receive: (packet: Uint8Array, address: string) => void,
  failed: () => void,
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
    socket.on('error', (error) => {
      close();
      if (listening) failed();
      else reject(error);
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
        if (!addresses.length) throw new Error('lan-interface-unavailable');
        for (const address of new Set(addresses)) socket.addMembership(GROUP, address);
        socket.setMulticastTTL(1);
        socket.setMulticastLoopback(true);
        socket.unref();
        listening = true;
        resolve({
          send(packet) {
            if (closed) return;
            socket.send(packet, PORT, GROUP, (error) => {
              if (error && !closed) failed();
            });
          },
          close,
        });
      } catch (error) {
        close();
        reject(error);
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
  function failed() {
    if (closed || state === 'error') return;
    state = 'error';
    stop();
    options.record?.({ phase: 'lan-discovery-failed', durationMs: 0 });
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
        try {
          self = await options.identity();
          const packet = Buffer.from(
            JSON.stringify(
              announcement.parse({ ...self, protocol: 'botharness-lan-bots-v1', port }),
            ),
          );
          if (packet.byteLength > 1024) throw new Error('lan-advertisement-too-large');
          if (closed) return;
          const opened = await (options.open ?? openMulticast)(receive, failed);
          if (closed || state === 'error') {
            opened.close();
            return;
          }
          transport = opened;
          state = 'listening';
          opened.send(packet);
          timer = setInterval(() => {
            prune();
            transport?.send(packet);
          }, 10_000);
          timer.unref();
          options.record?.({
            phase: 'lan-discovery-started',
            durationMs: Math.round(performance.now() - started),
          });
        } catch {
          failed();
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
