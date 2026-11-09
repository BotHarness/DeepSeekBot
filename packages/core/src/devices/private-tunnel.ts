import { spawn as spawnProcess } from 'node:child_process';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { connect as tcpConnect, type AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';

import { credentialKey, type CredentialProvider } from '@deepseek-ai/dsh-credentials';

import {
  createCloudflaredResolver,
  type CloudflaredResolver,
  type CloudflaredSource,
} from './cloudflared.js';
import { validTunnelToken, type SpawnTunnel, type TunnelProcess } from './connect.js';
import { CONNECT_CHANNEL_PATH } from './noise/channel.js';
import type { PrivateRelayAdmission } from './private-relay.js';

type Credentials = Pick<CredentialProvider, 'readRecord' | 'modifyRecord' | 'deleteRecord'>;

export type PrivateTunnelMode = 'quick' | 'named' | 'ingress';

export type PrivateTunnelIssue =
  | 'cloudflared-missing'
  | 'cloudflared-download-failed'
  | 'cloudflared-hash-mismatch'
  | 'cloudflared-exited'
  | 'tunnel-address-missing'
  | 'tunnel-unreachable'
  | 'origin-port-busy'
  | 'credential-unavailable'
  | 'private-tunnel-credential-invalid';

export interface PrivateTunnelStatus {
  state: 'off' | 'starting' | 'verifying' | 'connected' | 'error';
  mode?: PrivateTunnelMode;
  origin?: string;
  originPort?: number;
  lan?: boolean;
  issue?: PrivateTunnelIssue;
  probe?: string;
  cloudflared?: CloudflaredSource;
  addressChanged?: boolean;
}

export type PrivateTunnelRefusal =
  | 'private-tunnel-input-invalid'
  | 'private-tunnel-hostname-invalid'
  | 'private-tunnel-token-invalid'
  | 'private-ingress-origin-invalid'
  | 'private-route-in-use'
  | 'credential-unavailable';

export type PrivateTunnelResult =
  | { ok: true; status: PrivateTunnelStatus }
  | { ok: false; code: PrivateTunnelRefusal };

interface TunnelRecord {
  mode: PrivateTunnelMode;
  phoneToken: string;
  originPort: number;
  hostname?: string;
  token?: string;
  origin?: string;
  lan?: boolean;
}

export const PROBE_PREFIX = '/.well-known/botharness-tunnel/';
const QUICK_HOSTNAME = /https:\/\/([a-z0-9-]+\.trycloudflare\.com)/u;
const REGISTERED = /Registered tunnel connection/u;
const RESTART_MIN_MS = 5_000;
const RESTART_MAX_MS = 60_000;
const PROBE_INTERVAL_MS = 3_000;
const PROBE_WINDOW_MS = 90_000;
const REPROBE_MS = 30_000;
const SECRET = /^[a-f0-9]{64}$/u;

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

export function privateTunnelHostname(input: string): string | undefined {
  const hostname = input.trim().toLowerCase();
  if (
    hostname.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/u.test(hostname) ||
    hostname === 'deepseekbot.dev' ||
    hostname.endsWith('.deepseekbot.dev') ||
    hostname.endsWith('.ts.net') ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost')
  )
    return undefined;
  return hostname;
}

const TLS_FAILURES = new Set([
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

export function privateIngressOrigin(input: string): string | undefined {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return undefined;
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '[::1]' ||
    /^127\./u.test(host) ||
    host === 'deepseekbot.dev' ||
    host.endsWith('.deepseekbot.dev') ||
    host.endsWith('.ts.net') ||
    /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/u.test(host)
  )
    return undefined;
  return url.origin;
}

function parseRecord(payload: unknown): TunnelRecord | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const value = payload as Record<string, unknown>;
  const mode = value['mode'];
  const originPort = value['originPort'];
  const phoneToken = value['phoneToken'];
  if (
    (mode !== 'quick' && mode !== 'named' && mode !== 'ingress') ||
    typeof phoneToken !== 'string' ||
    !SECRET.test(phoneToken) ||
    typeof originPort !== 'number' ||
    !Number.isInteger(originPort) ||
    originPort < 0 ||
    originPort > 65535
  )
    return undefined;
  if (mode === 'ingress') {
    const origin =
      typeof value['origin'] === 'string' ? privateIngressOrigin(value['origin']) : undefined;
    if (origin === undefined) return undefined;
    return { mode, phoneToken, originPort, origin, lan: value['lan'] === true };
  }
  const hostname =
    typeof value['hostname'] === 'string' ? privateTunnelHostname(value['hostname']) : undefined;
  if (mode === 'named') {
    const token = value['token'];
    if (hostname === undefined || typeof token !== 'string' || !validTunnelToken(token))
      return undefined;
    return { mode, phoneToken, originPort, hostname, token };
  }
  return { mode, phoneToken, originPort, ...(hostname === undefined ? {} : { hostname }) };
}

type TunnelOrigin = Server & { upgraded: Set<Duplex> };

export function createTunnelOrigin(options: {
  port: () => number;
  phoneToken: () => string;
  probe: () => string | undefined;
}): TunnelOrigin {
  const upgraded = new Set<Duplex>();
  const server = createServer((request, response) => {
    request.resume();
    const nonce = options.probe();
    if (
      request.method === 'GET' &&
      nonce !== undefined &&
      request.url === `${PROBE_PREFIX}${nonce}`
    ) {
      response.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
      response.end(nonce);
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ code: 'not-found' }));
  });
  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const header = request.headers['x-botharness-admission'];
    const presented =
      (typeof header === 'string' ? header : undefined) ??
      request.headers.authorization?.replace(/^Bearer /u, '') ??
      '';
    if (
      request.url !== CONNECT_CHANNEL_PATH ||
      request.headers.cookie !== undefined ||
      !timingSafeEqual(digest(presented), digest(options.phoneToken()))
    ) {
      socket.end('HTTP/1.1 404 Not Found\r\nconnection: close\r\ncontent-length: 0\r\n\r\n');
      return;
    }
    let raw = `${request.method ?? 'GET'} ${CONNECT_CHANNEL_PATH} HTTP/${request.httpVersion}\r\n`;
    for (let index = 0; index < request.rawHeaders.length; index += 2) {
      const name = request.rawHeaders[index] ?? '';
      const lower = name.toLowerCase();
      if (lower === 'authorization' || lower === 'x-botharness-admission') continue;
      raw += `${name}: ${request.rawHeaders[index + 1] ?? ''}\r\n`;
    }
    const upstream = tcpConnect(options.port(), '127.0.0.1', () => {
      upstream.write(`${raw}\r\n`);
      if (head.length > 0) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
    upgraded.add(socket);
    socket.on('close', () => {
      upgraded.delete(socket);
      upstream.destroy();
    });
  });
  return Object.assign(server, { upgraded });
}

const spawnTunnel: SpawnTunnel = (binary, args, env) =>
  spawnProcess(binary, [...args], { env, stdio: ['ignore', 'ignore', 'pipe'] });

function probeFailure(error: unknown): string {
  const cause = (error as { cause?: { code?: unknown } }).cause;
  if (typeof cause?.code === 'string') {
    if (cause.code === 'ENOTFOUND') return 'dns';
    return TLS_FAILURES.has(cause.code) ? 'tls' : cause.code;
  }
  return error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network';
}

export function createPrivateTunnel(options: {
  credentials: () => Credentials | undefined;
  port: () => number;
  resolveBinary?: CloudflaredResolver;
  cloudflaredCache?: string;
  packageAnchors?: readonly string[];
  spawn?: SpawnTunnel;
  fetch?: typeof fetch;
  probeIntervalMs?: number;
  probeWindowMs?: number;
  reprobeMs?: number;
  record?: (phase: string, detail?: string) => void;
}) {
  const key = credentialKey('botharness-core', 'private-tunnel');
  const spawn = options.spawn ?? spawnTunnel;
  const fetchImpl = options.fetch ?? fetch;
  const record = options.record ?? (() => {});
  const probeInterval = options.probeIntervalMs ?? PROBE_INTERVAL_MS;
  const probeWindow = options.probeWindowMs ?? PROBE_WINDOW_MS;
  const reprobe = options.reprobeMs ?? REPROBE_MS;
  const resolveBinary =
    options.resolveBinary ??
    createCloudflaredResolver({
      ...(options.cloudflaredCache === undefined ? {} : { cacheDir: options.cloudflaredCache }),
      ...(options.packageAnchors === undefined ? {} : { anchors: options.packageAnchors }),
      log: record,
    });
  let status: PrivateTunnelStatus = { state: 'off' };
  let current: TunnelRecord | undefined;
  let server: TunnelOrigin | undefined;
  let tunnel: TunnelProcess | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let probeTimer: ReturnType<typeof setTimeout> | undefined;
  let probing = 0;
  let nonce: string | undefined;
  let backoff = RESTART_MIN_MS;
  let generation = 0;
  let queue: Promise<unknown> = Promise.resolve();

  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => undefined);
    return next;
  };
  const later = (work: () => void, ms: number): void => {
    clearTimeout(timer);
    timer = setTimeout(work, ms);
    timer.unref?.();
  };
  const probeLater = (work: () => void, ms: number): void => {
    clearTimeout(probeTimer);
    probeTimer = setTimeout(work, ms);
    probeTimer.unref?.();
  };

  const read = async (): Promise<TunnelRecord | undefined | 'unavailable' | 'invalid'> => {
    const native = options.credentials();
    if (native === undefined) return 'unavailable';
    try {
      const stored = await native.readRecord(key);
      if (stored === undefined || stored === null) return undefined;
      return (stored.kind === 'grant' ? parseRecord(stored.payload) : undefined) ?? 'invalid';
    } catch {
      return 'unavailable';
    }
  };
  const persist = async (next: TunnelRecord): Promise<boolean> => {
    const native = options.credentials();
    if (native === undefined) return false;
    try {
      await native.modifyRecord(key, async () => ({ kind: 'grant', payload: { ...next } }));
      return true;
    } catch {
      return false;
    }
  };

  const verify = (run: number, session: number, origin: string, deadline: number): void => {
    if (run !== generation || session !== probing) return;
    nonce = randomBytes(16).toString('hex');
    const expected = nonce;
    void fetchImpl(`${origin}${PROBE_PREFIX}${expected}`, {
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    })
      .then(async (response) => {
        const body = await response.text();
        if (response.status !== 200 || body !== expected)
          throw new Error(`http-${response.status}`);
      })
      .then(
        () => {
          if (run !== generation || session !== probing) return;
          status = { ...status, state: 'connected' };
          delete status.issue;
          delete status.probe;
          backoff = RESTART_MIN_MS;
          record('verified', `mode=${status.mode ?? ''}`);
          probeLater(() => verify(run, session, origin, Date.now() + probeWindow), reprobe * 4);
        },
        (error: unknown) => {
          if (run !== generation || session !== probing) return;
          const probe =
            error instanceof Error && error.message.startsWith('http-')
              ? error.message
              : probeFailure(error);
          status = { ...status, probe };
          if (Date.now() < deadline) {
            probeLater(() => verify(run, session, origin, deadline), probeInterval);
            return;
          }
          status = { ...status, state: 'error', issue: 'tunnel-unreachable' };
          record('unreachable', `probe=${probe}`);
          probeLater(() => verify(run, session, origin, Date.now() + probeWindow), reprobe);
        },
      );
  };

  const retry = (next: TunnelRecord, run: number): void =>
    later(() => void runTunnel(next, run), (backoff = Math.min(backoff * 2, RESTART_MAX_MS)));

  const runTunnel = async (next: TunnelRecord, run: number): Promise<void> => {
    if (run !== generation) return;
    status = { ...status, state: 'starting' };
    delete status.issue;
    if (next.mode === 'ingress' && next.origin !== undefined) {
      status = { ...status, state: 'verifying' };
      record('ingress-started', `lan=${String(next.lan === true)}`);
      verify(run, ++probing, next.origin, Date.now() + probeWindow);
      return;
    }
    let resolved;
    try {
      resolved = await resolveBinary();
    } catch {
      resolved = {
        binary: 'cloudflared',
        source: 'path' as const,
        failure: 'cloudflared-download-failed' as const,
      };
    }
    if (run !== generation) return;
    status = { ...status, cloudflared: resolved.source };
    const args =
      next.mode === 'quick'
        ? ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${String(next.originPort)}`]
        : ['tunnel', '--no-autoupdate', 'run'];
    const env = next.mode === 'named' ? { ...process.env, TUNNEL_TOKEN: next.token } : process.env;
    let child: TunnelProcess;
    try {
      child = spawn(resolved.binary, args, env);
    } catch {
      status = { ...status, state: 'error', issue: resolved.failure ?? 'cloudflared-missing' };
      return;
    }
    tunnel = child;
    record('cloudflared-started', `mode=${next.mode} source=${resolved.source}`);
    let hostname = next.mode === 'named' ? next.hostname : undefined;
    let registered = false;
    let text = '';
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      if (run !== generation) return;
      if (hostname === undefined) {
        text = (text + chunk).slice(-8192);
        const match = QUICK_HOSTNAME.exec(text)?.[1];
        if (match !== undefined) {
          hostname = match;
          const changed = current?.hostname !== undefined && current.hostname !== match;
          status = {
            ...status,
            origin: `https://${match}`,
            ...(changed || status.addressChanged ? { addressChanged: true } : {}),
          };
          if (current !== undefined) {
            current = { ...current, hostname: match };
            void persist(current);
          }
          record('quick-address', changed ? 'changed=true' : 'changed=false');
        }
      }
      if (!registered && REGISTERED.test(chunk)) registered = true;
      if (registered && hostname !== undefined && status.state === 'starting') {
        status = { ...status, state: 'verifying' };
        verify(run, ++probing, `https://${hostname}`, Date.now() + probeWindow);
      }
    });
    const exited = (issue: PrivateTunnelIssue, detail: string): void => {
      if (tunnel === child) tunnel = undefined;
      if (run !== generation) return;
      probing += 1;
      clearTimeout(probeTimer);
      nonce = undefined;
      status = { ...status, state: 'error', issue };
      record('cloudflared-exited', `${detail} retryMs=${String(backoff)}`);
      retry(next, run);
    };
    child.on('error', (error) =>
      error.code === 'ENOENT'
        ? ((status = {
            ...status,
            state: 'error',
            issue: resolved.failure ?? 'cloudflared-missing',
          }),
          undefined)
        : exited('cloudflared-exited', `error=${String(error.code)}`),
    );
    child.on('exit', (code) => exited('cloudflared-exited', `code=${String(code)}`));
  };

  const stop = async (): Promise<void> => {
    generation += 1;
    clearTimeout(timer);
    clearTimeout(probeTimer);
    probing += 1;
    nonce = undefined;
    tunnel?.kill();
    tunnel = undefined;
    const closing = server;
    server = undefined;
    backoff = RESTART_MIN_MS;
    if (closing?.listening) {
      closing.closeAllConnections();
      for (const socket of closing.upgraded) socket.destroy();
      await new Promise<void>((done) => closing.close(() => done()));
    }
  };

  const listen = (origin: Server, port: number, lan = false): Promise<number | undefined> =>
    new Promise((resolve) => {
      origin.once('error', () => resolve(undefined));
      origin.listen(port, lan ? '0.0.0.0' : '127.0.0.1', () =>
        resolve((origin.address() as AddressInfo).port),
      );
    });

  const run = async (next: TunnelRecord): Promise<TunnelRecord | undefined> => {
    await stop();
    const origin = createTunnelOrigin({
      port: options.port,
      phoneToken: () => next.phoneToken,
      probe: () => nonce,
    });
    const lan = next.mode === 'ingress' && next.lan === true;
    const bound =
      (await listen(origin, next.originPort, lan)) ??
      (next.mode === 'quick' && next.originPort !== 0 ? await listen(origin, 0, lan) : undefined);
    const base = {
      mode: next.mode,
      ...(next.mode === 'named' && next.hostname ? { origin: `https://${next.hostname}` } : {}),
      ...(next.mode === 'ingress' && next.origin ? { origin: next.origin, lan } : {}),
    };
    if (bound === undefined) {
      status = { ...base, state: 'error', issue: 'origin-port-busy', originPort: next.originPort };
      record('origin-port-busy', `port=${String(next.originPort)}`);
      return undefined;
    }
    server = origin;
    const started = { ...next, originPort: bound };
    current = started;
    status = {
      ...base,
      state: 'starting',
      originPort: bound,
      ...(status.addressChanged ? { addressChanged: true } : {}),
    };
    void runTunnel(started, generation);
    return started;
  };

  return {
    status: (): PrivateTunnelStatus => ({ ...status }),
    admission: (): PrivateRelayAdmission | undefined =>
      current !== undefined && status.state === 'connected' && status.origin !== undefined
        ? { origin: status.origin, token: current.phoneToken }
        : undefined,
    restore: () =>
      serial(async () => {
        const stored = await read();
        if (stored === undefined) return;
        if (stored === 'unavailable') {
          status = { state: 'error', issue: 'credential-unavailable' };
          return;
        }
        if (stored === 'invalid') {
          status = { state: 'error', issue: 'private-tunnel-credential-invalid' };
          return;
        }
        current = stored;
        const started = await run(stored);
        if (started !== undefined && started.originPort !== stored.originPort)
          await persist(started);
      }),
    enable: (input: {
      mode: PrivateTunnelMode;
      hostname?: string;
      token?: string;
      origin?: string;
      lan?: boolean;
      inUse?: boolean;
    }) =>
      serial(async (): Promise<PrivateTunnelResult> => {
        if (input.inUse) return { ok: false, code: 'private-route-in-use' };
        if (input.mode !== 'quick' && input.mode !== 'named' && input.mode !== 'ingress')
          return { ok: false, code: 'private-tunnel-input-invalid' };
        let hostname: string | undefined;
        let token: string | undefined;
        let origin: string | undefined;
        if (input.mode === 'ingress') {
          origin = privateIngressOrigin(input.origin ?? '');
          if (origin === undefined) return { ok: false, code: 'private-ingress-origin-invalid' };
        }
        if (input.mode === 'named') {
          hostname = privateTunnelHostname(input.hostname ?? '');
          if (hostname === undefined) return { ok: false, code: 'private-tunnel-hostname-invalid' };
          token = (input.token ?? '').trim();
          if (!validTunnelToken(token)) return { ok: false, code: 'private-tunnel-token-invalid' };
        }
        if (options.credentials() === undefined)
          return { ok: false, code: 'credential-unavailable' };
        const previous = await read();
        const kept = typeof previous === 'object' ? previous : undefined;
        if (input.mode === 'quick' && kept?.mode === 'quick') hostname = kept.hostname;
        const keptOrigin =
          kept?.mode === 'ingress'
            ? kept.origin
            : kept?.hostname === undefined
              ? undefined
              : `https://${kept.hostname}`;
        if (origin !== undefined && keptOrigin !== undefined && keptOrigin !== origin)
          status = { ...status, addressChanged: true };
        const next: TunnelRecord = {
          mode: input.mode,
          phoneToken: kept?.phoneToken ?? randomBytes(32).toString('hex'),
          originPort: kept?.originPort ?? 0,
          ...(hostname === undefined ? {} : { hostname }),
          ...(token === undefined ? {} : { token }),
          ...(origin === undefined ? {} : { origin, lan: input.lan === true }),
        };
        current = next;
        const started = await run(next);
        if (!(await persist(started ?? next))) {
          await stop();
          current = undefined;
          status = { state: 'off' };
          return { ok: false, code: 'credential-unavailable' };
        }
        record('enabled', `mode=${input.mode}`);
        return { ok: true, status: { ...status } };
      }),
    disable: () =>
      serial(async (): Promise<PrivateTunnelResult> => {
        await stop();
        current = undefined;
        status = { state: 'off' };
        const native = options.credentials();
        if (native === undefined) return { ok: false, code: 'credential-unavailable' };
        try {
          await native.deleteRecord(key);
        } catch {
          return { ok: false, code: 'credential-unavailable' };
        }
        record('disabled');
        return { ok: true, status: { ...status } };
      }),
    acknowledgeAddress: () => {
      delete status.addressChanged;
    },
    close: () => serial(stop),
  };
}

export type PrivateTunnel = ReturnType<typeof createPrivateTunnel>;
