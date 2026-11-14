import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { z } from 'zod';
import { ConnectChannel, CONNECT_CHANNEL_PATH } from './noise/channel.js';
import type { AccountStatus, ConnectedHost, ConnectedHostsResult } from './connect-account.js';
import type { ConnectStatus } from './connect.js';

import type {
  ConnectHealthStage,
  ConnectHealthCode,
  ConnectHealthStatus,
} from './connect-health-contract.js';
export type {
  ConnectHealthStage,
  ConnectHealthCode,
  ConnectHealthStatus,
} from './connect-health-contract.js';

export type PublicConnectResult =
  | { ok: true }
  | {
      ok: false;
      code: Extract<
        ConnectHealthCode,
        'dns' | 'tls' | 'timeout' | 'http' | 'handshake' | 'identity' | 'network'
      >;
      httpStatus?: number;
    };
const errorCode = z.object({ code: z.string() });
function networkFailure(error: unknown): PublicConnectResult {
  const value = errorCode.safeParse(error);
  const code = value.success ? value.data.code : '';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return { ok: false, code: 'dns' };
  if (code === 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH') return { ok: false, code: 'identity' };
  if (
    code.includes('CERT') ||
    code.includes('TLS') ||
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    code === 'INVALID_CA'
  )
    return { ok: false, code: 'tls' };
  return { ok: false, code: 'network' };
}
export function checkPublicConnect(options: {
  origin: string;
  hostId: string;
  publicKey: string;
  signal: AbortSignal;
  socket?: (url: string, limits: { maxPayload: number; perMessageDeflate: false }) => WebSocket;
  timeoutMs?: number;
}): Promise<PublicConnectResult> {
  return new Promise((resolve) => {
    let channel: ConnectChannel;
    let ws: WebSocket;
    try {
      const url = new URL(options.origin);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        !/^[0-9a-f]{64}$/u.test(options.publicKey)
      )
        throw new Error('invalid-target');
      url.protocol = 'wss:';
      url.pathname = CONNECT_CHANNEL_PATH;
      url.search = '';
      url.hash = '';
      channel = new ConnectChannel({
        role: 'initiator',
        hostId: options.hostId,
        staticKey: randomBytes(32),
        ephemeralKey: randomBytes(32),
        hostKey: Uint8Array.from(Buffer.from(options.publicKey, 'hex')),
      });
      const limits: { maxPayload: number; perMessageDeflate: false } = {
        maxPayload: 1024,
        perMessageDeflate: false,
      };
      ws = options.socket?.(url.href, limits) ?? new WebSocket(url.href, limits);
    } catch {
      resolve({ ok: false, code: 'identity' });
      return;
    }
    let done = false;
    let opened = false;
    const finish = (result: PublicConnectResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      options.signal.removeEventListener('abort', abort);
      channel.close();
      ws.terminate();
      resolve(result);
    };
    const abort = () => finish({ ok: false, code: 'timeout' });
    const timer = setTimeout(abort, options.timeoutMs ?? 8000);
    timer.unref?.();
    options.signal.addEventListener('abort', abort, { once: true });
    ws.on('error', (error) => finish(networkFailure(error)));
    ws.on('unexpected-response', (_request, response) => {
      response.resume();
      finish({ ok: false, code: 'http', httpStatus: response.statusCode ?? 502 });
    });
    ws.on('close', () => finish({ ok: false, code: opened ? 'handshake' : 'network' }));
    ws.on('open', () => {
      opened = true;
      if (done) return;
      try {
        ws.send(channel.start());
      } catch {
        finish({ ok: false, code: 'handshake' });
      }
    });
    ws.on('message', (data, binary) => {
      if (done) return;
      try {
        if (binary) throw new Error('binary-frame');
        const reply = channel.receive(data.toString());
        if (reply.reply) ws.send(reply.reply);
        if (reply.ready) finish({ ok: true });
      } catch {
        finish({ ok: false, code: 'identity' });
      }
    });
    if (options.signal.aborted) abort();
  });
}

type HealthAccount = {
  status(): Pick<AccountStatus, 'state' | 'hostId'>;
  connectedHosts(
    signal?: AbortSignal,
  ): Promise<
    | { ok: true; hosts: Pick<ConnectedHost, 'id' | 'current' | 'connected'>[] }
    | Extract<ConnectedHostsResult, { ok: false }>
  >;
};
export function createConnectHealth(options: {
  account: HealthAccount;
  connect: { status(): Pick<ConnectStatus, 'state'>; route(): { url: string } | undefined };
  identity(): Promise<{ hostId: string; publicKey: string }>;
  probe?: typeof checkPublicConnect;
  now?: () => number;
  freshnessMs?: number;
  timeoutMs?: number;
  record?: (phase: string, detail: string) => void;
}) {
  const now = options.now ?? Date.now;
  let status: ConnectHealthStatus = { state: 'idle' };
  let generation = 0;
  let closed = false;
  let pending: Promise<ConnectHealthStatus> | undefined;
  let controller: AbortController | undefined;
  let binding: string | undefined;
  const target = () =>
    `${options.account.status().state}|${options.connect.status().state}|${options.account.status().hostId ?? ''}|${options.connect.route()?.url ?? ''}`;
  const invalidate = () => {
    generation++;
    controller?.abort();
    pending = undefined;
    binding = undefined;
    status = { state: 'idle' };
  };
  const read = (): ConnectHealthStatus => {
    if (binding !== undefined && binding !== target()) invalidate();
    if (
      status.state === 'passed' &&
      now() - Date.parse(status.checkedAt) > (options.freshnessMs ?? 300000)
    )
      return { ...status, state: 'stale' };
    return { ...status };
  };
  const check = (): Promise<ConnectHealthStatus> => {
    if (closed) return Promise.resolve({ state: 'idle' });
    if (binding !== undefined && binding !== target()) invalidate();
    if (pending) return pending;
    const run = ++generation;
    binding = target();
    const abort = new AbortController();
    controller = abort;
    const started = now();
    let stage: ConnectHealthStage = 'account';
    status = { state: 'checking', stage, startedAt: new Date(started).toISOString() };
    const advance = (next: ConnectHealthStage) => {
      stage = next;
      if (run === generation && !abort.signal.aborted)
        status = { state: 'checking', stage, startedAt: new Date(started).toISOString() };
    };
    const failed = (code: ConnectHealthCode, httpStatus?: number): ConnectHealthStatus => ({
      state: 'failed',
      stage,
      code,
      checkedAt: new Date(now()).toISOString(),
      elapsedMs: Math.max(0, now() - started),
      ...(httpStatus === undefined ? {} : { httpStatus }),
    });
    const work = async (): Promise<ConnectHealthStatus> => {
      if (options.account.status().state !== 'signed-in') return failed('signed-out');
      advance('tunnel');
      const route = options.connect.route();
      if (options.connect.status().state !== 'connected' || !route)
        return failed('connector-unavailable');
      advance('relay');
      const hosts = await options.account.connectedHosts(abort.signal);
      if (run !== generation || abort.signal.aborted) return { state: 'idle' };
      if (!hosts.ok) return failed('relay-unavailable');
      const host = hosts.hosts.find(
        (host) => host.current && host.id === options.account.status().hostId,
      );
      if (host?.connected !== true)
        return failed(host?.connected === false ? 'relay-offline' : 'relay-status-unknown');
      advance('public');
      const identity = await options.identity();
      if (run !== generation || abort.signal.aborted) return { state: 'idle' };
      const probe = () =>
        (options.probe ?? checkPublicConnect)({
          ...identity,
          origin: route.url,
          signal: abort.signal,
        });
      let result = await probe();
      for (const [index, wait] of [1000, 3000, 6000].entries()) {
        if (result.ok || abort.signal.aborted || run !== generation) break;
        const transient =
          result.code === 'dns' ||
          result.code === 'network' ||
          result.code === 'timeout' ||
          (result.code === 'http' &&
            (result.httpStatus === 429 || (result.httpStatus ?? 0) >= 500));
        if (!transient) break;
        options.record?.(
          'retry',
          `stage=public attempt=${index + 2} code=${result.code} waitMs=${wait}${result.httpStatus === undefined ? '' : ` httpStatus=${result.httpStatus}`}`,
        );
        await delay(wait, undefined, { signal: abort.signal });
        if (run !== generation || abort.signal.aborted) return { state: 'idle' };
        result = await probe();
      }
      return result.ok
        ? {
            state: 'passed',
            checkedAt: new Date(now()).toISOString(),
            elapsedMs: Math.max(0, now() - started),
          }
        : failed(result.code, result.httpStatus);
    };
    let timeoutResult = () => {};
    const timeout = new Promise<ConnectHealthStatus>((resolve) => {
      timeoutResult = () => resolve(failed('timeout'));
      abort.signal.addEventListener('abort', timeoutResult, { once: true });
    });
    const deadline = setTimeout(() => abort.abort(), options.timeoutMs ?? 20000);
    deadline.unref?.();
    pending = Promise.race([work(), timeout])
      .catch(() => failed(stage === 'relay' ? 'relay-unavailable' : 'network'))
      .then((result) => {
        if (run !== generation || closed) return read();
        status = result;
        pending = undefined;
        options.record?.(
          result.state,
          result.state === 'failed'
            ? `stage=${result.stage} code=${result.code} elapsedMs=${result.elapsedMs}`
            : result.state === 'passed'
              ? `elapsedMs=${result.elapsedMs}`
              : '',
        );
        return read();
      })
      .finally(() => {
        clearTimeout(deadline);
        abort.signal.removeEventListener('abort', timeoutResult);
      });
    return pending;
  };
  return {
    status: read,
    check,
    invalidate,
    close: () => {
      closed = true;
      invalidate();
    },
  };
}
