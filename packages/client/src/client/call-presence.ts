import type { DesktopCall, DesktopCallSnapshot } from './desktop-call.js';

export const CALL_NOTICE_TAG = 'botharness-call';

export interface CallNoticeHandle {
  close(): void;
  onclick: ((event: Event) => void) | null;
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

export interface CallPresenceOptions {
  readonly call: DesktopCall;
  readonly doc?: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  readonly notice?: () => CallNoticeFactory | undefined;
  readonly focus?: () => void;
}

export function callNoticeWanted(snapshot: DesktopCallSnapshot, hidden: boolean): boolean {
  return hidden && snapshot.place !== undefined && snapshot.state.status === 'live';
}

export function watchCallPresence(options: CallPresenceOptions): () => void {
  const doc = options.doc ?? document;
  const notice = options.notice ?? browserNotice;
  const focus = options.focus ?? (() => globalThis.focus?.());
  let shown: CallNoticeHandle | undefined;
  let shownFor: string | undefined;
  const close = () => {
    const current = shown;
    shown = undefined;
    shownFor = undefined;
    if (current === undefined) return;
    current.onclick = null;
    try {
      current.close();
    } catch {}
  };
  const sync = () => {
    const snapshot = options.call.snapshot();
    const place = snapshot.place;
    if (
      place === undefined ||
      snapshot.state.status !== 'live' ||
      !callNoticeWanted(snapshot, doc.visibilityState === 'hidden')
    ) {
      close();
      return;
    }
    const key = snapshot.state.call.callId;
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
      focus();
      place.open();
      close();
    };
    shown = created;
    shownFor = key;
  };
  const unsubscribe = options.call.subscribe(sync);
  doc.addEventListener('visibilitychange', sync);
  sync();
  return () => {
    unsubscribe();
    doc.removeEventListener('visibilitychange', sync);
    close();
  };
}
