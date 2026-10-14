import { createSocket, type RemoteInfo, type Socket as UdpSocket } from 'node:dgram';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

import { TAILNET_IPV4 } from '../devices/routes.js';

export const SELKIES_RTC_CONFIG = '/run/botharness/rtc.json';
export const SELKIES_RTC_CONFIG_SCRIPT = `mkdir -p /run/botharness && printf '%s' '{"iceServers":[]}' > ${SELKIES_RTC_CONFIG} && chmod 644 ${SELKIES_RTC_CONFIG}`;

const SIGNALING_PATH = 'api/webrtc/signaling';
const SWITCH_PATH = 'api/switch';
const SIGNALING_RETRY_MS = 250;
const SIGNALING_DEADLINE_MS = 10_000;
const FLOW_IDLE_MS = 30_000;
const MAX_FLOWS = 32;
const WEBSOCKET_HEADERS = [
  'upgrade',
  'connection',
  'sec-websocket-key',
  'sec-websocket-version',
  'sec-websocket-extensions',
  'sec-websocket-protocol',
];

export interface SelkiesWebRtcMedia {
  readonly address: string;
  readonly port: number;
}

export interface SelkiesWebRtcContainer {
  media(): Promise<
    { readonly advertised: SelkiesWebRtcMedia; readonly loopbackPort: number } | undefined
  >;
  prepare(): Promise<void>;
}

export function selkiesWebRtcEnv(media: SelkiesWebRtcMedia | undefined): string[] {
  if (media === undefined) return [];
  return [
    'SELKIES_MODE=websockets',
    'SELKIES_ENABLE_DUAL_MODE=true',
    `SELKIES_WEBRTC_UDP_MUX_PORT=${String(media.port)}`,
    `SELKIES_WEBRTC_PUBLIC_IP=${media.address}`,
    'SELKIES_WEBRTC_ICE_LITE=true',
    `SELKIES_RTC_CONFIG_JSON=${SELKIES_RTC_CONFIG}`,
  ];
}

export function selkiesWebRtcMediaFromEnv(env: readonly string[]): SelkiesWebRtcMedia | undefined {
  const value = (key: string): string | undefined =>
    env.find((entry) => entry.startsWith(`${key}=`))?.slice(key.length + 1);
  const address = value('SELKIES_WEBRTC_PUBLIC_IP');
  const port = Number(value('SELKIES_WEBRTC_UDP_MUX_PORT'));
  if (address === undefined || !TAILNET_IPV4.test(address)) return undefined;
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) return undefined;
  return { address, port };
}

export function loopbackPort(dockerPortOutput: string): number | undefined {
  for (const line of dockerPortOutput.split('\n')) {
    const match = /^127\.0\.0\.1:(\d+)$/u.exec(line.trim());
    if (match !== null) return Number(match[1]);
  }
  return undefined;
}

export async function freeUdpPort(address: string): Promise<number> {
  const socket = createSocket('udp4');
  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject);
    socket.bind({ address, port: 0, exclusive: true }, () => resolve());
  });
  const { port } = socket.address();
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  return port;
}

export interface UdpRelay {
  readonly flows: () => number;
  close(): Promise<void>;
}

export async function openUdpRelay(options: {
  readonly address: string;
  readonly port: number;
  readonly targetPort: number;
  readonly idleMs?: number;
  readonly accept?: (address: string) => boolean;
}): Promise<UdpRelay> {
  const idleMs = options.idleMs ?? FLOW_IDLE_MS;
  const accept = options.accept ?? ((address: string) => TAILNET_IPV4.test(address));
  const listener = createSocket({ type: 'udp4', reuseAddr: false });
  const flows = new Map<string, { socket: UdpSocket; seen: number }>();
  await new Promise<void>((resolve, reject) => {
    listener.once('error', reject);
    listener.bind({ address: options.address, port: options.port, exclusive: true }, () => {
      listener.off('error', reject);
      resolve();
    });
  });
  listener.on('error', () => undefined);
  const drop = (key: string): void => {
    flows.get(key)?.socket.close();
    flows.delete(key);
  };
  const flowFor = (from: RemoteInfo): { socket: UdpSocket; seen: number } | undefined => {
    const key = `${from.address}:${String(from.port)}`;
    const known = flows.get(key);
    if (known !== undefined) return known;
    if (flows.size >= MAX_FLOWS || !accept(from.address)) return undefined;
    const socket = createSocket('udp4');
    const flow = { socket, seen: Date.now() };
    socket.on('message', (data) => {
      flow.seen = Date.now();
      listener.send(data, from.port, from.address);
    });
    socket.on('error', () => drop(key));
    socket.bind({ address: '127.0.0.1', port: 0 });
    flows.set(key, flow);
    return flow;
  };
  listener.on('message', (data, from) => {
    const flow = flowFor(from);
    if (flow === undefined) return;
    flow.seen = Date.now();
    flow.socket.send(data, options.targetPort, '127.0.0.1');
  });
  const sweep = setInterval(
    () => {
      for (const [key, flow] of flows) if (Date.now() - flow.seen > idleMs) drop(key);
    },
    Math.max(1000, idleMs / 2),
  );
  sweep.unref();
  return {
    flows: () => flows.size,
    async close() {
      clearInterval(sweep);
      for (const key of [...flows.keys()]) drop(key);
      await new Promise<void>((resolve) => listener.close(() => resolve()));
    },
  };
}

export type SelkiesWebRtcRefusal =
  | 'not-running'
  | 'tailnet-unavailable'
  | 'media-unavailable'
  | 'tailnet-changed'
  | 'media-port-busy'
  | 'switch-failed'
  | 'signaling-unavailable';

export type SelkiesWebRtcStatus =
  | {
      readonly available: true;
      readonly transport: 'webrtc';
      readonly address: string;
      readonly port: number;
      readonly iceServers: readonly [];
      readonly calls: number;
    }
  | {
      readonly available: false;
      readonly code: SelkiesWebRtcRefusal;
      readonly fallback: 'websocket';
    };

export interface SelkiesWebRtcOptions {
  readonly label: string;
  readonly upstream: () => URL | undefined;
  readonly container: () => SelkiesWebRtcContainer | undefined;
  readonly tailnetAddress: () => Promise<string | undefined>;
  readonly fetchImpl?: typeof fetch;
  readonly openRelay?: typeof openUdpRelay;
  readonly log?: (detail: string) => void;
}

export interface SelkiesWebRtc {
  status(): Promise<SelkiesWebRtcStatus>;
  signal(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void>;
  close(): Promise<void>;
}

class Refused extends Error {
  constructor(readonly code: SelkiesWebRtcRefusal) {
    super(code);
  }
}

export function refuseWebRtcUpgrade(socket: Duplex, code: SelkiesWebRtcRefusal): void {
  const body = JSON.stringify({ code, fallback: 'websocket' });
  socket.end(
    `HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
  );
}

export function createSelkiesWebRtc(options: SelkiesWebRtcOptions): SelkiesWebRtc {
  const fetchImpl = options.fetchImpl ?? fetch;
  const openRelay = options.openRelay ?? openUdpRelay;
  const log = options.log ?? (() => undefined);
  const sockets = new Set<Duplex>();
  let calls = 0;
  let relay: UdpRelay | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => undefined);
    return next;
  };

  const resolveMedia = async (): Promise<
    | { ok: true; upstream: URL; advertised: SelkiesWebRtcMedia; loopbackPort: number }
    | { ok: false; code: SelkiesWebRtcRefusal }
  > => {
    const upstream = options.upstream();
    if (upstream === undefined) return { ok: false, code: 'not-running' };
    const media = await options
      .container()
      ?.media()
      .catch(() => undefined);
    if (media === undefined) return { ok: false, code: 'media-unavailable' };
    const address = await options.tailnetAddress().catch(() => undefined);
    if (address === undefined) return { ok: false, code: 'tailnet-unavailable' };
    if (address !== media.advertised.address) return { ok: false, code: 'tailnet-changed' };
    return { ok: true, upstream, ...media };
  };

  const switchTo = async (upstream: URL, mode: 'webrtc' | 'websockets'): Promise<boolean> => {
    try {
      const response = await fetchImpl(new URL(SWITCH_PATH, upstream), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode }),
        signal: AbortSignal.timeout(20_000),
      });
      await response.body?.cancel();
      return response.ok;
    } catch {
      return false;
    }
  };

  const acquire = (): Promise<URL> =>
    serial(async () => {
      const media = await resolveMedia();
      if (!media.ok) throw new Refused(media.code);
      if (calls === 0) {
        try {
          await options.container()?.prepare();
        } catch {
          throw new Refused('media-unavailable');
        }
        try {
          relay = await openRelay({
            address: media.advertised.address,
            port: media.advertised.port,
            targetPort: media.loopbackPort,
          });
        } catch {
          throw new Refused('media-port-busy');
        }
        if (!(await switchTo(media.upstream, 'webrtc'))) {
          await relay.close();
          relay = undefined;
          throw new Refused('switch-failed');
        }
        log(
          `${options.label} webrtc phase=started address=${media.advertised.address} port=${String(media.advertised.port)}`,
        );
      }
      calls += 1;
      return media.upstream;
    });

  const release = (): Promise<void> =>
    serial(async () => {
      calls -= 1;
      if (calls > 0) return;
      const upstream = options.upstream();
      const back = upstream === undefined ? true : await switchTo(upstream, 'websockets');
      await relay?.close();
      relay = undefined;
      log(`${options.label} webrtc phase=ended switchedBack=${String(back)}`);
    });

  const connect = (
    request: IncomingMessage,
    target: URL,
  ): Promise<{ answer: IncomingMessage; upstream: Duplex; head: Buffer } | undefined> =>
    new Promise((resolve) => {
      const headers: Record<string, string> = { host: target.host };
      for (const name of WEBSOCKET_HEADERS) {
        const value = request.headers[name];
        if (typeof value === 'string') headers[name] = value;
      }
      const outbound = httpRequest({
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: 'GET',
        headers,
      });
      outbound.setTimeout(5000, () => outbound.destroy());
      outbound.on('upgrade', (answer, upstream, head) => resolve({ answer, upstream, head }));
      outbound.on('response', (answer) => {
        answer.resume();
        resolve(undefined);
      });
      outbound.on('error', () => resolve(undefined));
      outbound.end();
    });

  return {
    async status() {
      const media = await resolveMedia();
      if (!media.ok) return { available: false, code: media.code, fallback: 'websocket' };
      return {
        available: true,
        transport: 'webrtc',
        address: media.advertised.address,
        port: media.advertised.port,
        iceServers: [],
        calls,
      };
    },

    async signal(request, socket, head) {
      let upstream: URL;
      try {
        upstream = await acquire();
      } catch (error) {
        const code = error instanceof Refused ? error.code : 'switch-failed';
        log(`${options.label} webrtc phase=refused code=${code}`);
        refuseWebRtcUpgrade(socket, code);
        return;
      }
      let released = false;
      const end = (): void => {
        if (released) return;
        released = true;
        sockets.delete(socket);
        void release();
      };
      sockets.add(socket);
      socket.once('close', end);
      socket.on('error', () => socket.destroy());
      const search = new URL(request.url ?? '/', 'http://127.0.0.1').search;
      const target = new URL(`${SIGNALING_PATH}${search}`, upstream);
      const deadline = Date.now() + SIGNALING_DEADLINE_MS;
      let opened = await connect(request, target);
      while (opened === undefined && Date.now() < deadline && !socket.destroyed) {
        await new Promise((resolve) => setTimeout(resolve, SIGNALING_RETRY_MS));
        opened = await connect(request, target);
      }
      if (opened === undefined || socket.destroyed) {
        opened?.upstream.destroy();
        if (!socket.destroyed) refuseWebRtcUpgrade(socket, 'signaling-unavailable');
        end();
        return;
      }
      const { answer, upstream: peer, head: peerHead } = opened;
      const lines = ['HTTP/1.1 101 Switching Protocols'];
      for (let index = 0; index < answer.rawHeaders.length; index += 2) {
        const name = answer.rawHeaders[index]!;
        if (name.toLowerCase() !== 'set-cookie')
          lines.push(`${name}: ${answer.rawHeaders[index + 1]!}`);
      }
      socket.write(`${lines.join('\r\n')}\r\n\r\n`);
      if (peerHead.length > 0) socket.write(peerHead);
      if (head.length > 0) peer.write(head);
      peer.on('error', () => socket.destroy());
      peer.once('close', () => socket.destroy());
      socket.once('close', () => peer.destroy());
      peer.pipe(socket);
      socket.pipe(peer);
    },

    async close() {
      for (const socket of [...sockets]) socket.destroy();
      await new Promise((resolve) => setImmediate(resolve));
      await queue;
    },
  };
}
