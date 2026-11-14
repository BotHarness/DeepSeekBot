import { useSyncExternalStore } from 'react';

import type { ChannelAuthor } from './store.js';

export const OWNER_HUMAN_ID = 'local-human';

let self = OWNER_HUMAN_ID;
const listeners = new Set<() => void>();

export function setSelfHumanId(humanId: string): void {
  if (humanId === self || humanId.length === 0) return;
  self = humanId;
  for (const listener of listeners) listener();
}

export function selfHumanId(): string {
  return self;
}

export function useSelfHumanId(): string {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => self,
    () => OWNER_HUMAN_ID,
  );
}

export function humanIdOf(author: ChannelAuthor): string | undefined {
  return author.kind === 'human' ? (author.humanId ?? OWNER_HUMAN_ID) : undefined;
}
