import type { SavedHost } from './hosts';
import type { HostPush } from './push';
import { parsePushData } from './push';

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export interface NotificationsPort {
  permission(): Promise<PermissionState>;
  request(): Promise<PermissionState>;
  token(): Promise<string>;
  onTokenChanged(listener: () => void): () => void;
  setBadge(count: number): Promise<void>;
  presented(): Promise<Array<{ id: string; data: unknown }>>;
  dismiss(id: string): Promise<void>;
}

export type PushStatus =
  | { status: 'checking' }
  | { status: 'off' }
  | { status: 'denied' }
  | { status: 'unavailable'; reason: string }
  | { status: 'on'; failed: string[] };

export interface PushSession {
  getSnapshot(): PushStatus;
  subscribe(listener: () => void): () => void;
  sync(hosts: readonly SavedHost[]): Promise<void>;
  enable(hosts: readonly SavedHost[]): Promise<void>;
  forget(host: SavedHost): Promise<void>;
  reflect(hostId: string, unresolved: ReadonlySet<string> | undefined, count: number): void;
  reflectAgain(): void;
  stop(): void;
}

const RESOLVABLE = new Set(['tool-approval', 'user-question', 'private-input']);

export function createPushSession(options: {
  notifications: NotificationsPort;
  hostPush: HostPush;
  platform: 'ios' | 'android';
  locale: 'en' | 'zh';
}): PushSession {
  const { notifications, hostPush } = options;
  const listeners = new Set<() => void>();
  let snapshot: PushStatus = { status: 'checking' };
  let latest: readonly SavedHost[] = [];
  let reflected = '';

  const publish = (next: PushStatus): void => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  const registerAll = async (hosts: readonly SavedHost[]): Promise<void> => {
    let token: string;
    try {
      token = await notifications.token();
    } catch (error) {
      publish({
        status: 'unavailable',
        reason: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    const results = await Promise.all(
      hosts.map((host) =>
        hostPush.register(host, { token, platform: options.platform, locale: options.locale }).then(
          () => undefined,
          () => host.hostId,
        ),
      ),
    );
    publish({ status: 'on', failed: results.flatMap((id) => (id === undefined ? [] : [id])) });
  };

  const offToken = notifications.onTokenChanged(() => {
    if (snapshot.status === 'on') void registerAll(latest);
  });

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async sync(hosts) {
      latest = hosts;
      const permission = await notifications.permission().catch(() => 'denied' as const);
      if (permission === 'granted') return registerAll(hosts);
      publish({ status: permission === 'denied' ? 'denied' : 'off' });
    },
    async enable(hosts) {
      latest = hosts;
      const permission = await notifications.request().catch(() => 'denied' as const);
      if (permission === 'granted') return registerAll(hosts);
      publish({ status: permission === 'denied' ? 'denied' : 'off' });
    },
    async forget(host) {
      await hostPush.unregister(host).catch(() => undefined);
    },
    reflect(hostId, unresolved, count) {
      const key = `${hostId}:${String(count)}:${[...(unresolved ?? [])].sort().join(',')}`;
      if (key === reflected) return;
      reflected = key;
      void notifications.setBadge(count).catch(() => undefined);
      if (unresolved === undefined) return;
      void notifications
        .presented()
        .then((shown) =>
          Promise.all(
            shown.flatMap(({ id, data }) => {
              const target = parsePushData(data);
              return target?.hostId === hostId &&
                target.itemId !== undefined &&
                target.kind !== undefined &&
                RESOLVABLE.has(target.kind) &&
                !unresolved.has(target.itemId)
                ? [notifications.dismiss(id)]
                : [];
            }),
          ),
        )
        .catch(() => undefined);
    },
    reflectAgain() {
      reflected = '';
    },
    stop() {
      offToken();
    },
  };
}
