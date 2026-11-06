import type { SavedHost } from './hosts';
import type { HostPush } from './push';
import { parsePushData } from './push';

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export interface NotificationsPort {
  permission(): Promise<PermissionState>;
  request(): Promise<PermissionState>;
  token(): Promise<string>;
  onTokenChanged(
    listener: (resolveToken: () => Promise<string>, nativeToken?: string) => void,
  ): () => void;
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
  retryFailed(): Promise<void>;
  refreshPermission(): Promise<void>;
  reflect(hostId: string, unresolved: ReadonlySet<string> | undefined, count: number): void;
  reflectAgain(): void;
  stop(): void;
}

const TOKEN_TIMEOUT_MS = 20_000;
const RESOLVABLE = new Set(['tool-approval', 'user-question', 'private-input']);

export function createPushSession(options: {
  notifications: NotificationsPort;
  hostPush: HostPush;
  platform: 'ios' | 'android';
  locale: 'en' | 'zh';
  tokenTimeoutMs?: number;
  beforeRegister?: () => Promise<void>;
  prepareRegistration?: (host: SavedHost) => Promise<void>;
}): PushSession {
  const { notifications, hostPush } = options;
  const listeners = new Set<() => void>();
  let snapshot: PushStatus = { status: 'checking' };
  let latest: readonly SavedHost[] = [];
  let reflected = '';
  let retrying: Promise<void> | undefined;
  let generation = 0;
  let permissionRead = 0;
  let stopped = false;
  let granted = false;
  let fetching = 0;
  let seenToken: string | undefined;
  const registrations = new Map<string, Promise<unknown>>();

  const publish = (next: PushStatus): void => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  const registerAll = async (
    hosts: readonly SavedHost[],
    resolveToken: () => Promise<string> = () => notifications.token(),
  ): Promise<void> => {
    if (stopped) return;
    const attempt = ++generation;
    const current = () => !stopped && attempt === generation;
    if (snapshot.status === 'denied' || snapshot.status === 'off') publish({ status: 'checking' });
    try {
      await options.beforeRegister?.();
    } catch {
      if (current())
        publish({ status: 'unavailable', reason: 'notification-preferences-unavailable' });
      return;
    }
    if (!current()) return;
    let token: string;
    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      fetching++;
      token = await Promise.race([
        resolveToken(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('push-token-timeout')),
            options.tokenTimeoutMs ?? TOKEN_TIMEOUT_MS,
          );
        }),
      ]).finally(() => {
        fetching--;
        clearTimeout(timer);
      });
    } catch (error) {
      if (!current()) return;
      publish({
        status: 'unavailable',
        reason: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    if (!current()) return;
    const results = await Promise.all(
      hosts.map((host) => {
        const work = (registrations.get(host.hostId) ?? Promise.resolve())
          .catch(() => undefined)
          .then(async () => {
            if (!current()) return;
            await options.prepareRegistration?.(host);
            if (!current()) return;
            return hostPush.register(host, {
              token,
              platform: options.platform,
              locale: options.locale,
              ...(options.platform === 'android' ? { render: 'app' as const } : {}),
            });
          });
        registrations.set(host.hostId, work);
        return work
          .then(
            () => undefined,
            () => host.hostId,
          )
          .finally(() => {
            if (registrations.get(host.hostId) === work) registrations.delete(host.hostId);
          });
      }),
    );
    if (current())
      publish({ status: 'on', failed: results.flatMap((id) => (id === undefined ? [] : [id])) });
  };

  const offToken = notifications.onTokenChanged((resolveToken, nativeToken) => {
    const unchanged = nativeToken !== undefined && nativeToken === seenToken;
    const replaced =
      nativeToken !== undefined && seenToken !== undefined && nativeToken !== seenToken;
    if (nativeToken !== undefined) seenToken = nativeToken;
    if (fetching > 0 && nativeToken !== undefined && !replaced) return;
    if (unchanged && snapshot.status !== 'unavailable') return;
    if (granted && !stopped) void registerAll(latest, resolveToken);
  });

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async sync(hosts) {
      latest = hosts;
      const read = ++permissionRead;
      const permission = await notifications.permission().catch(() => 'denied' as const);
      if (stopped || read !== permissionRead) return;
      granted = permission === 'granted';
      if (permission === 'granted') return registerAll(hosts);
      generation++;
      publish({ status: permission === 'denied' ? 'denied' : 'off' });
    },
    async enable(hosts) {
      latest = hosts;
      const read = ++permissionRead;
      const permission = await notifications.request().catch(() => 'denied' as const);
      if (stopped || read !== permissionRead) return;
      granted = permission === 'granted';
      if (permission === 'granted') return registerAll(hosts);
      generation++;
      publish({ status: permission === 'denied' ? 'denied' : 'off' });
    },
    async forget(host) {
      latest = latest.filter((entry) => entry.hostId !== host.hostId);
      reflected = '';
      const cleared = notifications
        .presented()
        .then((shown) =>
          Promise.all(
            shown.flatMap(({ id, data }) =>
              parsePushData(data)?.hostId === host.hostId ? [notifications.dismiss(id)] : [],
            ),
          ),
        )
        .catch(() => undefined);
      const badge = latest.length === 0 ? notifications.setBadge(0).catch(() => undefined) : null;
      await Promise.all([cleared, badge, hostPush.unregister(host).catch(() => undefined)]);
    },
    async refreshPermission() {
      const read = ++permissionRead;
      const permission = await notifications.permission().catch(() => 'denied' as const);
      if (stopped || read !== permissionRead) return;
      const changed = granted !== (permission === 'granted');
      granted = permission === 'granted';
      if (!granted) {
        generation++;
        publish({ status: permission === 'denied' ? 'denied' : 'off' });
        return;
      }
      if (changed || snapshot.status === 'unavailable' || snapshot.status === 'checking')
        return registerAll(latest);
      return this.retryFailed();
    },
    retryFailed() {
      if (retrying !== undefined) return retrying;
      if (snapshot.status !== 'on') return Promise.resolve();
      const failed = new Set(snapshot.failed);
      const hosts = latest.filter((entry) => failed.has(entry.hostId));
      if (hosts.length === 0) return Promise.resolve();
      retrying = registerAll(latest).finally(() => {
        retrying = undefined;
      });
      return retrying;
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
      stopped = true;
      generation++;
      offToken();
    },
  };
}
