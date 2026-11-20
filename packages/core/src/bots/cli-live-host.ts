import { isLanAddress } from '@botharness/host-protocol/lan-address';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';
import { usage, type LiveValues } from './cli-live-input.js';

function isLoopbackName(name: string): boolean {
  return name === 'localhost' || name === '[::1]' || /^127\.\d+\.\d+\.\d+$/u.test(name);
}

function hostUrl(value: string | undefined): URL {
  if (!value) usage('Live commands require --host or DEEPSEEKBOT_HOST.');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    usage('--host must be an HTTP(S) origin.');
  }
  const name = url.hostname;
  const loopback = isLoopbackName(name);
  const tailnet =
    name.endsWith('.ts.net') || /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/u.test(name);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    !(
      (loopback && (url.protocol === 'http:' || url.protocol === 'https:')) ||
      ((tailnet || isLanAddress(name)) && url.protocol === 'https:')
    )
  ) {
    usage(
      '--host must be a loopback origin or a tailnet HTTPS origin, without credentials, query or path.',
    );
  }
  return url;
}

export function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export async function connectLiveHost(values: LiveValues, io: BotCreateCliIo, signal: AbortSignal) {
  const base = hostUrl(values.host ?? io.env['DEEPSEEKBOT_HOST']);
  let token = io.env['DEEPSEEKBOT_HOST_TOKEN'];
  if (values['token-file'] !== undefined) {
    try {
      token = readFileSync(values['token-file'], 'utf8').trim();
    } catch {
      throw new CliLiveError('host-unauthorized', 'Cannot read the Host token file.');
    }
  }
  if (!token?.trim())
    throw new CliLiveError(
      'host-unauthorized',
      'Set DEEPSEEKBOT_HOST_TOKEN or provide --token-file.',
    );
  const secret = token.trim();
  const login = new URL(base);
  login.searchParams.set('token', secret);
  let cookie = '';
  const refused = (status: number): CliLiveError =>
    status === 403 && !isLoopbackName(base.hostname)
      ? new CliLiveError(
          'host-untrusted',
          `The Host does not accept requests addressed to ${base.hostname}; restart it with --trusted-host ${base.hostname}.`,
        )
      : new CliLiveError(
          'host-unauthorized',
          'The Host refused this authority cookie; refresh its launch token.',
        );
  const request = async (url: URL, init: RequestInit = {}): Promise<Response> => {
    try {
      return await fetch(url, { ...init, signal, redirect: 'manual' });
    } catch {
      throw new CliLiveError(
        'host-unreachable',
        'The Host could not be reached before the command deadline.',
      );
    }
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await request(login, {
      headers: cookie ? { cookie } : {},
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length > 0) cookie = cookies.map((entry) => entry.split(';')[0]).join('; ');
    await response.body?.cancel();
    if (response.status === 401 || response.status === 403)
      throw new CliLiveError(
        'host-unauthorized',
        'Host login was refused; refresh its launch token.',
      );
    if (cookie) break;
  }
  if (!cookie)
    throw new CliLiveError('host-unauthorized', 'Host login did not issue an authority cookie.');
  const readResponse = async (response: Response): Promise<Record<string, unknown>> => {
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel();
      throw refused(response.status);
    }
    try {
      const body = await response.text();
      try {
        return record(JSON.parse(body));
      } catch {
        throw new CliLiveError('host-protocol-error', 'The Host did not return a JSON response.');
      }
    } catch (error) {
      if (error instanceof CliLiveError) throw error;
      throw new CliLiveError(
        'host-unreachable',
        'The Host response was interrupted before the command deadline.',
      );
    }
  };
  const scrub = (value: string) =>
    value.replaceAll(secret, '[redacted]').replaceAll(encodeURIComponent(secret), '[redacted]');
  const rpcFailure = (error: Record<string, unknown>): CliLiveError => {
    const failure = new CliLiveError(
      typeof error['code'] === 'string' ? error['code'] : 'host-protocol-error',
      scrub(typeof error['message'] === 'string' ? error['message'] : 'member-call-refused'),
    );
    const details = record(error['details']);
    if (
      ['permission-required', 'permission-not-grantable'].includes(failure.code) &&
      typeof details['permission'] === 'string'
    )
      failure.details = { permission: scrub(details['permission']) };
    if (failure.code === 'model-not-allowed' && typeof details['route'] === 'string')
      failure.details = { route: scrub(details['route']) };
    const { path, spaceId } = details;
    if (typeof path === 'string' || typeof spaceId === 'string')
      failure.details = {
        ...failure.details,
        ...(typeof path === 'string' ? { path: scrub(path) } : {}),
        ...(typeof spaceId === 'string' ? { spaceId: scrub(spaceId) } : {}),
      };
    return failure;
  };
  const rpc = async <T>(method: string, args: Record<string, unknown>): Promise<T> => {
    const name = method.includes('/') ? method : `botharness/${method}`;
    if (values.as !== undefined) {
      const [namespace, memberMethod, extra] = name.split('/');
      if (!namespace || !memberMethod || extra)
        throw new CliLiveError('as-command-unsupported', 'as-command-unsupported');
      const answer = await request(new URL('/api/botharness/team-as', base), {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ username: values.as, namespace, method: memberMethod, args }),
      });
      const result = await readResponse(answer);
      if (result['ok'] !== true) {
        const error = record(result['error']);
        throw rpcFailure(error);
      }
      return result['value'] as T;
    }
    const response = await request(new URL(`/api/${name}`, base), {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: randomUUID(),
        method: name,
        payload: method.startsWith('dsh-im/') ? args : { args },
      }),
    });
    const payload = await readResponse(response);
    if (!response.ok || payload['type'] !== 'server-response')
      throw new CliLiveError('host-protocol-error', 'The Host did not return a DSH RPC response.');
    const result = record(payload['result']);
    if (result['ok'] !== true) {
      const error = record(result['error']);
      throw rpcFailure(error);
    }
    return result['value'] as T;
  };
  const importBotZip = async <T>(
    archive: Uint8Array,
    metadata: {
      name?: string;
      displayName?: string;
      roles?: string[];
      description?: string;
    },
  ): Promise<T> => {
    if (values.as !== undefined)
      throw new CliLiveError('as-command-unsupported', 'as-command-unsupported');
    const url = new URL('/api/botharness/bot-zip/import', base);
    for (const key of ['name', 'displayName', 'description'] as const) {
      if (metadata[key] !== undefined) url.searchParams.set(key, metadata[key]);
    }
    if (metadata.roles !== undefined) url.searchParams.set('roles', JSON.stringify(metadata.roles));
    const response = await request(url, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/zip' },
      body: new Uint8Array(archive),
    });
    const payload = await readResponse(response);
    if (!response.ok) {
      const error = record(payload['error']);
      const bot = record(payload['bot']);
      throw new CliLiveError(
        typeof error['code'] === 'string' ? scrub(error['code']) : 'host-protocol-error',
        scrub(
          typeof error['message'] === 'string'
            ? error['message']
            : 'The Host refused this Bot Zip import.',
        ),
        undefined,
        undefined,
        typeof bot['id'] === 'string' && typeof bot['name'] === 'string'
          ? {
              bot: { id: bot['id'], name: bot['name'] },
              steps: [{ name: 'create-bot', status: 'ok' }],
              outcome: 'created',
            }
          : undefined,
      );
    }
    return payload as T;
  };
  const refuse = (path: string, status: number, bytes: Uint8Array): never => {
    let detail: Record<string, unknown> = {};
    try {
      detail = record(JSON.parse(new TextDecoder().decode(bytes)));
    } catch {
      detail = { error: new TextDecoder().decode(bytes).slice(0, 200) };
    }
    const nested = record(detail['error']);
    const code =
      typeof detail['code'] === 'string'
        ? detail['code']
        : typeof nested['code'] === 'string'
          ? nested['code']
          : undefined;
    if ((status === 401 || status === 403) && code === undefined) throw refused(status);
    const packages = Array.isArray(detail['packages'])
      ? detail['packages'].filter((name): name is string => typeof name === 'string')
      : [];
    const error = new CliLiveError(
      code === undefined ? 'host-refused' : scrub(code),
      scrub(
        (typeof detail['error'] === 'string' && detail['error'] !== ''
          ? detail['error']
          : typeof nested['message'] === 'string'
            ? nested['message']
            : `The Host refused ${path} with HTTP ${String(status)}.`) +
          (packages.length === 0 ? '' : ` Packages: ${packages.join(' ')}.`),
      ),
    );
    error.status = status;
    throw error;
  };
  const http = async (
    path: string,
    body?: Record<string, unknown>,
  ): Promise<{ response: Response; bytes: Uint8Array }> => {
    if (values.as !== undefined)
      throw new CliLiveError('as-command-unsupported', 'as-command-unsupported');
    const response = await request(new URL(path, base), {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        cookie,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch {
      throw new CliLiveError(
        'host-unreachable',
        'The Host response was interrupted before the command deadline.',
      );
    }
    if (!response.ok) refuse(path, response.status, bytes);
    return { response, bytes };
  };
  const stream = async (path: string, init: RequestInit = {}): Promise<Response> => {
    if (values.as !== undefined)
      throw new CliLiveError('as-command-unsupported', 'as-command-unsupported');
    const response = await request(new URL(path, base), {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        cookie,
      },
    });
    if (!response.ok) refuse(path, response.status, new Uint8Array(await response.arrayBuffer()));
    return response;
  };
  const socket = (path: string): WebSocket => {
    if (values.as !== undefined)
      throw new CliLiveError('as-command-unsupported', 'as-command-unsupported');
    const url = new URL(path, base);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const Socket = WebSocket as unknown as new (
      url: string,
      init: { headers: Record<string, string> },
    ) => WebSocket;
    return new Socket(url.href, { headers: { cookie } });
  };
  return { rpc, importBotZip, http, stream, socket };
}
