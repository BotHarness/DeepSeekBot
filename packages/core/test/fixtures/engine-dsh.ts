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
  const writers = new Map<string, EngineSessionHandle>();
  const routed = new Map<string, number>();
  const handle = (id: string): EngineSessionHandle => {
    const entry = stored.get(id)!;
    return {
      header: entry.header,
      inheritedEventCount: SessionLogOffset(0),
      read: async () => ({ events: structuredClone(entry.events), eventState: 'detached' }),
      append: async (events) => {
        events.forEach((event, index) => {
          if (Number(event.seq) !== entry.events.length + index)
            throw new Error(
              `append seq mismatch: expected ${entry.events.length + index}, got ${event.seq}`,
            );
        });
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
        routed.set(session.id, Number(session.seq));
        return () => live.delete(session.id);
      },
      announce: () => undefined,
      get: (id) => live.get(id),
      flush: async (session) => {
        const writer = writers.get(session.id);
        if (writer === undefined) return false;
        const from = routed.get(session.id) ?? 0;
        await writer.append(session.snapshotEvents(SessionLogOffset(from)));
        routed.set(session.id, Number(session.seq));
        return true;
      },
    },
    persistence: {
      stat: async (id) => stored.get(id),
      create: async (header) => {
        stored.set(header.id, { header, events: [] });
        writers.set(header.id, handle(header.id));
        return writers.get(header.id)!;
      },
      open: async (id) => {
        writers.set(id, handle(id));
        return writers.get(id)!;
      },
    },
  };
}
