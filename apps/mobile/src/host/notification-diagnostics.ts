export type NotificationChannelState = 'missing' | 'blocked' | 'available';

export interface NotificationDiagnostics {
  permission: boolean;
  requests: NotificationChannelState;
  connection: NotificationChannelState;
  batteryExempt: boolean;
  powerSave: boolean;
  setupDismissed: boolean;
}

export type LocalTestResult = 'posted' | 'permission-blocked' | 'channel-blocked';

export interface NotificationDiagnosticsPort {
  read(): Promise<NotificationDiagnostics>;
  dismissSetup(): Promise<void>;
  test(language: string): Promise<LocalTestResult>;
}
