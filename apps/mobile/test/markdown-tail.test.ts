import { afterEach, expect, it, vi } from 'vitest';
import { createHostClient, type HostClient } from '../src/host/client';
import { createConversation, type Conversation } from '../src/host/conversation';
import {
  createConversationPlayback,
  type ConversationPlayback,
} from '../src/host/conversation-playback';
import { FakeHost } from './fake-host';
import body from './fixtures/markdown-tail.json';

const slug = 'bot-59296301f8d044d2b022d8784c5ed3fe';
const dm = `dm-${slug}`;
let client: HostClient;
let conversation: Conversation;
let playback: ConversationPlayback;
let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  conversation?.stop();
  client?.stop();
  vi.useRealTimers();
});
async function until(accept: () => boolean) {
  for (let i = 0; i < 200; i++) {
    if (accept()) return;
    await vi.advanceTimersByTimeAsync(10);
  }
  expect(accept(), 'transport reaches the requested checkpoint').toBe(true);
}

it.each([
  'entry-first',
  'settled-first',
  'commit-offline',
  'reconnect-draft',
  'held-history',
  'lost-append',
] as const)('retains the complete mixed Markdown suffix without reopening: %s', async (mode) => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  expect(body.length).toBe(4504);
  const host = new FakeHost();
  const channel = host.channel(dm);
  client = createHostClient({
    routes: ['https://studio.tailnet-example.ts.net'],
    credential: host.credential,
    carrier: host.carrier,
    backoff: () => 5,
    timeoutMs: 200,
  });
  conversation = createConversation({
    host: client,
    botSlug: slug,
    displayName: 'Tail replay',
    channelId: dm,
    draftDelayMs: 0,
  });
  playback = createConversationPlayback(conversation);
  stop = playback.subscribe(() => {});
  client.start();
  conversation.start();
  await until(() => conversation.getSnapshot().status === 'live');
  const prefix = body.slice(0, body.indexOf('\n最后一段'));
  const draft = {
    channelId: dm,
    draftId: 'draft-tail',
    attemptId: 'attempt-tail',
    botSlug: slug,
    revision: 1,
    body: prefix,
  };
  channel.emit({ type: 'notification', notification: { kind: 'draft', draft } });
  await until(() => conversation.getSnapshot().drafts[0]?.body === prefix);
  await vi.advanceTimersByTimeAsync(120_000);
  if (mode === 'held-history') playback.setFollowing(false);
  if (mode === 'commit-offline' || mode === 'reconnect-draft') {
    host.kill();
    await vi.advanceTimersByTimeAsync(50);
  }
  if (mode === 'reconnect-draft') {
    channel.baselineDrafts = [{ ...draft, revision: 2, body }];
    host.restart();
    await until(() => conversation.getSnapshot().drafts[0]?.body === body);
  }
  if (mode === 'lost-append') {
    channel.baselineDrafts = [{ ...draft, revision: 3, body }];
    channel.emit({
      type: 'notification',
      notification: {
        kind: 'draft-append',
        append: {
          draftId: draft.draftId,
          revision: 3,
          base: 2,
          offset: prefix.length,
          append: body.slice(prefix.length),
        },
      },
    });
    await until(() => conversation.getSnapshot().drafts[0]?.body === body);
  }
  const settle = () =>
    channel.emit({
      type: 'notification',
      notification: { kind: 'draft-settled', event: { ...draft, revision: 4 } },
    });
  if (mode === 'settled-first') {
    settle();
    await vi.advanceTimersByTimeAsync(300);
  }
  channel.append(
    { id: 'committed-tail', body, author: { kind: 'bot', slug } },
    mode !== 'commit-offline',
  );
  if (mode === 'commit-offline') {
    channel.baselineDrafts = [];
    host.restart();
  }
  await until(() => conversation.getSnapshot().messages.some((m) => m.id === 'committed-tail'));
  if (mode === 'held-history') {
    const key = playback.rowKey('committed-tail');
    const bubble = playback.getBubble(key);
    expect(bubble).toBeDefined();
    const held = bubble!.message.body;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(playback.getBubble(key)?.message.body).toBe(held);
    playback.setFollowing(true);
  }
  await vi.advanceTimersByTimeAsync(300);
  settle();
  await vi.advanceTimersByTimeAsync(120_000);
  const canonical = conversation.getSnapshot().messages.find((m) => m.id === 'committed-tail')!;
  expect(canonical.body).toBe(body);
  const shown = playback.getBubble(playback.rowKey(canonical.id));
  expect(shown?.message.body ?? canonical.body, JSON.stringify(playback.diagnostics())).toBe(body);
  expect(shown?.streaming ?? false).toBe(false);
  expect(conversation.getSnapshot().drafts).toEqual([]);
});
