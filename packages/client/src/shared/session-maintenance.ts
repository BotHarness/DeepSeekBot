export type SessionMaintenanceAction = 'compact' | 'new-session';
export type SessionMaintenanceNotice =
  | 'new'
  | 'compacted'
  | 'nothing'
  | 'busy'
  | 'failed'
  | 'unsaved'
  | 'unavailable';
export interface SessionMaintenancePort {
  compact(slug: string): Promise<unknown>;
  newSession(slug: string): Promise<unknown>;
}
export function createSessionMaintenance(
  channelId: string | undefined,
  botSlug: string | undefined,
  port: SessionMaintenancePort,
) {
  const available = !!botSlug && channelId === `dm-${botSlug}`;
  let state: {
    pending: SessionMaintenanceAction | undefined;
    notice: SessionMaintenanceNotice | undefined;
  } = { pending: undefined, notice: undefined };
  let pending: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: typeof state) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const run = (action: SessionMaintenanceAction): Promise<void> => {
    if (pending) return pending;
    if (!available || !botSlug) {
      publish({ pending: undefined, notice: 'unavailable' });
      return Promise.resolve();
    }
    pending = Promise.resolve().then(async () => {
      let notice: SessionMaintenanceNotice = 'failed';
      try {
        if (action === 'new-session') {
          await port.newSession(botSlug);
          notice = 'new';
        } else {
          const result = await port.compact(botSlug);
          if (
            result &&
            typeof result === 'object' &&
            'outcome' in result &&
            (result.outcome === 'compacted' ||
              result.outcome === 'nothing' ||
              result.outcome === 'busy')
          )
            notice = result.outcome;
        }
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
        if (code === 'bot-busy') notice = 'busy';
        else if (code === 'session-unsaved') notice = 'unsaved';
      } finally {
        pending = undefined;
        publish({ pending: undefined, notice });
      }
    });
    publish({ pending: action, notice: undefined });
    return pending;
  };
  return {
    available,
    run,
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const owners = new WeakMap<object, Map<string, ReturnType<typeof createSessionMaintenance>>>();
export function sessionMaintenanceFor(
  owner: object,
  channelId: string | undefined,
  botSlug: string | undefined,
  port: SessionMaintenancePort,
) {
  let sessions = owners.get(owner);
  if (!sessions) {
    sessions = new Map();
    owners.set(owner, sessions);
  }
  const key = JSON.stringify([channelId, botSlug]);
  let controller = sessions.get(key);
  if (!controller) {
    controller = createSessionMaintenance(channelId, botSlug, port);
    sessions.set(key, controller);
  }
  return controller;
}
