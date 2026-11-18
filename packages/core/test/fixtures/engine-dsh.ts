import {
  Session,
  type SessionEvent,
  type SessionHeader,
  SessionLogOffset,
} from '@deepseek-ai/dsh-session';

import type {
  EngineSessionHandle,
  EngineSessionPersistence,
  EngineSessionStore,
} from '../../src/engines/engine-dsh-session.js';

export function memoryDsh(): {
  store: EngineSessionStore;
  persistence: EngineSessionPersistence;
  stored: Map<string, { header: SessionHeader; events: SessionEvent[] }>;
} {
  const live = new Map<string, Session>();
  const stored = new Map<string, { header: SessionHeader; events: SessionEvent[] }>();
  const handle = (id: string): EngineSessionHandle => {
    const entry = stored.get(id)!;
    return {
      header: entry.header,
      inheritedEventCount: SessionLogOffset(0),
      read: async () => ({ events: structuredClone(entry.events), eventState: 'detached' }),
      append: async (events) => {
        entry.events.push(...structuredClone(events));
      },
      close: async () => undefined,
    };
  };
  return {
    stored,
    store: {
      prepare: (id, options) =>
        options.eventState === undefined
          ? Session.create(id)
          : Session.fromRestore(
              id,
              options.seed,
              options.meta,
              options.inheritedEventCount,
              options.eventState,
            ),
      enter: (session) => {
        live.set(session.id, session);
        return () => live.delete(session.id);
      },
      announce: () => undefined,
      get: (id) => live.get(id),
    },
    persistence: {
      stat: async (id) => stored.get(id),
      create: async (header) => {
        stored.set(header.id, { header, events: [] });
        return handle(header.id);
      },
      open: async (id) => handle(id),
    },
  };
}
