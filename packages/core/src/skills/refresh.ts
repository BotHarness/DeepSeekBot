import { existsSync, statSync, watch, type FSWatcher } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import type { SkillCatalog } from './catalog.js';

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
              : event !== 'rename' && parts.at(-1) !== 'SKILL.md')
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
  diagnostic(phase: string, fields: { botSlug?: string; reason?: string; count?: number }): void;
}): { reconcile(): void; hostChanged(): Promise<void>; close(): void } {
  const watched = new Map<string, WatchedBot>();
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
      options.diagnostic('closed', { count: watched.size });
      watched.clear();
    },
  };
}
