import { execFile } from 'node:child_process';

export interface PhoneRoute {
  url: string;
  kind: 'tailscale' | 'loopback';
  ready: boolean;
  issue?: 'serve-missing' | 'serve-other-target';
}

export interface RouteStatus {
  routes: PhoneRoute[];
  tailscale: 'running' | 'stopped' | 'missing';
  serveCommand: string;
}

export type RunCommand = (file: string, args: readonly string[]) => Promise<string>;

const TAILSCALE_BINARIES = ['tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale'];

const runFile: RunCommand = (file, args) =>
  new Promise((resolve, reject) => {
    execFile(file, [...args], { timeout: 3000, maxBuffer: 1024 * 1024 }, (error, stdout) =>
      error ? reject(error) : resolve(stdout),
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
  const tailnet =
    name.endsWith('.ts.net') || /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/u.test(name);
  if (tailnet && url.protocol === 'https:')
    return { url: url.origin, kind: 'tailscale', ready: true };
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
        : { issue: served === undefined ? 'serve-missing' : 'serve-other-target' }),
    };
    return { routes: [route, loopback], tailscale: 'running', serveCommand };
  }
  return { routes: [loopback], tailscale: 'missing', serveCommand };
}
