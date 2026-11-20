import { createManagedTlsIngress, type ManagedTlsIngress } from './managed-tls-ingress.js';
import { execFileText } from '../process/exec-off-thread.js';
import { CONNECT_HOSTNAME } from '@botharness/host-protocol/connect-zones';
import { isLanAddress } from '@botharness/host-protocol/lan-address';
import { stalePhoneRoutes, type StalePhoneRoute } from './route-targets.js';

export interface PhoneRoute {
  url: string;
  kind: 'lan' | 'tailscale' | 'connect' | 'loopback' | 'private';
  ready: boolean;
  issue?: 'serve-missing' | 'serve-other-target';
  memberSignIn?: 'managed-tls' | 'untrusted';
}

export interface RouteStatus {
  staleRoutes?: StalePhoneRoute[];
  managed?: { enabled: boolean; owned: boolean; trustedIngress: boolean };
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

const runFile: RunCommand = async (file, args, options) =>
  (
    await execFileText(file, args, {
      timeout: options?.timeoutMs ?? 3000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    })
  ).stdout;

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

export {
  CONNECT_HOSTNAME,
  CONNECT_ZONES,
  isConnectZoneHost,
} from '@botharness/host-protocol/connect-zones';

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

async function inspectPhoneRoutes(options: {
  port: number;
  targetPort?: number;
  run?: RunCommand;
}): Promise<{ status: RouteStatus; config?: unknown }> {
  const run = options.run ?? runFile;
  const loopback: PhoneRoute = {
    url: `http://127.0.0.1:${String(options.port)}`,
    kind: 'loopback',
    ready: true,
  };
  const targetPort = options.targetPort ?? options.port;
  let serveCommand = `tailscale serve --bg ${String(targetPort)}`;
  for (const binary of TAILSCALE_BINARIES) {
    let status: Record<string, unknown>;
    try {
      status = record(JSON.parse(await run(binary, ['status', '--json'])));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      return { status: { routes: [loopback], tailscale: 'stopped', serveCommand } };
    }
    const dnsName = String(record(status['Self'])['DNSName'] ?? '').replace(/\.$/u, '');
    if (status['BackendState'] !== 'Running' || !dnsName.endsWith('.ts.net'))
      return { status: { routes: [loopback], tailscale: 'stopped', serveCommand } };
    let config: unknown;
    let served: boolean | undefined;
    let published = 443;
    try {
      config = JSON.parse(await run(binary, ['serve', 'status', '--json']));
      published =
        publishedPort(config, dnsName, targetPort) ?? freePublishPort(config, dnsName) ?? 443;
      served = servesPort(config, dnsName, targetPort, published);
      serveCommand = `tailscale ${serveArgs(targetPort, published).join(' ')}`;
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
    return { status: { routes: [route, loopback], tailscale: 'running', serveCommand }, config };
  }
  return { status: { routes: [loopback], tailscale: 'missing', serveCommand } };
}

export async function detectPhoneRoutes(
  options: Parameters<typeof inspectPhoneRoutes>[0],
): Promise<RouteStatus> {
  return (await inspectPhoneRoutes(options)).status;
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
  ownedMapping?: ManagedPhoneRouteState['mapping'];
  beforePublish?: (mapping: { hostname: string; port: number; target: number }) => Promise<void>;
  beforeReplace?: (target: number) => Promise<void>;
}): Promise<PublishRouteResult> {
  const run = options.run ?? runFile;
  const before = await detectPhoneRoutes(options);
  let route = before.routes.find((entry) => entry.kind === 'tailscale');
  if (before.tailscale === 'missing')
    return refusal('tailscale-missing', 'Tailscale is not installed on this computer.', before);
  if (before.tailscale === 'stopped' || route === undefined)
    return refusal('tailscale-stopped', 'Tailscale is not running or not signed in.', before);
  const owned = options.ownedMapping;
  const replacing = owned !== undefined && owned.target !== options.port;
  if (replacing) {
    const origin = new URL(route.url);
    if (origin.hostname !== owned.hostname)
      return refusal(
        'serve-other-target',
        'The Tailscale hostname changed. Check the saved route before publishing.',
        before,
      );
    route = { ...route, url: `https://${owned.hostname}:${owned.port}`, ready: false };
  }
  if (route.ready) return { ok: true, changed: false, status: before };
  if (!replacing && route.issue === 'serve-other-target')
    return refusal(
      'serve-other-target',
      'Tailscale serve already publishes another service at this address; change it by hand.',
      before,
    );
  let replacementPublished = false;
  const verifyReplacement = async (binary: string): Promise<boolean> => {
    if (!replacing) return false;
    try {
      return ownsMapping(JSON.parse(await run(binary, ['serve', 'status', '--json'])), {
        ...owned,
        target: options.port,
      });
    } catch {
      return false;
    }
  };
  for (const binary of TAILSCALE_BINARIES) {
    try {
      const published = Number(new URL(route.url).port || '443');
      const config: unknown = JSON.parse(await run(binary, ['serve', 'status', '--json']));
      const dnsName = new URL(route.url).hostname;
      if (replacing && ownsMapping(config, { ...owned, target: options.port }))
        return { ok: true, changed: false, status: before };
      const available =
        record(record(config)['Web'])[`${dnsName}:${published}`] === undefined &&
        record(record(config)['TCP'])[String(published)] === undefined;
      if (
        replacing
          ? !ownsMapping(config, owned) && !available
          : freePublishPort(config, dnsName) !== published
      )
        return refusal(
          'serve-other-target',
          'The publishing entry changed. Check again before publishing.',
          before,
        );
      if (!replacing)
        await options.beforePublish?.({ hostname: dnsName, port: published, target: options.port });
      else await options.beforeReplace?.(options.port);
      await run(binary, serveArgs(options.port, published), {
        timeoutMs: SERVE_TIMEOUT_MS,
      });
      if (replacing) replacementPublished = await verifyReplacement(binary);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      const output = outputOf(error);
      const after = await detectPhoneRoutes(options);
      replacementPublished = await verifyReplacement(binary);
      if (
        replacing
          ? replacementPublished
          : after.routes.some((entry) => entry.kind === 'tailscale' && entry.ready)
      )
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
  return (
    replacing
      ? replacementPublished
      : after.routes.some((entry) => entry.kind === 'tailscale' && entry.ready)
  )
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
  pendingTarget?: number;
}

function ownsMapping(
  serve: unknown,
  mapping: NonNullable<ManagedPhoneRouteState['mapping']>,
): boolean {
  const handlers = record(
    record(record(record(serve)['Web'])[`${mapping.hostname}:${mapping.port}`])['Handlers'],
  );
  return (
    Object.keys(handlers).length === 1 &&
    servesPort(serve, mapping.hostname, mapping.target, mapping.port) === true
  );
}

export function parseManagedPhoneRoute(input: unknown): ManagedPhoneRouteState | undefined {
  const value = record(input);
  if (typeof value['enabled'] !== 'boolean') return undefined;
  const mapping = record(value['mapping']);
  const port = mapping['port'];
  const target = mapping['target'];
  const hostname = mapping['hostname'];
  const pendingTarget = value['pendingTarget'];
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
    target > 65535 ||
    (pendingTarget !== undefined &&
      (typeof pendingTarget !== 'number' ||
        !Number.isInteger(pendingTarget) ||
        pendingTarget < 1 ||
        pendingTarget > 65535))
  )
    return undefined;
  return {
    enabled: value['enabled'],
    mapping: { hostname, port, target },
    ...(typeof pendingTarget === 'number' ? { pendingTarget } : {}),
  };
}

export function createManagedPhoneRoute(options: {
  port: number;
  tls?: boolean;
  ingress?: ManagedTlsIngress;
  run?: RunCommand;
  probe?: (port: number, host: string) => Promise<boolean>;
  read(): Promise<ManagedPhoneRouteState | undefined>;
  write(state: ManagedPhoneRouteState): Promise<void>;
  log?: (event: {
    phase: string;
    initiator: string;
    command: string;
    commands: { command: string; outcome: 'succeeded' | 'failed' }[];
    durationMs: number;
    refusal?: string;
  }) => void;
}) {
  const ingress = options.ingress ?? createManagedTlsIngress(options);
  let state: ManagedPhoneRouteState = { enabled: false };
  let tail = Promise.resolve();
  let closed = false;
  let commands: { command: string; outcome: 'succeeded' | 'failed' }[] = [];
  const runOwned: RunCommand = async (file, args, config) => {
    if (closed) throw new Error('publishing-owner-closed');
    const mutation = args[0] === 'serve' && args[1] !== 'status';
    try {
      const result = await (options.run ?? runFile)(file, args, config);
      if (mutation) commands.push({ command: `tailscale ${args.join(' ')}`, outcome: 'succeeded' });
      return result;
    } catch (error) {
      if (mutation) commands.push({ command: `tailscale ${args.join(' ')}`, outcome: 'failed' });
      throw error;
    }
  };
  const command: RunCommand = async (_file, args, config) => {
    for (const binary of TAILSCALE_BINARIES) {
      try {
        return await runOwned(binary, args, config);
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
  let checkedAt = 0;
  let stale: StalePhoneRoute[] = [];
  const status = async (): Promise<RouteStatus> => {
    const targetPort = ingress.port();
    const { status: detected, config } = await inspectPhoneRoutes({
      ...options,
      ...(targetPort === undefined ? {} : { targetPort }),
    });
    const route = detected.routes.find((entry) => entry.kind === 'tailscale');
    let owned = false;
    let trustedIngress = false;
    if (route && config !== undefined && !closed) {
      try {
        const mapping = state.mapping;
        owned = mapping !== undefined && ownsMapping(config, mapping);
        trustedIngress = !!(
          owned &&
          state.enabled &&
          targetPort !== undefined &&
          mapping?.target === targetPort &&
          new URL(route.url).hostname === mapping.hostname &&
          record(record(record(config)['TCP'])[String(mapping.port)])['HTTPS'] === true
        );
        if (Date.now() - checkedAt > 5000) {
          stale = await stalePhoneRoutes(
            config,
            new URL(route.url).hostname,
            targetPort ?? options.port,
            options.probe,
          );
          checkedAt = Date.now();
        }
      } catch {
        stale = [];
      }
    }
    return {
      ...detected,
      ...(trustedIngress && state.mapping && targetPort !== undefined
        ? {
            serveCommand: `tailscale ${serveArgs(targetPort, state.mapping.port).join(' ')}`,
          }
        : {}),
      routes: detected.routes.map((entry): PhoneRoute => {
        if (entry.kind !== 'tailscale') return entry;
        const mapping = state.mapping;
        if (trustedIngress && mapping)
          return {
            url: new URL(`https://${mapping.hostname}:${mapping.port}`).origin,
            kind: 'tailscale',
            ready: true,
            memberSignIn: 'managed-tls',
          };
        return { ...entry, memberSignIn: 'untrusted' };
      }),
      ...(route ? { staleRoutes: stale } : {}),
      managed: { enabled: state.enabled, owned, trustedIngress },
    };
  };
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
    if (
      ownsMapping(config, mapping) ||
      (state.pendingTarget !== undefined &&
        ownsMapping(config, { ...mapping, target: state.pendingTarget }))
    )
      await command('', ['serve', `--https=${String(mapping.port)}`, 'off'], {
        timeoutMs: SERVE_TIMEOUT_MS,
      });
    await save({ enabled: state.enabled });
  };
  const enable = async (): Promise<PublishRouteResult> => {
    if (closed) return refusal('serve-failed', 'Publishing owner is closed.', await status());
    await save({ ...state, enabled: true });
    if (state.mapping && state.pendingTarget !== undefined) {
      const pending = { ...state.mapping, target: state.pendingTarget };
      const config: unknown = JSON.parse(await command('', ['serve', 'status', '--json']));
      if (ownsMapping(config, pending)) await save({ enabled: true, mapping: pending });
    }
    const owned = state.mapping;
    if (closed) throw new Error('publishing-owner-closed');
    const targetPort = await ingress.start();
    if (closed) throw new Error('publishing-owner-closed');
    const result = await publishPhoneRoute({
      ...options,
      port: targetPort,
      run: runOwned,
      ownedMapping: owned,
      beforePublish: async (mapping) => save({ enabled: true, mapping }),
      beforeReplace: async (pendingTarget) => save({ ...state, pendingTarget }),
    });
    if (result.ok && owned)
      await save({ enabled: true, mapping: { ...owned, target: targetPort } });
    return { ...result, status: await status() };
  };
  const transition = (phase: string, work: () => Promise<PublishRouteResult>) =>
    serial(async () => {
      const started = performance.now();
      const existingIngress = ingress.port();
      checkedAt = 0;
      commands = [];
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
      if (!result.ok && (existingIngress === undefined || phase === 'disable')) {
        await ingress.close();
        result = { ...result, status: await status() };
      }
      options.log?.({
        phase,
        initiator: phase === 'restore' ? 'startup' : 'operator',
        command: commands.map((entry) => entry.command).join(' ; ') || 'none',
        commands,
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
        if (closed) return refusal('serve-failed', 'Publishing owner is closed.', await status());
        await save({ ...state, enabled: false });
        try {
          await removeOwned();
        } finally {
          await ingress.close();
        }
        return { ok: true, changed: true, status: await status() };
      }),
    close: async () => {
      const started = performance.now();
      closed = true;
      await tail;
      await ingress.close();
      options.log?.({
        phase: 'close',
        initiator: 'host',
        command: 'none',
        commands: [],
        durationMs: Math.round(performance.now() - started),
      });
    },
  };
}
