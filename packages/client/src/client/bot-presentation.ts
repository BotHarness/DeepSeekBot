import type {
  BotPresentation,
  BotPresentationSnapshot,
  BotPresentationView,
} from '../panel-api.js';
import type { ClientStore } from './store.js';
import {
  messageGraphemeBoundaries,
  messagePreview,
} from '../../../core/src/channels/message-preview.js';
import { speechBeats, beatHold, speechText } from './companion-beats.js';

interface Source {
  addEventListener(name: string, listener: (event: Event) => void): void;
  close(): void;
}
interface Output {
  id: string;
  body: string;
  boundaries: readonly number[];
  beats: readonly number[];
  shown: number;
  start: number;
  hold: number;
}
const SPEECH_STALE_LIMIT = 10_000;
const SPEECH_PAGE = 40;
const decode = (event: Event): Record<string, unknown> | undefined => {
  if (!(event instanceof MessageEvent)) return;
  try {
    const value: unknown = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    if (value && typeof value === 'object') return value as Record<string, unknown>;
  } catch {}
  return;
};
export function createBotPresentation(
  store: ClientStore,
  source: (url: string) => Source = (url) => new EventSource(url),
  diagnostic: (code: string) => void = (code) => console.warn('botharness presentation:', code),
): BotPresentation & { dispose(): void } {
  const readers = new Map<string, { acquire(): BotPresentationView; dispose(): void }>();
  let disposed = false;
  let failures = 0;
  const report = () => {
    if (failures++ < 5) diagnostic('consumer_failed');
  };
  return {
    bots: () => store.getSnapshot().bots.map((bot) => ({ id: bot.slug, name: bot.displayName })),
    acquire(botId) {
      if (disposed) throw new Error('presentation_disposed');
      if (!botId.trim()) throw new Error('invalid_bot_binding');
      let reader = readers.get(botId);
      if (!reader) {
        let references = 0;
        let stopped = false;
        let stream: Source | undefined;
        let generation: string | undefined;
        let retry: ReturnType<typeof setTimeout> | undefined;
        const listeners = new Set<() => void | Promise<void>>();
        const seen = new Set<string>();
        let queue: Output[] = [];
        let sync: BotPresentationSnapshot['sync'] = 'connecting';
        let primed = false;
        let staleSince: number | undefined;
        let snapshot: BotPresentationSnapshot = {
          botId,
          name: botId,
          available: false,
          paused: false,
          sync,
          activity: 'idle',
          text: '',
          page: '',
          speaking: false,
          conversing: false,
          mouth: 0,
          inbox: 0,
        };
        const notify = () => {
          for (const listener of [...listeners]) {
            try {
              Promise.resolve(listener()).catch(report);
            } catch {
              report();
            }
          }
        };
        const publish = (patch: Partial<BotPresentationSnapshot> = {}) => {
          const bot = store.getSnapshot().bots.find((item) => item.slug === botId);
          const next: BotPresentationSnapshot = {
            ...snapshot,
            ...patch,
            name: bot?.displayName ?? botId,
            available: bot !== undefined && !bot.deleted,
            paused: bot?.paused ?? false,
            attention: bot?.attention?.approvalCount
              ? 'Approval needed'
              : bot?.attention?.questionCount
                ? 'Question awaiting reply'
                : undefined,
            activity: (['idle', 'thinking', 'working', 'waiting', 'blocked'].includes(
              bot?.aggregateState ?? '',
            )
              ? bot!.aggregateState
              : 'idle') as BotPresentationSnapshot['activity'],
            sync: store.getSnapshot().activitySync === 'stale' ? 'stale' : sync,
          };
          const quiet = !next.available || next.paused || sync !== 'live';
          const woke =
            primed &&
            next.available &&
            !next.paused &&
            snapshot.activity === 'idle' &&
            next.activity !== 'idle';
          if (next.sync === 'live') primed = true;
          const counted = woke ? { ...next, inbox: snapshot.inbox + 1 } : next;
          const settled = quiet
            ? { ...counted, speaking: false, conversing: false, mouth: 0 }
            : next.sync !== 'live'
              ? { ...counted, speaking: false, mouth: 0 }
              : counted;
          if (JSON.stringify(settled) !== JSON.stringify(snapshot)) {
            snapshot = Object.freeze(settled);
            notify();
          }
        };
        const cancel = () => {
          queue = [];
          publish({ text: '', page: '', speaking: false, conversing: false, mouth: 0 });
        };
        const scheduleRetry = () => {
          if (stopped || retry !== undefined) return;
          retry = setTimeout(() => {
            retry = undefined;
            connect();
          }, 2000);
        };
        const connect = () => {
          if (stopped) return;
          stream?.close();
          let current: Source;
          try {
            current = source(
              './api/botharness/companion?botId=' +
                encodeURIComponent(botId) +
                '&dm=1&group=0&visibility=own-dm',
            );
          } catch {
            sync = 'stale';
            cancel();
            scheduleRetry();
            return;
          }
          stream = current;
          current.addEventListener('companion/baseline', (event) => {
            if (stopped || stream !== current) return;
            const value = decode(event);
            const activity = value?.activity as { generation?: unknown } | undefined;
            if (typeof activity?.generation !== 'string') return;
            generation = activity.generation;
            sync = 'live';
            cancel();
          });
          current.addEventListener('companion/message', (event) => {
            if (
              stopped ||
              stream !== current ||
              sync !== 'live' ||
              !snapshot.available ||
              snapshot.paused ||
              (typeof document !== 'undefined' && document.hidden)
            )
              return;
            const value = decode(event);
            if (
              !value ||
              value.generation !== generation ||
              value.botId !== botId ||
              value.source !== 'own-dm' ||
              typeof value.messageId !== 'string' ||
              typeof value.channelId !== 'string' ||
              typeof value.body !== 'string'
            )
              return;
            const id = generation + ':' + value.channelId + ':' + value.messageId;
            if (seen.has(id)) return;
            seen.add(id);
            if (seen.size > 200) seen.delete(seen.values().next().value!);
            const body = messagePreview(speechText(value.body));
            if (!body.trim()) return;
            const boundaries = messageGraphemeBoundaries(body);
            queue.push({
              id,
              body,
              boundaries,
              beats: speechBeats(body, boundaries, SPEECH_PAGE, 10),
              shown: 0,
              start: 0,
              hold: 0,
            });
            queue = queue.slice(-3);
          });
          current.addEventListener('error', () => {
            if (stopped || stream !== current) return;
            sync = 'stale';
            cancel();
            current.close();
            stream = undefined;
            scheduleRetry();
          });
        };
        const offStore = store.subscribe(() => {
          const state = store.getSnapshot();
          const bot = state.bots.find((b) => b.slug === botId);
          if (!bot || bot.paused || bot.deleted) return cancel();
          if (state.activitySync === 'live') staleSince = undefined;
          else staleSince ??= Date.now();
          publish();
        });
        const visibility = () => {
          if (document.hidden) cancel();
        };
        if (typeof document !== 'undefined')
          document.addEventListener('visibilitychange', visibility);
        const timer = setInterval(() => {
          if (typeof document !== 'undefined' && document.hidden) return;
          const item = queue[0];
          if (!item || sync !== 'live') return;
          if (staleSince !== undefined) {
            if (Date.now() - staleSince > SPEECH_STALE_LIMIT) cancel();
            return;
          }
          if (item.hold > 0) {
            item.hold -= 50;
            if (item.hold <= 0 && item.shown >= item.body.length) {
              queue.shift();
              publish({
                text: '',
                page: '',
                speaking: false,
                conversing: queue.length > 0,
                mouth: 0,
              });
              return;
            }
            if (item.hold <= 0) item.start = item.shown;
            publish({ speaking: false, conversing: true, mouth: 0 });
            return;
          }
          const previous = item.shown;
          item.shown = item.boundaries.find((n) => n > previous) ?? item.body.length;
          const text = item.body.slice(0, item.shown);
          const pause = /[。，、！？!?…；;\s]$/u.test(text);
          publish({
            text,
            page: item.body.slice(item.start, item.shown).trimStart(),
            speaking: true,
            conversing: true,
            mouth: pause ? 0 : [0.2, 0.65, 0.9, 0.4][item.boundaries.indexOf(item.shown) % 4]!,
          });
          if (item.beats.includes(item.shown))
            item.hold = beatHold(text, item.shown === item.body.length, queue.length > 1);
        }, 50);
        const dispose = () => {
          if (stopped) return;
          stopped = true;
          stream?.close();
          if (retry !== undefined) clearTimeout(retry);
          clearInterval(timer);
          offStore();
          if (typeof document !== 'undefined')
            document.removeEventListener('visibilitychange', visibility);
          queue = [];
          listeners.clear();
          readers.delete(botId);
        };
        reader = {
          dispose,
          acquire() {
            references++;
            let released = false;
            const owned = new Set<() => void | Promise<void>>();
            return {
              getSnapshot: () => snapshot,
              subscribe(listener) {
                if (released) return () => {};
                owned.add(listener);
                listeners.add(listener);
                return () => {
                  owned.delete(listener);
                  listeners.delete(listener);
                };
              },
              dispose() {
                if (released) return;
                released = true;
                for (const listener of owned) listeners.delete(listener);
                owned.clear();
                if (--references === 0) dispose();
              },
            };
          },
        };
        readers.set(botId, reader);
        publish();
        try {
          connect();
        } catch {
          sync = 'stale';
          publish();
        }
      }
      return reader.acquire();
    },
    dispose() {
      disposed = true;
      for (const reader of [...readers.values()]) reader.dispose();
    },
  };
}
