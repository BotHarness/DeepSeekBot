import type { AlertSnapshot } from './device-alerts';
import type { ConnectionSummary } from './connection-summary';
import type { NotificationDiagnosticsPort } from './notification-diagnostics';
import { AppState } from 'react-native';
import { alertBanners } from './alert-banners';
import { createInAppBanners } from './in-app-banners';

const inAppBanners = createInAppBanners(alertBanners.reconcile);

const inactive: { enabled: boolean; running: boolean; error: string | null } = {
  enabled: false,
  running: false,
  error: null,
};

export const notificationDiagnostics: NotificationDiagnosticsPort = {
  async read() {
    throw new Error('connection-build-required');
  },
  async dismissSetup() {
    throw new Error('connection-build-required');
  },
  async test() {
    throw new Error('connection-build-required');
  },
};

export const connectionMode = {
  supported: false,
  updateSummary(_summary: ConnectionSummary, _language: string): void {},
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
  async reconcile(snapshot: AlertSnapshot): Promise<void> {
    inAppBanners.reconcile(snapshot, AppState.currentState === 'active');
  },
  async forget(hostId: string): Promise<void> {
    inAppBanners.forget(hostId);
  },
};
