import {
  evaluateReleaseManifest,
  nativeReleaseRuntime,
  type ReleaseCompatibility,
  type ReleaseRuntime,
} from './compatibility.js';
import type { ReleaseRestarter } from './restart.js';
import {
  DEFAULT_RELEASE_REGISTRIES,
  RELEASE_CHECK_CACHE_MS,
  RELEASE_FAILURE_CACHE_MS,
  RELEASE_NETWORK_FAILURES,
  RELEASE_REQUEST_TIMEOUT_MS,
  newestTag,
  packageTarball,
  releaseInstallFailure,
  type ReleaseInstallFailure,
  type ReleaseInstaller,
  type ReleaseInstallerResult,
} from './service.js';
import { compareVersions, isReleaseVersion } from './version.js';

export const PLUGIN_SCOPE = '@botharness/';

export type PluginUpdate =
  | { name: string; status: 'development'; current: string }
  | { name: string; status: 'unavailable'; current: string }
  | { name: string; status: 'current'; current: string; latest: string }
  | {
      name: string;
      status: 'blocked';
      current: string;
      latest: string;
      compatibility: ReleaseCompatibility;
    }
  | {
      name: string;
      status: 'available';
      current: string;
      latest: string;
      compatibility: ReleaseCompatibility;
    }
  | { name: string; status: 'restart-required'; current: string; installed: string };

export interface PluginUpdates {
  installable: boolean;
  restartable: boolean;
  plugins: PluginUpdate[];
}

export type PluginInstall =
  | {
      status: 'installed';
      name: string;
      current: string;
      installed: string;
      restartable: boolean;
      applied: boolean;
    }
  | {
      status: 'failed';
      name: string;
      reason: ReleaseInstallFailure | 'unknown-plugin';
      diagnostic?: string;
      logPath?: string;
    };

export type PluginRestart =
  | { status: 'restarting'; plugins: string[] }
  | { status: 'failed'; reason: 'unavailable' | 'not-pending' };

export interface PluginUpdateService {
  list(force?: boolean): Promise<PluginUpdates>;
  install(name: string, version: string, beforeEffect?: () => void): Promise<PluginInstall>;
  restart(beforeEffect?: (pending: string[]) => void): Promise<PluginRestart>;
}

export interface PluginUpdateServiceOptions {
  installer: () => ReleaseInstaller | undefined;
  restarter?: () => ReleaseRestarter | undefined;
  runtime?: () => Promise<ReleaseRuntime | undefined>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  registries?: readonly string[];
  timeoutMs?: number;
}

type Checked = { at: number; result: PluginUpdate };

export function isUpdatablePlugin(name: string): boolean {
  return name.startsWith(PLUGIN_SCOPE) && name.length > PLUGIN_SCOPE.length;
}

export function createPluginUpdateService(
  options: PluginUpdateServiceOptions,
): PluginUpdateService {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const registries = (options.registries ?? DEFAULT_RELEASE_REGISTRIES).map((registry) =>
    registry.replace(/\/+$/u, ''),
  );
  const timeoutMs = options.timeoutMs ?? RELEASE_REQUEST_TIMEOUT_MS;
  const runtime = options.runtime ?? nativeReleaseRuntime;
  const cache = new Map<string, Checked>();
  const pending = new Map<string, { current: string; installed: string }>();
  let installing: Promise<PluginInstall> | undefined;

  const json = async (url: string): Promise<unknown> => {
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
      return response.ok ? await response.json() : undefined;
    } catch {
      return undefined;
    }
  };

  const bundles = async (): Promise<{ name: string; version: string }[] | undefined> => {
    const installer = options.installer();
    if (installer === undefined) return undefined;
    try {
      return (await installer.listBundles())
        .filter((bundle) => bundle.installed && isUpdatablePlugin(bundle.name))
        .map((bundle) => ({ name: bundle.name, version: bundle.version ?? '' }))
        .sort((left, right) => left.name.localeCompare(right.name));
    } catch {
      return undefined;
    }
  };

  const compatibility = async (
    registry: string,
    name: string,
    version: string,
  ): Promise<ReleaseCompatibility> => {
    const host = await runtime();
    if (host === undefined) return { status: 'unknown', reason: 'runtime-unavailable' };
    return evaluateReleaseManifest(
      host,
      await json(`${registry}/${encodeURIComponent(name)}/${version}`),
      name,
      version,
    );
  };

  const check = async (name: string, current: string): Promise<PluginUpdate> => {
    if (!isReleaseVersion(current)) return { name, status: 'development', current };
    for (const registry of registries) {
      const latest = newestTag(
        await json(`${registry}/-/package/${encodeURIComponent(name)}/dist-tags`),
        current,
      );
      if (latest === undefined) continue;
      if (compareVersions(latest, current) <= 0)
        return { name, status: 'current', current, latest };
      const result = await compatibility(registry, name, latest);
      return result.status === 'compatible'
        ? { name, status: 'available', current, latest, compatibility: result }
        : { name, status: 'blocked', current, latest, compatibility: result };
    }
    return { name, status: 'unavailable', current };
  };

  const checked = async (name: string, current: string, force: boolean) => {
    const entry = cache.get(name);
    if (!force && entry !== undefined && entry.result.current === current) {
      const failed =
        entry.result.status === 'unavailable' ||
        (entry.result.status === 'blocked' && entry.result.compatibility.status === 'unknown');
      if (now() - entry.at < (failed ? RELEASE_FAILURE_CACHE_MS : RELEASE_CHECK_CACHE_MS))
        return entry.result;
    }
    const result = await check(name, current);
    cache.set(name, { at: now(), result });
    return result;
  };

  const list = async (force = false): Promise<PluginUpdates> => {
    const restartable = options.restarter?.() !== undefined;
    const installed = await bundles();
    if (installed === undefined) return { installable: false, restartable, plugins: [] };
    const plugins = await Promise.all(
      installed.map(async (bundle): Promise<PluginUpdate> => {
        const staged = pending.get(bundle.name);
        if (staged !== undefined && staged.installed === bundle.version)
          return {
            name: bundle.name,
            status: 'restart-required',
            current: staged.current,
            installed: staged.installed,
          };
        pending.delete(bundle.name);
        return checked(bundle.name, bundle.version, force);
      }),
    );
    return { installable: true, restartable, plugins };
  };

  const runInstall = async (
    name: string,
    version: string,
    beforeEffect?: () => void,
  ): Promise<PluginInstall> => {
    const failed = (
      reason: ReleaseInstallFailure | 'unknown-plugin',
    ): Extract<PluginInstall, { status: 'failed' }> => ({
      status: 'failed',
      name,
      reason,
    });
    if (!isUpdatablePlugin(name)) return failed('unknown-plugin');
    const installer = options.installer();
    const bundle = (await bundles())?.find((entry) => entry.name === name);
    if (installer === undefined) return failed('unavailable');
    if (bundle === undefined) return failed('unknown-plugin');
    if (pending.has(name)) return failed('unavailable');
    const current = bundle.version;
    if (
      !isReleaseVersion(current) ||
      !isReleaseVersion(version) ||
      compareVersions(version, current) <= 0
    )
      return failed('invalid-version');
    let eligibility: ReleaseCompatibility = {
      status: 'unknown',
      reason: 'metadata-unavailable',
    };
    for (const registry of registries) {
      eligibility = await compatibility(registry, name, version);
      if (eligibility.status !== 'unknown') break;
    }
    if (eligibility.status !== 'compatible')
      return failed(eligibility.status === 'incompatible' ? 'incompatible' : 'unavailable');
    beforeEffect?.();
    let result: ReleaseInstallerResult;
    try {
      result = await installer.installBundle(`${name}@${version}`);
      if (result.error?.code === 'already-installed') {
        for (const registry of registries) {
          result = await installer.installBundle(packageTarball(registry, name, version));
          if (!RELEASE_NETWORK_FAILURES.has(result.packageResult?.kind ?? '')) break;
        }
      }
    } catch (error) {
      return { ...failed('failed'), diagnostic: String(error).slice(-2_000) };
    }
    if (
      result.error !== undefined ||
      (result.application !== 'restart-required' && result.application !== 'applied')
    ) {
      const failure = releaseInstallFailure(result);
      return failure.status === 'failed' ? { ...failure, name } : failed('failed');
    }
    cache.delete(name);
    const applied = result.application === 'applied';
    if (!applied) pending.set(name, { current, installed: version });
    return {
      status: 'installed',
      name,
      current,
      installed: version,
      restartable: options.restarter?.() !== undefined,
      applied,
    };
  };

  return {
    list,
    install(name, version, beforeEffect) {
      if (installing !== undefined)
        return Promise.resolve({ status: 'failed', name, reason: 'unavailable' });
      installing = runInstall(name, version, beforeEffect).finally(() => {
        installing = undefined;
      });
      return installing;
    },
    async restart(beforeEffect) {
      const restarter = options.restarter?.();
      if (restarter === undefined) return { status: 'failed', reason: 'unavailable' };
      const staged = (await list()).plugins
        .filter((plugin) => plugin.status === 'restart-required')
        .map((plugin) => plugin.name);
      if (staged.length === 0) return { status: 'failed', reason: 'not-pending' };
      beforeEffect?.(staged);
      restarter.restart();
      return { status: 'restarting', plugins: staged };
    },
  };
}
