import type { LocalApprovalAlert } from './device-alerts';

export function createAlertBanners() {
  let queue: LocalApprovalAlert[] = [];
  const dismissed = new Set<string>();
  const key = (alert: LocalApprovalAlert) => JSON.stringify([alert.data.hostId, alert.data.itemId]);
  const retire = (alert: LocalApprovalAlert | undefined) => {
    if (alert?.members) dismissed.add(key(alert));
  };
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
        (alert) =>
          alert.data.hostId !== host ||
          (alert.members
            ? alert.members.some((item) => pending.includes(item))
            : pending.includes(alert.data.itemId)),
      );
      for (const alert of added) {
        const index = queue.findIndex(
          (entry) => entry.data.hostId === host && entry.data.itemId === alert.data.itemId,
        );
        if (index >= 0) queue[index] = alert;
        else if (!dismissed.has(key(alert))) queue.push(alert);
      }
      queue = queue.slice(-20);
      publish();
    },
    clear() {
      queue.forEach(retire);
      queue = [];
      publish();
    },
    dismiss() {
      retire(queue.shift());
      publish();
    },
    open() {
      const alert = queue.shift();
      retire(alert);
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
