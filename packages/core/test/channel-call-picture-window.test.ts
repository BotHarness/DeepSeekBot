import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ChannelMessage } from '../src/channels/channel.js';
import { createChannelStore } from '../src/channels/store.js';
import {
  at,
  PICTURE_CALLS,
  pictureMessages,
  pictureWindowIds,
  setup,
} from './channel-call-fixture.js';
import { createTempRoot } from './helpers.js';

const ids = (page: { messages: Array<{ message: ChannelMessage }> }) =>
  page.messages.map((entry) => entry.message.id);

async function pictureSetup() {
  const fixture = await setup();
  for (const call of [PICTURE_CALLS[1], PICTURE_CALLS[0]])
    for (const message of pictureMessages(call))
      await fixture.core.channels.appendMessage(OWNER_HUMAN_CONTEXT, fixture.dm.id, message);
  return fixture;
}

describe('channel_read by call returns pictures that overlap the window (#3713)', () => {
  it('returns a 0:00–0:13 record and a sentence whose picture starts before its speech for 0:05–0:09', async () => {
    const { read, close } = await pictureSetup();
    try {
      for (const call of PICTURE_CALLS) {
        const page = await read({ call: call.id, from_ms: 5_000, to_ms: 9_000 });
        expect(ids(page)).toEqual(pictureWindowIds(call));
        expect(page.messages.at(-1)!.message.voiceCallRecord).toMatchObject({
          callId: call.id,
          state: 'frames',
          fromMs: 0,
          toMs: 13_000,
        });
        expect(page.call).toMatchObject({
          callId: call.id,
          fromMs: 5_000,
          toMs: 9_000,
          from: at(call.startedAt, 5_000),
          to: at(call.startedAt, 9_000),
        });
      }
    } finally {
      await close();
    }
  });

  it('leaves out pictures wholly outside the window even when the message time is inside', async () => {
    const { read, close } = await pictureSetup();
    try {
      const [first] = PICTURE_CALLS;
      const page = await read({ call: first.id, from_ms: 5_000, to_ms: 9_000 });
      expect(ids(page)).not.toContain('first-old-picture');
      expect(ids(page)).not.toContain(`voice-call-frames-${first.id}-20000`);
      expect(ids(page)).not.toContain('first-early');
      expect(ids(page)).not.toContain('first-late-reply');
      expect(ids(await read({ call: first.id, from_ms: 3_500, to_ms: 4_500 }))).toEqual([
        'first-old-picture',
        'first-said',
        `voice-call-frames-${first.id}-13000`,
      ]);
      expect(ids(await read({ call: first.id, from_ms: 15_000 }))).toEqual([
        `voice-call-frames-${first.id}-20000`,
        `voice-call-ended-${first.id}`,
      ]);
      expect(ids(await read({ call: first.id }))).toEqual(
        pictureMessages(first)
          .toSorted((left, right) => Date.parse(left.at) - Date.parse(right.at))
          .map((message) => message.id),
      );
    } finally {
      await close();
    }
  });

  it('pages the same window oldest first', async () => {
    const { read, close } = await pictureSetup();
    try {
      const call = PICTURE_CALLS[1];
      const seen: string[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 5; page += 1) {
        const result = await read({
          call: call.id,
          from_ms: 5_000,
          to_ms: 9_000,
          limit: 2,
          ...(cursor === undefined ? {} : { cursor }),
        });
        seen.push(...ids(result));
        cursor = result.nextCursor;
        if (cursor === undefined) break;
      }
      expect(seen).toEqual(pictureWindowIds(call));
    } finally {
      await close();
    }
  });

  it('refuses a cursor from another window', async () => {
    const { read, close } = await pictureSetup();
    try {
      const call = PICTURE_CALLS[0];
      const first = await read({ call: call.id, from_ms: 5_000, to_ms: 9_000, limit: 2 });
      await expect(
        read({ call: call.id, from_ms: 6_000, to_ms: 9_000, limit: 2, cursor: first.nextCursor }),
      ).rejects.toThrow('channel_read: invalid cursor');
    } finally {
      await close();
    }
  });

  it('matches in the file store as in SQLite', async () => {
    const store = createChannelStore({ rootDir: join(createTempRoot('call-picture-file-'), 'c') });
    const dm = store.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    for (const call of PICTURE_CALLS)
      for (const message of pictureMessages(call))
        await store.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, message);
    const call = PICTURE_CALLS[1];
    const query = {
      from: call.startedAt,
      to: at(call.startedAt, 30_000),
      orderBy: 'time' as const,
      ascending: true,
      callWindow: {
        callId: call.id,
        fromMs: 5_000,
        toMs: 9_000,
        from: at(call.startedAt, 5_000),
        to: at(call.startedAt, 9_000),
      },
    };
    const first = store.queryMessages(dm.id, { ...query, limit: 3 });
    const second = store.queryMessages(dm.id, { ...query, limit: 3, cursor: first.nextCursor! });
    expect([...first.messages, ...second.messages].map((message) => message.id)).toEqual(
      pictureWindowIds(call),
    );
    expect(second.nextCursor).toBeUndefined();
  });
});
