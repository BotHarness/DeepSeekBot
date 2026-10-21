import { execFile } from 'node:child_process';

export interface PhoneRoute {
  url: string;
  kind: 'tailscale' | 'connect' | 'loopback';
  ready: boolean;
  issue?: 'serve-missing' | 'serve-other-target';
}

export interface RouteStatus {
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
  if (name === 'localhost' || name === '[::1]' || /^127\.\d+\.\d+\.\d+$/u.test(name))
    return { url: url.origin, kind: 'loopback', ready: true };
  const tailnet = name.endsWith('.ts.net') || TAILNET_IPV4.test(name);
  if (tailnet && url.protocol === 'https:')
    return { url: url.origin, kind: 'tailscale', ready: true };
  if (CONNECT_HOSTNAME.test(name) && url.protocol === 'https:' && url.port === '')
    return { url: url.origin, kind: 'connect', ready: true };
  return undefined;
}

function servesPort(serve: unknown, dnsName: string, port: number): boolean | undefined {
  const web = record(record(serve)['Web']);
  const site = record(web[`${dnsName}:443`]);
  const handlers = record(site['Handlers']);
  if (Object.keys(handlers).length === 0) return undefined;
  const proxy = record(handlers['/'])['Proxy'];
  if (typeof proxy !== 'string') return false;
  try {
    const target = new URL(proxy.includes('://') ? proxy : `http://${proxy}`);
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname);
    return loopback && Number(target.port || '80') === port;
  } catch {
    return /^\d+$/u.test(proxy) && Number(proxy) === port;
  }
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
  const serveCommand = `tailscale serve --bg ${String(options.port)}`;
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
    try {
      served = servesPort(
        JSON.parse(await run(binary, ['serve', 'status', '--json'])),
        dnsName,
        options.port,
      );
    } catch {
      served = undefined;
    }
    const route: PhoneRoute = {
      url: `https://${dnsName}`,
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
      await run(binary, ['serve', '--bg', String(options.port)], {
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
