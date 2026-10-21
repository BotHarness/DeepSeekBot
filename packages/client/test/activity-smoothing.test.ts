import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ACTIVITY_DETAIL_MS,
  ACTIVITY_HOLD_MS,
  ActivitySmoother,
} from '../src/client/activity-smoothing.js';
import {
  createStore,
  type BotSummary,
  type PersonaBotActivitySnapshot,
} from '../src/client/store.js';

type Entry = PersonaBotActivitySnapshot['bots'][number];
const tool = (toolName: string) => ({
  effect: 'executing' as const,
  toolKind: 'execute' as const,
  toolName,
  startedAt: 1000,
  activeToolCount: 1,
});
const raw = (...entries: Entry[]) => new Map(entries.map((entry) => [entry.slug, entry]));
const shown = (smoother: ActivitySmoother, entry: Entry, now: number) =>
  smoother.step(raw(entry), now).shown.get(entry.slug);

describe('ActivitySmoother', () => {
  it('keeps thinking when a short tool call ends before it settles', () => {
    const smoother = new ActivitySmoother();
    expect(shown(smoother, { slug: 'ada', state: 'thinking' }, 0)?.state).toBe('thinking');
    const flash = smoother.step(
      raw({ slug: 'ada', state: 'working', activity: tool('read') }),
      2000,
    );
    expect(flash.shown.get('ada')?.state).toBe('thinking');
    expect(flash.shown.get('ada')?.activity).toBeUndefined();
    expect(flash.wake).toBe(2700);
    expect(shown(smoother, { slug: 'ada', state: 'thinking' }, 2300)?.state).toBe('thinking');
    expect(shown(smoother, { slug: 'ada', state: 'thinking' }, 3500)?.state).toBe('thinking');
  });

  it('switches once the new state is stable and the old one was held long enough', () => {
    const smoother = new ActivitySmoother();
    shown(smoother, { slug: 'ada', state: 'thinking' }, 0);
    const working = { slug: 'ada', state: 'working', activity: tool('shell') } as const;
    const early = smoother.step(raw(working), 200);
    expect(early.shown.get('ada')?.state).toBe('thinking');
    expect(early.wake).toBe(ACTIVITY_HOLD_MS);
    expect(shown(smoother, working, ACTIVITY_HOLD_MS)).toMatchObject({
      state: 'working',
      activity: tool('shell'),
    });
  });

  it('wakes from idle and surfaces waiting or blocked immediately', () => {
    const smoother = new ActivitySmoother();
    shown(smoother, { slug: 'ada', state: 'idle' }, 0);
    expect(shown(smoother, { slug: 'ada', state: 'thinking' }, 10)?.state).toBe('thinking');
    expect(shown(smoother, { slug: 'ada', state: 'waiting' }, 20)?.state).toBe('waiting');
    expect(shown(smoother, { slug: 'ada', state: 'thinking' }, 30)?.state).toBe('thinking');
  });

  it('throttles tool detail changes while working', () => {
    const smoother = new ActivitySmoother();
    shown(smoother, { slug: 'ada', state: 'working', activity: tool('read') }, 0);
    const quick = smoother.step(
      raw({ slug: 'ada', state: 'working', activity: tool('grep') }),
      300,
    );
    expect(quick.shown.get('ada')?.activity).toEqual(tool('read'));
    expect(quick.wake).toBe(ACTIVITY_DETAIL_MS);
    expect(
      shown(smoother, { slug: 'ada', state: 'working', activity: tool('grep') }, ACTIVITY_DETAIL_MS)
        ?.activity,
    ).toEqual(tool('grep'));
  });
});

describe('store activity smoothing', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('settles the presented state without dropping the final raw state', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const bot: BotSummary = {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '2026-10-01',
    };
    const store = createStore();
    store.setRoster([bot], []);
    const apply = (revision: number, entry: Entry) =>
      store.applyActivity({ generation: 'host', revision, bots: [entry] });
    apply(1, { slug: 'ada', state: 'thinking' });
    expect(store.getSnapshot().bots[0]?.aggregateState).toBe('thinking');
    vi.advanceTimersByTime(300);
    apply(2, { slug: 'ada', state: 'working', activity: tool('shell') });
    expect(store.getSnapshot().bots[0]?.aggregateState).toBe('thinking');
    vi.advanceTimersByTime(ACTIVITY_HOLD_MS);
    expect(store.getSnapshot().bots[0]?.aggregateState).toBe('working');
    expect(store.getSnapshot().bots[0]?.activity).toEqual(tool('shell'));
  });
});
