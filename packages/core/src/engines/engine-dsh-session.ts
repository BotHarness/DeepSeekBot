import {
  interruptedTurnClosers,
  type PrepareSessionOptions,
  type Session,
  type SessionEvent,
  type SessionHeader,
  SessionId,
  SessionLogOffset,
  type SessionSeedEventState,
} from '@deepseek-ai/dsh-session';

export interface EngineSessionStore {
  prepare(id: SessionId, options: PrepareSessionOptions): Session;
  enter(session: Session): () => void;
  announce(session: Session): void;
  get(id: SessionId): Session | undefined;
  flush(session: Session): Promise<boolean>;
}

export interface EngineSessionHandle {
  readonly header: SessionHeader;
  readonly inheritedEventCount: SessionLogOffset;
  read(): Promise<{ events: readonly SessionEvent[]; eventState: SessionSeedEventState }>;
  append(events: readonly SessionEvent[]): Promise<void>;
  close(): Promise<void>;
}

export interface EngineSessionPersistence {
  stat(id: SessionId): Promise<unknown>;
  create(
    header: SessionHeader,
    options: { inheritedEventCount: SessionLogOffset },
  ): Promise<EngineSessionHandle>;
  open(id: SessionId, access: 'write'): Promise<EngineSessionHandle>;
}

export interface OpenedEngineDshSession {
  session: Session;
  flush(): Promise<unknown>;
  close(): Promise<void>;
}

export async function openEngineDshSession(
  store: EngineSessionStore,
  persistence: EngineSessionPersistence,
  sessionId: string,
  cwd: string,
): Promise<OpenedEngineDshSession> {
  const id = SessionId(sessionId);
  if (store.get(id) !== undefined)
    throw new Error(`Session ${sessionId} is live in another runner`);
  let handle: EngineSessionHandle | undefined;
  let session: Session;
  try {
    if ((await persistence.stat(id)) !== undefined) {
      handle = await persistence.open(id, 'write');
      const stored = await handle.read();
      const closers = interruptedTurnClosers(stored.events);
      if (closers.length > 0) await handle.append(closers);
      const seed = [...stored.events, ...closers];
      session = store.prepare(id, {
        seed,
        meta: structuredClone(handle.header),
        inheritedEventCount: handle.inheritedEventCount,
        eventState: stored.eventState,
      });
      const marker = session.snapshotEvents(
        SessionLogOffset(seed.length > 0 ? Number(seed.at(-1)!.seq) + 1 : 0),
      );
      if (marker.length > 0) await handle.append(marker);
    } else {
      session = store.prepare(id, { meta: { cwd } });
      handle = await persistence.create(session.header, {
        inheritedEventCount: session.inheritedEventCount,
      });
    }
  } catch (error) {
    await handle?.close().catch(() => undefined);
    throw error;
  }
  const owned = handle;
  let detach: (() => void) | undefined;
  try {
    detach = store.enter(session);
    store.announce(session);
  } catch (error) {
    detach?.();
    await owned.close().catch(() => undefined);
    throw error;
  }
  return {
    session,
    flush: () => store.flush(session),
    close: async () => {
      detach?.();
      detach = undefined;
      await owned.close();
    },
  };
}
