import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ChannelMessage } from '../src/channels/channel.js';
import { createChannelStore, queryChannelMessages } from '../src/channels/store.js';
import { at, callMessages, CALLS, OTHER_CALL, setup } from './channel-call-fixture.js';
import { createTempRoot } from './helpers.js';

const ids = (page: { messages: Array<{ message: ChannelMessage }> }) =>
  page.messages.map((entry) => entry.message.id);

describe('channel_read by call and time within it (#3693)', () => {
  it('returns each call’s own 00:13–00:40 window, oldest first, without mixing calls', async () => {
    const { read, close } = await setup();
    try {
      for (const call of CALLS) {
        const page = await read({ call: call.id, from_ms: 13_000, to_ms: 40_000 });
        expect(ids(page)).toEqual([
          `${call.label}-look`,
          `voice-call-frames-${call.id}-20000`,
          `${call.label}-reply`,
        ]);
        expect(page.messages.map((entry) => entry.message.author.kind)).toEqual([
          'human',
          'system',
          'bot',
        ]);
        expect(page.messages[1]!.message.voiceCallRecord).toMatchObject({
          callId: call.id,
          state: 'frames',
        });
        expect(page.call).toMatchObject({
          callId: call.id,
          startedAt: call.startedAt,
          fromMs: 13_000,
          toMs: 40_000,
          from: at(call.startedAt, 13_000),
          to: at(call.startedAt, 40_000),
        });
      }
    } finally {
      await close();
    }
  });

  it('reads a whole call from its start notice to its end notice, or on to now while it goes on', async () => {
    const { read, close } = await setup();
    try {
      const week = await read({ call: CALLS[0].id });
      expect(ids(week)).toEqual(callMessages(CALLS[0]).map((message) => message.id));
      expect(week.call).toMatchObject({
        endedAt: at(CALLS[0].startedAt, 60_000),
        durationMs: 60_000,
      });
      const now = await read({ call: CALLS[2].id });
      expect(ids(now)).toEqual(callMessages(CALLS[2]).map((message) => message.id));
      expect(now.call).not.toHaveProperty('endedAt');
      expect(now.call).not.toHaveProperty('to');
      expect(ids(await read({ call: CALLS[1].id, from_ms: 45_000, to_ms: 600_000 }))).toEqual([
        'yesterday-bye',
        `voice-call-ended-${CALLS[1].id}`,
      ]);
    } finally {
      await close();
    }
  });

  it('pages forward in time with nextCursor', async () => {
    const { read, close } = await setup();
    try {
      const first = await read({ call: CALLS[0].id, limit: 4 });
      expect(ids(first)).toEqual(
        callMessages(CALLS[0])
          .slice(0, 4)
          .map((message) => message.id),
      );
      const second = await read({ call: CALLS[0].id, limit: 4, cursor: first.nextCursor });
      expect(ids(second)).toEqual(
        callMessages(CALLS[0])
          .slice(4)
          .map((message) => message.id),
      );
      expect(second.nextCursor).toBeUndefined();
    } finally {
      await close();
    }
  });

  it.each([
    [{ call: 'call-eeeeeeeeeeeeeeee' }, 'call-not-found'],
    [{ call: OTHER_CALL }, 'call-not-found'],
    [{ call: 'yesterday' }, 'invalid-call'],
    [{ call: CALLS[0].id, from: '2026-10-31' }, 'call-range-conflict'],
    [{ call: CALLS[0].id, to: '2026-10-31' }, 'call-range-conflict'],
    [{ call: CALLS[0].id, scope: 'joined', text: 'look' }, 'call-range-conflict'],
    [{ call: CALLS[0].id, from_ms: 40_000, to_ms: 13_000 }, 'invalid-call-window'],
    [{ call: CALLS[0].id, from_ms: -1 }, 'invalid-call-window'],
    [{ call: CALLS[0].id, to_ms: 1.5 }, 'invalid-call-window'],
    [{ call: CALLS[0].id, from_ms: 61_000 }, 'invalid-call-window'],
    [{ from_ms: 0, to_ms: 1_000 }, 'invalid-call-window'],
  ])('refuses %j with %s', async (args, code) => {
    const { read, close } = await setup();
    try {
      await expect(read(args)).rejects.toMatchObject({
        code,
        message: expect.stringContaining(`channel_read: ${code}:`),
      });
    } finally {
      await close();
    }
  });

  it('carries the refusal code through the direct Bot tool bridge', async () => {
    const { methods, dm, close } = await setup();
    try {
      const refused = await methods.botToolRun({
        slug: 'ada',
        tool: 'channel_read',
        args: { channel_id: dm.id, call: OTHER_CALL },
      });
      expect(refused).toMatchObject({ ok: false, error: { code: 'call-not-found' } });
      const read = await methods.botToolRun({
        slug: 'ada',
        tool: 'channel_read',
        args: { channel_id: dm.id, call: CALLS[1].id, from_ms: 13_000, to_ms: 40_000 },
      });
      expect(read).toMatchObject({ ok: true, value: { tool: 'channel_read' } });
    } finally {
      await close();
    }
  });
});

describe('time-ordered Channel query oldest first', () => {
  it('orders and pages ascending in the file store as in SQLite', async () => {
    const store = createChannelStore({ rootDir: join(createTempRoot('call-read-file-'), 'c') });
    const dm = store.getOrCreateDm('ada', 'Ada')!;
    const messages = [...callMessages(CALLS[1]), ...callMessages(CALLS[0])];
    for (const message of messages) await store.appendMessage(dm.id, message);
    const window = {
      from: CALLS[0].startedAt,
      to: at(CALLS[0].startedAt, 60_000),
      orderBy: 'time' as const,
      ascending: true,
    };
    const first = store.queryMessages(dm.id, { ...window, limit: 3 });
    const second = store.queryMessages(dm.id, { ...window, limit: 10, cursor: first.nextCursor! });
    expect([...first.messages, ...second.messages].map((message) => message.id)).toEqual(
      callMessages(CALLS[0]).map((message) => message.id),
    );
    expect(() => queryChannelMessages(dm.id, messages, { ascending: true })).toThrow(
      'channel_read: ascending order needs time order',
    );
  });
});
