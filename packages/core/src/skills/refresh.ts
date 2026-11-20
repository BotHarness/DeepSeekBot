import { existsSync, statSync, watch, type FSWatcher } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import type { SkillCatalog } from './catalog.js';
import type { SkillWorkspace } from './workspace.js';

export interface SkillCatalogBot {
  slug: string;
  memoryDir: string;
  preset?: string;
  agent?: object | undefined;
}

interface WatchedBot {
  bot: SkillCatalogBot;
  failures: number;
  state:
    | { kind: 'watching'; close(): void }
    | { kind: 'retrying'; timer: ReturnType<typeof setTimeout> }
    | { kind: 'failed' };
}

function watchMemorySkills(
  root: string,
  changed: () => void,
  failed: (error: Error) => void,
): () => void {
  const watchers = new Map<string, { watcher: FSWatcher; identity: string }>();
  let closed = false;
  const sync = (): void => {
    if (closed) return;
    const paths = new Map<string, boolean>([[root, false]]);
    for (const parent of ['.agents', '.dsh']) {
      const directory = join(root, parent);
      if (existsSync(directory)) paths.set(directory, false);
      const skills = join(directory, 'skills');
      if (existsSync(skills)) paths.set(skills, true);
    }
    const identities = new Map<string, string>();
    for (const path of paths.keys()) {
      try {
        const stat = statSync(path, { bigint: true });
        identities.set(path, `${stat.dev}:${stat.ino}`);
      } catch (error) {
        if (path === root) throw error;
        paths.delete(path);
      }
    }
    for (const [path, entry] of watchers) {
      if (paths.has(path) && identities.get(path) === entry.identity) continue;
      entry.watcher.close();
      watchers.delete(path);
    }
    for (const [path, recursive] of paths) {
      if (watchers.has(path)) continue;
      const watcher = watch(path, { recursive, persistent: false }, (event, name) => {
        if (closed || watchers.get(path)?.watcher !== watcher) return;
        const parts = name === null ? [] : normalize(name).split(sep);
        if (
          name !== null &&
          (path === root
            ? parts[0] !== '.agents' && parts[0] !== '.dsh'
            : !recursive
              ? parts[0] !== 'skills'
              : event !== 'rename' &&
                parts.at(-1) !== 'SKILL.md' &&
                !(parts.length === 1 && parts[0]?.endsWith('.md')))
        )
          return;
        try {
          sync();
        } catch (error) {
          failed(error instanceof Error ? error : new Error('watch-failed'));
        }
        changed();
      });
      watcher.on('error', (error) => {
        if (!closed && watchers.get(path)?.watcher === watcher) failed(error);
      });
      watchers.set(path, { watcher, identity: identities.get(path)! });
    }
  };
  const close = (): void => {
    closed = true;
    for (const entry of watchers.values()) entry.watcher.close();
    watchers.clear();
  };
  try {
    sync();
  } catch (error) {
    close();
    throw error;
  }
  return close;
}

export function watchSkillCatalog(options: {
  catalog: SkillCatalog;
  invalidateNative?(): void;
  bots(): SkillCatalogBot[];
  changed(botSlugs: string[]): void;
  diagnostic(
    phase: string,
    fields: { botSlug?: string; workspaceId?: string; reason?: string; count?: number },
  ): void;
}): { reconcile(): void; hostChanged(): Promise<void>; close(): void } {
  const watched = new Map<string, WatchedBot>();
  const workspaceWatchers = new Map<string, { workspace: SkillWorkspace; close(): void }>();
  const workspacePending = new Map<string, ReturnType<typeof setTimeout>>();
  const workspaceRetries = new Map<
    string,
    { failures: number; due?: boolean; timer?: ReturnType<typeof setTimeout> | undefined }
  >();
  const retryWorkspace = (id: string): void => {
    const retry = workspaceRetries.get(id) ?? { failures: 0 };
    workspaceRetries.set(id, retry);
    clearTimeout(retry.timer);
    if (retry.failures >= 3) {
      retry.timer = undefined;
      options.diagnostic('retry-exhausted', { workspaceId: id, count: retry.failures });
      return;
    }
    const delay = 100 * 2 ** retry.failures++;
    options.diagnostic('retry', { workspaceId: id, count: retry.failures });
    retry.timer = setTimeout(() => {
      retry.timer = undefined;
      retry.due = true;
      reconcile();
    }, delay);
  };
  let closed = false;
  let hostDirty = false;
  let hostRefresh: Promise<void> | undefined;
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const cancel = (slug: string): void => {
    clearTimeout(pending.get(slug));
    pending.delete(slug);
  };
  const memoryChanged = (slug: string): void => {
    options.catalog.invalidateMemory(slug);
    options.invalidateNative?.();
    cancel(slug);
    pending.set(
      slug,
      setTimeout(() => {
        pending.delete(slug);
        if (!closed && watched.has(slug)) options.changed([slug]);
      }, 25),
    );
  };
  const stop = (entry: WatchedBot): void => {
    if (entry.state.kind === 'watching') entry.state.close();
    else if (entry.state.kind === 'retrying') clearTimeout(entry.state.timer);
    entry.state = { kind: 'failed' };
  };
  const failed = (entry: WatchedBot, error: unknown): void => {
    const { slug } = entry.bot;
    if (closed || watched.get(slug) !== entry) return;
    stop(entry);
    cancel(slug);
    options.catalog.invalidateMemory(slug);
    options.diagnostic('failed', {
      botSlug: slug,
      reason: error instanceof Error ? error.name : 'unknown',
    });
    if (entry.failures < 3) {
      const delay = Math.min(100 * 2 ** entry.failures++, 1000);
      entry.state = {
        kind: 'retrying',
        timer: setTimeout(() => {
          if (closed || watched.get(slug) !== entry) return;
          if (start(entry)) {
            options.catalog.invalidateMemory(slug);
            options.invalidateNative?.();
            options.changed([slug]);
          }
        }, delay),
      };
      options.diagnostic('retry', { botSlug: slug, count: entry.failures });
    } else options.diagnostic('retry-exhausted', { botSlug: slug, count: entry.failures });
    options.changed([slug]);
  };
  const start = (entry: WatchedBot): boolean => {
    const { slug, memoryDir } = entry.bot;
    entry.state = { kind: 'failed' };
    try {
      const close = watchMemorySkills(
        memoryDir,
        () => {
          if (closed || watched.get(slug) !== entry || entry.state.kind !== 'watching') return;
          entry.failures = 0;
          memoryChanged(slug);
        },
        (error) => failed(entry, error),
      );
      entry.state = { kind: 'watching', close };
      options.diagnostic('watch', { botSlug: slug });
      return true;
    } catch (error) {
      failed(entry, error);
      return false;
    }
  };
  const reconcile = (): void => {
    if (closed) return;
    const bots = new Map(options.bots().map((bot) => [bot.slug, bot]));
    const changed = new Set<string>();
    for (const [slug, entry] of watched) {
      const bot = bots.get(slug);
      if (bot?.memoryDir === entry.bot.memoryDir && bot.preset === entry.bot.preset) {
        if (bot.agent !== entry.bot.agent) {
          options.catalog.invalidateBot(slug);
          changed.add(slug);
        }
        entry.bot = bot;
        if (entry.state.kind === 'failed') {
          entry.failures = 0;
          if (start(entry)) {
            options.catalog.invalidateMemory(slug);
            options.invalidateNative?.();
            changed.add(slug);
          }
        }
        continue;
      }
      stop(entry);
      cancel(slug);
      watched.delete(slug);
      options.catalog.invalidateBot(slug);
      changed.add(slug);
      options.diagnostic('unwatch', { botSlug: slug });
    }
    for (const [slug, bot] of bots) {
      if (watched.has(slug)) continue;
      const entry: WatchedBot = { bot, failures: 0, state: { kind: 'failed' } };
      watched.set(slug, entry);
      if (start(entry)) changed.add(slug);
    }
    const workspaces = new Map(
      options.catalog
        .workspaces([...bots.keys()])
        .map((workspace) => [workspace.workspaceId, workspace]),
    );
    for (const [id, entry] of workspaceWatchers) {
      if (JSON.stringify(workspaces.get(id)) === JSON.stringify(entry.workspace)) continue;
      entry.close();
      clearTimeout(workspacePending.get(id));
      workspacePending.delete(id);
      workspaceWatchers.delete(id);
      options.diagnostic('unwatch-workspace', { workspaceId: id });
      options.catalog.invalidateWorkspace(id);
      for (const slug of entry.workspace.botSlugs) changed.add(slug);
    }
    for (const [id, retry] of workspaceRetries) {
      if (workspaces.has(id)) continue;
      clearTimeout(retry.timer);
      workspaceRetries.delete(id);
    }
    for (const [id, workspace] of workspaces) {
      if (workspaceWatchers.has(id)) continue;
      const retry = workspaceRetries.get(id);
      if (retry?.timer !== undefined) continue;
      if (retry !== undefined) {
        if (retry.due !== true) retry.failures = 0;
        retry.due = false;
      }
      for (const slug of workspace.botSlugs) changed.add(slug);
      const invalidate = (): void => {
        workspaceRetries.delete(id);
        options.catalog.invalidateWorkspace(id);
        clearTimeout(workspacePending.get(id));
        workspacePending.set(
          id,
          setTimeout(() => {
            workspacePending.delete(id);
            if (!closed && workspaceWatchers.has(id)) options.changed(workspace.botSlugs);
          }, 25),
        );
      };
      try {
        const entry = {
          workspace,
          close: watchMemorySkills(
            workspace.path,
            () => {
              if (!closed && workspaceWatchers.get(id) === entry) invalidate();
            },
            (error) => {
              if (closed || workspaceWatchers.get(id) !== entry) return;
              entry.close();
              clearTimeout(workspacePending.get(id));
              workspacePending.delete(id);
              workspaceWatchers.delete(id);
              options.catalog.invalidateWorkspace(id);
              options.diagnostic('failed', { workspaceId: id, reason: error.name });
              options.changed(workspace.botSlugs);
              retryWorkspace(id);
            },
          ),
        };
        workspaceWatchers.set(id, entry);
        if (retry !== undefined) options.catalog.invalidateWorkspace(id);
        options.diagnostic('watch-workspace', {
          workspaceId: id,
          count: workspace.botSlugs.length,
        });
      } catch (error) {
        options.diagnostic('failed', {
          workspaceId: id,
          reason: error instanceof Error ? error.name : 'unknown',
        });
        retryWorkspace(id);
      }
    }
    if (changed.size > 0) options.changed([...changed]);
  };
  reconcile();
  return {
    reconcile,
    hostChanged() {
      if (closed) return Promise.resolve();
      hostDirty = true;
      hostRefresh ??= (async () => {
        do {
          hostDirty = false;
          let refreshed: boolean;
          try {
            refreshed = await options.catalog.refreshHost();
          } catch {
            options.catalog.invalidateHost();
            refreshed = true;
          }
          if (refreshed) {
            if (!closed) options.changed(options.bots().map((bot) => bot.slug));
          }
        } while (hostDirty && !closed);
      })().finally(() => {
        hostRefresh = undefined;
      });
      return hostRefresh;
    },
    close() {
      if (closed) return;
      closed = true;
      for (const slug of pending.keys()) cancel(slug);
      for (const [slug, entry] of watched) {
        stop(entry);
        cancel(slug);
        options.catalog.invalidateBot(slug);
      }
      options.diagnostic('closed', { count: watched.size + workspaceWatchers.size });
      watched.clear();
      for (const timer of workspacePending.values()) clearTimeout(timer);
      for (const retry of workspaceRetries.values()) clearTimeout(retry.timer);
      workspaceRetries.clear();
      workspacePending.clear();
      for (const [id, entry] of workspaceWatchers) {
        entry.close();
        options.catalog.invalidateWorkspace(id);
      }
      workspaceWatchers.clear();
    },
  };
}
