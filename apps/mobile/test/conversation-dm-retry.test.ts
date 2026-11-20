import { afterEach, expect, it, vi } from 'vitest';
import type { HostClient } from '@botharness/host-client/client';
import { createConversation, type Conversation } from '@botharness/host-client/conversation';

let conversation: Conversation | undefined;
afterEach(() => {
  conversation?.stop();
  vi.useRealTimers();
});

it('backs off when the DM cannot be opened instead of asking every second', async () => {
  vi.useFakeTimers();
  const calls: string[] = [];
  const host = {
    call: vi.fn(async (method: string) => {
      calls.push(method);
      throw new Error('The DM could not be opened.');
    }),
    follow: vi.fn(() => () => {}),
    subscribe: () => () => {},
    getSnapshot: () => ({ connection: { status: 'connected', route: 'r' } }),
    onLive: () => () => {},
  } as unknown as HostClient;
  conversation = createConversation({ host, botSlug: 'bot-a', pageSize: 10 });
  conversation.start();
  await vi.advanceTimersByTimeAsync(60_000);
  const opens = calls.filter((method) => method === 'channelDm').length;
  expect(opens).toBeGreaterThan(1);
  expect(opens).toBeLessThanOrEqual(7);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(calls.filter((method) => method === 'channelDm').length - opens).toBeLessThanOrEqual(2);
  expect(conversation.getSnapshot().status).toBe('interrupted');
});
