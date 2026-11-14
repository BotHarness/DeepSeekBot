import { createTunnelLookup } from './tunnel-dns.js';
import { spawn as spawnProcess } from 'node:child_process';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, request as httpRequest, type IncomingMessage, type Server } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { connect as tcpConnect, type AddressInfo, type LookupFunction } from 'node:net';
import type { Duplex } from 'node:stream';
import { privateAdmissionFromHeaders } from '../../../../deploy/private-relay/admission.mjs';
import { getCACertificates } from 'node:tls';

import type { CredentialProvider } from '@deepseek-ai/dsh-credentials';

import {
  createCloudflaredResolver,
  type CloudflaredResolver,
  type CloudflaredSource,
} from './cloudflared.js';
import { validTunnelToken, type SpawnTunnel, type TunnelProcess } from './connect.js';
import { CONNECT_CHANNEL_PATH } from './noise/channel.js';
import type { PrivateRelayAdmission } from './private-relay.js';
import { isConnectZoneHost } from './routes.js';

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
  | 'credential-unavailable'
  | 'private-route-origin-in-use'
  | 'private-route-id-required'
  | 'private-route-not-found'
  | 'private-route-replace-required'
  | 'private-route-limit'
  | 'private-tunnel-credential-invalid';

export type PrivateTunnelResult =
  | { ok: true; status: PrivateTunnelStatus; routeId?: 'quick' | 'custom' }
  | { ok: false; code: PrivateTunnelRefusal };

export interface TunnelRecord {
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
    isConnectZoneHost(hostname) ||
    hostname.endsWith('.ts.net') ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost')
  )
    return undefined;
  return hostname;
}

const TLS_FAILURES = new Set([
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'CERT_UNTRUSTED',
  'CERT_NOT_YET_VALID',
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
    isConnectZoneHost(host) ||
    host.endsWith('.ts.net') ||
    /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/u.test(host)
  )
    return undefined;
  return url.origin;
}

export function parseTunnelRecord(payload: unknown): TunnelRecord | undefined {
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
    const admission = privateAdmissionFromHeaders(
      request.headers.authorization,
      request.headers['x-botharness-admission'],
      request.headers['sec-websocket-protocol'],
    );
    if (
      request.url !== CONNECT_CHANNEL_PATH ||
      request.headers.cookie !== undefined ||
      !admission ||
      !timingSafeEqual(digest(admission.token), digest(options.phoneToken()))
    ) {
      socket.end('HTTP/1.1 404 Not Found\r\nconnection: close\r\ncontent-length: 0\r\n\r\n');
      return;
    }
    let raw = `${request.method ?? 'GET'} ${CONNECT_CHANNEL_PATH} HTTP/${request.httpVersion}\r\n`;
    for (let index = 0; index < request.rawHeaders.length; index += 2) {
      const name = request.rawHeaders[index] ?? '';
      const lower = name.toLowerCase();
      if (lower === 'authorization' || lower === 'x-botharness-admission') continue;
      if (lower === 'sec-websocket-protocol') {
        if (admission.protocol) raw += `${name}: ${admission.protocol}\r\n`;
        continue;
      }
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

export function systemTrustedCertificates(): string[] {
  try {
    return [...new Set([...getCACertificates('default'), ...getCACertificates('system')])];
  } catch {
    return [...getCACertificates('default')];
  }
}

const quickTunnelLookup = createTunnelLookup();

export const createTrustFetch = (
  certificates: () => string[],
  resolveHost: LookupFunction = quickTunnelLookup,
) =>
  ((input: string | URL, init?: RequestInit): Promise<Response> =>
    new Promise((resolve, reject) => {
      const url = new URL(String(input));
      const signal = init?.signal ?? undefined;
      const fail = (cause: unknown) => {
        const timeout =
          signal?.aborted && (signal.reason as Error | undefined)?.name === 'TimeoutError';
        const error = new Error(timeout ? 'timeout' : 'fetch failed', { cause });
        if (timeout) error.name = 'TimeoutError';
        reject(error);
      };
      const options = { method: 'GET', lookup: resolveHost, ...(signal ? { signal } : {}) };
      const done = (response: IncomingMessage) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          body += chunk;
          if (body.length > 4096) response.destroy(new Error('body-too-large'));
        });
        response.on('error', fail);
        response.on('end', () => {
          try {
            resolve(new Response(body || null, { status: response.statusCode ?? 0 }));
          } catch (error) {
            fail(error);
          }
        });
      };
      const request =
        url.protocol === 'https:'
          ? httpsRequest(url, { ...options, ca: certificates() }, done)
          : httpRequest(url, options, done);
      request.on('error', fail);
      request.end();
    })) as typeof fetch;

export const systemTrustFetch = createTrustFetch(systemTrustedCertificates);

export function probeFailure(error: unknown): string {
  if (error instanceof Error && error.name === 'TimeoutError') return 'timeout';
  const cause = (error as { cause?: { code?: unknown } }).cause;
  if (typeof cause?.code === 'string') {
    if (cause.code === 'ENOTFOUND') return 'dns';
    return TLS_FAILURES.has(cause.code) ? 'tls' : cause.code;
  }
  return error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network';
}

export interface PrivateTunnelOptions {
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
}

export function createPrivateTunnelRuntime(
  options: Omit<PrivateTunnelOptions, 'credentials'> & {
    storage: {
      read(): Promise<TunnelRecord | undefined | 'unavailable' | 'invalid'>;
      persist(record: TunnelRecord): Promise<boolean>;
    };
  },
) {
  const spawn = options.spawn ?? spawnTunnel;
  const fetchImpl = options.fetch ?? systemTrustFetch;
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
  let probeAbort: AbortController | undefined;
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

  const read = options.storage.read;
  const persist = options.storage.persist;

  const verify = (
    run: number,
    session: number,
    origin: string,
    deadline: number,
    attempt = 1,
    startedAt = Date.now(),
  ): void => {
    if (run !== generation || session !== probing) return;
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      status = { ...status, state: 'error', issue: 'tunnel-unreachable' };
      record(
        'unreachable',
        `probe=${status.probe ?? 'timeout'} attempts=${attempt - 1} elapsedMs=${Date.now() - startedAt}`,
      );
      probeLater(() => verify(run, session, origin, Date.now() + probeWindow), reprobe);
      return;
    }
    probeAbort?.abort();
    const abort = new AbortController();
    probeAbort = abort;
    const timeoutMs = Math.min(10_000, 2_500 * 2 ** Math.min(attempt - 1, 2), remaining);
    record(
      'probe-started',
      `attempt=${attempt} elapsedMs=${Date.now() - startedAt} timeoutMs=${timeoutMs}`,
    );
    nonce = randomBytes(16).toString('hex');
    const expected = nonce;
    void fetchImpl(`${origin}${PROBE_PREFIX}${expected}`, {
      redirect: 'error',
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(timeoutMs)]),
    })
      .then(async (response) => {
        const body = await response.text();
        if (response.status !== 200) throw new Error(`http-${response.status}`);
        if (body !== expected) throw new Error('challenge-mismatch');
      })
      .then(
        () => {
          if (run !== generation || session !== probing) return;
          status = { ...status, state: 'connected' };
          delete status.issue;
          delete status.probe;
          backoff = RESTART_MIN_MS;
          record(
            'verified',
            `mode=${status.mode ?? ''} attempt=${attempt} elapsedMs=${Date.now() - startedAt}`,
          );
          probeLater(() => verify(run, session, origin, Date.now() + probeWindow), reprobe * 4);
        },
        (error: unknown) => {
          if (run !== generation || session !== probing) return;
          const probe =
            error instanceof Error &&
            (error.message.startsWith('http-') || error.message === 'challenge-mismatch')
              ? error.message
              : probeFailure(error);
          status = { ...status, probe };
          record(
            'probe-failed',
            `attempt=${attempt} elapsedMs=${Date.now() - startedAt} probe=${probe}`,
          );
          if (Date.now() < deadline) {
            probeLater(
              () => verify(run, session, origin, deadline, attempt + 1, startedAt),
              Math.min(probeInterval, 500 * 2 ** Math.min(attempt - 1, 3), deadline - Date.now()),
            );
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
      probeAbort?.abort();
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
    probeAbort?.abort();
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
    acknowledgeAddress: () => {
      delete status.addressChanged;
    },
    close: () => serial(stop),
  };
}

export { createPrivateTunnel, type PrivateTunnel } from './private-tunnel-owner.js';
