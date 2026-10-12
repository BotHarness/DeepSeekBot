import { useSyncExternalStore, type Dispatch, type SetStateAction } from 'react';

import type { SelectedMention } from './mentions.js';
import type { SelectedChannelRef } from './channel-refs.js';
import type { ChannelMessage, ClientState } from './store.js';
import type { ChannelComposerUpload } from './channel-composer.js';

interface ComposerDraft {
  text: string;
  mentions: SelectedMention[];
  channelRefs: SelectedChannelRef[];
  reply: ChannelMessage | undefined;
  uploads: ChannelComposerUpload[];
}

const drafts = new Map<string, ComposerDraft>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function conversationDraftKey(state: ClientState): string {
  const selection = state.selection;
  if (selection?.kind === 'bot') return `bot:${selection.slug}`;
  if (selection?.kind === 'channel') {
    const channel = state.channels.find((item) => item.id === selection.channelId);
    if (channel?.type === 'dm' && channel.botSlug !== undefined) return `bot:${channel.botSlug}`;
    return `channel:${selection.channelId}`;
  }
  return 'none';
}

export function clearConversationDrafts(): void {
  drafts.clear();
}

export function useConversationDraft<Key extends keyof ComposerDraft>(
  scope: string,
  field: Key,
  initial: ComposerDraft[Key],
): [ComposerDraft[Key], Dispatch<SetStateAction<ComposerDraft[Key]>>] {
  if (!drafts.has(scope))
    drafts.set(scope, { text: '', mentions: [], channelRefs: [], reply: undefined, uploads: [] });
  const snapshot = (): ComposerDraft[Key] => drafts.get(scope)?.[field] ?? initial;
  const value = useSyncExternalStore(subscribe, snapshot, snapshot);
  const update: Dispatch<SetStateAction<ComposerDraft[Key]>> = (next) => {
    const previous = snapshot();
    const resolved = typeof next === 'function' ? next(previous) : next;
    const draft = drafts.get(scope) ?? {
      text: '',
      mentions: [],
      channelRefs: [],
      reply: undefined,
      uploads: [],
    };
    drafts.set(scope, { ...draft, [field]: resolved });
    for (const listener of listeners) listener();
  };
  return [value, update];
}
