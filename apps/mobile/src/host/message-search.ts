import { useCallback, useRef, useState } from 'react';

import { searchMessages } from '@botharness/host-client/channel-messages';
import type { HostClient } from '@botharness/host-client/client';
import { hostStore, hostStoreAvailable } from './host-store';
import { searchStoredMessages } from './local-message-search';

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

export type MessageSearchHost = {
  hostId: string;
  client: Pick<HostClient, 'call'>;
  offline?: boolean;
};

export type MessageSearchState = {
  query: string;
  hits: readonly MessageSearchHit[];
  loading: boolean;
};

const IDLE: MessageSearchState = { query: '', hits: [], loading: false };

function newestFirst(hits: MessageSearchHit[]): MessageSearchHit[] {
  return hits
    .sort((left, right) => Date.parse(right.at) - Date.parse(left.at))
    .slice(0, MESSAGE_SEARCH_LIMIT);
}

type SearchedMessage = { id: string; at: string; author: MessageSearchAuthor };

function searchedMessage(value: unknown): SearchedMessage | undefined {
  const message = value as { id?: unknown; at?: unknown; author?: unknown } | null | undefined;
  const author = message?.author as MessageSearchAuthor | undefined;
  return typeof message?.id === 'string' &&
    typeof message.at === 'string' &&
    typeof author?.kind === 'string'
    ? { id: message.id, at: message.at, author }
    : undefined;
}

export async function searchHostMessages(
  hosts: readonly MessageSearchHost[],
  text: string,
): Promise<MessageSearchHit[]> {
  const pages = await Promise.allSettled(
    hosts
      .filter((host) => host.offline !== true)
      .map(async ({ hostId, client }) =>
        (
          await searchMessages(client, { text, limit: MESSAGE_SEARCH_LIMIT }, searchedMessage)
        ).hits.map(({ channelId, message, snippet }) => ({
          hostId,
          channelId,
          messageId: message.id,
          at: message.at,
          author: message.author,
          snippet,
        })),
      ),
  );
  return newestFirst(pages.flatMap((page) => (page.status === 'fulfilled' ? page.value : [])));
}

export type LocalMessageSearch = (
  hostId: string,
  text: string,
  limit: number,
) => Promise<MessageSearchHit[]>;

const storedSearch: LocalMessageSearch = async (hostId, text, limit) => {
  if (!hostStoreAvailable()) return [];
  const hits = await searchStoredMessages(await hostStore(hostId), text, limit);
  return hits.map(({ channelId, entry, snippet }) => ({
    hostId,
    channelId,
    messageId: entry.message.id,
    at: entry.message.at,
    author: entry.message.author as MessageSearchAuthor,
    snippet,
  }));
};

export async function searchLocalMessages(
  hosts: readonly Pick<MessageSearchHost, 'hostId'>[],
  text: string,
  search: LocalMessageSearch = storedSearch,
): Promise<MessageSearchHit[]> {
  const pages = await Promise.allSettled(
    hosts.map(({ hostId }) => search(hostId, text, MESSAGE_SEARCH_LIMIT)),
  );
  return newestFirst(pages.flatMap((page) => (page.status === 'fulfilled' ? page.value : [])));
}

export function mergeMessageHits(
  local: readonly MessageSearchHit[],
  remote: readonly MessageSearchHit[],
): MessageSearchHit[] {
  const key = (hit: MessageSearchHit) =>
    `${hit.hostId}\u0000${hit.channelId}\u0000${hit.messageId}`;
  const seen = new Set(remote.map(key));
  return newestFirst([...remote, ...local.filter((hit) => !seen.has(key(hit)))]);
}

export function useMessageSearch(): {
  state: MessageSearchState;
  schedule(text: string, hosts: readonly MessageSearchHost[]): void;
  cancel(): void;
} {
  const [state, setState] = useState<MessageSearchState>(IDLE);
  const sequence = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancel = useCallback(() => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = undefined;
    sequence.current++;
  }, []);
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
      let remote: MessageSearchHit[] | undefined;
      const local = searchLocalMessages(hosts, trimmed).then((hits) => {
        if (current === sequence.current && remote === undefined)
          setState({ query: trimmed, hits, loading: true });
        return hits;
      });
      void searchHostMessages(hosts, trimmed).then(async (hits) => {
        remote = hits;
        const stored = await local;
        if (current === sequence.current)
          setState({ query: trimmed, hits: mergeMessageHits(stored, hits), loading: false });
      });
    }, MESSAGE_SEARCH_DEBOUNCE_MS);
  }, []);
  return { state, schedule, cancel };
}
