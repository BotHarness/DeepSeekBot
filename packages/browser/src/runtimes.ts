import { createAgentBrowserRuntime } from './runtime/agent-browser.js';
import { dirname, join } from 'node:path';
import { readdir } from 'node:fs/promises';
import {
  createContainerBrowserExecution,
  type ContainerBrowserOptions,
} from './runtime/container.js';

import {
  createBotBrowserRuntime,
  type BotBrowserRuntime,
  type BotBrowserRuntimeOptions,
} from './runtime/browser.js';
import type { BrowserInstallProgress } from './failure-kinds.js';

export interface BotBrowserRuntimes {
  for(slug: string): BotBrowserRuntime;
  touch(slug: string): void;
  installProgress(slug: string): BrowserInstallProgress | undefined;
  closeIdle(idleMs: number): Promise<void>;
  stop(slug: string): Promise<void>;
  stopAll(): Promise<void>;
  profileOf(slug: string): string;
}

export interface BotBrowserRuntimesOptions {
  readonly target?: () => 'local' | 'container';
  readonly driver?: () => 'current' | 'agent-browser';
  readonly onIdleStop?: (profile: string) => void;
  readonly onViewer?: ContainerBrowserOptions['onViewer'];
  readonly tailnetAddress?: ContainerBrowserOptions['tailnetAddress'];
  readonly browserDir: string;
  readonly installDir: string;
  readonly browserPath?: string;
  readonly headless?: boolean;
  readonly onEvent?: (detail: string) => void;
  readonly profileOf: (slug: string) => string;
  readonly create?: (options: BotBrowserRuntimeOptions) => BotBrowserRuntime;
}

const PROFILE_NAME = /^[a-zA-Z0-9._-]{1,40}$/u;

export function sanitizeProfileName(value: string): string {
  const trimmed = value.trim();
  if (trimmed === 'default' || trimmed === '.' || trimmed === '..') return '';
  return PROFILE_NAME.test(trimmed) ? trimmed : '';
}

export async function listStoredProfileNames(browserDir: string): Promise<readonly string[]> {
  try {
    const entries = await readdir(join(dirname(browserDir), 'browser-profiles'), {
      withFileTypes: true,
    });
    return entries
      .filter((entry) => entry.isDirectory() && sanitizeProfileName(entry.name) === entry.name)
      .map((entry) => entry.name)
      .sort();
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return [];
    throw cause;
  }
}

export function createBotBrowserRuntimes(options: BotBrowserRuntimesOptions): BotBrowserRuntimes {
  const create = options.create ?? createBotBrowserRuntime;
  const entries = new Map<
    string,
    {
      runtime: BotBrowserRuntime;
      lastActivity: number;
      profile: string;
      progress: BrowserInstallProgress | undefined;
    }
  >();

  const profileOf = (slug: string): string => sanitizeProfileName(options.profileOf(slug));

  const directoryFor = (profile: string): string =>
    profile === ''
      ? options.browserDir
      : join(dirname(options.browserDir), 'browser-profiles', profile);

  const identityFor = (slug: string) => {
    const profile = profileOf(slug);
    const target = options.target?.() ?? 'local';
    const driver = options.driver?.() ?? 'current';
    return { profile, target, driver, key: `${target}:${driver}:${profile}` };
  };

  const entryFor = (
    slug: string,
  ): {
    runtime: BotBrowserRuntime;
    lastActivity: number;
    profile: string;
    progress: BrowserInstallProgress | undefined;
  } => {
    const { profile, target, driver, key } = identityFor(slug);
    const existing = entries.get(key);
    if (existing !== undefined) return existing;
    const created: {
      runtime: BotBrowserRuntime;
      lastActivity: number;
      profile: string;
      progress: BrowserInstallProgress | undefined;
    } = {
      profile,
      runtime: undefined as never,
      lastActivity: Date.now(),
      progress: undefined,
    };
    created.runtime = (driver === 'agent-browser' ? createAgentBrowserRuntime : create)({
      ...(options.browserPath === undefined ? {} : { browserPath: options.browserPath }),
      userDataDir: directoryFor(profile),
      ...(target === 'container'
        ? {
            execution: createContainerBrowserExecution({
              profileDirectory: directoryFor(profile),
              onEvent: (detail) =>
                options.onEvent?.(`[${profile === '' ? 'default' : profile}] ${detail}`),
              ...(options.onViewer === undefined ? {} : { onViewer: options.onViewer }),
              ...(options.tailnetAddress === undefined
                ? {}
                : { tailnetAddress: options.tailnetAddress }),
            }),
          }
        : {}),
      installDir: options.installDir,
      ...(options.headless === true ? { headless: true } : {}),
      onEvent: (detail) => options.onEvent?.(`[${profile === '' ? 'default' : profile}] ${detail}`),
      onInstallProgress: (downloadedBytes, totalBytes) => {
        created.progress = { downloadedBytes, totalBytes };
      },
      onInstallSettled: () => {
        created.progress = undefined;
      },
    });
    entries.set(key, created);
    return created;
  };

  return {
    for(slug) {
      return entryFor(slug).runtime;
    },
    touch(slug) {
      entryFor(slug).lastActivity = Date.now();
    },
    installProgress(slug) {
      const { key } = identityFor(slug);
      return entries.get(key)?.progress;
    },
    async closeIdle(idleMs) {
      for (const entry of entries.values()) {
        if (!entry.runtime.isRunning()) continue;
        if (Date.now() - entry.lastActivity < idleMs) continue;
        options.onIdleStop?.(entry.profile);
        await entry.runtime.stop().catch((error: unknown) => {
          options.onEvent?.(
            `initiator=idle phase=stop-refused detail=${String(error).slice(0, 200)}`,
          );
          throw error;
        });
      }
    },
    async stop(slug) {
      const { key } = identityFor(slug);
      const entry = entries.get(key);
      if (entry === undefined) return;
      await entry.runtime.stop();
      entries.delete(key);
    },
    async stopAll() {
      const failures: unknown[] = [];
      for (const [key, entry] of entries) {
        try {
          await entry.runtime.stop();
          entries.delete(key);
        } catch (error) {
          failures.push(error);
        }
      }
      if (failures.length > 0)
        throw new AggregateError(failures, 'Browser runtime disposal failed');
    },
    profileOf,
  };
}
