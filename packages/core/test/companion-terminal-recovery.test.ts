import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { expect, it, vi } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createTempRoot, FIXED_NOW } from './helpers.js';
import { WindowCompanions } from '../../client/src/client/window-companions.js';

it('resumes canonical unplayed replies after terminal transport failures without losing reading or leaking retries', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  const core = createCore({ dshHome: createTempRoot('companion-terminal-recovery-') });
  const connections: {
    events: EventTarget;
    reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    readyState: number;
  }[] = [];
  let unavailable = false;
  let updates = 0;
  let completeOldIdentityQuery: ((exists: boolean) => void) | undefined;
  const owner = new WindowCompanions({
    context: async () =>
      core.companions.open(new Request('http://localhost/api/botharness/companion')).json(),
    source: (url) => {
      const connection = {
        events: new EventTarget(),
        reader: unavailable
          ? undefined
          : core.companions.open(new Request(new URL(url, 'http://localhost'))).body!.getReader(),
        readyState: unavailable ? 2 : 1,
      };
      connections.push(connection);
      if (unavailable) queueMicrotask(() => connection.events.dispatchEvent(new Event('error')));
      return {
        get readyState() {
          return connection.readyState;
        },
        addEventListener: connection.events.addEventListener.bind(connection.events),
        close() {
          void connection.reader?.cancel();
        },
      };
    },
    update: async (value) => {
      const response = await core.companions.update(
        new Request('http://localhost/api/botharness/companion', {
          method: 'POST',
          body: JSON.stringify(value),
        }),
      );
      if (!response.ok) throw new Error('Selection failed');
      updates++;
    },
    exists: () =>
      new Promise<boolean>((resolve) => {
        completeOldIdentityQuery = resolve;
      }),
  });
  const receive = async () => {
    const connection = connections.at(-1)!;
    const text = new TextDecoder().decode((await connection.reader!.read()).value);
    const frame = /event: ([^\n]+)\ndata: ([^\n]+)/u.exec(text);
    if (!frame) throw new Error('Missing Host frame');
    connection.events.dispatchEvent(new MessageEvent(frame[1]!, { data: frame[2]! }));
  };
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    core.ownership.claim({
      sessionId: 'ada',
      botSlug: 'ada',
      rootRole: 'orchestrator',
      at: FIXED_NOW().toISOString(),
    });
    const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    const commit = (id: string) =>
      core.channels.appendMessage(
        OWNER_HUMAN_CONTEXT,
        dm.id,
        { id, at: FIXED_NOW().toISOString(), author: { kind: 'bot', slug: 'ada' }, body: id },
        { sessionId: 'ada' },
      );
    await owner.start();
    owner.select('ada');
    await vi.advanceTimersByTimeAsync(0);
    await receive();
    await vi.advanceTimersByTimeAsync(0);
    expect(updates).toBe(1);
    await receive();
    await commit('reading-before-disconnect');
    await receive();
    const child = owner.get('ada')!;
    child.advance(100);
    const shown = child.getSnapshot().cards[0]!.shown;
    child.reading(true);
    const first = connections[0]!;
    await first.reader!.cancel();
    first.readyState = 2;
    unavailable = true;
    first.events.dispatchEvent(new Event('error'));
    await commit('committed-while-unavailable');
    await vi.advanceTimersByTimeAsync(4000);
    expect(connections.length).toBeGreaterThan(1);
    expect(connections.length).toBeLessThanOrEqual(5);
    unavailable = false;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(connections.at(-1)!.reader).toBeDefined();
    await receive();
    await vi.advanceTimersByTimeAsync(0);
    expect(updates).toBe(2);
    await receive();
    await receive();
    await receive();
    completeOldIdentityQuery!(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(owner.get('ada')).toBe(child);
    expect(child.getSnapshot()).toMatchObject({
      reading: true,
      cards: [{ messageId: 'reading-before-disconnect', shown }],
      pending: 1,
      sync: 'live',
    });
    child.reading(false);
    expect(child.getSnapshot().cards.map((card) => card.messageId)).toEqual([
      'reading-before-disconnect',
      'committed-while-unavailable',
    ]);
    const latest = connections.at(-1)!;
    latest.readyState = 2;
    await latest.reader!.cancel();
    latest.events.dispatchEvent(new Event('error'));
    owner.dispose();
    const connectionCount = connections.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(connections).toHaveLength(connectionCount);
    expect(vi.getTimerCount()).toBe(0);
    expect(core.channels.readPosition(OWNER_HUMAN_CONTEXT, dm.id)).toBeUndefined();
  } finally {
    owner.dispose();
    for (const connection of connections) await connection.reader?.cancel();
    core.companions.close();
    await core.runtime.close();
    core.externalMessaging.close();
    core.live.close();
    core.operationalDatabase.close();
    vi.useRealTimers();
  }
});
