import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store';

import { parseReleaseNotes, type ReleaseNote } from '../../../core/src/release/notes.js';
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
import type { ReleaseChannel, ReleaseChannelStatus } from '../../../core/src/release/channel.js';

export const RELEASE_NOTES_SEEN_KEY = 'botharness.releaseNotes.seenVersion';

const RESTART_POLL_MS = 2_000;
const RESTART_POLL_LIMIT = 90;

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
  | { status: 'failed'; reason?: Extract<ReleaseRestart, { status: 'failed' }>['reason'] };

export interface ReleaseNotesSnapshot {
  channel: ReleaseChannelStatus | undefined;
  channelSaving: boolean;
  channelError: 'read' | 'save' | undefined;
  version: string | undefined;
  announcement: ReleaseNote[] | undefined;
  firstRun: boolean;
  viewing: ReleaseNote[] | undefined;
  update: ReleaseUpdateState;
  install: ReleaseInstallState;
  restart: ReleaseRestartState;
}

const INSTALL_FAILURES: readonly ReleaseInstallFailure[] = [
  'beta-not-enabled',
  'busy',
  'activity-unavailable',
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

export function parseReleaseInfo(value: unknown): ReleaseInfo | undefined {
  const source = record(value);
  const releases = parseReleaseNotes(source?.['releases']);
  return typeof source?.['version'] === 'string' && releases !== undefined
    ? { version: source['version'], releases }
    : undefined;
}

export function parseReleaseUpdate(value: unknown): ReleaseUpdate | undefined {
  const source = record(value);
  const current = source?.['current'];
  const latest = source?.['latest'];
  if (typeof current !== 'string') return undefined;
  switch (source?.['status']) {
    case 'development':
    case 'unavailable':
      return { status: source['status'], current };
    case 'current':
      return typeof latest === 'string' ? { status: 'current', current, latest } : undefined;
    case 'available': {
      const releases = parseReleaseNotes(source['releases']);
      return typeof latest === 'string' && releases !== undefined
        ? {
            status: 'available',
            current,
            latest,
            releases,
            installable: source['installable'] === true,
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
      ? { status: 'installed', current, installed, restartable: source['restartable'] === true }
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
    (reason === 'unavailable' ||
      reason === 'not-pending' ||
      reason === 'busy' ||
      reason === 'activity-unavailable')
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
  private updateRequest = 0;
  private channelRequest = 0;

  constructor(
    call: BridgeCall,
    storage: ConfigStorage | undefined,
    watch: ReleaseRestartWatch = DEFAULT_RESTART_WATCH,
  ) {
    this.call = call;
    this.storage = storage;
    this.watch = watch;
    this.source = createSnapshotStore<ReleaseNotesSnapshot>({
      channel: undefined,
      channelSaving: false,
      channelError: undefined,
      version: undefined,
      announcement: undefined,
      firstRun: false,
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
    if (this.source.getSnapshot().channelSaving) return;
    const current = this.source.getSnapshot().update.status;
    if (current === 'checking' || (!force && current !== 'idle')) return;
    const request = ++this.updateRequest;
    this.source.update((draft) => {
      draft.update = { status: 'checking' };
    });
    let update: ReleaseUpdate | undefined;
    try {
      const result = await this.call('releaseUpdate', {});
      update = result.ok ? parseReleaseUpdate(result.value) : undefined;
    } catch {
      update = undefined;
    }
    if (request === this.updateRequest)
      this.source.update((draft) => {
        draft.update = update ?? { status: 'unavailable', current: draft.version ?? '' };
      });
  }

  async loadChannel(): Promise<void> {
    const request = ++this.channelRequest;
    try {
      const response = await this.call('releaseChannel', {});
      const value = response.ok ? record(response.value) : undefined;
      if (value?.['channel'] !== 'stable' && value?.['channel'] !== 'beta')
        throw new Error('invalid channel');
      const channel = value['channel'];
      if (request !== this.channelRequest) return;
      const changed =
        channel !== this.source.getSnapshot().channel?.channel &&
        this.source.getSnapshot().update.status !== 'idle';
      if (changed) this.updateRequest += 1;
      this.source.update((draft) => {
        draft.channel = { channel, writable: value['writable'] === true };
        if (draft.channelError === 'read') draft.channelError = undefined;
        if (changed) {
          draft.update = { status: 'idle' };
          draft.viewing = undefined;
        }
      });
      if (changed) await this.checkUpdate(true);
    } catch {
      if (request !== this.channelRequest) return;
      this.source.update((draft) => {
        draft.channel = undefined;
        draft.channelError ??= 'read';
      });
    }
  }

  async setChannel(channel: ReleaseChannel): Promise<void> {
    const snapshot = this.source.getSnapshot();
    if (
      !snapshot.channel?.writable ||
      snapshot.channelSaving ||
      snapshot.install.status === 'installing' ||
      snapshot.restart.status === 'restarting'
    )
      return;
    this.updateRequest += 1;
    this.channelRequest += 1;
    this.source.update((draft) => {
      draft.channelSaving = true;
      draft.channelError = undefined;
      draft.update = { status: 'idle' };
      draft.viewing = undefined;
    });
    try {
      const response = await this.call('releaseChannelSet', { channel });
      const result = response.ok ? record(response.value) : undefined;
      if (result?.['status'] !== 'saved' || result['channel'] !== channel)
        throw new Error('channel not saved');
      this.source.update((draft) => {
        draft.channel = { channel, writable: true };
      });
    } catch {
      await this.loadChannel();
      this.source.update((draft) => {
        draft.channelError = 'save';
      });
    } finally {
      this.channelRequest += 1;
      this.source.update((draft) => {
        draft.channelSaving = false;
      });
    }
    await this.checkUpdate(true);
  }

  async install(version: string): Promise<void> {
    if (version.includes('-') && this.source.getSnapshot().channel?.channel !== 'beta') {
      this.source.update((draft) => {
        draft.install = { status: 'failed', reason: 'beta-not-enabled' };
      });
      return;
    }
    if (this.source.getSnapshot().channelSaving) return;
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
    this.source.update((draft) => {
      if (outcome?.status === 'installed') {
        draft.install = { status: 'idle' };
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
    const running = update.status === 'restart-required' ? update.current : undefined;
    let outcome: ReleaseRestart | undefined;
    try {
      const result = await this.call('releaseRestart', {});
      outcome = result.ok ? parseReleaseRestart(result.value) : undefined;
    } catch {
      outcome = { status: 'restarting' };
    }
    if (outcome?.status !== 'restarting') {
      this.source.update((draft) => {
        draft.restart = outcome ?? { status: 'failed' };
      });
      return;
    }
    await this.awaitRestart(running);
  }

  private async awaitRestart(running: string | undefined): Promise<void> {
    for (let attempt = 0; attempt < RESTART_POLL_LIMIT; attempt += 1) {
      await this.watch.wait(RESTART_POLL_MS);
      let version: string | undefined;
      try {
        const result = await this.call('releaseInfo', {});
        version = result.ok ? parseReleaseInfo(result.value)?.version : undefined;
      } catch {
        version = undefined;
      }
      if (version !== undefined && version !== running) {
        this.watch.reload();
        return;
      }
    }
    this.source.update((draft) => {
      draft.restart = { status: 'failed' };
    });
  }

  private async announce(): Promise<void> {
    const seen = readSeen(this.storage);
    const result = await this.call('releaseInfo', seen === undefined ? {} : { since: seen });
    if (!result.ok) throw new Error(result.error.message);
    const info = parseReleaseInfo(result.value);
    if (info === undefined) throw new Error('invalid releaseInfo response');
    const fresh =
      isReleaseVersion(info.version) &&
      (seen === undefined || compareVersions(info.version, seen) > 0);
    this.source.update((draft) => {
      draft.version = info.version;
      draft.announcement = fresh && info.releases.length > 0 ? info.releases : undefined;
      draft.firstRun = seen === undefined;
    });
    if (fresh && info.releases.length === 0) this.dismiss();
  }
}
