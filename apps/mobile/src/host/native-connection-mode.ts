import type { AlertSnapshot } from './device-alerts';

const inactive: { enabled: boolean; running: boolean; error: string | null } = {
  enabled: false,
  running: false,
  error: null,
};

export const connectionMode = {
  supported: false,
  reportAlertFailure(): void {},
  onApproval(_listener: (data: { hostId: string; itemId: string }) => void): () => void {
    return () => {};
  },
  async verifiedAbsent(_hostId: string, _itemId: string): Promise<void> {},
  getSnapshot: () => inactive,
  subscribe(_listener: () => void): () => void {
    return () => {};
  },
  async setEnabled(_enabled: boolean): Promise<void> {
    throw new Error('connection-build-required');
  },
  async resume(): Promise<void> {},
  async syncHosts(
    _hosts: string[],
    _approvalsEnabled: boolean,
    _hostPreferences: Record<string, boolean>,
  ): Promise<void> {},
  async reconcile(_snapshot: AlertSnapshot): Promise<void> {},
  async forget(_hostId: string): Promise<void> {},
};
