import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import type { HostClient } from './client';

export const MESSAGE_SEARCH_DEBOUNCE_MS = 150;
export const MESSAGE_SEARCH_LIMIT = 20;

export type MessageSearchAuthor =
  | { kind: 'human' }
  | { kind: 'system' }
  | { kind: 'bot'; slug: string }
  | { kind: 'bridged'; source: string };

export type MessageSearchHit = {
  hostId: string;
  channelId: string;
  messageId: string;
  at: string;
  author: MessageSearchAuthor;
  snippet: string;
};

export type MessageSearchHost = { hostId: string; client: Pick<HostClient, 'call'> };

export type MessageSearchState = {
  query: string;
  hits: readonly MessageSearchHit[];
  loading: boolean;
};

const IDLE: MessageSearchState = { query: '', hits: [], loading: false };

function hitsOf(hostId: string, value: unknown): MessageSearchHit[] {
  const hits = (value as { hits?: unknown } | null)?.hits;
  if (!Array.isArray(hits)) return [];
  return hits.flatMap((entry) => {
    const hit = entry as {
      channelId?: unknown;
      snippet?: unknown;
      message?: { id?: unknown; at?: unknown; author?: unknown };
    };
    const author = hit.message?.author as MessageSearchAuthor | undefined;
    return typeof hit.channelId === 'string' &&
      typeof hit.snippet === 'string' &&
      typeof hit.message?.id === 'string' &&
      typeof hit.message.at === 'string' &&
      typeof author?.kind === 'string'
      ? [
          {
            hostId,
            channelId: hit.channelId,
            messageId: hit.message.id,
            at: hit.message.at,
            author,
            snippet: hit.snippet,
          },
        ]
      : [];
  });
}

export async function searchHostMessages(
  hosts: readonly MessageSearchHost[],
  text: string,
): Promise<MessageSearchHit[]> {
  const pages = await Promise.allSettled(
    hosts.map(async ({ hostId, client }) =>
      hitsOf(
        hostId,
        await client.call<unknown>('messageSearch', { text, limit: MESSAGE_SEARCH_LIMIT }),
      ),
    ),
  );
  return pages
    .flatMap((page) => (page.status === 'fulfilled' ? page.value : []))
    .sort((left, right) => Date.parse(right.at) - Date.parse(left.at))
    .slice(0, MESSAGE_SEARCH_LIMIT);
}

export function useMessageSearch(): {
  state: MessageSearchState;
  schedule(text: string, hosts: readonly MessageSearchHost[]): void;
} {
  const [state, setState] = useState<MessageSearchState>(IDLE);
  const sequence = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const schedule = useCallback((text: string, hosts: readonly MessageSearchHost[]) => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = undefined;
    const current = ++sequence.current;
    const trimmed = text.trim();
    if (trimmed === '' || hosts.length === 0) {
      setState(IDLE);
      return;
    }
    setState({ query: trimmed, hits: [], loading: true });
    timer.current = setTimeout(() => {
      timer.current = undefined;
      void searchHostMessages(hosts, trimmed).then((hits) => {
        if (current === sequence.current) setState({ query: trimmed, hits, loading: false });
      });
    }, MESSAGE_SEARCH_DEBOUNCE_MS);
  }, []);
  useLayoutEffect(
    () => () => {
      sequence.current++;
      if (timer.current !== undefined) clearTimeout(timer.current);
    },
    [],
  );
  return { state, schedule };
}
