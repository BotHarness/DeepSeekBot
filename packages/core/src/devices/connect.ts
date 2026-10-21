import { spawn as spawnProcess } from 'node:child_process';
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { connect as tcpConnect, type AddressInfo, type Socket } from 'node:net';
import type { Duplex, Readable } from 'node:stream';

import { credentialKey, type CredentialProvider } from '@deepseek-ai/dsh-credentials';

import {
  createCloudflaredResolver,
  type CloudflaredFailure,
  type CloudflaredResolver,
  type CloudflaredSource,
  type ResolvedCloudflared,
} from './cloudflared.js';
import { DEVICE_GATEWAY_PREFIX } from './gateway.js';
import { CONNECT_HOSTNAME, type PhoneRoute } from './routes.js';

type Credentials = Pick<CredentialProvider, 'readRecord' | 'modifyRecord' | 'deleteRecord'>;

export type ConnectIssue =
  | 'cloudflared-missing'
  | CloudflaredFailure
  | 'cloudflared-exited'
  | 'origin-port-busy'
  | 'credential-unavailable';

export interface ConnectStatus {
  state: 'off' | 'starting' | 'connected' | 'error';
  hostname?: string;
  origin?: string;
  issue?: ConnectIssue;
  cloudflared?: CloudflaredSource;
}

export type ConnectRefusal =
  | 'connect-hostname-invalid'
  | 'connect-token-invalid'
  | 'credential-unavailable';

export type ConnectResult =
  | { ok: true; status: ConnectStatus }
  | { ok: false; code: ConnectRefusal };

export interface TunnelProcess {
  readonly stderr: Readable | null;
  on(event: 'exit', listener: (code: number | null) => void): unknown;
  on(event: 'error', listener: (error: NodeJS.ErrnoException) => void): unknown;
  kill(): unknown;
}

export type SpawnTunnel = (
  binary: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
) => TunnelProcess;

export interface DeviceConnect {
  status(): ConnectStatus;
  route(): PhoneRoute | undefined;
  start(): Promise<void>;
  enable(input: { hostname: string; token: string }): Promise<ConnectResult>;
  disable(): Promise<ConnectResult>;
  close(): Promise<void>;
}

interface ConnectRecord {
  hostname: string;
  token: string;
  originPort: number;
}

const RESTART_MIN_MS = 5_000;
const RESTART_MAX_MS = 60_000;
const CONNECTED_LINE = /Registered tunnel connection/u;

const spawnTunnel: SpawnTunnel = (binary, args, env) =>
  spawnProcess(binary, [...args], { env, stdio: ['ignore', 'ignore', 'pipe'] });

export function validTunnelToken(token: string): boolean {
  if (token.length > 4096 || !/^[A-Za-z0-9+/=_-]+$/u.test(token)) return false;
  try {
    const value = JSON.parse(Buffer.from(token, 'base64').toString('utf8')) as unknown;
    if (typeof value !== 'object' || value === null) return false;
    const fields = value as Record<string, unknown>;
    return ['a', 't', 's'].every((key) => typeof fields[key] === 'string' && fields[key] !== '');
  } catch {
    return false;
  }
}

export function admitsGatewayPath(url: string | undefined): boolean {
  const path = (url ?? '').split('?')[0] ?? '';
  if (path !== DEVICE_GATEWAY_PREFIX && !path.startsWith(`${DEVICE_GATEWAY_PREFIX}/`)) return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return false;
  }
  return !decoded.includes('\\') && !/(?:^|\/)\.{1,2}(?:\/|$)/u.test(decoded);
}

function parseRecord(payload: unknown): ConnectRecord | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const value = payload as Record<string, unknown>;
  if (
    typeof value['hostname'] !== 'string' ||
    !CONNECT_HOSTNAME.test(value['hostname']) ||
    typeof value['token'] !== 'string' ||
    typeof value['originPort'] !== 'number' ||
    !Number.isInteger(value['originPort'])
  )
    return undefined;
  return {
    hostname: value['hostname'],
    token: value['token'],
    originPort: value['originPort'],
  };
}

function rawHead(request: IncomingMessage): string {
  let head = `${request.method ?? 'GET'} ${request.url ?? '/'} HTTP/${request.httpVersion}\r\n`;
  for (let index = 0; index < request.rawHeaders.length; index += 2)
    head += `${request.rawHeaders[index] ?? ''}: ${request.rawHeaders[index + 1] ?? ''}\r\n`;
  return `${head}\r\n`;
}

function notFound(response: ServerResponse): void {
  response.writeHead(404, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify({ code: 'not-found' }));
}

type GatewayOrigin = Server & { upgraded: Set<Duplex> };

export function createGatewayOrigin(port: () => number): GatewayOrigin {
  const upgraded = new Set<Duplex>();
  const server = createServer((request, response) => {
    if (!admitsGatewayPath(request.url)) {
      request.resume();
      notFound(response);
      return;
    }
    const upstream = httpRequest(
      {
        host: '127.0.0.1',
        port: port(),
        method: request.method,
        path: request.url,
        headers: request.headers,
      },
      (reply) => {
        response.writeHead(reply.statusCode ?? 502, reply.headers);
        reply.pipe(response);
      },
    );
    upstream.on('error', () => {
      if (response.headersSent) response.destroy();
      else {
        response.writeHead(502, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ code: 'host-unavailable' }));
      }
    });
    response.on('close', () => {
      if (!response.writableFinished) upstream.destroy();
    });
    request.pipe(upstream);
  });
  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!admitsGatewayPath(request.url)) {
      socket.end('HTTP/1.1 404 Not Found\r\nconnection: close\r\ncontent-length: 0\r\n\r\n');
      return;
    }
    const upstream: Socket = tcpConnect(port(), '127.0.0.1', () => {
      upstream.write(rawHead(request));
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

function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const failed = (error: Error): void => reject(error);
    server.once('error', failed);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', failed);
      resolve((server.address() as AddressInfo).port);
    });
  });
}

function closeServer(server: GatewayOrigin | undefined): Promise<void> {
  if (server === undefined || !server.listening) return Promise.resolve();
  server.closeAllConnections();
  for (const socket of server.upgraded) socket.destroy();
  return new Promise((resolve) => server.close(() => resolve()));
}

export function createDeviceConnect(options: {
  credentials: () => Credentials | undefined;
  port: () => number;
  binary?: string;
  resolveBinary?: CloudflaredResolver;
  cloudflaredCache?: string;
  packageAnchors?: readonly string[];
  spawn?: SpawnTunnel;
  record?: (phase: string, detail?: string) => void;
}): DeviceConnect {
  const key = credentialKey('botharness-core', 'device-connect');
  const spawn = options.spawn ?? spawnTunnel;
  const record = options.record ?? (() => {});
  const fixed = options.binary;
  const resolveBinary: CloudflaredResolver =
    fixed !== undefined
      ? () => Promise.resolve({ binary: fixed, source: 'env' })
      : (options.resolveBinary ??
        createCloudflaredResolver({
          ...(options.cloudflaredCache === undefined ? {} : { cacheDir: options.cloudflaredCache }),
          ...(options.packageAnchors === undefined ? {} : { anchors: options.packageAnchors }),
          log: record,
        }));
  let status: ConnectStatus = { state: 'off' };
  let server: GatewayOrigin | undefined;
  let tunnel: TunnelProcess | undefined;
  let restart: ReturnType<typeof setTimeout> | undefined;
  let backoff = RESTART_MIN_MS;
  let generation = 0;
  let queue: Promise<unknown> = Promise.resolve();

  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => undefined);
    return next;
  };

  const retry = (current: ConnectRecord, run: number): void => {
    restart = setTimeout(() => void runTunnel(current, run), backoff);
    backoff = Math.min(backoff * 2, RESTART_MAX_MS);
  };

  const resolve = async (): Promise<ResolvedCloudflared> => {
    try {
      return await resolveBinary();
    } catch (error) {
      record(
        'cloudflared-download-failed',
        `error=${error instanceof Error ? error.message : String(error)}`,
      );
      return { binary: 'cloudflared', source: 'path', failure: 'cloudflared-download-failed' };
    }
  };

  const runTunnel = async (current: ConnectRecord, run: number): Promise<void> => {
    if (run !== generation) return;
    status = { ...status, state: 'starting' };
    delete status.issue;
    const resolved = await resolve();
    if (run !== generation) return;
    status = { ...status, cloudflared: resolved.source };
    const missing = (): void => {
      const issue = resolved.failure ?? 'cloudflared-missing';
      status = { ...status, state: 'error', issue };
      if (resolved.failure === undefined) {
        record('cloudflared-missing');
        return;
      }
      record(issue, `retryMs=${String(backoff)}`);
      retry(current, run);
    };
    let child: TunnelProcess;
    try {
      child = spawn(resolved.binary, ['tunnel', '--no-autoupdate', 'run'], {
        ...process.env,
        TUNNEL_TOKEN: current.token,
      });
    } catch {
      missing();
      return;
    }
    record('cloudflared-started', `source=${resolved.source}`);
    tunnel = child;
    let absent = false;
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      if (run !== generation || !CONNECTED_LINE.test(chunk) || status.state === 'connected') return;
      status = { ...status, state: 'connected' };
      backoff = RESTART_MIN_MS;
      record('connected', `hostname=${current.hostname}`);
    });
    child.on('error', (error) => {
      if (run !== generation || absent) return;
      absent = true;
      if (tunnel === child) tunnel = undefined;
      if (error.code === 'ENOENT') return missing();
      status = { ...status, state: 'error', issue: 'cloudflared-exited' };
      record('cloudflared-exited', `error=${String(error.code)} retryMs=${String(backoff)}`);
      retry(current, run);
    });
    child.on('exit', (code) => {
      if (tunnel === child) tunnel = undefined;
      if (run !== generation || absent) return;
      status = { ...status, state: 'error', issue: 'cloudflared-exited' };
      record('cloudflared-exited', `code=${String(code)} retryMs=${String(backoff)}`);
      retry(current, run);
    });
  };

  const stop = async (): Promise<void> => {
    generation += 1;
    clearTimeout(restart);
    tunnel?.kill();
    tunnel = undefined;
    await closeServer(server);
    server = undefined;
    backoff = RESTART_MIN_MS;
  };

  const run = async (current: ConnectRecord, port: number): Promise<number | undefined> => {
    server = createGatewayOrigin(options.port);
    let bound: number;
    try {
      bound = await listen(server, port);
    } catch {
      server = undefined;
      status = {
        state: 'error',
        hostname: current.hostname,
        issue: 'origin-port-busy',
      };
      record('origin-port-busy', `port=${String(port)}`);
      return undefined;
    }
    status = {
      state: 'starting',
      hostname: current.hostname,
      origin: `http://127.0.0.1:${String(bound)}`,
    };
    void runTunnel({ ...current, originPort: bound }, generation);
    return bound;
  };

  const read = async (): Promise<ConnectRecord | undefined | 'unavailable'> => {
    const native = options.credentials();
    if (native === undefined) return 'unavailable';
    try {
      const stored = await native.readRecord(key);
      return stored?.kind === 'grant' ? parseRecord(stored.payload) : undefined;
    } catch {
      return 'unavailable';
    }
  };

  return {
    status: () => ({ ...status }),
    route() {
      if (status.hostname === undefined || status.state === 'off') return undefined;
      return {
        url: `https://${status.hostname}`,
        kind: 'connect',
        ready: status.state === 'connected',
      };
    },
    start: () =>
      serial(async () => {
        const stored = await read();
        if (stored === 'unavailable') {
          status = { state: 'error', issue: 'credential-unavailable' };
          return;
        }
        if (stored === undefined) return;
        await stop();
        await run(stored, stored.originPort);
      }),
    enable: (input) =>
      serial(async (): Promise<ConnectResult> => {
        const hostname = input.hostname.trim().toLowerCase();
        if (!CONNECT_HOSTNAME.test(hostname))
          return { ok: false, code: 'connect-hostname-invalid' };
        const token = input.token.trim();
        if (!validTunnelToken(token)) return { ok: false, code: 'connect-token-invalid' };
        const native = options.credentials();
        if (native === undefined) return { ok: false, code: 'credential-unavailable' };
        const previous = await read();
        await stop();
        const port = typeof previous === 'object' ? previous.originPort : 0;
        const next: ConnectRecord = { hostname, token, originPort: port };
        const bound = (await run(next, port)) ?? (port === 0 ? undefined : await run(next, 0));
        if (bound === undefined) return { ok: true, status: { ...status } };
        try {
          await native.modifyRecord(key, async () => ({
            kind: 'grant',
            payload: { ...next, originPort: bound },
          }));
        } catch {
          await stop();
          status = { state: 'off' };
          return { ok: false, code: 'credential-unavailable' };
        }
        record('enabled', `hostname=${hostname} origin=${String(bound)}`);
        return { ok: true, status: { ...status } };
      }),
    disable: () =>
      serial(async (): Promise<ConnectResult> => {
        await stop();
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
    close: () => serial(stop),
  };
}
