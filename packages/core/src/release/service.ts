import { readFileSync } from 'node:fs';

import {
  captureReleaseComposition,
  readReleaseIdentity,
  type ReleaseIdentity,
  type ReleaseIdentityFailure,
} from './identity.js';
import type { LoadedReleaseComponent } from './component.js';

import { pairReleaseLedgers, selectReleaseNotes, type ReleaseNote } from './notes.js';
import type { ReleaseRestarter } from './restart.js';
import { compareVersions, isReleaseVersion } from './version.js';

export const RELEASE_PACKAGE = 'deepseekbot';
export const RELEASE_NOTES_PACKAGE = '@botharness/core';
export const DEFAULT_RELEASE_REGISTRIES = [
  'https://registry.npmjs.org',
  'https://registry.npmmirror.com',
] as const;
export const DEFAULT_RELEASE_NOTE_SOURCES = [
  (version: string) => `https://cdn.jsdelivr.net/npm/${RELEASE_NOTES_PACKAGE}@${version}/`,
  (version: string) => `https://registry.npmmirror.com/${RELEASE_NOTES_PACKAGE}/${version}/files/`,
] as const;

const CHECK_CACHE_MS = 6 * 60 * 60 * 1000;
const FAILURE_CACHE_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;
const DIAGNOSTIC_CHARS = 2_000;
const NETWORK_FAILURES = new Set(['network', 'timeout', 'not-found', 'no-matching-version']);

export interface ReleaseLedgers {
  english: string;
  chinese: string;
}

export interface ReleaseInfo {
  version: string;
  identity?: ReleaseIdentity;
  releases: ReleaseNote[];
}

export type ReleaseUpdate =
  | { status: 'unknown'; current: string; reason: ReleaseIdentityFailure }
  | { status: 'development'; current: string }
  | { status: 'unavailable'; current: string }
  | { status: 'current'; current: string; latest: string }
  | {
      status: 'available';
      current: string;
      latest: string;
      releases: ReleaseNote[];
      installable: boolean;
    }
  | { status: 'restart-required'; current: string; installed: string; restartable: boolean };

export type ReleaseInstallFailure =
  | 'identity-invalid'
  | 'unavailable'
  | 'invalid-version'
  | 'network'
  | 'incompatible'
  | 'build-blocked'
  | 'failed';

export type ReleaseInstall =
  | { status: 'installed'; current: string; installed: string; restartable: boolean }
  | {
      status: 'failed';
      reason: ReleaseInstallFailure;
      diagnostic?: string;
      logPath?: string;
    };

export type ReleaseRestart =
  | { status: 'restarting' }
  | { status: 'failed'; reason: 'unavailable' | 'not-pending' | 'identity-invalid' };

type CheckResult =
  | Exclude<ReleaseUpdate, { status: 'available' } | { status: 'restart-required' }>
  | {
      status: 'available';
      current: string;
      latest: string;
      releases: ReleaseNote[];
    };

export interface ReleaseInstallerResult {
  application: string;
  error?: { code: string; diagnostic?: string };
  packageResult?: { kind?: string; output?: string; logPath?: string };
}

export interface ReleaseInstaller {
  listBundles(): Promise<readonly { name: string; installed: boolean; version?: string }[]>;
  installBundle(spec: string): Promise<ReleaseInstallerResult>;
}

export interface ReleaseService {
  info(since?: string): ReleaseInfo;
  update(): Promise<ReleaseUpdate>;
  install(version: string): Promise<ReleaseInstall>;
  restart(): Promise<ReleaseRestart>;
}

export interface ReleaseServiceOptions {
  version: () => string;
  identity?: () => ReleaseIdentity;
  ledgers: () => ReleaseLedgers | undefined;
  fetchImpl?: typeof fetch;
  now?: () => number;
  registries?: readonly string[];
  noteSources?: readonly ((version: string) => string)[];
  timeoutMs?: number;
  installer?: () => ReleaseInstaller | undefined;
  restarter?: () => ReleaseRestarter | undefined;
}

function readFirst(candidates: readonly URL[]): string | undefined {
  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8');
    } catch {
      continue;
    }
  }
  return undefined;
}

export function installedRelease(moduleUrl: string): Pick<
  ReleaseServiceOptions,
  'version' | 'ledgers'
> & {
  identity(
    anchors?: readonly string[],
    loaded?: readonly LoadedReleaseComponent[],
  ): ReleaseIdentity;
} {
  const identity = readReleaseIdentity(moduleUrl);
  const qualified = new Map<string, ReturnType<typeof captureReleaseComposition>>();
  const ledger = (name: string): string | undefined =>
    readFirst([new URL(`../${name}`, moduleUrl), new URL(`../../../${name}`, moduleUrl)]);
  return {
    version: () =>
      identity.kind === 'release'
        ? identity.version
        : identity.kind === 'development'
          ? '0.0.0'
          : 'unknown',
    identity: (anchors = [], loaded = []) => {
      const key = JSON.stringify(anchors);
      let snapshot = qualified.get(key);
      if (snapshot === undefined) {
        snapshot = captureReleaseComposition(identity, moduleUrl, anchors);
        qualified.set(key, snapshot);
      }
      return snapshot(loaded);
    },
    ledgers: () => {
      const english = ledger('CHANGELOG.md');
      if (english === undefined) return undefined;
      return { english, chinese: ledger('CHANGELOG.zh.md') ?? english };
    },
  };
}

function newestTag(tags: unknown, current: string): string | undefined {
  if (typeof tags !== 'object' || tags === null) return undefined;
  const source = tags as Record<string, unknown>;
  const candidates = [source['latest'], current.includes('-') ? source['next'] : undefined].filter(
    (value): value is string => typeof value === 'string' && isReleaseVersion(value),
  );
  return candidates.sort(compareVersions).at(-1);
}

function failureOf(result: ReleaseInstallerResult): ReleaseInstall {
  const kind = result.packageResult?.kind;
  const reason: ReleaseInstallFailure =
    result.error?.code === 'incompatible-version'
      ? 'incompatible'
      : kind === 'build-blocked'
        ? 'build-blocked'
        : kind !== undefined && NETWORK_FAILURES.has(kind)
          ? 'network'
          : 'failed';
  const diagnostic = (result.error?.diagnostic ?? result.packageResult?.output ?? '').trim();
  const logPath = result.packageResult?.logPath;
  return {
    status: 'failed',
    reason,
    ...(diagnostic.length === 0 ? {} : { diagnostic: diagnostic.slice(-DIAGNOSTIC_CHARS) }),
    ...(logPath === undefined ? {} : { logPath }),
  };
}

export function createLoadingReleaseService(options: ReleaseServiceOptions): ReleaseService {
  let ready: ReleaseService | undefined;
  const version = options.version();
  const current = (): ReleaseService => {
    const identity = options.identity?.();
    if (ready !== undefined && JSON.stringify(identity) === JSON.stringify(ready.info().identity))
      return ready;
    const checked: ReleaseIdentity | undefined =
      ready === undefined || identity?.kind === 'unknown'
        ? identity
        : { kind: 'unknown', reason: 'component-mismatch' };
    const service = createReleaseService({
      ...options,
      version: () => version,
      ...(checked === undefined ? {} : { identity: () => checked }),
    });
    if (ready === undefined && checked?.kind !== 'unknown') ready = service;
    return service;
  };
  return {
    info: (since) => current().info(since),
    update: () => current().update(),
    install: (version) => current().install(version),
    restart: () => current().restart(),
  };
}

export function createReleaseService(options: ReleaseServiceOptions): ReleaseService {
  const identity = options.identity?.();
  const runningVersion = identity?.kind === 'unknown' ? 'unknown' : options.version();
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const registries = options.registries ?? DEFAULT_RELEASE_REGISTRIES;
  const noteSources = options.noteSources ?? DEFAULT_RELEASE_NOTE_SOURCES;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  let notes: ReleaseNote[] | undefined;
  let cached: { at: number; result: CheckResult } | undefined;
  let pending: Promise<CheckResult> | undefined;
  let installed: string | undefined;
  let installing: Promise<ReleaseInstall> | undefined;

  const profileBundle = async (): Promise<
    { installer: ReleaseInstaller; version: string | undefined } | undefined
  > => {
    const installer = options.installer?.();
    if (
      installer === undefined ||
      identity?.kind === 'unknown' ||
      !isReleaseVersion(runningVersion)
    )
      return undefined;
    try {
      const bundle = (await installer.listBundles()).find(
        (candidate) => candidate.name === RELEASE_PACKAGE && candidate.installed,
      );
      return bundle === undefined ? undefined : { installer, version: bundle.version };
    } catch {
      return undefined;
    }
  };

  const newerInProfile = (current: string, version: string | undefined): string | undefined =>
    version !== undefined && isReleaseVersion(version) && compareVersions(version, current) > 0
      ? version
      : undefined;

  const runInstall = async (version: string): Promise<ReleaseInstall> => {
    const current = runningVersion;
    if (identity?.kind === 'unknown') return { status: 'failed', reason: 'identity-invalid' };
    if (!isReleaseVersion(version) || compareVersions(version, current) <= 0) {
      return { status: 'failed', reason: 'invalid-version' };
    }
    const installer = (await profileBundle())?.installer;
    if (installer === undefined) return { status: 'failed', reason: 'unavailable' };
    let result: ReleaseInstallerResult;
    try {
      result = await installer.installBundle(`${RELEASE_PACKAGE}@${version}`);
    } catch (error) {
      return {
        status: 'failed',
        reason: 'failed',
        diagnostic: String(error).slice(-DIAGNOSTIC_CHARS),
      };
    }
    if (
      result.error !== undefined ||
      (result.application !== 'restart-required' && result.application !== 'applied')
    ) {
      return failureOf(result);
    }
    installed = version;
    return {
      status: 'installed',
      current,
      installed: version,
      restartable: options.restarter?.() !== undefined,
    };
  };

  const installedNotes = (): ReleaseNote[] => {
    if (notes !== undefined) return notes;
    const ledgers = options.ledgers();
    notes = ledgers === undefined ? [] : pairReleaseLedgers(ledgers.english, ledgers.chinese);
    return notes;
  };

  const text = async (url: string): Promise<string | undefined> => {
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
      return response.ok ? await response.text() : undefined;
    } catch {
      return undefined;
    }
  };

  const latestVersion = async (current: string): Promise<string | undefined> => {
    for (const registry of registries) {
      const body = await text(
        `${registry.replace(/\/+$/u, '')}/-/package/${RELEASE_PACKAGE}/dist-tags`,
      );
      if (body === undefined) continue;
      try {
        const latest = newestTag(JSON.parse(body), current);
        if (latest !== undefined) return latest;
      } catch {
        continue;
      }
    }
    return undefined;
  };

  const newerNotes = async (current: string, latest: string): Promise<ReleaseNote[]> => {
    for (const source of noteSources) {
      const base = source(latest);
      const english = await text(`${base}CHANGELOG.md`);
      if (english === undefined) continue;
      const chinese = (await text(`${base}CHANGELOG.zh.md`)) ?? english;
      return selectReleaseNotes(pairReleaseLedgers(english, chinese), {
        after: current,
        through: latest,
      });
    }
    return [];
  };

  const check = async (): Promise<CheckResult> => {
    const current = runningVersion;
    if (identity?.kind === 'unknown')
      return { status: 'unknown', current, reason: identity.reason };
    if (!isReleaseVersion(current)) return { status: 'development', current };
    const latest = await latestVersion(current);
    if (latest === undefined) return { status: 'unavailable', current };
    if (compareVersions(latest, current) <= 0) return { status: 'current', current, latest };
    return { status: 'available', current, latest, releases: await newerNotes(current, latest) };
  };

  const checked = (): Promise<CheckResult> => {
    if (cached !== undefined) {
      const age = now() - cached.at;
      const limit = cached.result.status === 'unavailable' ? FAILURE_CACHE_MS : CHECK_CACHE_MS;
      if (age < limit) return Promise.resolve(cached.result);
    }
    pending ??= check()
      .then((result) => {
        cached = { at: now(), result };
        return result;
      })
      .finally(() => {
        pending = undefined;
      });
    return pending;
  };

  return {
    info(since) {
      const version = runningVersion;
      return {
        version,
        ...(identity === undefined ? {} : { identity }),
        releases: !isReleaseVersion(version)
          ? []
          : since === undefined
            ? installedNotes().filter((note) => compareVersions(note.version, version) === 0)
            : selectReleaseNotes(installedNotes(), { after: since, through: version }),
      };
    },
    async update() {
      const current = runningVersion;
      const bundle = await profileBundle();
      const pendingVersion = installed ?? newerInProfile(current, bundle?.version);
      if (pendingVersion !== undefined) {
        return {
          status: 'restart-required',
          current,
          installed: pendingVersion,
          restartable: options.restarter?.() !== undefined,
        };
      }
      const result = await checked();
      if (result.status !== 'available') return result;
      return { ...result, installable: bundle !== undefined };
    },
    install(version) {
      installing ??= runInstall(version).finally(() => {
        installing = undefined;
      });
      return installing;
    },
    async restart() {
      if (identity?.kind === 'unknown') return { status: 'failed', reason: 'identity-invalid' };
      const restarter = options.restarter?.();
      if (restarter === undefined) return { status: 'failed', reason: 'unavailable' };
      const pendingVersion =
        installed ?? newerInProfile(runningVersion, (await profileBundle())?.version);
      if (pendingVersion === undefined) return { status: 'failed', reason: 'not-pending' };
      restarter.restart();
      return { status: 'restarting' };
    },
  };
}
