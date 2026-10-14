import type { ConfigStorage } from './roster-config.js';
import type { ChannelSummary, HumanAttentionItem } from './store.js';

export const DESKTOP_NOTIFICATIONS_KEY = 'botharness.desktopNotifications';
export const DESKTOP_NOTIFICATION_POLL_MS = 15_000;

export type DesktopNotificationPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export interface DesktopNotificationHandle {
  onclick: ((event: Event) => void) | null;
  close(): void;
}

export interface DesktopNotificationApi {
  permission(): Exclude<DesktopNotificationPermission, 'unsupported'>;
  requestPermission(): Promise<Exclude<DesktopNotificationPermission, 'unsupported'>>;
  show(
    title: string,
    options: { body: string; tag: string; lang?: string },
  ): DesktopNotificationHandle;
}

export function browserNotificationApi(): DesktopNotificationApi | undefined {
  if (typeof window === 'undefined' || typeof window.Notification === 'undefined') return undefined;
  const api = window.Notification;
  return {
    permission: () => api.permission,
    requestPermission: async () => await api.requestPermission(),
    show: (title, options) => new api(title, options),
  };
}

export interface DesktopNotificationSnapshot {
  enabled: boolean;
  permission: DesktopNotificationPermission;
}

export class DesktopNotificationPrefs {
  #snapshot: DesktopNotificationSnapshot;
  readonly #listeners = new Set<() => void>();
  readonly #storage: ConfigStorage | undefined;
  readonly api: DesktopNotificationApi | undefined;

  constructor(storage: ConfigStorage | undefined, api: DesktopNotificationApi | undefined) {
    this.#storage = storage;
    this.api = api;
    let enabled = false;
    try {
      enabled = storage?.getItem(DESKTOP_NOTIFICATIONS_KEY) === 'on';
    } catch {}
    this.#snapshot = { enabled, permission: api?.permission() ?? 'unsupported' };
  }

  readonly getSnapshot = (): DesktopNotificationSnapshot => this.#snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  active(): boolean {
    this.refreshPermission();
    return this.#snapshot.enabled && this.#snapshot.permission === 'granted';
  }

  refreshPermission(): void {
    const permission = this.api?.permission() ?? 'unsupported';
    if (permission !== this.#snapshot.permission) this.#set({ ...this.#snapshot, permission });
  }

  readonly setEnabled = async (enabled: boolean): Promise<void> => {
    if (!enabled) {
      this.#persist(false);
      return;
    }
    if (this.api === undefined) return;
    let permission = this.api.permission();
    if (permission === 'default') {
      try {
        permission = await this.api.requestPermission();
      } catch {
        permission = this.api.permission();
      }
    }
    this.#set({ ...this.#snapshot, permission });
    if (permission === 'granted') this.#persist(true);
  };

  #persist(enabled: boolean): void {
    try {
      this.#storage?.setItem(DESKTOP_NOTIFICATIONS_KEY, enabled ? 'on' : 'off');
    } catch {}
    this.#set({ ...this.#snapshot, enabled });
  }

  #set(next: DesktopNotificationSnapshot): void {
    if (next.enabled === this.#snapshot.enabled && next.permission === this.#snapshot.permission)
      return;
    this.#snapshot = next;
    for (const listener of this.#listeners) listener();
  }
}

export type DesktopNoticeKind =
  | 'approval'
  | 'question'
  | 'private-input'
  | 'waiting'
  | 'mention'
  | 'reply'
  | 'bot-reply';

export function desktopNoticeKind(
  item: HumanAttentionItem,
  channels: readonly Pick<ChannelSummary, 'id' | 'type' | 'botSlug'>[],
): DesktopNoticeKind | undefined {
  switch (item.kind) {
    case 'tool-approval':
    case 'workspace-grant-request':
      return 'approval';
    case 'user-question':
      return 'question';
    case 'private-input':
      return 'private-input';
    case 'assignment-waiting-human':
      return 'waiting';
    case 'channel-mention':
      return item.isUnread === false ? undefined : 'mention';
    case 'channel-reply':
      return item.isUnread === false ? undefined : 'reply';
    case 'channel-unread': {
      const channel = channels.find((candidate) => candidate.id === item.channelId);
      return channel?.type === 'dm' && channel.botSlug !== undefined ? 'bot-reply' : undefined;
    }
    default:
      return undefined;
  }
}

export function desktopNoticeKey(item: HumanAttentionItem): string {
  return `${item.id}|${item.sourceEventId ?? item.messageId ?? item.createdAt}`;
}

export function noticeBody(summary: string, max = 140): string {
  const flat = summary.replace(/\s+/gu, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export interface DesktopNotifierDeps {
  prefs: Pick<DesktopNotificationPrefs, 'active' | 'api'>;
  load(): Promise<readonly HumanAttentionItem[]>;
  channels(): readonly Pick<ChannelSummary, 'id' | 'type' | 'botSlug'>[];
  attentive(): boolean;
  subscribe(listener: () => void): () => void;
  title(kind: DesktopNoticeKind, item: HumanAttentionItem): string;
  open(item: HumanAttentionItem): void;
  lang?: () => string;
  intervalMs?: number;
}

export function mountDesktopNotifications(deps: DesktopNotifierDeps): () => void {
  let seen: Set<string> | undefined;
  let running = false;
  let again = false;
  let disposed = false;
  const shown = new Set<DesktopNotificationHandle>();

  const check = async (): Promise<void> => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        if (!deps.prefs.active() || deps.attentive()) {
          seen = undefined;
          if (deps.attentive()) closeAll();
          continue;
        }
        let items: readonly HumanAttentionItem[];
        try {
          items = await deps.load();
        } catch {
          continue;
        }
        if (disposed || !deps.prefs.active() || deps.attentive()) continue;
        const keys = items.map(desktopNoticeKey);
        if (seen === undefined) {
          seen = new Set(keys);
          continue;
        }
        const channels = deps.channels();
        for (const item of items) {
          const key = desktopNoticeKey(item);
          if (seen.has(key)) continue;
          seen.add(key);
          const kind = desktopNoticeKind(item, channels);
          if (kind !== undefined) show(kind, item);
        }
      } while (again && !disposed);
    } finally {
      running = false;
    }
  };

  const show = (kind: DesktopNoticeKind, item: HumanAttentionItem): void => {
    const api = deps.prefs.api;
    if (api === undefined) return;
    let handle: DesktopNotificationHandle;
    try {
      handle = api.show(deps.title(kind, item), {
        body: noticeBody(item.summary),
        tag: `botharness:${item.id}`,
        ...(deps.lang === undefined ? {} : { lang: deps.lang() }),
      });
    } catch {
      return;
    }
    shown.add(handle);
    handle.onclick = (event) => {
      event.preventDefault();
      if (typeof window !== 'undefined') window.focus();
      handle.close();
      shown.delete(handle);
      deps.open(item);
    };
  };

  const closeAll = (): void => {
    for (const handle of shown) handle.close();
    shown.clear();
  };

  const trigger = (): void => {
    if (!disposed) void check();
  };
  const unsubscribe = deps.subscribe(trigger);
  const timer = setInterval(trigger, deps.intervalMs ?? DESKTOP_NOTIFICATION_POLL_MS);
  trigger();
  return () => {
    disposed = true;
    unsubscribe();
    clearInterval(timer);
    shown.clear();
  };
}
