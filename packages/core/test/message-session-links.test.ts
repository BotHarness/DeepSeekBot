import { afterEach, expect, it } from 'vitest';

import type { ChannelLiveFrame } from '../src/channels/live.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createCore } from '../src/plugin.js';
import { createTempRoot } from './helpers.js';

const cores: ReturnType<typeof createCore>[] = [];
const aborts: AbortController[] = [];
afterEach(async () => {
  for (const abort of aborts.splice(0)) abort.abort();
  for (const core of cores.splice(0)) {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

it('adds Session links to a sent Bot message, persists them and pushes the change', async () => {
  const core = createCore({ dshHome: createTempRoot('bh-session-links-') });
  cores.push(core);
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
  await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
    id: 'receipt',
    at: new Date().toISOString(),
    author: { kind: 'bot', slug: 'ada' },
    body: 'Starting both.',
  });
  await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
    id: 'ask',
    at: new Date().toISOString(),
    author: { kind: 'human', id: OWNER_HUMAN_CONTEXT.humanId },
    body: 'Do both',
  } as never);
  const cursor = core.channels.changeCursor!();
  const abort = new AbortController();
  aborts.push(abort);
  const frames = core.live
    .followChannel(OWNER_HUMAN_CONTEXT, dm.id, 0, abort.signal)
    [Symbol.asyncIterator]();
  const notifications: ChannelLiveFrame[] = [];
  const collect = (async () => {
    for (;;) {
      const next = await frames.next();
      if (next.done) return;
      notifications.push(next.value);
    }
  })();

  const first = { sessionId: 'asg-1', kind: 'created' as const, title: 'Research' };
  const second = { sessionId: 'asg-2', kind: 'sent' as const, title: 'Draft' };
  core.channels.addMessageSessionLinks!(dm.id, 'receipt', [first]);
  const linked = core.channels.addMessageSessionLinks!(dm.id, 'receipt', [
    { ...first, kind: 'sent' },
    second,
  ]);
  expect(linked?.sessionLinks).toEqual([first, second]);
  expect(core.channels.message(dm.id, 'receipt')?.sessionLinks).toEqual([first, second]);
  expect(
    core.channels.addMessageSessionLinks!(dm.id, 'ask', [first])?.sessionLinks,
  ).toBeUndefined();
  expect(core.channels.addMessageSessionLinks!(dm.id, 'missing', [first])).toBeUndefined();

  const changes = core.channels.readHumanChanges!(OWNER_HUMAN_CONTEXT, dm.id, {
    sinceSeq: cursor.seq,
    epoch: cursor.epoch,
  })!;
  if (changes.reset) throw new Error('unexpected reset');
  expect(changes.upserts.map((entry) => entry.message.sessionLinks)).toContainEqual([
    first,
    second,
  ]);
  for (let tries = 0; tries < 50 && notifications.length < 3; tries += 1)
    await new Promise((resolve) => setTimeout(resolve, 10));
  expect(notifications).toContainEqual({
    type: 'notification',
    notification: expect.objectContaining({
      kind: 'session-links',
      channelId: dm.id,
      messageId: 'receipt',
      sessionLinks: [first, second],
    }),
  });
  abort.abort();
  await collect.catch(() => undefined);
});
