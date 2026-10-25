import { execFile } from 'node:child_process';
import { isLanAddress } from './lan-address.js';

export interface PhoneRoute {
  url: string;
  kind: 'lan' | 'tailscale' | 'connect' | 'loopback';
  ready: boolean;
  issue?: 'serve-missing' | 'serve-other-target';
}

export interface RouteStatus {
  managed?: { enabled: boolean; owned: boolean };
  routes: PhoneRoute[];
  tailscale: 'running' | 'stopped' | 'missing';
  serveCommand: string;
}

export type RunCommand = (
  file: string,
  args: readonly string[],
  options?: { timeoutMs?: number },
) => Promise<string>;

export type PublishRouteRefusal =
  | 'tailscale-missing'
  | 'tailscale-stopped'
  | 'serve-other-target'
  | 'serve-needs-enable'
  | 'serve-denied'
  | 'serve-failed';

export type PublishRouteResult =
  | { ok: true; changed: boolean; status: RouteStatus }
  | {
      ok: false;
      code: PublishRouteRefusal;
      message: string;
      enableUrl?: string;
      status: RouteStatus;
    };

const TAILSCALE_BINARIES = ['tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale'];

const SERVE_TIMEOUT_MS = 15_000;

const runFile: RunCommand = (file, args, options) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      [...args],
      { timeout: options?.timeoutMs ?? 3000, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) =>
        error ? reject(Object.assign(error, { stdout, stderr })) : resolve(stdout),
    );
  });

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export function phoneRoute(input: string): PhoneRoute | undefined {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return undefined;
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return;
  const name = url.hostname;
  if (isLanAddress(name) && url.protocol === 'http:' && url.port !== '')
    return { url: url.origin, kind: 'lan', ready: true };
  if (name === 'localhost' || name === '[::1]' || /^127\.\d+\.\d+\.\d+$/u.test(name))
    return { url: url.origin, kind: 'loopback', ready: true };
  const tailnet = name.endsWith('.ts.net') || TAILNET_IPV4.test(name);
  if (tailnet && url.protocol === 'https:')
    return { url: url.origin, kind: 'tailscale', ready: true };
  if (CONNECT_HOSTNAME.test(name) && url.protocol === 'https:' && url.port === '')
    return { url: url.origin, kind: 'connect', ready: true };
  return undefined;
}

function servesPort(
  serve: unknown,
  dnsName: string,
  port: number,
  published = 443,
): boolean | undefined {
  const web = record(record(serve)['Web']);
  const site = record(web[`${dnsName}:${String(published)}`]);
  const handlers = record(site['Handlers']);
  if (Object.keys(handlers).length === 0) return undefined;
  const proxy = record(handlers['/'])['Proxy'];
  if (typeof proxy !== 'string') return false;
  try {
    const target = new URL(proxy.includes('://') ? proxy : `http://${proxy}`);
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname);
    return (
      loopback &&
      target.protocol === 'http:' &&
      target.pathname === '/' &&
      !target.search &&
      !target.hash &&
      !target.username &&
      !target.password &&
      Number(target.port || '80') === port
    );
  } catch {
    return /^\d+$/u.test(proxy) && Number(proxy) === port;
  }
}

const PUBLISH_PORTS = [443, 8443, 8444, 8445, 8446, 8447, 8448, 8449, 8450, 8451, 8452];

function publishedPort(serve: unknown, dnsName: string, port: number): number | undefined {
  return Object.keys(record(record(serve)['Web']))
    .filter((key) => key.startsWith(`${dnsName}:`))
    .map((key) => Number(key.slice(dnsName.length + 1)))
    .find((candidate) => servesPort(serve, dnsName, port, candidate) === true);
}

function freePublishPort(serve: unknown, dnsName: string): number | undefined {
  const config = record(serve);
  return PUBLISH_PORTS.find(
    (port) =>
      record(config['Web'])[`${dnsName}:${String(port)}`] === undefined &&
      record(config['TCP'])[String(port)] === undefined,
  );
}

function serveArgs(port: number, published: number): string[] {
  return [
    'serve',
    '--bg',
    ...(published === 443 ? [] : [`--https=${String(published)}`]),
    String(port),
  ];
}

export const CONNECT_HOSTNAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.deepseekbot\.dev$/u;

export const TAILNET_IPV4 = /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/u;

export async function detectTailnetAddress(
  options: { run?: RunCommand } = {},
): Promise<string | undefined> {
  const run = options.run ?? runFile;
  for (const binary of TAILSCALE_BINARIES) {
    try {
      const address = (await run(binary, ['ip', '-4'])).split('\n')[0]?.trim() ?? '';
      return TAILNET_IPV4.test(address) ? address : undefined;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      return undefined;
    }
  }
  return undefined;
}

export async function detectPhoneRoutes(options: {
  port: number;
  run?: RunCommand;
}): Promise<RouteStatus> {
  const run = options.run ?? runFile;
  const loopback: PhoneRoute = {
    url: `http://127.0.0.1:${String(options.port)}`,
    kind: 'loopback',
    ready: true,
  };
  let serveCommand = `tailscale serve --bg ${String(options.port)}`;
  for (const binary of TAILSCALE_BINARIES) {
    let status: Record<string, unknown>;
    try {
      status = record(JSON.parse(await run(binary, ['status', '--json'])));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      return { routes: [loopback], tailscale: 'stopped', serveCommand };
    }
    const dnsName = String(record(status['Self'])['DNSName'] ?? '').replace(/\.$/u, '');
    if (status['BackendState'] !== 'Running' || !dnsName.endsWith('.ts.net'))
      return { routes: [loopback], tailscale: 'stopped', serveCommand };
    let served: boolean | undefined;
    let published = 443;
    try {
      const config: unknown = JSON.parse(await run(binary, ['serve', 'status', '--json']));
      published =
        publishedPort(config, dnsName, options.port) ?? freePublishPort(config, dnsName) ?? 443;
      served = servesPort(config, dnsName, options.port, published);
      serveCommand = `tailscale ${serveArgs(options.port, published).join(' ')}`;
    } catch {
      served = undefined;
    }
    const route: PhoneRoute = {
      url: `https://${dnsName}${published === 443 ? '' : `:${String(published)}`}`,
      kind: 'tailscale',
      ready: served === true,
      ...(served === true
        ? {}
        : {
            issue: served === undefined ? 'serve-missing' : 'serve-other-target',
          }),
    };
    return { routes: [route, loopback], tailscale: 'running', serveCommand };
  }
  return { routes: [loopback], tailscale: 'missing', serveCommand };
}

function outputOf(error: unknown): string {
  const failure = record(error);
  return ['stdout', 'stderr', 'message']
    .map((key) => failure[key])
    .filter((part): part is string => typeof part === 'string')
    .join('\n');
}

function refusal(
  code: PublishRouteRefusal,
  message: string,
  status: RouteStatus,
  enableUrl?: string,
): PublishRouteResult {
  return {
    ok: false,
    code,
    message,
    status,
    ...(enableUrl === undefined ? {} : { enableUrl }),
  };
}

export async function publishPhoneRoute(options: {
  port: number;
  run?: RunCommand;
  beforePublish?: (mapping: { hostname: string; port: number; target: number }) => Promise<void>;
}): Promise<PublishRouteResult> {
  const run = options.run ?? runFile;
  const before = await detectPhoneRoutes(options);
  const route = before.routes.find((entry) => entry.kind === 'tailscale');
  if (before.tailscale === 'missing')
    return refusal('tailscale-missing', 'Tailscale is not installed on this computer.', before);
  if (before.tailscale === 'stopped' || route === undefined)
    return refusal('tailscale-stopped', 'Tailscale is not running or not signed in.', before);
  if (route.ready) return { ok: true, changed: false, status: before };
  if (route.issue === 'serve-other-target')
    return refusal(
      'serve-other-target',
      'Tailscale serve already publishes another service at this address; change it by hand.',
      before,
    );
  for (const binary of TAILSCALE_BINARIES) {
    try {
      const published = Number(new URL(route.url).port || '443');
      const config: unknown = JSON.parse(await run(binary, ['serve', 'status', '--json']));
      const dnsName = new URL(route.url).hostname;
      if (freePublishPort(config, dnsName) !== published)
        return refusal(
          'serve-other-target',
          'The publishing entry changed. Check again before publishing.',
          before,
        );
      await options.beforePublish?.({ hostname: dnsName, port: published, target: options.port });
      await run(binary, serveArgs(options.port, published), {
        timeoutMs: SERVE_TIMEOUT_MS,
      });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      const output = outputOf(error);
      const after = await detectPhoneRoutes(options);
      if (after.routes.some((entry) => entry.kind === 'tailscale' && entry.ready))
        return { ok: true, changed: true, status: after };
      const enableUrl = /https:\/\/login\.tailscale\.com\/\S+/u.exec(output)?.[0];
      if (enableUrl !== undefined)
        return refusal(
          'serve-needs-enable',
          'Serve is not enabled on this tailnet yet; enable it in the Tailscale admin console.',
          after,
          enableUrl,
        );
      if (/access denied|permission denied|operator|not permitted/iu.test(output))
        return refusal(
          'serve-denied',
          'Tailscale refused to change serve for this user; run the command in a terminal.',
          after,
        );
      const detail = output.trim().split('\n')[0]?.slice(0, 200) ?? '';
      return refusal(
        'serve-failed',
        `tailscale serve failed${detail === '' ? '.' : `: ${detail}`}`,
        after,
      );
    }
  }
  const after = await detectPhoneRoutes(options);
  return after.routes.some((entry) => entry.kind === 'tailscale' && entry.ready)
    ? { ok: true, changed: true, status: after }
    : refusal(
        'serve-failed',
        'tailscale serve finished but this Host is still not published.',
        after,
      );
}

export interface ManagedPhoneRouteState {
  enabled: boolean;
  mapping?: { hostname: string; port: number; target: number };
}

export function parseManagedPhoneRoute(input: unknown): ManagedPhoneRouteState | undefined {
  const value = record(input);
  if (typeof value['enabled'] !== 'boolean') return undefined;
  const mapping = record(value['mapping']);
  const port = mapping['port'];
  const target = mapping['target'];
  const hostname = mapping['hostname'];
  if (value['mapping'] === undefined) return { enabled: value['enabled'] };
  if (
    typeof hostname !== 'string' ||
    !/^[a-z0-9.-]+\.ts\.net$/u.test(hostname) ||
    typeof port !== 'number' ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    typeof target !== 'number' ||
    !Number.isInteger(target) ||
    target < 1 ||
    target > 65535
  )
    return undefined;
  return { enabled: value['enabled'], mapping: { hostname, port, target } };
}

export function createManagedPhoneRoute(options: {
  port: number;
  run?: RunCommand;
  read(): Promise<ManagedPhoneRouteState | undefined>;
  write(state: ManagedPhoneRouteState): Promise<void>;
  log?: (event: { phase: string; durationMs: number; refusal?: string }) => void;
}) {
  let state: ManagedPhoneRouteState = { enabled: false };
  let tail = Promise.resolve();
  let closed = false;
  const command: RunCommand = async (_file, args, config) => {
    for (const binary of TAILSCALE_BINARIES) {
      try {
        return await (options.run ?? runFile)(binary, args, config);
      } catch (error) {
        if (record(error)['code'] !== 'ENOENT') throw error;
      }
    }
    throw new Error('tailscale-missing');
  };
  const save = async (next: ManagedPhoneRouteState) => {
    await options.write(next);
    state = next;
  };
  const status = async (): Promise<RouteStatus> => ({
    ...(await detectPhoneRoutes(options)),
    managed: { enabled: state.enabled, owned: state.mapping !== undefined },
  });
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const result = tail.then(work);
    tail = result.then(
      () => {},
      () => {},
    );
    return result;
  };
  const removeOwned = async () => {
    const mapping = state.mapping;
    if (!mapping) return;
    const config: unknown = JSON.parse(await command('', ['serve', 'status', '--json']));
    const handlers = record(
      record(record(record(config)['Web'])[`${mapping.hostname}:${String(mapping.port)}`])[
        'Handlers'
      ],
    );
    if (
      Object.keys(handlers).length === 1 &&
      servesPort(config, mapping.hostname, mapping.target, mapping.port) === true
    )
      await command('', ['serve', `--https=${String(mapping.port)}`, 'off'], {
        timeoutMs: SERVE_TIMEOUT_MS,
      });
    await save({ enabled: state.enabled });
  };
  const enable = async (): Promise<PublishRouteResult> => {
    if (closed) return refusal('serve-failed', 'Publishing owner is closed.', await status());
    await save({ ...state, enabled: true });
    if (state.mapping && state.mapping.target !== options.port) await removeOwned();
    const result = await publishPhoneRoute({
      ...options,
      beforePublish: async (mapping) => save({ enabled: true, mapping }),
    });
    return { ...result, status: await status() };
  };
  const transition = (phase: string, work: () => Promise<PublishRouteResult>) =>
    serial(async () => {
      const started = performance.now();
      let result: PublishRouteResult;
      try {
        result = await work();
      } catch {
        result = refusal(
          'serve-failed',
          'Could not save or update Tailscale publishing. Retry setup.',
          await status(),
        );
      }
      options.log?.({
        phase,
        durationMs: Math.round(performance.now() - started),
        ...(!result.ok ? { refusal: result.code } : {}),
      });
      return result;
    });
  return {
    status,
    start: () =>
      transition('restore', async () => {
        state = (await options.read()) ?? { enabled: false };
        return state.enabled ? enable() : { ok: true, changed: false, status: await status() };
      }),
    enable: () => transition('enable', enable),
    disable: () =>
      transition('disable', async () => {
        await save({ ...state, enabled: false });
        await removeOwned();
        return { ok: true, changed: true, status: await status() };
      }),
    close: () => {
      closed = true;
    },
  };
}
