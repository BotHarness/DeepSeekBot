import { useMemo, useRef, type RefCallback } from 'react';

import type { HostClient } from '../../host/client';
import type { Conversation, ConversationMessage } from '../../host/conversation';
import type { Inbox } from '../../host/inbox';
import { useMounted } from '../mounted';

const SETTLE_MS = 250;

export function readTarget(messages: readonly ConversationMessage[]): string | undefined {
  return messages.findLast((message) => message.delivery === 'committed')?.id;
}

export interface ReadMarker {
  offer(channelId: string, messageId: string | undefined): void;
  stop(): void;
}

export function createReadMarker(
  mark: (channelId: string, messageId: string) => Promise<unknown>,
  settleMs = SETTLE_MS,
): ReadMarker {
  let marked: string | undefined;
  let waiting: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    offer(channelId, messageId) {
      if (messageId === undefined) return;
      const key = `${channelId}\n${messageId}`;
      if (key === marked || key === waiting) return;
      clearTimeout(timer);
      waiting = key;
      timer = setTimeout(() => {
        waiting = undefined;
        marked = key;
        mark(channelId, messageId).catch(() => {
          if (marked === key) marked = undefined;
        });
      }, settleMs);
    },
    stop() {
      clearTimeout(timer);
      waiting = undefined;
    },
  };
}

export function useMarkRead(
  client: Pick<HostClient, 'call'> | undefined,
  inbox: Pick<Inbox, 'refresh'> | undefined,
  conversation: Pick<Conversation, 'getSnapshot' | 'subscribe'> | undefined,
  channelId: string | undefined,
  atLatest: boolean,
): RefCallback<unknown> {
  const following = useRef(atLatest);
  following.current = atLatest;
  const marker = useMemo(
    () =>
      client === undefined
        ? undefined
        : createReadMarker((id, messageId) =>
            client
              .call('channelMarkRead', { channelId: id, messageId })
              .then(() => inbox?.refresh()),
          ),
    [client, inbox],
  );
  return useMounted<unknown>(() => {
    if (marker === undefined || conversation === undefined || channelId === undefined) return;
    const offer = (): void => {
      if (following.current)
        marker.offer(channelId, readTarget(conversation.getSnapshot().messages));
    };
    offer();
    const unsubscribe = conversation.subscribe(offer);
    return () => {
      unsubscribe();
      marker.stop();
    };
  }, [marker, conversation, channelId]);
}
