import { readFileSync } from 'node:fs';

import {
  readReleaseChannel,
  writeReleaseChannel,
  type ReleaseChannel,
  type ReleaseChannelStatus,
  type ReleaseChannelChange,
} from './channel.js';

import { pairReleaseLedgers, selectReleaseNotes, type ReleaseNote } from './notes.js';
import type { ReleaseActivityRefusal, ReleaseRestarter } from './restart.js';
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
  releases: ReleaseNote[];
}

export type ReleaseUpdate =
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
  | 'beta-not-enabled'
  | 'busy'
  | 'activity-unavailable'
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
  | { status: 'failed'; reason: 'unavailable' | 'not-pending' | 'busy' | 'activity-unavailable' };

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
  channel(): ReleaseChannelStatus;
  setChannel(channel: ReleaseChannel): ReleaseChannelChange;
  info(since?: string): ReleaseInfo;
  update(): Promise<ReleaseUpdate>;
  install(version: string): Promise<ReleaseInstall>;
  restart(): Promise<ReleaseRestart>;
}

export interface ReleaseServiceOptions {
  dataDir?: string;
  version: () => string;
  ledgers: () => ReleaseLedgers | undefined;
  fetchImpl?: typeof fetch;
  now?: () => number;
  registries?: readonly string[];
  noteSources?: readonly ((version: string) => string)[];
  timeoutMs?: number;
  installer?: () => ReleaseInstaller | undefined;
  restarter?: () => ReleaseRestarter | undefined;
  activity?: () => 'idle' | 'busy' | 'unknown';
  log?: (message: string) => void;
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

export function installedRelease(
  moduleUrl: string,
): Pick<ReleaseServiceOptions, 'version' | 'ledgers'> {
  const ledger = (name: string): string | undefined =>
    readFirst([new URL(`../${name}`, moduleUrl), new URL(`../../../${name}`, moduleUrl)]);
  return {
    version: () => {
      const manifest = readFirst([new URL('../package.json', moduleUrl)]);
      if (manifest === undefined) return '0.0.0';
      const version: unknown = (JSON.parse(manifest) as { version?: unknown }).version;
      return typeof version === 'string' ? version : '0.0.0';
    },
    ledgers: () => {
      const english = ledger('CHANGELOG.md');
      if (english === undefined) return undefined;
      return { english, chinese: ledger('CHANGELOG.zh.md') ?? english };
    },
  };
}

function newestTag(tags: unknown, channel: ReleaseChannel): string | undefined {
  if (typeof tags !== 'object' || tags === null) return undefined;
  const source = tags as Record<string, unknown>;
  const stable = source['latest'];
  const candidates = [
    typeof stable === 'string' && !stable.includes('-') ? stable : undefined,
    channel === 'beta' ? source['beta'] : undefined,
  ].filter((value): value is string => typeof value === 'string' && isReleaseVersion(value));
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

export function createReleaseService(options: ReleaseServiceOptions): ReleaseService {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const registries = options.registries ?? DEFAULT_RELEASE_REGISTRIES;
  const noteSources = options.noteSources ?? DEFAULT_RELEASE_NOTE_SOURCES;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  let notes: ReleaseNote[] | undefined;
  let cached: { at: number; result: CheckResult } | undefined;
  let pending: { revision: number; result: Promise<CheckResult> } | undefined;
  let installed: string | undefined;
  let installing: Promise<ReleaseInstall> | undefined;
  let restarting = false;
  let channel = readReleaseChannel(options.dataDir);
  let channelRevision = 0;

  const refuse = (
    operation: 'install' | 'restart',
    phase: 'admission' | 'preflight' | 'restart-delay',
    reason: ReleaseActivityRefusal,
    started: number,
  ): { status: 'failed'; reason: ReleaseActivityRefusal } => {
    try {
      options.log?.(
        `release-change initiator=explicit-request operation=${operation} phase=${phase} outcome=refused reason=${reason} durationMs=${Math.max(0, Math.round(now() - started))}`,
      );
    } catch {
      return { status: 'failed', reason };
    }
    return { status: 'failed', reason };
  };

  const activityRefusal = (): ReleaseActivityRefusal | undefined => {
    try {
      const activity = options.activity?.();
      return activity === 'idle'
        ? undefined
        : activity === 'busy'
          ? 'busy'
          : 'activity-unavailable';
    } catch {
      return 'activity-unavailable';
    }
  };

  const profileBundle = async (): Promise<
    { installer: ReleaseInstaller; version: string | undefined } | undefined
  > => {
    const installer = options.installer?.();
    if (installer === undefined || !isReleaseVersion(options.version())) return undefined;
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
    const started = now();
    const current = options.version();
    if (!isReleaseVersion(version) || compareVersions(version, current) <= 0) {
      return { status: 'failed', reason: 'invalid-version' };
    }
    if (version.includes('-') && channel !== 'beta')
      return { status: 'failed', reason: 'beta-not-enabled' };
    const refusal = activityRefusal();
    if (refusal !== undefined) return refuse('install', 'admission', refusal, started);
    const installer = (await profileBundle())?.installer;
    if (installer === undefined) return { status: 'failed', reason: 'unavailable' };
    const latestRefusal = activityRefusal();
    if (latestRefusal !== undefined) return refuse('install', 'preflight', latestRefusal, started);
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

  const latestVersion = async (selected: ReleaseChannel): Promise<string | undefined> => {
    for (const registry of registries) {
      const body = await text(
        `${registry.replace(/\/+$/u, '')}/-/package/${RELEASE_PACKAGE}/dist-tags`,
      );
      if (body === undefined) continue;
      try {
        const latest = newestTag(JSON.parse(body), selected);
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
    const current = options.version();
    if (!isReleaseVersion(current)) return { status: 'development', current };
    const latest = await latestVersion(channel);
    if (latest === undefined) return { status: 'unavailable', current };
    if (compareVersions(latest, current) <= 0) return { status: 'current', current, latest };
    return { status: 'available', current, latest, releases: await newerNotes(current, latest) };
  };

  const checked = async (): Promise<CheckResult> => {
    while (true) {
      if (cached !== undefined) {
        const age = now() - cached.at;
        const limit = cached.result.status === 'unavailable' ? FAILURE_CACHE_MS : CHECK_CACHE_MS;
        if (age < limit) return cached.result;
      }
      pending ??= {
        revision: channelRevision,
        result: check().finally(() => {
          pending = undefined;
        }),
      };
      const { revision, result: checking } = pending;
      const result = await checking;
      if (revision !== channelRevision) continue;
      cached = { at: now(), result };
      return result;
    }
  };

  return {
    channel: () => ({ channel, writable: options.dataDir !== undefined }),
    setChannel(next) {
      if (installing !== undefined || restarting) return { status: 'failed', reason: 'busy' };
      if (options.dataDir === undefined) return { status: 'failed', reason: 'storage-unavailable' };
      try {
        writeReleaseChannel(options.dataDir, next);
      } catch {
        return { status: 'failed', reason: 'storage-unavailable' };
      }
      channel = next;
      channelRevision += 1;
      cached = undefined;
      return { status: 'saved', channel };
    },
    info(since) {
      const version = options.version();
      return {
        version,
        releases: !isReleaseVersion(version)
          ? []
          : since === undefined
            ? installedNotes().filter((note) => compareVersions(note.version, version) === 0)
            : selectReleaseNotes(installedNotes(), { after: since, through: version }),
      };
    },
    async update() {
      const current = options.version();
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
      if (restarting) return Promise.resolve(refuse('install', 'admission', 'busy', now()));
      installing ??= runInstall(version).finally(() => {
        installing = undefined;
      });
      return installing;
    },
    async restart() {
      const started = now();
      if (installing !== undefined || restarting)
        return refuse('restart', 'admission', 'busy', started);
      restarting = true;
      let accepted = false;
      try {
        const refusal = activityRefusal();
        if (refusal !== undefined) return refuse('restart', 'admission', refusal, started);
        const restarter = options.restarter?.();
        if (restarter === undefined) return { status: 'failed', reason: 'unavailable' };
        const bundle = await profileBundle();
        const pendingVersion = installed ?? newerInProfile(options.version(), bundle?.version);
        if (pendingVersion === undefined) return { status: 'failed', reason: 'not-pending' };
        const latestRefusal = activityRefusal();
        if (latestRefusal !== undefined)
          return refuse('restart', 'preflight', latestRefusal, started);
        const restartRefusal = await restarter.restart(activityRefusal);
        if (restartRefusal !== undefined)
          return refuse('restart', 'restart-delay', restartRefusal, started);
        accepted = true;
        return { status: 'restarting' };
      } finally {
        if (!accepted) restarting = false;
      }
    },
  };
}
