import type { LocalApprovalAlert } from './device-alerts';

export function createAlertBanners() {
  let queue: LocalApprovalAlert[] = [];
  const listeners = new Set<() => void>();
  const taps = new Set<(data: unknown) => void>();
  const publish = () => {
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => queue[0],
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reconcile(host: string, pending: readonly string[], added: LocalApprovalAlert[]) {
      queue = queue.filter(
        (alert) => alert.data.hostId !== host || pending.includes(alert.data.itemId),
      );
      for (const alert of added) {
        if (
          !queue.some(
            (entry) => entry.data.hostId === host && entry.data.itemId === alert.data.itemId,
          )
        )
          queue.push(alert);
      }
      queue = queue.slice(-20);
      publish();
    },
    clear() {
      queue = [];
      publish();
    },
    dismiss() {
      queue.shift();
      publish();
    },
    open() {
      const alert = queue.shift();
      publish();
      if (alert) for (const tap of taps) tap(alert.data);
    },
    onOpen(listener: (data: unknown) => void) {
      taps.add(listener);
      return () => {
        taps.delete(listener);
      };
    },
  };
}

export const alertBanners = createAlertBanners();
