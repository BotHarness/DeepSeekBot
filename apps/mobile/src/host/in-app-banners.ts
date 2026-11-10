import type { AlertSnapshot, LocalApprovalAlert } from './device-alerts';

export function createInAppBanners(
  present: (hostId: string, pending: readonly string[], added: LocalApprovalAlert[]) => void,
) {
  const seen = new Map<string, Set<string>>();
  return {
    reconcile(snapshot: AlertSnapshot, active: boolean): void {
      if (snapshot.inApp !== true) {
        seen.delete(snapshot.hostId);
        return;
      }
      const known = seen.get(snapshot.hostId);
      seen.set(snapshot.hostId, new Set(snapshot.pending));
      const added =
        known === undefined || !active
          ? []
          : snapshot.alerts.filter((alert) => !known.has(alert.data.itemId));
      present(snapshot.hostId, snapshot.pending, added);
    },
    forget(hostId: string): void {
      seen.delete(hostId);
    },
  };
}
