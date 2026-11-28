export type MessagingReadMode = 'saved' | 'status';

export type ReceptionRecovery =
  | {
      kind: 'retrying';
      reason: 'provider-unavailable';
      attempt: number;
      nextRetryAt: string;
    }
  | { kind: 'action-required'; reason: string };

export interface MessagingConnection {
  id: string;
  botSlug: string;
  botName: string;
  canOpenSettings: boolean;
  providerId: string;
  platform: string;
  accountRef: string;
  name: string;
  enabled: boolean;
  availability: 'available' | 'paused' | 'unavailable' | 'rebind-required';
  reception: 'off' | 'connecting' | 'receiving' | 'unavailable';
  recovery?: ReceptionRecovery;
}

export interface MessagingConnectionsView {
  checks: 'pending' | 'complete';
  bindings: MessagingConnection[];
}
