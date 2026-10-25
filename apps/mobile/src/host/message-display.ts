import type { ConversationMessage } from './conversation';
import type { ChannelWireMessage } from './wire';

export function messageForDisplay(message: ConversationMessage): ChannelWireMessage {
  return (
    message.source?.message ?? {
      id: message.id,
      at: message.at,
      body: message.body,
      author:
        message.author === 'bot'
          ? { kind: 'bot', slug: message.bot ?? '' }
          : { kind: message.author },
    }
  );
}

export type MessageDisplayMode = 'streaming' | 'complete';

export function createMessageDisplayPreferences(storage: {
  read(): Promise<unknown>;
  write(mode: MessageDisplayMode): void;
}) {
  let snapshot: { mode: MessageDisplayMode; loaded: boolean; storageError: boolean } = {
    mode: 'streaming',
    loaded: false,
    storageError: false,
  };
  let touched = false;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const persist = () => {
    try {
      storage.write(snapshot.mode);
      snapshot = { ...snapshot, storageError: false };
    } catch {
      snapshot = { ...snapshot, storageError: true };
    }
  };
  const ready = storage
    .read()
    .then(
      (value) => {
        if (!touched && (value === 'complete' || value === 'streaming'))
          snapshot = { ...snapshot, mode: value };
      },
      () => {
        snapshot = { ...snapshot, storageError: true };
      },
    )
    .then(() => {
      snapshot = { ...snapshot, loaded: true };
      if (touched) persist();
      notify();
    });
  return {
    ready,
    getSnapshot: () => snapshot,
    setMode(mode: MessageDisplayMode) {
      touched = true;
      snapshot = { ...snapshot, mode };
      if (snapshot.loaded) persist();
      notify();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
