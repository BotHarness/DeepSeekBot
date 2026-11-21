import type { TeamSignInError } from '@botharness/host-client/team-sign-in';
import type { TeamInvitation } from '@botharness/host-protocol/team-invitation';
import type { HostClient, HostSnapshot } from '@botharness/host-client/client';
import type { SavedHost } from '@botharness/host-client/hosts';
import type { Inbox, InboxSnapshot } from '@botharness/host-client/inbox';
import type { PairingRefusal } from '@botharness/host-client/pairing';
import type { RemoteBotActivity } from '../../remote-host-activity.js';
import type { RemoteHosts } from '../../remote-hosts.js';

export interface RemoteConversationTarget {
  hostId: string;
  title: string;
  botSlug?: string;
  channelId?: string;
}

export type ManagedSavedHost = SavedHost & {
  pendingConnection?: NonNullable<Parameters<RemoteHosts['setPendingConnection']>[2]>;
  connectionOwnerChanged?: boolean;
  connectionOperationUnavailable?: boolean;
};

export interface RemoteHost {
  host: ManagedSavedHost;
  snapshot: HostSnapshot;
  inbox: InboxSnapshot;
  activity?: ReadonlyMap<string, RemoteBotActivity>;
}

export interface RemoteHostsSnapshot {
  hosts: readonly RemoteHost[];
  avatars: ReadonlyMap<string, string>;
  tab: string;
  open?: RemoteConversationTarget;
}

export type HostPairResult =
  | { ok: false; code: 'team-sign-in-required'; invitation: TeamInvitation }
  | { ok: true; host: SavedHost }
  | {
      ok: false;
      code:
        | PairingRefusal
        | TeamSignInError
        | 'already-paired'
        | 'pairing-in-progress'
        | 'this-host'
        | 'storage-failure'
        | 'client-lock-unavailable'
        | 'client-automatic-enrollment-suppressed'
        | 'owner-required'
        | 'cancelled';
    };

export interface RemotePairTrust {
  confirmFingerprint?: (fingerprint: string, hostName: string) => Promise<boolean>;
  onPending?: (fingerprint: string) => void;
  signal?: AbortSignal;
}

export interface HostStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface HostEntry {
  host: ManagedSavedHost;
  client: HostClient;
  release: () => void;
  inbox: { feed: Inbox; release: () => void } | undefined;
  retained: InboxSnapshot;
  activity: ReadonlyMap<string, RemoteBotActivity>;
}
export type NotificationTranslate = (key: 'remoteHosts.notifications.privateBody') => string;

export type RemoteHostTelemetry = (
  event: 'remote_host:host_pair_complete' | 'remote_host:conversation_open',
  properties?: { outcome: 'success' | 'refused' | 'failed' },
) => void;

export interface RemoteHostCustody {
  seal(host: SavedHost): Promise<SavedHost>;
  forget(handle: string): Promise<void>;
}
