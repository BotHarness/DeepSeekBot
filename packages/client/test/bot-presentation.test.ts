import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBotPresentation } from '../src/client/bot-presentation.js';
import { createStore, type BotSummary } from '../src/client/store.js';
const bot = (slug: string): BotSummary => ({
  slug,
  displayName: slug,
  roles: [],
  workspaces: [],
  aggregateState: 'idle',
  createdAt: '2026-10-19',
});
class Source extends EventTarget {
  closed = false;
  close() {
    this.closed = true;
  }
  emit(kind: string, data: unknown) {
    this.dispatchEvent(new MessageEvent('companion/' + kind, { data: JSON.stringify(data) }));
  }
}
const output = (botId: string, messageId = 'm1') => ({
  botId,
  messageId,
  channelId: 'dm:' + botId,
  body: 'Hello there. Working continues.',
  generation: 'g1',
  source: 'own-dm',
});
function setup() {
  vi.useFakeTimers();
  const store = createStore({ smoothActivity: false });
  store.setRoster([bot('a'), bot('b')], []);
  const sources: Source[] = [];
  const errors = vi.fn();
  const provider = createBotPresentation(
    store,
    () => {
      const source = new Source();
      sources.push(source);
      return source;
    },
    errors,
  );
  return { store, sources, provider, errors };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('public Bot presentation', () => {
  it('shows current Activity immediately, shares a single timeline, and composes speech with work', () => {
    const { store, sources, provider } = setup();
    store.applyActivity({ generation: 'g1', revision: 1, bots: [{ slug: 'a', state: 'working' }] });
    const a = provider.acquire('a'),
      second = provider.acquire('a');
    expect(a.getSnapshot().activity).toBe('working');
    expect(sources).toHaveLength(1);
    sources[0]!.emit('baseline', { activity: { generation: 'g1' } });
    sources[0]!.emit('message', output('a'));
    vi.advanceTimersByTime(100);
    expect(a.getSnapshot()).toMatchObject({ activity: 'working', speaking: true, text: 'He' });
    expect(second.getSnapshot()).toBe(a.getSnapshot());
    second.dispose();
    expect(sources[0]!.closed).toBe(false);
    a.dispose();
    expect(sources[0]!.closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    provider.dispose();
  });
  it('pages speech by sentence, holds each page and stays in conversation until the last one ends', () => {
    const { sources, provider } = setup();
    const view = provider.acquire('a');
    sources[0]!.emit('baseline', { activity: { generation: 'g1' } });
    sources[0]!.emit('message', output('a'));
    vi.advanceTimersByTime(50 * 'Hello there.'.length);
    expect(view.getSnapshot()).toMatchObject({ page: 'Hello there.', conversing: true });
    vi.advanceTimersByTime(600);
    expect(view.getSnapshot()).toMatchObject({
      page: 'Hello there.',
      speaking: false,
      conversing: true,
    });
    vi.advanceTimersByTime(3000);
    expect(view.getSnapshot().page.startsWith('Hello')).toBe(false);
    expect(view.getSnapshot().text.startsWith('Hello there. W')).toBe(true);
    vi.advanceTimersByTime(20000);
    expect(view.getSnapshot()).toMatchObject({
      text: '',
      page: '',
      speaking: false,
      conversing: false,
    });
    view.dispose();
    provider.dispose();
  });
  it('isolates Bots and source visibility, drops duplicate output and callbacks after release', () => {
    const { sources, provider } = setup();
    const a = provider.acquire('a'),
      b = provider.acquire('b');
    for (const source of sources) source.emit('baseline', { activity: { generation: 'g1' } });
    sources[0]!.emit('message', { ...output('a'), source: 'shared-group' });
    sources[0]!.emit('message', output('b'));
    vi.advanceTimersByTime(100);
    expect(a.getSnapshot().text).toBe('');
    sources[0]!.emit('message', output('a'));
    sources[0]!.emit('message', output('a'));
    vi.advanceTimersByTime(30000);
    expect(a.getSnapshot().speaking).toBe(false);
    expect(b.getSnapshot().text).toBe('');
    const previous = a.getSnapshot();
    a.dispose();
    sources[0]!.emit('message', output('a', 'late'));
    vi.advanceTimersByTime(100);
    expect(a.getSnapshot()).toBe(previous);
    b.dispose();
    provider.dispose();
  });
  it('cancels on disconnect and reconnects without replaying baseline history', () => {
    const { sources, provider } = setup();
    const a = provider.acquire('a');
    sources[0]!.emit('baseline', { activity: { generation: 'g1' } });
    sources[0]!.emit('message', output('a'));
    vi.advanceTimersByTime(100);
    sources[0]!.dispatchEvent(new Event('error'));
    expect(a.getSnapshot()).toMatchObject({ sync: 'stale', speaking: false, mouth: 0, text: '' });
    vi.advanceTimersByTime(2000);
    expect(sources).toHaveLength(2);
    sources[1]!.emit('baseline', {
      activity: { generation: 'g1' },
      recovered: true,
      messages: [output('a')],
    });
    sources[0]!.emit('message', output('a', 'late'));
    vi.advanceTimersByTime(100);
    expect(a.getSnapshot()).toMatchObject({ sync: 'live', speaking: false, text: '' });
    sources[1]!.emit('message', output('a', 'new'));
    vi.advanceTimersByTime(100);
    expect(a.getSnapshot().speaking).toBe(true);
    a.dispose();
    provider.dispose();
  });
  it('keeps queued speech through a brief Activity sync blip and drops it when stale persists', () => {
    const { store, sources, provider } = setup();
    const a = provider.acquire('a');
    sources[0]!.emit('baseline', { activity: { generation: 'g1' } });
    sources[0]!.emit('message', output('a'));
    vi.advanceTimersByTime(100);
    expect(a.getSnapshot()).toMatchObject({ speaking: true, conversing: true });
    const spoken = a.getSnapshot().text;
    store.setActivitySync('stale');
    sources[0]!.emit('message', output('a', 'during-blip'));
    vi.advanceTimersByTime(1000);
    expect(a.getSnapshot()).toMatchObject({
      speaking: false,
      mouth: 0,
      conversing: true,
      text: spoken,
    });
    store.setActivitySync('live');
    vi.advanceTimersByTime(60000);
    expect(a.getSnapshot()).toMatchObject({ speaking: false, conversing: false, text: '' });
    const pages: string[] = [];
    a.subscribe(() => {
      pages.push(a.getSnapshot().text);
    });
    sources[0]!.emit('message', output('a', 'second'));
    vi.advanceTimersByTime(100);
    store.setActivitySync('stale');
    vi.advanceTimersByTime(11000);
    expect(a.getSnapshot()).toMatchObject({ speaking: false, conversing: false, text: '' });
    store.setActivitySync('live');
    vi.advanceTimersByTime(10000);
    expect(a.getSnapshot().text).toBe('');
    a.dispose();
    provider.dispose();
  });
  it('plays a reply that arrives while Activity sync is briefly stale', () => {
    const { store, sources, provider } = setup();
    const a = provider.acquire('a');
    sources[0]!.emit('baseline', { activity: { generation: 'g1' } });
    const texts = new Set<string>();
    a.subscribe(() => {
      texts.add(a.getSnapshot().text);
    });
    store.setActivitySync('stale');
    sources[0]!.emit('message', output('a'));
    vi.advanceTimersByTime(500);
    store.setActivitySync('live');
    vi.advanceTimersByTime(30000);
    expect(texts).toContain(output('a').body);
    a.dispose();
    provider.dispose();
  });
  it('counts each wake from idle as a new inbox notice once the feed is live', () => {
    const { store, sources, provider } = setup();
    store.applyActivity({ generation: 'g1', revision: 1, bots: [{ slug: 'a', state: 'working' }] });
    const view = provider.acquire('a');
    sources[0]!.emit('baseline', { activity: { generation: 'g1' } });
    expect(view.getSnapshot().inbox).toBe(0);
    const state = (revision: number, value: 'idle' | 'thinking' | 'working') =>
      store.applyActivity({ generation: 'g1', revision, bots: [{ slug: 'a', state: value }] });
    state(2, 'idle');
    state(3, 'thinking');
    state(4, 'working');
    expect(view.getSnapshot().inbox).toBe(1);
    state(5, 'idle');
    state(6, 'thinking');
    expect(view.getSnapshot().inbox).toBe(2);
    state(7, 'idle');
    store.setActivitySync('stale');
    state(8, 'thinking');
    store.setActivitySync('live');
    expect(view.getSnapshot().inbox).toBe(3);
    view.dispose();
    provider.dispose();
  });
  it('isolates throwing and rejecting consumers with bounded diagnostics', async () => {
    const { store, provider, errors } = setup();
    const a = provider.acquire('a');
    a.subscribe(() => {
      throw new Error('bad consumer');
    });
    a.subscribe(async () => {
      throw new Error('bad async consumer');
    });
    const healthy = vi.fn();
    a.subscribe(healthy);
    for (let revision = 1; revision <= 8; revision++)
      store.applyActivity({
        generation: 'g1',
        revision,
        bots: [{ slug: 'a', state: revision % 2 ? 'working' : 'idle' }],
      });
    await Promise.resolve();
    expect(healthy).toHaveBeenCalledTimes(8);
    expect(errors).toHaveBeenCalledTimes(5);
    a.dispose();
    provider.dispose();
  });
  it('cancels paused and deleted Bots and does not replay their old output on resume', () => {
    const { store, sources, provider } = setup();
    const view = provider.acquire('a');
    sources[0]!.emit('baseline', { activity: { generation: 'g1' } });
    sources[0]!.emit('message', output('a'));
    vi.advanceTimersByTime(100);
    store.setRoster([{ ...bot('a'), paused: true }, bot('b')], []);
    expect(view.getSnapshot()).toMatchObject({ paused: true, speaking: false, mouth: 0, text: '' });
    sources[0]!.emit('message', output('a', 'while-paused'));
    store.setRoster([bot('a'), bot('b')], []);
    vi.advanceTimersByTime(500);
    expect(view.getSnapshot()).toMatchObject({ speaking: false, text: '' });
    store.setRoster([{ ...bot('a'), deleted: true }], []);
    expect(view.getSnapshot().available).toBe(false);
    view.dispose();
    provider.dispose();
  });
  it('drops output received while the document is hidden and resumes only new output', () => {
    const document = Object.assign(new EventTarget(), { hidden: false });
    vi.stubGlobal('document', document);
    const { sources, provider } = setup();
    const view = provider.acquire('a');
    sources[0]!.emit('baseline', { activity: { generation: 'g1' } });
    sources[0]!.emit('message', output('a'));
    vi.advanceTimersByTime(100);
    expect(view.getSnapshot().speaking).toBe(true);
    document.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    sources[0]!.emit('message', output('a', 'hidden'));
    document.hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(200);
    expect(view.getSnapshot()).toMatchObject({ text: '', speaking: false, mouth: 0 });
    sources[0]!.emit('message', output('a', 'visible'));
    vi.advanceTimersByTime(100);
    expect(view.getSnapshot().speaking).toBe(true);
    view.dispose();
    provider.dispose();
  });
  it('retries construction failures and cancels the retry when the final view closes', () => {
    vi.useFakeTimers();
    const store = createStore({ smoothActivity: false });
    store.setRoster([bot('a')], []);
    const source = vi.fn(() => {
      throw new Error('offline');
    });
    const provider = createBotPresentation(store, source);
    const view = provider.acquire('a');
    expect(view.getSnapshot().sync).toBe('stale');
    vi.advanceTimersByTime(4000);
    expect(source).toHaveBeenCalledTimes(3);
    view.dispose();
    provider.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
