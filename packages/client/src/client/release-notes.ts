import type { ReleaseCompatibility } from '../../../core/src/release/compatibility.js';
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store';

import { parseReleaseNotes, type ReleaseNote } from '../../../core/src/release/notes.js';
import type {
  ReleaseIdentity,
  ReleaseIdentityFailure,
} from '../../../core/src/release/identity.js';
import type {
  ReleaseInfo,
  ReleaseInstall,
  ReleaseInstallFailure,
  ReleaseRestart,
  ReleaseUpdate,
} from '../../../core/src/release/service.js';
import { compareVersions, isReleaseVersion } from '../../../core/src/release/version.js';
import type { BridgeCall } from './bridge.js';
import type { ConfigStorage } from './roster-config.js';

export const RELEASE_NOTES_SEEN_KEY = 'botharness.releaseNotes.seenVersion';

const RESTART_POLL_MS = 2_000;
const RESTART_POLL_LIMIT = 90;
const APPLIED_POLL_LIMIT = 10;

export interface ReleaseRestartWatch {
  wait(ms: number): Promise<void>;
  reload(): void;
}

const DEFAULT_RESTART_WATCH: ReleaseRestartWatch = {
  wait: (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
  reload: () => {
    globalThis.location?.reload();
  },
};

export type ReleaseUpdateState = { status: 'idle' } | { status: 'checking' } | ReleaseUpdate;

export type ReleaseInstallState =
  | { status: 'idle' }
  | { status: 'installing'; version: string }
  | Extract<ReleaseInstall, { status: 'failed' }>;

export type ReleaseRestartState =
  | { status: 'idle' }
  | { status: 'restarting' }
  | { status: 'failed' };

export interface ReleaseNotesSnapshot {
  version: string | undefined;
  identity?: ReleaseIdentity | undefined;
  announcement: ReleaseNote[] | undefined;
  firstRun: boolean;
  updateNotice: boolean;
  viewing: ReleaseNote[] | undefined;
  update: ReleaseUpdateState;
  install: ReleaseInstallState;
  restart: ReleaseRestartState;
}

const INSTALL_FAILURES: readonly ReleaseInstallFailure[] = [
  'identity-invalid',
  'unavailable',
  'invalid-version',
  'network',
  'incompatible',
  'build-blocked',
  'failed',
];

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

const IDENTITY_FAILURES: readonly ReleaseIdentityFailure[] = [
  'metadata-missing',
  'metadata-invalid',
  'composition-unverified',
  'component-mismatch',
];

function parseIdentity(value: unknown, version: string): ReleaseIdentity {
  const identity = record(value);
  if (
    identity?.['kind'] === 'release' &&
    identity['version'] === version &&
    isReleaseVersion(version)
  )
    return { kind: 'release', version };
  if (identity?.['kind'] === 'development' && version === '0.0.0') {
    const source = record(identity['source']);
    if (
      typeof source?.['revision'] === 'string' &&
      /^[a-f0-9]{40}$/u.test(source['revision']) &&
      typeof source['dirty'] === 'boolean'
    ) {
      return {
        kind: 'development',
        source: { revision: source['revision'], dirty: source['dirty'] },
      };
    }
  }
  const reason = IDENTITY_FAILURES.find((candidate) => candidate === identity?.['reason']);
  return {
    kind: 'unknown',
    reason: identity?.['kind'] === 'unknown' && reason !== undefined ? reason : 'metadata-invalid',
  };
}

export function parseReleaseInfo(value: unknown): ReleaseInfo | undefined {
  const source = record(value);
  const releases = parseReleaseNotes(source?.['releases']);
  return typeof source?.['version'] === 'string' && releases !== undefined
    ? {
        version: source['version'],
        ...(typeof source['profileId'] === 'string' ? { profileId: source['profileId'] } : {}),
        releases,
        ...(source['identity'] === undefined
          ? {}
          : { identity: parseIdentity(source['identity'], source['version']) }),
      }
    : undefined;
}

function parseCompatibility(value: unknown): ReleaseCompatibility | undefined {
  const source = record(value);
  if (
    source?.['status'] === 'unknown' &&
    (source['reason'] === 'runtime-unavailable' || source['reason'] === 'metadata-unavailable')
  )
    return {
      status: 'unknown',
      reason: source['reason'],
      ...(typeof source['dshVersion'] === 'string' ? { dshVersion: source['dshVersion'] } : {}),
    };
  if (typeof source?.['dshVersion'] !== 'string') return undefined;
  if (source['status'] === 'compatible')
    return { status: 'compatible', dshVersion: source['dshVersion'] };
  const requirements = record(source['requirements']);
  if (
    source['status'] === 'incompatible' &&
    typeof source['package'] === 'string' &&
    requirements &&
    Object.values(requirements).every((value) => typeof value === 'string')
  )
    return {
      status: 'incompatible',
      dshVersion: source['dshVersion'],
      package: source['package'],
      requirements: requirements as Record<string, string>,
    };
  return undefined;
}

export function parseReleaseUpdate(value: unknown): ReleaseUpdate | undefined {
  const source = record(value);
  const current = source?.['current'];
  const latest = source?.['latest'];
  if (typeof current !== 'string') return undefined;
  switch (source?.['status']) {
    case 'unknown': {
      const reason = IDENTITY_FAILURES.find((candidate) => candidate === source['reason']);
      return reason === undefined ? undefined : { status: 'unknown', current, reason };
    }
    case 'development':
    case 'unavailable':
      return { status: source['status'], current };
    case 'current':
      return typeof latest === 'string' ? { status: 'current', current, latest } : undefined;
    case 'blocked': {
      const compatibility = parseCompatibility(source['compatibility']);
      return typeof latest === 'string' && compatibility !== undefined
        ? { status: 'blocked', current, latest, compatibility }
        : undefined;
    }
    case 'available': {
      const compatibility = parseCompatibility(source['compatibility']);
      const blocked = record(source['blockedLatest']);
      const blockedCompatibility = parseCompatibility(blocked?.['compatibility']);
      const releases = parseReleaseNotes(source['releases']);
      return typeof latest === 'string' && releases !== undefined
        ? {
            status: 'available',
            current,
            latest,
            releases,
            installable: source['installable'] === true,
            ...(compatibility === undefined ? {} : { compatibility }),
            ...(typeof blocked?.['version'] === 'string' && blockedCompatibility !== undefined
              ? {
                  blockedLatest: {
                    version: blocked['version'],
                    compatibility: blockedCompatibility,
                  },
                }
              : {}),
          }
        : undefined;
    }
    case 'restart-required': {
      const installed = source['installed'];
      return typeof installed === 'string'
        ? {
            status: 'restart-required',
            current,
            installed,
            restartable: source['restartable'] === true,
          }
        : undefined;
    }
    default:
      return undefined;
  }
}

export function parseReleaseInstall(value: unknown): ReleaseInstall | undefined {
  const source = record(value);
  if (source?.['status'] === 'installed') {
    const { current, installed } = source;
    return typeof current === 'string' && typeof installed === 'string'
      ? {
          status: 'installed',
          current,
          installed,
          restartable: source['restartable'] === true,
          applied: source['applied'] === true,
        }
      : undefined;
  }
  const reason = INSTALL_FAILURES.find((candidate) => candidate === source?.['reason']);
  if (source?.['status'] !== 'failed' || reason === undefined) return undefined;
  const { diagnostic, logPath } = source;
  return {
    status: 'failed',
    reason,
    ...(typeof diagnostic === 'string' ? { diagnostic } : {}),
    ...(typeof logPath === 'string' ? { logPath } : {}),
  };
}

export function parseReleaseRestart(value: unknown): ReleaseRestart | undefined {
  const source = record(value);
  if (source?.['status'] === 'restarting') return { status: 'restarting' };
  const reason = source?.['reason'];
  return source?.['status'] === 'failed' &&
    (reason === 'unavailable' || reason === 'not-pending' || reason === 'identity-invalid')
    ? { status: 'failed', reason }
    : undefined;
}

function readSeen(storage: ConfigStorage | undefined): string | undefined {
  try {
    const value = storage?.getItem(RELEASE_NOTES_SEEN_KEY);
    return value !== null && value !== undefined && isReleaseVersion(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export class ReleaseNotesController {
  readonly source: SnapshotStore<ReleaseNotesSnapshot>;

  private readonly call: BridgeCall;
  private readonly storage: ConfigStorage | undefined;
  private readonly watch: ReleaseRestartWatch;
  private started: Promise<void> | undefined;
  private profileId: string | undefined;
  private checkedAt = 0;
  private dismissed = new Set<string>();

  constructor(
    call: BridgeCall,
    storage: ConfigStorage | undefined,
    watch: ReleaseRestartWatch = DEFAULT_RESTART_WATCH,
  ) {
    this.call = call;
    this.storage = storage;
    this.watch = watch;
    this.source = createSnapshotStore<ReleaseNotesSnapshot>({
      version: undefined,
      announcement: undefined,
      firstRun: false,
      updateNotice: false,
      viewing: undefined,
      update: { status: 'idle' },
      install: { status: 'idle' },
      restart: { status: 'idle' },
    });
  }

  start(): Promise<void> {
    this.started ??= this.announce().catch((error: unknown) => {
      this.started = undefined;
      console.warn('botharness: failed to read release notes', error);
    });
    return this.started;
  }

  async enter(): Promise<void> {
    await this.start();
    await this.checkUpdate();
    const update = this.source.getSnapshot().update;
    const eligible =
      update.status === 'restart-required' ||
      (update.status === 'available' && update.compatibility?.status === 'compatible') ||
      (update.status === 'blocked' && update.compatibility.status === 'incompatible');
    const key = this.noticeKey();
    let dismissed = key === undefined || this.dismissed.has(key);
    try {
      dismissed ||= key !== undefined && this.storage?.getItem(key) === 'dismissed';
    } catch {}
    this.source.update((draft) => {
      draft.updateNotice = eligible && !dismissed;
    });
  }

  private noticeKey(): string | undefined {
    const update = this.source.getSnapshot().update;
    if (
      this.profileId === undefined ||
      (update.status !== 'available' &&
        update.status !== 'blocked' &&
        update.status !== 'restart-required')
    )
      return undefined;
    return `botharness.releaseUpdate.dismissed/${encodeURIComponent(this.profileId)}/${update.current.includes('-') ? 'preview' : 'stable'}/${update.status === 'restart-required' ? `restart-${update.installed}` : update.latest}`;
  }

  dismissUpdate(): void {
    const key = this.noticeKey();
    if (key !== undefined) {
      this.dismissed.add(key);
      try {
        this.storage?.setItem(key, 'dismissed');
      } catch {}
    }
    this.source.update((draft) => {
      draft.updateNotice = false;
    });
  }

  dismiss(): void {
    const version = this.source.getSnapshot().version;
    if (version !== undefined && isReleaseVersion(version)) {
      try {
        this.storage?.setItem(RELEASE_NOTES_SEEN_KEY, version);
      } catch {
        console.warn('botharness: failed to remember the seen release');
      }
    }
    this.source.update((draft) => {
      draft.announcement = undefined;
    });
  }

  view(releases: ReleaseNote[] | undefined): void {
    this.source.update((draft) => {
      draft.viewing = releases;
    });
  }

  async checkUpdate(force = false): Promise<void> {
    let identity = this.source.getSnapshot().identity;
    const retryIdentity =
      identity?.kind === 'unknown' && identity.reason === 'composition-unverified';
    const current = this.source.getSnapshot().update.status;
    const ttl = current === 'unavailable' || current === 'blocked' ? 5 * 60_000 : 6 * 60 * 60_000;
    if (
      current === 'checking' ||
      current === 'restart-required' ||
      (!force && current !== 'idle' && !retryIdentity && Date.now() - this.checkedAt < ttl)
    )
      return;
    this.source.update((draft) => {
      draft.update = { status: 'checking' };
    });
    if (retryIdentity) {
      await this.announce().catch(() => undefined);
      identity = this.source.getSnapshot().identity;
    }
    if (identity?.kind === 'unknown') {
      this.source.update((draft) => {
        draft.update = { status: 'unknown', current: 'unknown', reason: identity.reason };
      });
      return;
    }
    let update: ReleaseUpdate | undefined;
    try {
      const result = await this.call('releaseUpdate', force ? { force: true } : {});
      update = result.ok ? parseReleaseUpdate(result.value) : undefined;
    } catch {
      update = undefined;
    }
    this.checkedAt = Date.now();
    this.source.update((draft) => {
      draft.update = update ?? { status: 'unavailable', current: draft.version ?? '' };
    });
  }

  async install(version: string): Promise<void> {
    if (this.source.getSnapshot().install.status === 'installing') return;
    this.source.update((draft) => {
      draft.install = { status: 'installing', version };
    });
    let outcome: ReleaseInstall | undefined;
    try {
      const result = await this.call('releaseInstall', { version });
      outcome = result.ok ? parseReleaseInstall(result.value) : undefined;
    } catch {
      outcome = undefined;
    }
    if (
      outcome?.status === 'installed' &&
      outcome.applied &&
      (await this.awaitVersion(outcome.installed, APPLIED_POLL_LIMIT))
    )
      return;
    this.source.update((draft) => {
      if (outcome?.status === 'installed') {
        draft.install = { status: 'idle' };
        draft.updateNotice = true;
        draft.update = {
          status: 'restart-required',
          current: outcome.current,
          installed: outcome.installed,
          restartable: outcome.restartable,
        };
        return;
      }
      draft.install = outcome ?? { status: 'failed', reason: 'failed' };
    });
  }

  async restart(): Promise<void> {
    if (this.source.getSnapshot().restart.status === 'restarting') return;
    this.source.update((draft) => {
      draft.restart = { status: 'restarting' };
    });
    const update = this.source.getSnapshot().update;
    const expected = update.status === 'restart-required' ? update.installed : undefined;
    let outcome: ReleaseRestart | undefined;
    try {
      const result = await this.call('releaseRestart', {});
      outcome = result.ok ? parseReleaseRestart(result.value) : undefined;
    } catch {
      outcome = { status: 'restarting' };
    }
    if (outcome?.status !== 'restarting') {
      this.source.update((draft) => {
        draft.restart = { status: 'failed' };
      });
      return;
    }
    await this.awaitRestart(expected);
  }

  private async awaitRestart(expected: string | undefined): Promise<void> {
    if (await this.awaitVersion(expected, RESTART_POLL_LIMIT)) return;
    this.source.update((draft) => {
      draft.restart = { status: 'failed' };
    });
  }

  private async awaitVersion(expected: string | undefined, attempts: number): Promise<boolean> {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      await this.watch.wait(RESTART_POLL_MS);
      let version: string | undefined;
      try {
        const result = await this.call('releaseInfo', {});
        const info = result.ok ? parseReleaseInfo(result.value) : undefined;
        version =
          this.source.getSnapshot().identity === undefined || info?.identity?.kind === 'release'
            ? info?.version
            : undefined;
      } catch {
        version = undefined;
      }
      if (expected !== undefined && version === expected) {
        this.watch.reload();
        return true;
      }
    }
    return false;
  }

  private async announce(): Promise<void> {
    const seen = readSeen(this.storage);
    const result = await this.call('releaseInfo', seen === undefined ? {} : { since: seen });
    if (!result.ok) throw new Error(result.error.message);
    const info = parseReleaseInfo(result.value);
    if (info === undefined) throw new Error('invalid releaseInfo response');
    this.profileId = info.profileId;
    const fresh =
      info.identity?.kind !== 'unknown' &&
      isReleaseVersion(info.version) &&
      (seen === undefined || compareVersions(info.version, seen) > 0);
    this.source.update((draft) => {
      draft.version = info.version;
      draft.identity = info.identity;
      draft.announcement = fresh && info.releases.length > 0 ? info.releases : undefined;
      draft.firstRun = seen === undefined;
    });
    if (fresh && info.releases.length === 0) this.dismiss();
  }
}
