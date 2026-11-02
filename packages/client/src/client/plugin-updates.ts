import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store';

import type {
  PluginInstall,
  PluginUpdate,
  PluginUpdates,
} from '../../../core/src/release/plugins.js';
import type { BridgeCall } from './bridge.js';
import {
  DEFAULT_RESTART_WATCH,
  INSTALL_FAILURES,
  parseCompatibility,
  type ReleaseRestartWatch,
} from './release-notes.js';

const RESTART_POLL_MS = 2_000;
const RESTART_POLL_LIMIT = 90;
const RELOAD_DELAY_MS = 1_200;

export type PluginRowState =
  | { status: 'idle' }
  | { status: 'installing'; version: string }
  | { status: 'reloading'; version: string }
  | Extract<PluginInstall, { status: 'failed' }>;

export interface PluginUpdatesSnapshot {
  status: 'loading' | 'ready' | 'error';
  checking: boolean;
  installable: boolean;
  restartable: boolean;
  plugins: PluginUpdate[];
  rows: Readonly<Record<string, PluginRowState>>;
  restart: 'idle' | 'restarting' | 'failed';
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): value is string {
  return typeof value === 'string';
}

export function parsePluginUpdate(value: unknown): PluginUpdate | undefined {
  const source = record(value);
  const name = source?.['name'];
  const current = source?.['current'];
  if (!text(name) || !text(current)) return undefined;
  switch (source?.['status']) {
    case 'development':
    case 'unavailable':
      return { name, status: source['status'], current };
    case 'current':
      return text(source['latest'])
        ? { name, status: 'current', current, latest: source['latest'] }
        : undefined;
    case 'available':
    case 'blocked': {
      const compatibility = parseCompatibility(source['compatibility']);
      return text(source['latest']) && compatibility !== undefined
        ? { name, status: source['status'], current, latest: source['latest'], compatibility }
        : undefined;
    }
    case 'restart-required':
      return text(source['installed'])
        ? { name, status: 'restart-required', current, installed: source['installed'] }
        : undefined;
    default:
      return undefined;
  }
}

export function parsePluginUpdates(value: unknown): PluginUpdates | undefined {
  const source = record(value);
  if (!Array.isArray(source?.['plugins'])) return undefined;
  const plugins = source['plugins'].map(parsePluginUpdate);
  if (plugins.some((plugin) => plugin === undefined)) return undefined;
  return {
    installable: source['installable'] === true,
    restartable: source['restartable'] === true,
    plugins: plugins as PluginUpdate[],
  };
}

export function parsePluginInstall(value: unknown): PluginInstall | undefined {
  const source = record(value);
  const name = source?.['name'];
  if (!text(name)) return undefined;
  if (source?.['status'] === 'installed') {
    const { current, installed } = source;
    return text(current) && text(installed)
      ? {
          status: 'installed',
          name,
          current,
          installed,
          restartable: source['restartable'] === true,
          applied: source['applied'] === true,
        }
      : undefined;
  }
  const reason = [...INSTALL_FAILURES, 'unknown-plugin' as const].find(
    (candidate) => candidate === source?.['reason'],
  );
  if (source?.['status'] !== 'failed' || reason === undefined) return undefined;
  const { diagnostic, logPath } = source;
  return {
    status: 'failed',
    name,
    reason,
    ...(text(diagnostic) ? { diagnostic } : {}),
    ...(text(logPath) ? { logPath } : {}),
  };
}

export class PluginUpdatesController {
  readonly source: SnapshotStore<PluginUpdatesSnapshot>;

  private readonly call: BridgeCall;
  private readonly watch: ReleaseRestartWatch;

  constructor(call: BridgeCall, watch: ReleaseRestartWatch = DEFAULT_RESTART_WATCH) {
    this.call = call;
    this.watch = watch;
    this.source = createSnapshotStore<PluginUpdatesSnapshot>({
      status: 'loading',
      checking: false,
      installable: false,
      restartable: false,
      plugins: [],
      rows: {},
      restart: 'idle',
    });
  }

  private async fetch(force: boolean): Promise<PluginUpdates | undefined> {
    try {
      const result = await this.call('pluginUpdates', force ? { force: true } : {});
      return result.ok ? parsePluginUpdates(result.value) : undefined;
    } catch {
      return undefined;
    }
  }

  async load(force = false): Promise<void> {
    if (this.source.getSnapshot().checking) return;
    this.source.update((draft) => {
      draft.checking = true;
    });
    const updates = await this.fetch(force);
    this.source.update((draft) => {
      draft.checking = false;
      if (updates === undefined) {
        if (draft.status === 'loading') draft.status = 'error';
        return;
      }
      draft.status = 'ready';
      draft.installable = updates.installable;
      draft.restartable = updates.restartable;
      draft.plugins = updates.plugins;
    });
  }

  async install(name: string, version: string): Promise<void> {
    const rows = this.source.getSnapshot().rows;
    if (Object.values(rows).some((row) => row.status === 'installing')) return;
    this.setRow(name, { status: 'installing', version });
    let outcome: PluginInstall | undefined;
    try {
      const result = await this.call('pluginInstall', { name, version });
      outcome = result.ok ? parsePluginInstall(result.value) : undefined;
    } catch {
      outcome = undefined;
    }
    if (outcome?.status === 'installed' && outcome.applied) {
      this.setRow(name, { status: 'reloading', version });
      await this.watch.wait(RELOAD_DELAY_MS);
      this.watch.reload();
      return;
    }
    if (outcome?.status === 'installed') {
      this.setRow(name, { status: 'idle' });
      await this.load();
      return;
    }
    this.setRow(name, outcome ?? { status: 'failed', name, reason: 'failed' });
  }

  async restart(): Promise<void> {
    if (this.source.getSnapshot().restart === 'restarting') return;
    this.source.update((draft) => {
      draft.restart = 'restarting';
    });
    let restarting = false;
    try {
      const result = await this.call('pluginRestart', {});
      restarting = result.ok && record(result.value)?.['status'] === 'restarting';
    } catch {
      restarting = true;
    }
    if (restarting) {
      const staged = this.source
        .getSnapshot()
        .plugins.filter((plugin) => plugin.status === 'restart-required');
      for (let attempt = 0; attempt < RESTART_POLL_LIMIT; attempt += 1) {
        await this.watch.wait(RESTART_POLL_MS);
        const updates = await this.fetch(false);
        if (
          updates !== undefined &&
          staged.every((plugin) =>
            updates.plugins.some(
              (next) =>
                next.name === plugin.name &&
                next.status !== 'restart-required' &&
                next.current === (plugin.status === 'restart-required' ? plugin.installed : ''),
            ),
          )
        ) {
          this.watch.reload();
          return;
        }
      }
    }
    this.source.update((draft) => {
      draft.restart = 'failed';
    });
  }

  private setRow(name: string, state: PluginRowState): void {
    this.source.update((draft) => {
      draft.rows = { ...draft.rows, [name]: state };
    });
  }
}
