import type { HostClient } from './client';
import type { BotInboxItem, BotInboxPage } from './wire';

export const BOT_INBOX_PAGE = 30;

export type BotInboxSnapshot =
  | { status: 'loading'; items: BotInboxItem[] }
  | { status: 'ready'; items: BotInboxItem[]; nextCursor?: string }
  | { status: 'failed'; items: BotInboxItem[]; error: string; cursor?: string };

export interface BotInbox {
  getSnapshot(): BotInboxSnapshot;
  subscribe(listener: () => void): () => void;
  load(cursor?: string): Promise<void>;
  close(): void;
}

export function createBotInbox(client: Pick<HostClient, 'call'>, slug: string): BotInbox {
  const listeners = new Set<() => void>();
  let snapshot: BotInboxSnapshot = { status: 'loading', items: [] };
  let request = 0;
  const set = (next: BotInboxSnapshot): void => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async load(cursor) {
      const current = ++request;
      const kept = cursor === undefined ? [] : snapshot.items;
      set({ status: 'loading', items: kept });
      try {
        const page = await client.call<BotInboxPage>('botAttention', {
          slug,
          limit: BOT_INBOX_PAGE,
          ...(cursor === undefined ? {} : { cursor }),
        });
        if (current !== request) return;
        const seen = new Set(kept.map((item) => item.id));
        set({
          status: 'ready',
          items: [...kept, ...page.items.filter((item) => !seen.has(item.id))],
          ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
        });
      } catch (error) {
        if (current !== request) return;
        set({
          status: 'failed',
          items: kept,
          error: error instanceof Error ? error.message : String(error),
          ...(cursor === undefined ? {} : { cursor }),
        });
      }
    },
    close() {
      request++;
      listeners.clear();
    },
  };
}

export function inboxOrder(items: readonly BotInboxItem[], messageId: string | undefined) {
  return messageId === undefined
    ? [...items]
    : [
        ...items.filter((item) => item.sourceMessageId === messageId),
        ...items.filter((item) => item.sourceMessageId !== messageId),
      ];
}
