import {
  isSessionActivityName,
  type PersonaBotSessionActivity,
} from '../../../core/src/state/tool-activity.js';
import { parsePublicAttention } from './activity-attention.js';
import { parsePublicToolActivity } from './activity-detail.js';
import { PERSONA_BOT_ACTIVITY_STATES } from './avatar.js';
import type { ClientStore, PersonaBotActivitySnapshot } from './store.js';
import { openRosterActivity, type ActivityEventSource } from './messaging-defaults-live.js';

export function parseActivitySnapshot(data: string): PersonaBotActivitySnapshot | undefined {
  try {
    const value: unknown = JSON.parse(data);
    if (typeof value !== 'object' || value === null) return undefined;
    const item = value as Record<string, unknown>;
    if (
      typeof item['generation'] !== 'string' ||
      item['generation'].length === 0 ||
      typeof item['revision'] !== 'number' ||
      !Number.isSafeInteger(item['revision']) ||
      item['revision'] < 0 ||
      !Array.isArray(item['bots'])
    )
      return undefined;
    const bots: PersonaBotActivitySnapshot['bots'] = [];
    const slugs = new Set<string>();
    for (const value of item['bots']) {
      if (typeof value !== 'object' || value === null) return undefined;
      const bot = value as Record<string, unknown>;
      const state = PERSONA_BOT_ACTIVITY_STATES.find((candidate) => candidate === bot['state']);
      if (
        typeof bot['slug'] !== 'string' ||
        bot['slug'].length === 0 ||
        slugs.has(bot['slug']) ||
        state === undefined
      )
        return undefined;
      slugs.add(bot['slug']);
      const attention =
        bot['attention'] === undefined ? undefined : parsePublicAttention(bot['attention']);
      if (bot['attention'] !== undefined && attention === undefined) return undefined;
      const activity =
        bot['activity'] === undefined ? undefined : parsePublicToolActivity(bot['activity']);
      if (bot['activity'] !== undefined && (activity === undefined || state !== 'working'))
        return undefined;
      let sessions: PersonaBotSessionActivity[] | undefined;
      if (bot['sessions'] !== undefined) {
        if (state === 'idle' || !Array.isArray(bot['sessions']) || bot['sessions'].length === 0)
          return undefined;
        sessions = [];
        const ids = new Set<string>();
        for (const entry of bot['sessions']) {
          if (typeof entry !== 'object' || entry === null) return undefined;
          const sessionState = PERSONA_BOT_ACTIVITY_STATES.find(
            (candidate) => candidate === entry.state,
          );
          const role = (['orchestrator', 'assignment', 'subagent'] as const).find(
            (candidate) => candidate === entry.role,
          );
          const detail =
            entry.activity === undefined ? undefined : parsePublicToolActivity(entry.activity);
          if (
            typeof entry.id !== 'string' ||
            !/^activity-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(
              entry.id,
            ) ||
            ids.has(entry.id) ||
            role === undefined ||
            (entry.name !== undefined && !isSessionActivityName(entry.name)) ||
            sessionState === undefined ||
            sessionState === 'idle' ||
            !Number.isSafeInteger(entry.revision) ||
            entry.revision < 0 ||
            entry.revision > item['revision'] ||
            !Number.isSafeInteger(entry.at) ||
            entry.at < 0 ||
            entry.at > 8_640_000_000_000_000 ||
            (entry.activity !== undefined &&
              (detail === undefined || sessionState !== 'working')) ||
            (detail?.sources !== undefined &&
              (detail.sources.length !== 1 ||
                detail.sources[0]?.role !== role ||
                detail.sources[0]?.count !== 1))
          )
            return undefined;
          ids.add(entry.id);
          sessions.push({
            id: entry.id,
            role,
            ...(entry.name === undefined ? {} : { name: entry.name }),
            revision: entry.revision,
            at: entry.at,
            state: sessionState,
            ...(detail === undefined ? {} : { activity: detail }),
          });
        }
      }
      bots.push({
        slug: bot['slug'],
        state,
        ...(attention === undefined ? {} : { attention }),
        ...(activity === undefined ? {} : { activity }),
        ...(sessions === undefined ? {} : { sessions }),
      });
    }
    return { generation: item['generation'], revision: item['revision'], bots };
  } catch {
    return undefined;
  }
}

export function mountActivityLive(
  store: ClientStore,
  makeSource: (url: string) => ActivityEventSource | undefined = () => openRosterActivity(),
  readSnapshot: (signal: AbortSignal) => Promise<unknown> = async () => undefined,
  demand?: { enabled(): boolean; subscribe(changed: () => void): () => void },
): () => void {
  let source: ActivityEventSource | undefined;
  let disposed = false;
  let active = false;
  let healthy = false;
  let latest: PersonaBotActivitySnapshot | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const mark = (sync: 'live' | 'stale'): void => {
    store.setActivitySync(sync);
    const root = typeof document === 'undefined' ? undefined : document.documentElement;
    if (root === undefined) return;
    if (sync === 'stale') root.dataset['botharnessActivity'] = 'stale';
    else delete root.dataset['botharnessActivity'];
  };
  const apply = (snapshot: PersonaBotActivitySnapshot): void => {
    if (latest?.generation === snapshot.generation && snapshot.revision <= latest.revision) return;
    latest = snapshot;
    store.applyActivity(snapshot);
  };
  const clearTimer = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const refresh = (): void => {
    if (!active || controller !== undefined) return;
    const next = new AbortController();
    controller = next;
    const generation = latest?.generation;
    deadline = setTimeout(() => {
      next.abort();
      if (controller !== next) return;
      controller = undefined;
      deadline = undefined;
      if (active && !healthy) schedule();
    }, 5_000);
    void readSnapshot(next.signal)
      .then((value) => {
        if (!active || next.signal.aborted || controller !== next) return;
        const snapshot = parseActivitySnapshot(JSON.stringify(value));
        if (snapshot === undefined) return;
        if (latest?.generation !== generation && snapshot.generation !== latest?.generation) return;
        apply(snapshot);
      })
      .catch(() => undefined)
      .finally(() => {
        if (controller !== next) return;
        if (deadline !== undefined) clearTimeout(deadline);
        deadline = undefined;
        controller = undefined;
        if (active && !healthy) schedule();
      });
  };
  const schedule = (): void => {
    if (timer !== undefined || !active) return;
    timer = setTimeout(() => {
      timer = undefined;
      connect();
      refresh();
    }, 10_000);
  };
  const connect = (): void => {
    if (source !== undefined) return;
    let next: ActivityEventSource | undefined;
    try {
      next = makeSource('./api/botharness/stream?scope=activity');
    } catch {
      schedule();
      return;
    }
    if (next === undefined) {
      schedule();
      return;
    }
    source = next;
    next.addEventListener('activity/snapshot', (event) => {
      if (!active || source !== next || !(event instanceof MessageEvent)) return;
      const snapshot = parseActivitySnapshot(event.data as string);
      if (snapshot === undefined) return;
      const gap =
        latest?.generation === snapshot.generation && snapshot.revision > latest.revision + 1;
      healthy = true;
      clearTimer();
      apply(snapshot);
      mark('live');
      if (gap) refresh();
    });
    next.addEventListener('error', () => {
      if (!active || source !== next) return;
      healthy = false;
      mark('stale');
      if (next.readyState === 2) {
        next.close();
        source = undefined;
      }
      schedule();
    });
  };
  const sync = (): void => {
    const visible = typeof document === 'undefined' || document.visibilityState !== 'hidden';
    const enabled =
      !disposed && store.getSnapshot().mode === 'bot' && visible && (demand?.enabled() ?? true);
    if (enabled === active) return;
    active = enabled;
    if (!active) {
      source?.close();
      source = undefined;
      healthy = false;
      clearTimer();
      controller?.abort();
      controller = undefined;
      if (deadline !== undefined) clearTimeout(deadline);
      deadline = undefined;
      return;
    }
    connect();
    refresh();
  };
  const unsubscribe = store.subscribe(sync);
  const offDemand = demand?.subscribe(sync);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', sync);
  sync();
  return () => {
    disposed = true;
    unsubscribe();
    offDemand?.();
    if (typeof document !== 'undefined' && document.documentElement !== undefined)
      delete document.documentElement.dataset['botharnessActivity'];
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', sync);
    sync();
  };
}
