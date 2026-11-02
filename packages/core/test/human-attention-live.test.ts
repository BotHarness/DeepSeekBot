import { afterEach, expect, it, vi } from 'vitest';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { watchHumanAttention } from '../src/runtime/human-attention-live.js';
import { createTempRoot } from './helpers.js';

const agents: BotAgentAdapter = {
  async runOrchestrator() {},
  async runAssignment() {},
  async close() {},
  requestAssignment() {
    throw new Error('Unexpected assignment');
  },
};
afterEach(() => vi.useRealTimers());

it('invalidates the shared carrier after canonical messages, reads, decisions and snooze expiry', async () => {
  vi.useFakeTimers();
  const core = createCore({ dshHome: createTempRoot('attention-live-'), agents });
  const abort = new AbortController();
  const snapshots: string[][] = [];
  const following = (async () => {
    for await (const frame of core.live.followRoster(abort.signal)) {
      if (frame.type === 'attention')
        snapshots.push(
          (['action', 'replies', 'unread'] as const).flatMap((category) =>
            core.humanAttention.list({ category }).items.map((x) => category + ':' + x.messageId),
          ),
        );
    }
  })();
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
    await core.channels.appendMessage(dm.id, {
      id: 'reply',
      at: new Date().toISOString(),
      author: { kind: 'bot', slug: 'ada' },
      body: 'A real persisted reply',
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(snapshots.at(-1)).toContain('unread:reply');
    const unread = core.humanAttention.list({ category: 'unread' }).items[0]!;
    expect(unread).toMatchObject({ channelId: dm.id, messageId: 'reply' });
    expect(unread.sourceEventId).toBeTruthy();
    await core.channels.markRead(dm.id, 'reply');
    await vi.advanceTimersByTimeAsync(1);
    expect(snapshots.at(-1)).not.toContain('unread:reply');
    await core.channels.appendMessage(dm.id, {
      id: 'approval',
      at: new Date().toISOString(),
      author: { kind: 'bot', slug: 'ada' },
      body: 'Please approve',
      grantRequest: true,
    });
    await vi.advanceTimersByTimeAsync(1);
    const action = core.humanAttention.list({ category: 'action' }).items[0]!;
    expect(snapshots.at(-1)).toContain('action:approval');
    core.humanAttentionDecisions.snooze(action, new Date(Date.now() + 1000).toISOString());
    await vi.advanceTimersByTimeAsync(1);
    expect(snapshots.at(-1)).not.toContain('action:approval');
    await vi.advanceTimersByTimeAsync(1001);
    expect(snapshots.at(-1)).toContain('action:approval');
    core.humanAttentionDecisions.dismiss(action);
    await vi.advanceTimersByTimeAsync(1);
    expect(snapshots.at(-1)).not.toContain('action:approval');
    const count = snapshots.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(snapshots).toHaveLength(count);
  } finally {
    abort.abort();
    await following;
    core.live.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

it('coalesces transient request owner signals and cancels queued work when the database closes', async () => {
  vi.useFakeTimers();
  const core = createCore({ dshHome: createTempRoot('attention-request-live-'), agents });
  let signal!: () => void;
  const off = vi.fn();
  const changed = vi.fn();
  const stop = watchHumanAttention(
    core.operationalDatabase,
    (callback) => {
      signal = callback;
      return off;
    },
    changed,
  );
  try {
    signal();
    signal();
    signal();
    expect(changed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(changed).toHaveBeenCalledTimes(1);
    signal();
    core.operationalDatabase.close();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(changed).toHaveBeenCalledTimes(1);
    stop();
    expect(off).toHaveBeenCalledTimes(1);
  } finally {
    stop();
    core.live.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});
