import fc from 'fast-check';
import { expect, it, vi } from 'vitest';

import type {
  ConversationMessage,
  ConversationSnapshot,
} from '@botharness/host-client/conversation';
import { createConversationPlayback } from '../src/host/conversation-playback';
import { createPlaybackRuntime } from '../src/host/playback-runtime';
import type { TextPlayback } from '../src/host/text-playback';

function verifyPlayback(replies: { bot: string; size: number }[]) {
  const messages = replies.map(({ bot, size }, index): ConversationMessage => ({
    id: `reply-${index}`,
    revision: index + 1,
    author: 'bot',
    bot,
    at: '2026-11-19T00:00:00Z',
    body: bot.repeat(size),
    attachments: [],
    delivery: 'committed',
  }));
  let snapshot: ConversationSnapshot = {
    status: 'live',
    messages: [],
    drafts: [],
    hasOlder: false,
    loadingOlder: false,
    fromCache: false,
  };
  let publish = () => {};
  const runtime = createPlaybackRuntime();
  const players: TextPlayback[] = [];
  let scheduled: TextPlayback[] = [];
  const playback = createConversationPlayback(
    {
      getSnapshot: () => snapshot,
      getTimelineSnapshot: () => ({ ...snapshot, drafts: [] }),
      subscribe(listener) {
        publish = listener;
        return () => {
          publish = () => {};
        };
      },
    },
    {
      createPlayer(initial) {
        const player = runtime.createPlayer(initial);
        players.push(player);
        return player;
      },
      schedule(selection, tick) {
        scheduled = selection;
        return runtime.schedule(selection, tick);
      },
    },
  );
  const bodies = () => messages.map(({ id }) => playback.getBubble(id)?.message.body ?? '');
  const unsubscribe = playback.subscribe(() => {});
  try {
    playback.setFollowing(false);
    snapshot = { ...snapshot, messages };
    publish();
    expect(vi.getTimerCount()).toBe(0);
    expect(bodies()).toEqual(messages.map(() => ''));
    playback.setFollowing(true);

    for (let frame = 0; frame < 600 && vi.getTimerCount() > 0; frame++) {
      const before = bodies();
      const firstUnfinishedBySpeaker = messages.flatMap((message, index) =>
        messages.findIndex((reply, i) => reply.bot === message.bot && before[i] !== reply.body) ===
        index
          ? [index]
          : [],
      );
      expect(scheduled.map((player) => players.indexOf(player)).sort((a, b) => a - b)).toEqual(
        firstUnfinishedBySpeaker,
      );
      vi.advanceTimersToNextTimer();
      for (const [index, body] of bodies().entries()) {
        expect(body.startsWith(before[index] ?? '')).toBe(true);
        expect(messages[index]?.body.startsWith(body)).toBe(true);
        if (!firstUnfinishedBySpeaker.includes(index)) expect(body).toBe(before[index]);
        else if (frame === 0) expect(body.length).toBeGreaterThan(0);
      }
    }
    expect(bodies()).toEqual(messages.map(({ body }) => body));
    expect(vi.getTimerCount()).toBe(0);

    const next = messages.at(-1);
    if (next === undefined) throw new Error('Playback requires a reply');
    snapshot = {
      ...snapshot,
      messages: [...messages, { ...next, id: 'next', revision: messages.length + 1 }],
    };
    publish();
    expect(vi.getTimerCount()).toBe(1);
  } finally {
    unsubscribe();
  }
  expect(vi.getTimerCount()).toBe(0);
}

it('advances only the first unfinished reply of each speaker in conversation order', () => {
  vi.useFakeTimers();
  try {
    const reply = fc.record({
      bot: fc.constantFrom('a', 'b', 'c'),
      size: fc.integer({ min: 4, max: 20 }),
    });
    fc.assert(fc.property(fc.array(reply, { minLength: 1, maxLength: 9 }), verifyPlayback), {
      examples: [
        [
          [
            { bot: 'a', size: 20 },
            { bot: 'b', size: 4 },
            { bot: 'a', size: 6 },
          ],
        ],
      ],
    });
  } finally {
    vi.useRealTimers();
  }
});
