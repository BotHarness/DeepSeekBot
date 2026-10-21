import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  parseNotificationPreferences,
} from '../../../../apps/mobile/src/host/device-notification-preferences.js';
import {
  PUSH_KINDS,
  type PushKind,
  type PushPreferences,
} from '../../../../apps/mobile/src/host/push.js';
import type { HumanAttentionItem } from '../../../../apps/mobile/src/host/wire.js';
import type { RemoteHost, HostStorage, RemoteConversationTarget } from './remote-hosts.js';
import {
  noticeBody,
  type DesktopNotificationApi,
  type DesktopNotificationHandle,
  type DesktopNotificationPermission,
} from './desktop-notifications.js';

export const REMOTE_NOTIFICATION_KEY = 'botharness.remoteNotifications.v1';
type Choice = { enabled: boolean; preferences: PushPreferences };
type ControlRequest = { expiresAt: number; signal: AbortSignal };
function checkRequest(request?: ControlRequest): void {
  if (request === undefined) return;
  if (request.signal.aborted) throw new Error('notification-activation-cancelled');
  if (!Number.isFinite(request.expiresAt) || Date.now() >= request.expiresAt)
    throw new Error('appearance-request-stale');
}
type Snapshot = {
  hosts: Readonly<Record<string, Choice>>;
  permission: DesktopNotificationPermission;
};
const off: Choice = { enabled: false, preferences: DEFAULT_NOTIFICATION_PREFERENCES };
type NotificationDiagnostic =
  | 'remote-notification-show-refused'
  | 'remote-notification-show-failed';
function reportDiagnostic(code: NotificationDiagnostic): void {
  if (typeof window !== 'undefined')
    window.dispatchEvent(new CustomEvent('botharness:notification-diagnostic', { detail: code }));
}
const kinds: Record<string, PushKind> = {
  'tool-approval': 'approval',
  'workspace-grant-request': 'approval',
  'auto-rejection': 'approval',
  'group-join-request': 'approval',
  'assignment-waiting-human': 'question',
  'assignment-blocked': 'question',
  'user-question': 'question',
  'private-input': 'private-input',
  'channel-reply': 'reply',
  'channel-mention': 'reply',
};

export function createRemoteNotifications(options: {
  storage?: HostStorage | undefined;
  api?: DesktopNotificationApi | undefined;
  open(target: RemoteConversationTarget): void;
  privateBody(): string;
  prepareEnable(hostId: string, signal: AbortSignal): Promise<void>;
  diagnostic?(code: NotificationDiagnostic): void;
}) {
  const { api, storage } = options;
  let hosts: Record<string, Choice> = {};
  try {
    const saved: unknown = JSON.parse(storage?.getItem(REMOTE_NOTIFICATION_KEY) ?? '{}');
    if (typeof saved === 'object' && saved !== null)
      for (const [id, value] of Object.entries(saved)) {
        const entry = value as Partial<Choice> | null;
        const preferences = parseNotificationPreferences(entry?.preferences);
        if (preferences && typeof entry?.enabled === 'boolean')
          hosts[id] = { enabled: entry.enabled, preferences };
      }
  } catch {}
  let snapshot: Snapshot = { hosts, permission: api?.permission() ?? 'unsupported' };
  const listeners = new Set<() => void>();
  const reported = new Set<NotificationDiagnostic>();
  const state = new Map<
    string,
    {
      credential: string;
      inbox: RemoteHost['inbox'];
      baseline: boolean;
      high: string;
      seen: Set<string>;
    }
  >();
  const shown = new Map<string, { hostId: string; handle: DesktopNotificationHandle }>();
  const revisions = new Map<string, number>();
  const pending = new Map<string, AbortController>();
  const cancel = (hostId?: string) => {
    for (const [id, controller] of pending) {
      if (hostId !== undefined && id !== hostId) continue;
      controller.abort(new Error('notification-activation-cancelled'));
      pending.delete(id);
    }
  };
  const wait = <T>(work: Promise<T>, signal: AbortSignal): Promise<T> =>
    new Promise((resolve, reject) => {
      const abort = () => {
        signal.removeEventListener('abort', abort);
        reject(signal.reason);
      };
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      void work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
  const publish = () => {
    snapshot = { hosts, permission: api?.permission() ?? 'unsupported' };
    for (const listener of listeners) listener();
  };
  const close = (hostId?: string) => {
    for (const [key, notice] of shown) {
      if (hostId !== undefined && notice.hostId !== hostId) continue;
      notice.handle.onclick = null;
      notice.handle.close();
      shown.delete(key);
    }
  };
  const choice = (hostId: string) => hosts[hostId] ?? off;
  const owner = {
    getSnapshot: () => snapshot,
    choice,
    cancel,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async set(
      hostId: string,
      patch: { enabled?: boolean; preferences?: Partial<PushPreferences> },
      request?: ControlRequest,
    ) {
      checkRequest(request);
      cancel(hostId);
      const controller = new AbortController();
      const abortRequest = () => controller.abort(new Error('notification-activation-cancelled'));
      request?.signal.addEventListener('abort', abortRequest, { once: true });
      const deadline =
        request === undefined
          ? undefined
          : setTimeout(
              () => controller.abort(new Error('appearance-request-stale')),
              Math.max(0, request.expiresAt - Date.now()),
            );
      pending.set(hostId, controller);
      const revision = (revisions.get(hostId) ?? 0) + 1;
      revisions.set(hostId, revision);
      try {
        if (patch.enabled === true && api?.permission() === 'default') {
          try {
            await wait(api.requestPermission(), controller.signal);
          } catch {}
        }
        controller.signal.throwIfAborted();
        if (revisions.get(hostId) !== revision) return;
        const current = choice(hostId);
        const next = {
          enabled:
            patch.enabled === undefined
              ? current.enabled
              : patch.enabled && api?.permission() === 'granted',
          preferences: { ...current.preferences, ...patch.preferences },
        };
        if (
          next.enabled &&
          PUSH_KINDS.some(
            (kind) => next.preferences[kind] && (!current.enabled || !current.preferences[kind]),
          )
        ) {
          const timeout = setTimeout(
            () => controller.abort(new Error('notification-baseline-timeout')),
            10_000,
          );
          try {
            await wait(options.prepareEnable(hostId, controller.signal), controller.signal);
          } finally {
            clearTimeout(timeout);
          }
          controller.signal.throwIfAborted();
          if (api?.permission() !== 'granted') throw new Error('notification-permission-required');
        }
        checkRequest(request);
        controller.signal.throwIfAborted();
        const updated = { ...hosts, [hostId]: next };
        storage?.setItem(REMOTE_NOTIFICATION_KEY, JSON.stringify(updated));
        hosts = updated;
        close(hostId);
        publish();
      } finally {
        clearTimeout(deadline);
        request?.signal.removeEventListener('abort', abortRequest);
        if (pending.get(hostId) === controller) pending.delete(hostId);
      }
    },
    async control(
      input: Record<string, unknown>,
      expectedRevision: unknown,
      request: ControlRequest,
    ) {
      checkRequest(request);
      const hostId = input.hostId as string;
      const current = choice(hostId);
      if (input.patch !== undefined) {
        if (expectedRevision !== JSON.stringify(current))
          throw new Error('notification-revision-stale');
        const patch = input.patch as Partial<Choice> | null;
        const preferences = parseNotificationPreferences(patch?.preferences);
        if (!preferences || typeof patch?.enabled !== 'boolean')
          throw new Error('notification-invalid-input');
        if (patch.enabled && api?.permission() !== 'granted')
          throw new Error('notification-permission-required');
        await owner.set(hostId, { enabled: patch.enabled, preferences }, request);
      }
      checkRequest(request);
      return {
        hostId,
        ...choice(hostId),
        permission: api?.permission() ?? 'unsupported',
        revision: JSON.stringify(choice(hostId)),
      };
    },
    update(remotes: readonly RemoteHost[]) {
      const present = new Set(remotes.map((remote) => remote.host.hostId));
      for (const id of pending.keys()) if (!present.has(id)) cancel(id);
      for (const id of state.keys())
        if (!present.has(id)) {
          state.delete(id);
          close(id);
        }
      const permission = api?.permission() ?? 'unsupported';
      if (permission !== snapshot.permission) {
        publish();
        if (permission !== 'granted') {
          cancel();
          close();
        }
      }
      for (const remote of remotes) {
        const id = remote.host.hostId;
        let entry = state.get(id);
        if (entry === undefined || entry.credential !== remote.host.credential) {
          if (entry !== undefined) cancel(id);
          close(id);
          entry = {
            credential: remote.host.credential,
            inbox: { status: 'idle' },
            baseline: false,
            high: '',
            seen: new Set(),
          };
          state.set(id, entry);
        }
        if (
          remote.snapshot.connection.status !== 'connected' ||
          remote.inbox.status !== 'ready' ||
          remote.inbox.stale
        ) {
          if (remote.snapshot.connection.status !== 'connected') cancel(id);
          entry.inbox = remote.inbox;
          entry.baseline = false;
          close(id);
          continue;
        }
        if (remote.inbox.notificationItems === undefined) continue;
        if (entry.inbox === remote.inbox) continue;
        const previousIds = new Set(
          entry.inbox.status === 'ready'
            ? entry.inbox.notificationItems?.map((item) => item.id)
            : [],
        );
        entry.inbox = remote.inbox;
        const items = remote.inbox.notificationItems;
        const active = new Set(
          items.filter((item) => item.isUnread !== false).map((item) => `${id}:${item.id}`),
        );
        for (const [key, notice] of shown)
          if (notice.hostId === id && !active.has(key)) {
            notice.handle.onclick = null;
            notice.handle.close();
            shown.delete(key);
          }
        const pref = choice(id);
        for (const item of items) {
          const key = `${id}:${item.id}`;
          const known = entry.seen.has(item.id) || previousIds.has(item.id);
          entry.seen.add(item.id);
          const kind = kinds[item.kind];
          if (
            !entry.baseline ||
            known ||
            item.createdAt < entry.high ||
            kind === undefined ||
            item.isUnread === false ||
            !pref.enabled ||
            !pref.preferences[kind] ||
            permission !== 'granted' ||
            api === undefined
          )
            continue;
          const bot = remote.snapshot.roster?.bots.find((bot) => bot.slug === item.botSlug);
          const title = `${remote.host.hostName} · ${item.channelName ?? bot?.displayName ?? item.botSlug}`;
          try {
            const handle = api.show(title, {
              body: kind === 'private-input' ? options.privateBody() : noticeBody(item.summary),
              tag: `botharness-remote:${key}`,
            });
            shown.set(key, { hostId: id, handle });
            handle.onclick = (event) => {
              event.preventDefault();
              handle.close();
              shown.delete(key);
              options.open(target(remote, item));
            };
          } catch (error) {
            const code =
              error instanceof Error &&
              (error.name === 'NotAllowedError' || error.name === 'SecurityError')
                ? 'remote-notification-show-refused'
                : 'remote-notification-show-failed';
            if (!reported.has(code)) {
              reported.add(code);
              (options.diagnostic ?? reportDiagnostic)(code);
            }
          }
        }
        entry.high = items.reduce(
          (high, item) => (item.createdAt > high ? item.createdAt : high),
          entry.high,
        );
        entry.baseline = true;
        while (entry.seen.size > 2000) entry.seen.delete(entry.seen.values().next().value!);
      }
    },
    stop() {
      cancel();
      state.clear();
      close();
    },
  };
  return owner;
}

function target(remote: RemoteHost, item: HumanAttentionItem): RemoteConversationTarget {
  const bot = remote.snapshot.roster?.bots.find((bot) => bot.slug === item.botSlug);
  return {
    hostId: remote.host.hostId,
    title: item.channelName ?? bot?.displayName ?? item.botSlug,
    ...(item.channelId === undefined ? { botSlug: item.botSlug } : { channelId: item.channelId }),
  };
}

export type RemoteNotifications = ReturnType<typeof createRemoteNotifications>;
