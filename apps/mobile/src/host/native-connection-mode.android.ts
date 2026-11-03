import { requireOptionalNativeModule } from 'expo';
import * as Notifications from 'expo-notifications';
import { AppRegistry, AppState } from 'react-native';

import type { AlertSnapshot, LocalApprovalAlert } from './device-alerts';
import { alertBanners } from './alert-banners';
import type { PushPreferences } from './push';
import type { ConnectionSummary } from './connection-summary';
import { REQUESTS_CHANNEL } from './native-notifications';
import { t } from '../ui/strings';
import type {
  NotificationDiagnostics,
  LocalTestResult,
  NotificationDiagnosticsPort,
} from './notification-diagnostics';

interface NativeConnectionState {
  enabled: boolean;
  running: boolean;
  error: string | null;
}

interface ConnectionNativeModule {
  notificationDiagnostics?(): NotificationDiagnostics;
  dismissNotificationSetup?(): void;
  testLocalNotification?(language: string): LocalTestResult;
  alertRecoverySession?(): string;
  connectionState(): NativeConnectionState;
  setConnectionEnabled(enabled: boolean): void;
  updateConnectionSummary(
    hosts: number,
    connected: number,
    synced: number,
    active: number,
    needsYou: number,
    language: string,
  ): void;
  syncAlertHostsAsync(
    hosts: string[],
    approvalsEnabled: boolean,
    hostPreferences: Record<string, boolean>,
    kinds: Partial<PushPreferences>,
  ): Promise<void>;
  reconcileAlertsAsync(snapshot: string): Promise<string>;
  forgetAlertsAsync(host: string): Promise<void>;
  verifyAbsentAlertAsync(host: string, item: string): Promise<void>;
  addListener(
    event: 'approvalArrived',
    listener: (data: { hostId: string; itemId: string }) => void,
  ): { remove(): void };
  addListener(
    event: 'connectionState',
    listener: (state: NativeConnectionState) => void,
  ): { remove(): void };
}

const native = requireOptionalNativeModule<ConnectionNativeModule>('ConversationNotifications');
const supported = native !== null && typeof native.connectionState === 'function';
const listeners = new Set<() => void>();
let snapshot = supported
  ? native.connectionState()
  : { enabled: false, running: false, error: null };
let finishTask: (() => void) | undefined;
function publish(state: NativeConnectionState) {
  snapshot = state;
  if (!state.running) {
    finishTask?.();
    finishTask = undefined;
  }
  for (const listener of listeners) listener();
}
if (supported) {
  native.addListener('connectionState', publish);
  AppRegistry.registerHeadlessTask(
    'BotharnessKeepConnected',
    () => () =>
      new Promise<void>((resolve) => {
        finishTask?.();
        finishTask = resolve;
        if (!native.connectionState().running) {
          finishTask = undefined;
          resolve();
        }
      }),
  );
}

export const connectionMode = {
  supported,
  recoverySession: supported ? (native.alertRecoverySession?.() ?? 'build-required') : undefined,
  updateSummary(summary: ConnectionSummary, language: string): void {
    if (!supported) return;
    if (typeof native.updateConnectionSummary !== 'function') {
      publish({ ...snapshot, error: 'connection-build-required' });
      return;
    }
    native.updateConnectionSummary(
      summary.hosts,
      summary.connected,
      summary.synced,
      summary.active,
      summary.needsYou,
      language,
    );
  },
  reportAlertFailure(): void {
    if (snapshot.error !== 'connection-build-required')
      publish({ ...snapshot, error: 'alert-sync-failed' });
  },
  onApproval(listener: (data: { hostId: string; itemId: string }) => void): () => void {
    const subscription = supported ? native.addListener('approvalArrived', listener) : undefined;
    return () => subscription?.remove();
  },
  async verifiedAbsent(hostId: string, itemId: string): Promise<void> {
    if (supported) await native.verifyAbsentAlertAsync(hostId, itemId);
  },
  getSnapshot: () => snapshot,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  async setEnabled(enabled: boolean): Promise<void> {
    if (!supported) throw new Error('connection-build-required');
    if (enabled) {
      if (AppState.currentState !== 'active') throw new Error('foreground-required');
      await Notifications.setNotificationChannelAsync(REQUESTS_CHANNEL, {
        name: t.notificationsChannel,
        importance: Notifications.AndroidImportance.HIGH,
        showBadge: true,
      });
    }
    native.setConnectionEnabled(enabled);
    publish(native.connectionState());
  },
  async resume(): Promise<void> {
    if (supported && snapshot.enabled && !snapshot.running) await this.setEnabled(true);
  },
  async syncHosts(
    hosts: string[],
    approvalsEnabled: boolean,
    hostPreferences: Record<string, boolean>,
    kinds?: PushPreferences,
  ): Promise<void> {
    if (supported)
      await native.syncAlertHostsAsync(hosts, approvalsEnabled, hostPreferences, kinds ?? {});
  },
  async reconcile(snapshot: AlertSnapshot): Promise<void> {
    if (!supported) return;
    if (snapshot.recovery && typeof native.alertRecoverySession !== 'function') {
      publish({ ...native.connectionState(), error: 'connection-build-required' });
      throw new Error('connection-build-required');
    }
    const result = await native.reconcileAlertsAsync(JSON.stringify(snapshot));
    if (snapshot.recovery?.ready === false) return;
    const banners: LocalApprovalAlert[] = JSON.parse(result);
    alertBanners.reconcile(
      snapshot.hostId,
      snapshot.pending,
      AppState.currentState === 'active' ? banners : [],
    );
  },
  async forget(hostId: string): Promise<void> {
    if (supported) await native.forgetAlertsAsync(hostId);
    alertBanners.reconcile(hostId, [], []);
  },
};

export const notificationDiagnostics: NotificationDiagnosticsPort = {
  async read() {
    if (!native?.notificationDiagnostics) throw new Error('connection-build-required');
    publish(native.connectionState());
    return native.notificationDiagnostics();
  },
  async dismissSetup() {
    if (!native?.dismissNotificationSetup) throw new Error('connection-build-required');
    native.dismissNotificationSetup();
  },
  async test(language) {
    if (!native?.testLocalNotification) throw new Error('connection-build-required');
    return native.testLocalNotification(language);
  },
};
