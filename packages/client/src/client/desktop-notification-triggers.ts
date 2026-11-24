import type { DesktopNotificationPrefs } from './desktop-notifications.js';
import { observeHumanAttention } from './messaging-defaults-live.js';
import type { ClientStore } from './store.js';

export function subscribeDesktopNotificationTriggers(
  store: ClientStore,
  prefs: DesktopNotificationPrefs,
  listener: () => void,
): () => void {
  let prior = store.getSnapshot().activityList;
  const offStore = store.subscribe(() => {
    const next = store.getSnapshot().activityList;
    if (next.unreadCount === prior.unreadCount && next.hasAction === prior.hasAction) return;
    prior = next;
    listener();
  });
  const offPrefs = prefs.subscribe(listener);
  const offAttention = observeHumanAttention(listener);
  document.addEventListener('visibilitychange', listener);
  window.addEventListener('focus', listener);
  window.addEventListener('blur', listener);
  return () => {
    offStore();
    offPrefs();
    offAttention();
    document.removeEventListener('visibilitychange', listener);
    window.removeEventListener('focus', listener);
    window.removeEventListener('blur', listener);
  };
}
