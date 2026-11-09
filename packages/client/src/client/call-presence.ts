import type { DesktopCall, DesktopCallSnapshot } from './desktop-call.js';
import { revealDesktopWindow } from './desktop-window.js';

export const CALL_NOTICE_TAG = 'botharness-call';

export interface CallNoticeHandle {
  close(): void;
  onclick: ((event: Event) => void) | null;
  onclose?: ((event: Event) => void) | null;
}

export type CallNoticeFactory = (
  title: string,
  options: { body: string; tag: string; silent: boolean; requireInteraction: boolean },
) => CallNoticeHandle;

type NotificationShape = {
  readonly permission?: NotificationPermission;
  requestPermission?: () => Promise<NotificationPermission>;
};

function notificationApi(): NotificationShape | undefined {
  return (globalThis as { Notification?: NotificationShape }).Notification;
}

export function askCallNotifications(api: NotificationShape | undefined = notificationApi()): void {
  if (api?.permission !== 'default' || api.requestPermission === undefined) return;
  void api.requestPermission().catch(() => undefined);
}

function browserNotice(): CallNoticeFactory | undefined {
  const api = notificationApi();
  if (api?.permission !== 'granted') return undefined;
  const Ctor = api as unknown as new (
    title: string,
    options: NotificationOptions,
  ) => CallNoticeHandle;
  return (title, options) => new Ctor(title, options);
}

export interface CallWindow {
  hidden(): boolean;
  subscribe(listener: () => void): () => void;
  reveal(): void;
}

type PresenceDocument = Pick<
  Document,
  'visibilityState' | 'addEventListener' | 'removeEventListener'
>;

export function documentCallWindow(
  doc: PresenceDocument,
  reveal: () => void = () => revealDesktopWindow(),
): CallWindow {
  return {
    hidden: () => doc.visibilityState === 'hidden',
    subscribe(listener) {
      doc.addEventListener('visibilitychange', listener);
      return () => doc.removeEventListener('visibilitychange', listener);
    },
    reveal,
  };
}

export interface CallPresenceOptions {
  readonly call: DesktopCall;
  readonly window?: CallWindow;
  readonly doc?: PresenceDocument;
  readonly notice?: () => CallNoticeFactory | undefined;
  readonly focus?: () => void;
}

export function callNoticeWanted(snapshot: DesktopCallSnapshot, hidden: boolean): boolean {
  return hidden && snapshot.place !== undefined && snapshot.state.status === 'live';
}

export function watchCallPresence(options: CallPresenceOptions): () => void {
  const where = options.window ?? documentCallWindow(options.doc ?? document, options.focus);
  const notice = options.notice ?? browserNotice;
  let shown: CallNoticeHandle | undefined;
  let shownFor: string | undefined;
  let answered: string | undefined;
  const close = () => {
    const current = shown;
    shown = undefined;
    shownFor = undefined;
    if (current === undefined) return;
    current.onclick = null;
    if (current.onclose !== undefined) current.onclose = null;
    try {
      current.close();
    } catch {}
  };
  const sync = () => {
    const snapshot = options.call.snapshot();
    const place = snapshot.place;
    const hidden = where.hidden();
    if (!hidden) answered = undefined;
    if (
      place === undefined ||
      snapshot.state.status !== 'live' ||
      !callNoticeWanted(snapshot, hidden)
    ) {
      close();
      return;
    }
    const key = snapshot.state.call.callId;
    if (answered === key) return;
    if (shown !== undefined && shownFor === key) return;
    close();
    const make = notice();
    if (make === undefined) return;
    let created: CallNoticeHandle;
    try {
      created = make(place.title, {
        body: place.body,
        tag: CALL_NOTICE_TAG,
        silent: true,
        requireInteraction: true,
      });
    } catch {
      return;
    }
    created.onclick = (event) => {
      event.preventDefault?.();
      answered = key;
      where.reveal();
      place.open();
      close();
    };
    created.onclose = () => {
      if (shown !== created) return;
      answered = key;
      shown = undefined;
      shownFor = undefined;
    };
    shown = created;
    shownFor = key;
  };
  const unsubscribe = options.call.subscribe(sync);
  const unwatch = where.subscribe(sync);
  sync();
  return () => {
    unsubscribe();
    unwatch();
    close();
  };
}
