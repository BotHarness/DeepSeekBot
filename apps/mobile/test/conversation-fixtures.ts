import { createHostClient, type HostClient } from '@botharness/host-client/client';
import { vi } from 'vitest';
import {
  createConversation,
  type Conversation,
  type ConversationSnapshot,
} from '@botharness/host-client/conversation';
import type { FakeChannel, FakeHost } from '../../../packages/host-client/test/fake-host.js';

export const ROUTE = 'https://studio.tailnet-example.ts.net';

export const SLUG = 'bot-59296301f8d044d2b022d8784c5ed3fe';

export const DM = `dm-${SLUG}`;

export function seed(channel: FakeChannel, count: number): void {
  for (let index = 1; index <= count; index += 1)
    channel.append(
      index % 2 === 1
        ? { id: `human-${index}`, body: `question ${index}`, author: { kind: 'human' } }
        : { id: `bot-${index}`, body: `answer ${index}`, author: { kind: 'bot', slug: SLUG } },
      false,
    );
}

export async function until(
  target: Conversation,
  accept: (snapshot: ConversationSnapshot) => boolean,
): Promise<ConversationSnapshot> {
  for (let tries = 0; tries < 300; tries += 1) {
    const snapshot = target.getSnapshot();
    if (accept(snapshot)) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out; last snapshot ${JSON.stringify(target.getSnapshot())}`);
}

export const ids = (snapshot: ConversationSnapshot) =>
  snapshot.messages.map((message) => message.id);

export const revisions = (snapshot: ConversationSnapshot) =>
  snapshot.messages.map((message) => message.revision);

export function contiguous(snapshot: ConversationSnapshot): boolean {
  const list = revisions(snapshot).filter((value) => value !== undefined);
  return list.every((value, index) => index === 0 || value === list[index - 1]! + 1);
}

export let client: HostClient | undefined;
let conversation: Conversation | undefined;

export function stopConversation() {
  conversation?.stop();
  client?.stop();
  vi.useRealTimers();
}

export function open(
  host: FakeHost,
  {
    noChannel,
    ...options
  }: Partial<Parameters<typeof createConversation>[0]> & { noChannel?: true } = {},
): Conversation {
  client = createHostClient({
    routes: [ROUTE],
    credential: host.credential,
    carrier: host.carrier,
    backoff: () => 5,
    timeoutMs: 200,
  });
  client.start();
  let next = 0;
  conversation = createConversation({
    host: client,
    botSlug: SLUG,
    displayName: 'Mobile Probe',
    ...(noChannel ? {} : { channelId: DM }),
    pageSize: 10,
    olderPageSize: 8,
    messageId: () => `human-00000000-0000-4000-8000-${String(++next).padStart(12, '0')}`,
    ...options,
  });
  conversation.start();
  return conversation;
}
