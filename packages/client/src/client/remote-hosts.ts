import { markChannelRead } from '@botharness/host-client/channel-messages';
import {
  prepareTeamSignIn,
  type TeamSignInTarget,
  type TeamSignInFlow,
  type TeamSignInError,
} from '@botharness/host-client/team-sign-in';
import {
  parseTeamInvitation,
  type TeamResult,
  type TeamInvitation,
} from '@botharness/host-protocol/team-invitation';
import { prepareMemberIdentity } from '@botharness/host-client/member-identity';
import {
  connectionOperationIndexSchema,
  pendingConnectionSchema,
  type PendingConnection,
} from '../../../core/src/devices/connection-operation.js';
import { hostLooks } from './host-looks.js';
import { memberPage } from './member-page.js';
import { secureRandom, keyHex, keyBytes } from '@botharness/host-client/encrypted-carrier';
import { noisePublicKey } from '@botharness/host-protocol/noise/xk';
import {
  custodyCarrier,
  custodyResponse,
  forgetRemoteHost,
  sealRemoteHost,
  teamCustodyResponse,
} from './remote-custody.js';
import { browserAdmissionProtocols } from '../../../../deploy/private-relay/admission.mjs';
import { isPrivateRoute } from '@botharness/host-protocol/route';
import {
  enrollRelationshipClient,
  commitRelationshipEnrollment,
  cancelRelationshipEnrollment,
  relationshipClientPublicKey,
  updateRelationshipClientRoute,
} from '../../../core/src/devices/relationship-enrollment.js';
import { pendingRelationshipEnrollmentSchema as pendingEnrollmentSchema } from '../../../core/src/devices/relationship-contract.js';
import { automaticEnrollmentChoiceSchema } from '../../../core/src/devices/relationship-contract.js';
import {
  withRemoteHostStorageLock,
  withRemoteHostCredentialWrite,
} from './remote-host-storage-lock.js';
import { relationshipRequest, type ClientRelationship } from './relationships.js';
import { shownHostName } from '@botharness/host-client/ui/design/host-look';
import type { HostCarrier } from '@botharness/host-protocol/carrier';
import {
  createHostClient,
  type HostClient,
  type HostSnapshot,
} from '@botharness/host-client/client';
import { createConversation, type Conversation } from '@botharness/host-client/conversation';
import {
  isCustodyHandle,
  parseSavedHost,
  serializeSavedHost,
  type SavedHost,
  type PrivateAdmission,
} from '@botharness/host-client/hosts';
import {
  createInbox,
  prepareNotificationBaseline,
  type Inbox,
  type InboxSnapshot,
  observeInbox,
  type InboxQuery,
} from '@botharness/host-client/inbox';
import {
  DEVICE_PREFIX,
  parsePairingLink,
  redeemPairing,
  revokePairing,
  type PairingRefusal,
} from '@botharness/host-client/pairing';
import { store } from './store.js';
import { createRemoteActivityProjection, type RemoteBotActivity } from './remote-host-activity.js';
import { releaseRemoteHostViewers } from './remote-host-viewer.js';
import { browserNotificationApi } from './desktop-notifications.js';
import { createRemoteNotifications, type RemoteNotifications } from './remote-notifications.js';
import { en } from './locale.js';
import { hostSettingsDrafts } from './host-settings-drafts.js';
import { relationshipListSchema } from '../../../core/src/devices/relationship-contract.js';

export const REMOTE_HOSTS_STORAGE_KEY = 'botharness.remoteHosts.v1';
export const HOST_TAB_STORAGE_KEY = 'botharness.hostTab.v1';
export const REMOTE_HOST_RELEASE_STORAGE_KEY = 'botharness.remoteHosts.release.v1';
const RELEASE_LIMIT = 256;

function readReleaseQueue(storage: HostStorage | undefined): string[] {
  try {
    const value: unknown = JSON.parse(storage?.getItem(REMOTE_HOST_RELEASE_STORAGE_KEY) ?? '[]');
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && isCustodyHandle(item))
      : [];
  } catch {
    return [];
  }
}

function updateReleaseQueue(
  storage: HostStorage | undefined,
  change: (handles: string[]) => string[],
): void {
  if (!storage) return;
  const handles = [...new Set(change(readReleaseQueue(storage)))].slice(-RELEASE_LIMIT);
  try {
    if (handles.length === 0) storage.removeItem(REMOTE_HOST_RELEASE_STORAGE_KEY);
    else storage.setItem(REMOTE_HOST_RELEASE_STORAGE_KEY, JSON.stringify(handles));
  } catch {}
}
export const ALL_HOSTS = 'all';
export const THIS_HOST = 'local';

export interface RemoteConversationTarget {
  hostId: string;
  title: string;
  botSlug?: string;
  channelId?: string;
}

type ManagedSavedHost = SavedHost & {
  pendingConnection?: PendingConnection;
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

export interface RemoteHosts {
  teamSignIn(
    target: TeamSignInTarget,
    localHostId?: string,
    signal?: AbortSignal,
  ): Promise<TeamResult<TeamSignInFlow, TeamSignInError>>;
  withConnectionOperation<T>(
    hostId: string,
    client: HostClient,
    run: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T>;
  dispatchConnectionOperation<T>(
    hostId: string,
    client: HostClient,
    pending: PendingConnection,
    dispatch: { check(): void; send(): Promise<T> },
  ): Promise<{ response: Promise<T> }>;
  previousConnectionOperations(hostId: string, client: HostClient): PendingConnection[];
  setPendingConnection(
    hostId: string,
    client: HostClient,
    pending: PendingConnection | undefined,
    expectedGeneration?: string,
    previousDeviceId?: string,
  ): void;
  retireRelationship(relationshipId: string): Promise<void>;
  learnRelationshipRoutes(
    peer: ClientRelationship['peer'],
    privateRelay?: PrivateAdmission,
    intent?: 'merge-existing',
  ): Promise<void>;
  enrollRelationship(
    relationship: Pick<ClientRelationship, 'id' | 'peer'>,
    name: string,
    signal?: AbortSignal,
    background?: { accountGeneration: string },
  ): Promise<HostPairResult>;
  notifications: RemoteNotifications;
  getSnapshot(): RemoteHostsSnapshot;
  subscribe(listener: () => void): () => void;
  pair(
    link: string,
    deviceName: string,
    localHostId?: string,
    trust?: RemotePairTrust,
  ): Promise<HostPairResult>;
  remove(hostId: string): Promise<void>;
  forgetLocal(hostId: string): Promise<void>;
  select(tab: string): void;
  open(target: RemoteConversationTarget): void;
  close(): void;
  conversation(target: RemoteConversationTarget): Conversation | undefined;
  markRead(target: RemoteConversationTarget, messageId: string): Promise<void>;
  activity(hostId: string, query?: InboxQuery): ReturnType<typeof observeInbox> | undefined;
  client(hostId: string): HostClient | undefined;
  viewerClient(hostId: string): HostClient | undefined;
}

export interface HostStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function conversationKey(target: RemoteConversationTarget): string {
  return JSON.stringify([
    target.hostId,
    target.channelId === undefined ? 'bot' : 'channel',
    target.channelId ?? target.botSlug ?? '',
  ]);
}

function readHosts(storage: HostStorage | undefined, strict = false): SavedHost[] {
  try {
    const value = JSON.parse(
      readStorage(storage, REMOTE_HOSTS_STORAGE_KEY, 'botharness.computers.v1') ?? '[]',
    ) as unknown;
    return Array.isArray(value)
      ? value.flatMap((entry) => {
          const host = parseSavedHost(entry);
          if (!host) return [];
          const parsed = pendingEnrollmentSchema.safeParse(entry);
          if (!parsed.success) return [];
          const pending = parsed.data.relationshipEnrollment;
          return pending ? { ...host, relationshipEnrollment: pending } : host;
        })
      : [];
  } catch {
    if (strict) throw new Error('connection-operation-storage-unavailable');
    return [];
  }
}

function readExecutionHost(storage: HostStorage | undefined, host: SavedHost): ManagedSavedHost {
  const saved = hostConfiguration(host);
  try {
    const pendingConnection = readPendingConnection(storage, saved);
    return {
      ...saved,
      ...(pendingConnection ? { pendingConnection } : {}),
      ...(oldConnectionOwner(storage, saved) ? { connectionOwnerChanged: true } : {}),
    };
  } catch {
    return { ...saved, connectionOperationUnavailable: true };
  }
}

function operationKey(host: SavedHost): string {
  return `botharness.remoteHosts.operation.v1:${JSON.stringify([host.hostId, host.encryption?.hostKey, host.deviceId])}`;
}

const CONNECTION_OPERATIONS_INDEX = 'botharness.remoteHosts.operations.v1';
const executionIndexSchema = connectionOperationIndexSchema.element
  .extend({ record: pendingConnectionSchema.nullable().optional() })
  .array()
  .max(32);

function operationIndex(storage: HostStorage | undefined) {
  if (!storage) throw new Error('storage-unavailable');
  const raw = storage.getItem(CONNECTION_OPERATIONS_INDEX);
  const value: unknown = raw === null ? [] : JSON.parse(raw);
  let entries: unknown = value;
  if (!Array.isArray(value)) {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('version' in value) ||
      (value.version !== 2 && value.version !== 3) ||
      !('entries' in value)
    )
      throw new Error('connection-operation-storage-unavailable');
    entries = value.entries;
  }
  const index = executionIndexSchema.parse(entries);
  const keys = new Set<string>();
  const prefix = 'botharness.remoteHosts.operation.v1:';
  for (const item of index) {
    if (!item.key.startsWith(prefix)) throw new Error('connection-operation-storage-unavailable');
    const identity: unknown = JSON.parse(item.key.slice(prefix.length));
    if (
      !Array.isArray(identity) ||
      identity.length !== 3 ||
      !identity.every((part) => typeof part === 'string' && part.length > 0) ||
      identity[0] !== item.hostId ||
      item.key !== prefix + JSON.stringify(identity) ||
      keys.has(item.key)
    )
      throw new Error('connection-operation-storage-unavailable');
    keys.add(item.key);
    if (
      item.record &&
      item.key !==
        `botharness.remoteHosts.operation.v1:${JSON.stringify([item.hostId, item.record.hostKey, item.record.deviceId])}`
    )
      throw new Error('connection-operation-storage-unavailable');
  }
  return index;
}

function writeOperationIndex(storage: HostStorage, index: ReturnType<typeof operationIndex>): void {
  storage.setItem(
    CONNECTION_OPERATIONS_INDEX,
    JSON.stringify(index.length ? { version: 3, entries: index } : []),
  );
}

function pruneCompletedOperations(storage: HostStorage, index: ReturnType<typeof operationIndex>) {
  return index.filter((item) => {
    if (item.record !== null) return true;
    try {
      storage.removeItem(item.key);
      return storage.getItem(item.key) !== null;
    } catch {
      return true;
    }
  });
}

function oldConnectionOwner(storage: HostStorage | undefined, host: SavedHost): boolean {
  const previous = operationIndex(storage).filter(
    (entry) =>
      entry.record !== null && entry.hostId === host.hostId && entry.key !== operationKey(host),
  );
  for (const entry of previous) indexedPending(storage, entry);
  return previous.length > 0;
}

function indexedPending(
  storage: HostStorage | undefined,
  entry: {
    key: string;
    record?: PendingConnection | null | undefined;
  },
): PendingConnection | undefined {
  if (entry.record !== undefined) return entry.record ?? undefined;
  const raw = storage?.getItem(entry.key);
  if (raw == null) throw new Error('connection-operation-storage-unavailable');
  return pendingConnectionSchema.parse(JSON.parse(raw));
}

function readPendingConnection(
  storage: HostStorage | undefined,
  host: SavedHost,
): PendingConnection | undefined {
  if (!storage) throw new Error('storage-unavailable');
  const indexed = operationIndex(storage).find((entry) => entry.key === operationKey(host));
  if (indexed) return indexedPending(storage, indexed);
  const value = storage.getItem(operationKey(host));
  return value === null ? undefined : pendingConnectionSchema.parse(JSON.parse(value));
}

function hostConfiguration(host: ManagedSavedHost): SavedHost {
  const {
    pendingConnection: _execution,
    connectionOwnerChanged: _previousOwner,
    connectionOperationUnavailable: _executionUnavailable,
    ...saved
  } = host;
  return saved;
}

export const relationshipEnrollmentPending = (host: SavedHost): boolean =>
  pendingEnrollmentSchema.safeParse(host).data?.relationshipEnrollment !== undefined;
function committedHost(host: SavedHost & { relationshipEnrollment?: unknown }): SavedHost {
  const { relationshipEnrollment: _pending, ...saved } = host;
  return saved;
}

function readAutomaticChoices(storage: HostStorage | undefined) {
  try {
    const rows: unknown = JSON.parse(
      readStorage(storage, REMOTE_HOSTS_STORAGE_KEY, 'botharness.computers.v1') ?? '[]',
    );
    return Array.isArray(rows)
      ? rows.flatMap((row) => automaticEnrollmentChoiceSchema.safeParse(row).data ?? [])
      : [];
  } catch {
    return [];
  }
}

type AutomaticChoice = ReturnType<typeof automaticEnrollmentChoiceSchema.parse>;
type ChoiceChange =
  | { kind: 'preserve' | 'suppress' }
  | { kind: 'clear'; expected: string | null }
  | { kind: 'restore'; choice: AutomaticChoice };
const choiceSnapshot = (choice: AutomaticChoice | undefined): string | null =>
  choice ? JSON.stringify(choice) : null;
function readStorage(storage: HostStorage | undefined, key: string, oldKey: string): string | null {
  const current = storage?.getItem(key);
  const previous = storage?.getItem(oldKey);
  if (previous == null) return current ?? null;
  if (key === REMOTE_HOSTS_STORAGE_KEY) return current ?? previous;
  try {
    if (current == null) storage?.setItem(key, previous);
    storage?.removeItem(oldKey);
  } catch {}
  return current ?? previous;
}

function readTab(storage: HostStorage | undefined): string {
  try {
    return readStorage(storage, HOST_TAB_STORAGE_KEY, 'botharness.computers.tab.v1') ?? ALL_HOSTS;
  } catch {
    return ALL_HOSTS;
  }
}

interface HostEntry {
  host: ManagedSavedHost;
  client: HostClient;
  release: () => void;
  inbox: { feed: Inbox; release: () => void } | undefined;
  retained: InboxSnapshot;
  activity: ReadonlyMap<string, RemoteBotActivity>;
}

const PAIR_FAILURES: ReadonlySet<string> = new Set([
  'unreachable',
  'no-route',
  'host-key-required',
]);
const idleInbox: InboxSnapshot = { status: 'idle' };
type NotificationTranslate = (key: 'remoteHosts.notifications.privateBody') => string;

export type RemoteHostTelemetry = (
  event: 'remote_host:host_pair_complete' | 'remote_host:conversation_open',
  properties?: { outcome: 'success' | 'refused' | 'failed' },
) => void;

class SealOutdated extends Error {}

export interface RemoteHostCustody {
  seal(host: SavedHost): Promise<SavedHost>;
  forget(handle: string): Promise<void>;
}

function devicePublicKey(host: SavedHost): string | undefined {
  const key = host.encryption?.deviceKey;
  if (key === undefined || isCustodyHandle(host.credential)) return key;
  return keyHex(noisePublicKey(keyBytes(key)));
}

export function createRemoteHosts(options: {
  custody?: RemoteHostCustody;
  connectionOperationLock?: <T>(name: string, run: () => Promise<T>) => Promise<T>;
  enabled?: boolean;
  storage?: HostStorage | undefined;
  record?: RemoteHostTelemetry;
  carrier: HostCarrier;
  loadImage?: (url: string, headers: Record<string, string>) => Promise<string | undefined>;
  releaseImage?: (image: string) => void;
  translate?: NotificationTranslate;
  hostName?: (hostId: string, fallback: string) => string;
}): RemoteHosts {
  const { carrier, loadImage, releaseImage } = options;
  const enabled = !memberPage() && options.enabled !== false;
  const storage = enabled ? options.storage : undefined;
  const requireOwner = () => {
    if (!enabled) throw Object.assign(new Error('owner-required'), { code: 'owner-required' });
  };
  const record = options.record ?? (() => {});
  const listeners = new Set<() => void>();
  const clients = new Map<string, HostEntry>();
  const pairing = new Set<string>();
  const activity = new Map<string, ReturnType<typeof observeInbox>>();
  const conversations = new Map<string, Conversation>();
  const images = new Map<string, string>();
  const loading = new Map<string, symbol>();
  let avatars: ReadonlyMap<string, string> = new Map();
  let tab = readTab(storage);
  let open: RemoteConversationTarget | undefined;
  let snapshot: RemoteHostsSnapshot = { hosts: [], avatars, tab };
  let relationshipTimer: ReturnType<typeof setInterval> | undefined;
  let relationshipPoll: AbortController | undefined;
  const reconcileRelationships = async () => {
    if (
      relationshipPoll ||
      listeners.size === 0 ||
      ![...clients.values()].some((entry) => entry.host.relationshipId)
    )
      return;
    const abort = new AbortController();
    relationshipPoll = abort;
    try {
      const result = relationshipListSchema.parse(
        await relationshipRequest(undefined, abort.signal),
      );
      if (abort.signal.aborted) return;
      for (const entry of [...clients.values()]) {
        if (clients.get(entry.host.hostId) !== entry) continue;
        if (!entry.host.relationshipId) continue;
        const relationship = result.relationships.find(
          (item) => item.id === entry.host.relationshipId,
        );
        const pending = pendingEnrollmentSchema.safeParse(entry.host).data?.relationshipEnrollment;
        if (pending && relationship?.state === 'active') {
          const state = await commitRelationshipEnrollment({
            relationshipId: entry.host.relationshipId,
            publicKey: pending.publicKey,
            request: (body) => relationshipRequest(body, abort.signal),
          });
          if (abort.signal.aborted || clients.get(entry.host.hostId) !== entry) continue;
          if (state === 'committed') {
            try {
              await saveHostChange(
                entry.host.hostId,
                entry.client,
                committedHost,
                pending.clearAutomaticChoiceOnCommit &&
                  pending.expectedAutomaticChoice !== undefined
                  ? { kind: 'clear', expected: pending.expectedAutomaticChoice }
                  : { kind: 'preserve' },
              );
            } catch (error) {
              if (!(error instanceof Error) || error.message !== 'client-automatic-choice-changed')
                throw error;
              await cancelRelationshipEnrollment({
                relationshipId: entry.host.relationshipId,
                publicKey: pending.publicKey,
                request: (body) => relationshipRequest(body),
              });
              await revoke(entry.host);
              await persistCredential(entry.host.hostId, entry.host, () => undefined);
              if (clients.get(entry.host.hostId) === entry) retireEntry(entry);
              publish();
            }
          }
          if (state === 'cancelled') {
            await revoke(entry.host);
            if (clients.get(entry.host.hostId) !== entry) continue;
            try {
              await persistCredential(entry.host.hostId, entry.host, () => undefined);
            } catch (error) {
              if (!(error instanceof Error) || error.message !== 'connection-host-changed')
                throw error;
              continue;
            }
            if (clients.get(entry.host.hostId) === entry) retireEntry(entry);
          }
        }
        if (relationship?.state !== 'disconnected') continue;
        const releasing = releaseRemoteHostViewers(entry.client);
        await forget(entry.host.hostId);
        await releasing;
      }
    } catch {
    } finally {
      if (relationshipPoll === abort) relationshipPoll = undefined;
    }
  };
  const notifications = createRemoteNotifications({
    requireOwner,
    ...(options.hostName === undefined ? {} : { hostName: options.hostName }),
    storage,
    api: browserNotificationApi(),
    async prepareEnable(hostId, signal) {
      const entry = clients.get(hostId);
      const inbox = entry?.inbox?.feed;
      if (entry === undefined || inbox === undefined)
        throw new Error('notification-baseline-unavailable');
      await prepareNotificationBaseline(inbox, signal);
      if (
        clients.get(hostId) !== entry ||
        entry.inbox?.feed !== inbox ||
        entry.client.getSnapshot().connection.status !== 'connected'
      )
        throw new Error('notification-activation-cancelled');
    },
    privateBody: () =>
      options.translate?.('remoteHosts.notifications.privateBody') ??
      en['remoteHosts.notifications.privateBody'],
    open(target) {
      globalThis.window?.focus();
      open = target;
      record('remote_host:conversation_open');
      publish();
    },
  });

  const fetchAvatars = (hosts: readonly RemoteHost[]): void => {
    const wanted = new Map(
      hosts.flatMap(({ snapshot: host }) =>
        listeners.size === 0 || host.connection.status === 'refused'
          ? []
          : (host.roster?.bots ?? []).flatMap((bot) =>
              bot.avatarUrl === undefined
                ? []
                : [[bot.avatarUrl, bot.avatarHeaders ?? {}] as const],
            ),
      ),
    );
    for (const [url, image] of images) {
      if (wanted.has(url)) continue;
      images.delete(url);
      releaseImage?.(image);
      avatars = new Map(images);
    }
    for (const url of loading.keys()) if (!wanted.has(url)) loading.delete(url);
    if (loadImage === undefined) return;
    for (const [url, headers] of wanted) {
      if (images.has(url) || loading.has(url)) continue;
      const request = Symbol();
      loading.set(url, request);
      void loadImage(url, headers)
        .catch(() => undefined)
        .then((image) => {
          if (loading.get(url) !== request) {
            if (image !== undefined) releaseImage?.(image);
            return;
          }
          loading.delete(url);
          if (image === undefined) return;
          images.set(url, image);
          avatars = new Map(images);
          publish();
        });
    }
  };

  const publish = (): void => {
    const hosts = [...clients.values()].map(({ host, client, inbox, retained, activity }) => ({
      host,
      snapshot: client.getSnapshot(),
      inbox: inbox?.feed.getSnapshot() ?? retained,
      activity,
    }));
    fetchAvatars(hosts);
    if (listeners.size > 0) notifications.update(hosts);
    const known = tab === ALL_HOSTS || tab === THIS_HOST || clients.has(tab);
    snapshot = {
      hosts,
      avatars,
      tab: known ? tab : ALL_HOSTS,
      ...(open === undefined ? {} : { open }),
    };
    for (const listener of listeners) listener();
  };

  const start = (entry: HostEntry): void => {
    if (relationshipEnrollmentPending(entry.host)) return;
    entry.client.start();
    if (entry.inbox !== undefined) return;
    const feed = createInbox(entry.client, { activity: true, notifications: true }, entry.retained);
    entry.inbox = { feed, release: feed.subscribe(publish) };
  };

  const stop = (entry: HostEntry): void => {
    entry.retained = entry.inbox?.feed.getSnapshot() ?? entry.retained;
    entry.inbox?.release();
    entry.inbox?.feed.stop();
    entry.inbox = undefined;
    entry.client.stop();
  };

  const custody = options.custody;
  const sealedHandles = new Map<string, string>();
  const forgetHandle = async (handle: string, raw?: string): Promise<void> => {
    if (!custody) return;
    updateReleaseQueue(storage, (handles) => [...handles, handle]);
    if (readHosts(storage).some((saved) => saved.credential === handle)) return;
    try {
      await custody.forget(handle);
      updateReleaseQueue(storage, (handles) => handles.filter((item) => item !== handle));
      if (raw !== undefined) sealedHandles.delete(raw);
    } catch {}
  };
  const releasePending = async (): Promise<void> => {
    for (const handle of readReleaseQueue(storage)) await forgetHandle(handle);
  };
  const sameCredential = (a: SavedHost, b: SavedHost): boolean =>
    a.hostId === b.hostId &&
    a.deviceId === b.deviceId &&
    (isCustodyHandle(a.credential) === isCustodyHandle(b.credential)
      ? a.credential === b.credential
      : (sealedHandles.get(a.credential) ?? a.credential) ===
        (sealedHandles.get(b.credential) ?? b.credential)) &&
    a.encryption?.hostKey === b.encryption?.hostKey &&
    devicePublicKey(a) === devicePublicKey(b) &&
    a.relationshipId === b.relationshipId;
  const releaseCustody = async (host: SavedHost): Promise<void> => {
    if (!custody) return;
    const handle = isCustodyHandle(host.credential)
      ? host.credential
      : sealedHandles.get(host.credential);
    if (handle === undefined) return;
    await forgetHandle(handle, isCustodyHandle(host.credential) ? undefined : host.credential);
  };
  const revoke = async (host: SavedHost) => {
    try {
      return await revokePairing({ host, carrier });
    } finally {
      await releaseCustody(host);
    }
  };
  const sealFor = async (next: SavedHost): Promise<SavedHost> => {
    if (!custody) return next;
    const sealed = await custody.seal(next);
    if (!isCustodyHandle(next.credential)) sealedHandles.set(next.credential, sealed.credential);
    const pending = pendingEnrollmentSchema.safeParse(next).data?.relationshipEnrollment;
    return pending ? Object.assign(sealed, { relationshipEnrollment: pending }) : sealed;
  };
  const persistCredential = async (
    hostId: string,
    expected: SavedHost | undefined,
    change: (current: SavedHost | undefined) => SavedHost | undefined,
    choiceChange: ChoiceChange = { kind: 'preserve' },
  ): Promise<SavedHost | undefined> => {
    if (!storage) throw new Error('storage-unavailable');
    for (let attempt = 0; ; attempt += 1) {
      let preview: SavedHost | undefined;
      let sealed: SavedHost | undefined;
      let storedBefore: string | undefined;
      if (custody) {
        const stored = readHosts(storage).find((host) => host.hostId === hostId);
        if (expected ? !stored || !sameCredential(stored, expected) : stored !== undefined)
          throw new Error('connection-host-changed');
        storedBefore = JSON.stringify(stored);
        preview = change(stored);
        if (preview) sealed = await sealFor(preview);
      }
      try {
        const written = await writeCredential(
          hostId,
          expected,
          (stored) => {
            const next = change(stored);
            if (!custody || !next) return next;
            if (
              JSON.stringify(stored) !== storedBefore ||
              JSON.stringify(next) !== JSON.stringify(preview)
            )
              throw new SealOutdated();
            return sealed;
          },
          choiceChange,
        );
        await releasePending();
        return written;
      } catch (error) {
        if (sealed && preview && !isCustodyHandle(preview.credential)) {
          if (sealedHandles.get(preview.credential) === sealed.credential)
            sealedHandles.delete(preview.credential);
          await forgetHandle(sealed.credential);
        }
        if (!(error instanceof SealOutdated) || attempt >= 2)
          throw error instanceof SealOutdated ? new Error('connection-host-changed') : error;
      }
    }
  };
  const writeCredential = async (
    hostId: string,
    expected: SavedHost | undefined,
    change: (current: SavedHost | undefined) => SavedHost | undefined,
    choiceChange: ChoiceChange,
  ): Promise<SavedHost | undefined> => {
    if (!storage) throw new Error('storage-unavailable');
    return withRemoteHostCredentialWrite({
      storage,
      run: () => {
        const current = readHosts(storage);
        const stored = current.find((host) => host.hostId === hostId);
        if (expected ? !stored || !sameCredential(stored, expected) : stored !== undefined)
          throw new Error('connection-host-changed');
        const next = change(stored);
        const currentChoices = readAutomaticChoices(storage);
        if (
          choiceChange.kind === 'clear' &&
          choiceSnapshot(currentChoices.find((choice) => choice.hostId === hostId)) !==
            choiceChange.expected
        )
          throw new Error('client-automatic-choice-changed');
        const hosts = current.filter((host) => host.hostId !== hostId);
        if (next) hosts.push(next);
        const clearChoice = choiceChange.kind === 'clear';
        const choices = currentChoices.filter(
          (choice) =>
            choice.hostId !== hostId || (!clearChoice && choiceChange.kind !== 'suppress'),
        );
        if (choiceChange.kind === 'restore' && !choices.some((choice) => choice.hostId === hostId))
          choices.push(choiceChange.choice);
        if (choiceChange.kind === 'suppress' && expected) {
          if (choices.length >= 256) throw new Error('client-automatic-choice-limit');
          choices.push({
            kind: 'automatic-enrollment-suppressed',
            hostId,
            generation: keyHex(secureRandom(carrier)),
            publicKey: expected.encryption?.hostKey ?? null,
          });
        }
        storage.setItem(
          REMOTE_HOSTS_STORAGE_KEY,
          JSON.stringify([...hosts.map(serializeSavedHost), ...choices]),
        );
        try {
          storage.removeItem('botharness.computers.v1');
        } catch {}
        return next;
      },
    });
  };

  const saveHostChange = async (
    hostId: string,
    client: HostClient,
    change: (host: SavedHost) => SavedHost,
    choiceChange: ChoiceChange = { kind: 'preserve' },
  ): Promise<void> => {
    const entry = clients.get(hostId);
    if (!entry || entry.client !== client) throw new Error('connection-host-changed');
    const wasPending = relationshipEnrollmentPending(entry.host);
    if (!storage) throw new Error('storage-unavailable');
    const next = await persistCredential(
      hostId,
      entry.host,
      (current) => {
        if (!current || clients.get(hostId)?.client !== client)
          throw new Error('connection-host-changed');
        return change(current);
      },
      choiceChange,
    );
    if (!next || clients.get(hostId) !== entry) throw new Error('connection-host-changed');
    entry.host = readExecutionHost(storage, next);
    if (wasPending && listeners.size > 0 && !relationshipEnrollmentPending(next)) start(entry);
    publish();
  };

  const attach = (host: ManagedSavedHost): void => {
    host = readExecutionHost(storage, host);
    const client = createHostClient({
      ...host,
      onRoutesChanged: async (routes) =>
        saveHostChange(host.hostId, client, (current) => ({ ...current, routes })),
      onRoutePreferenceChanged: async (routePreference) =>
        saveHostChange(host.hostId, client, (current) => {
          const { routePreference: _previous, ...rest } = current;
          return routePreference === undefined ? rest : { ...rest, routePreference };
        }),
      routes: host.routes,
      credential: host.credential,
      carrier,
    });
    const projectActivity = createRemoteActivityProjection();
    const entry: HostEntry = {
      host,
      client,
      release: client.subscribe(() => {
        entry.activity = projectActivity(client.getSnapshot().roster?.bots ?? [], Date.now());
        publish();
      }),
      inbox: undefined,
      retained: idleInbox,
      activity: new Map(),
    };
    clients.set(host.hostId, entry);
    if (listeners.size > 0) start(entry);
  };

  for (const host of readHosts(storage)) attach(host);
  publish();

  const detachEntry = (entry: HostEntry): boolean => {
    const hostId = entry.host.hostId;
    if (clients.get(hostId) !== entry) return false;
    entry.release();
    stop(entry);
    clients.delete(hostId);
    activity.delete(hostId);
    for (const [key, conversation] of conversations)
      if ((JSON.parse(key) as string[])[0] === hostId) {
        conversation.stop();
        conversations.delete(key);
      }
    return true;
  };
  const retireEntry = (entry: HostEntry): void => {
    const hostId = entry.host.hostId;
    if (!detachEntry(entry)) return;
    notifications.forget(hostId);
    if (open?.hostId === hostId) open = undefined;
    if (tab === hostId) {
      tab = ALL_HOSTS;
      try {
        storage?.setItem(HOST_TAB_STORAGE_KEY, tab);
      } catch {}
    }
    publish();
  };
  const forget = async (hostId: string, suppressAutomatic = false): Promise<void> => {
    const entry = clients.get(hostId);
    if (!entry) return;
    await persistCredential(hostId, entry.host, () => undefined, {
      kind: suppressAutomatic ? 'suppress' : 'preserve',
    });
    retireEntry(entry);
  };
  void (async () => {
    if (!custody) return;
    await releasePending();
    for (const host of readHosts(storage)) {
      if (isCustodyHandle(host.credential)) continue;
      const entry = clients.get(host.hostId);
      if (!entry || !sameCredential(entry.host, host)) continue;
      try {
        const sealed = await persistCredential(host.hostId, host, (current) => current);
        if (!sealed || clients.get(host.hostId) !== entry) continue;
        const running = entry.inbox !== undefined;
        detachEntry(entry);
        attach(sealed);
        const next = clients.get(host.hostId);
        if (running && next && listeners.size > 0) start(next);
      } catch {}
    }
    publish();
  })();
  const refreshCredentials = (): void => {
    const saved = readHosts(storage);
    for (const entry of [...clients.values()]) {
      const current = saved.find((host) => host.hostId === entry.host.hostId);
      if (!current) retireEntry(entry);
      else if (
        !sameCredential(current, entry.host) &&
        current.encryption?.hostKey === entry.host.encryption?.hostKey
      ) {
        retireEntry(entry);
        attach(current);
      } else if (sameCredential(current, entry.host)) {
        const wasPending = relationshipEnrollmentPending(entry.host);
        entry.host = readExecutionHost(storage, current);
        entry.client.updateRoutes?.(current.routes, current.encryption, {
          routePreference: current.routePreference,
        });
        if (wasPending && listeners.size > 0 && !relationshipEnrollmentPending(current))
          start(entry);
      }
    }
    for (const host of saved) if (!clients.has(host.hostId)) attach(host);
    publish();
  };
  const persistentOwner = (hostId: string, client: HostClient) => {
    const entry = clients.get(hostId);
    const current = readHosts(storage, true).find((host) => host.hostId === hostId);
    if (!entry || entry.client !== client || !current || !sameCredential(current, entry.host))
      throw new Error('connection-host-changed');
    return { entry, current };
  };
  const storageChanged = (event: StorageEvent) => {
    if (
      event.storageArea !== storage ||
      (event.key !== null && event.key !== REMOTE_HOSTS_STORAGE_KEY)
    )
      return;
    refreshCredentials();
  };

  const setPendingConnection = (
    hostId: string,
    client: HostClient,
    pending: PendingConnection | undefined,
    expectedGeneration?: string,
    previousDeviceId?: string,
    notify = true,
  ): void => {
    requireOwner();
    const entry = clients.get(hostId);
    if (!entry || entry.client !== client) throw new Error('connection-host-changed');
    if (!storage) throw new Error('storage-unavailable');
    if (previousDeviceId !== undefined && pending !== undefined)
      throw new Error('connection-operation-owner-changed');
    const owner =
      previousDeviceId === undefined ? entry.host : { ...entry.host, deviceId: previousDeviceId };
    const current = readPendingConnection(storage, owner);
    if (
      expectedGeneration !== undefined
        ? current?.generation !== expectedGeneration
        : current !== undefined
    )
      throw new Error('connection-operation-changed');
    const executionKey = operationKey(owner);
    let index = pruneCompletedOperations(storage, operationIndex(storage));
    if (pending) {
      if (pending.deviceId !== owner.deviceId || pending.hostKey !== owner.encryption?.hostKey)
        throw new Error('connection-operation-owner-changed');
      if (!index.some((item) => item.key === executionKey)) {
        if (index.length >= 32) throw new Error('connection-operation-limit');
      }
      index = [
        ...index.filter((item) => item.key !== executionKey),
        { hostId, key: executionKey, record: pending },
      ];
    } else {
      index = index.filter((item) => item.key !== executionKey);
      if (storage.getItem(executionKey) !== null)
        index.push({ hostId, key: executionKey, record: null });
    }
    const currentPending =
      previousDeviceId === undefined ? pending : readPendingConnection(storage, entry.host);
    const {
      pendingConnection: _previous,
      connectionOwnerChanged: _previousOwner,
      connectionOperationUnavailable: _executionUnavailable,
      ...rest
    } = entry.host;
    const nextHost = {
      ...rest,
      ...(currentPending ? { pendingConnection: currentPending } : {}),
      ...(index.some(
        (item) =>
          item.record !== null && item.hostId === hostId && item.key !== operationKey(entry.host),
      )
        ? { connectionOwnerChanged: true }
        : {}),
    };
    writeOperationIndex(storage, index);
    entry.host = nextHost;
    if (notify) publish();
    if (!pending && index.some((item) => item.key === executionKey && item.record === null)) {
      try {
        storage.removeItem(executionKey);
        if (storage.getItem(executionKey) === null)
          writeOperationIndex(
            storage,
            index.filter((item) => item.key !== executionKey),
          );
      } catch {}
    }
  };
  return {
    async withConnectionOperation(hostId, client, run, signal) {
      requireOwner();
      const entry = clients.get(hostId);
      if (!entry || entry.client !== client) throw new Error('connection-host-changed');
      let entered = false;
      const locked = async () => {
        entered = true;
        if (clients.get(hostId) !== entry || entry.client !== client)
          throw new Error('connection-host-changed');
        if (!storage) throw new Error('storage-unavailable');
        await withRemoteHostCredentialWrite({
          storage,
          run: () => {
            signal?.throwIfAborted();
            const { current } = persistentOwner(hostId, client);
            const index = operationIndex(storage);
            const pruned = pruneCompletedOperations(storage, index);
            if (pruned.length !== index.length) writeOperationIndex(storage, pruned);
            const pending = readPendingConnection(storage, current);
            entry.host = {
              ...current,
              ...(pending ? { pendingConnection: pending } : {}),
              ...(oldConnectionOwner(storage, current) ? { connectionOwnerChanged: true } : {}),
            };
            publish();
          },
        });
        return run();
      };
      const name = CONNECTION_OPERATIONS_INDEX;
      if (options.connectionOperationLock) return options.connectionOperationLock(name, locked);
      if (typeof navigator === 'undefined' || !navigator.locks)
        throw new Error('connection-operation-lock-unavailable');
      try {
        return await navigator.locks.request(name, signal ? { signal } : {}, locked);
      } catch (error) {
        if (!entered && !signal?.aborted)
          throw new Error('connection-operation-lock-unavailable', { cause: error });
        throw error;
      }
    },
    async dispatchConnectionOperation(hostId, client, pending, dispatch) {
      requireOwner();
      if (!storage) throw new Error('storage-unavailable');
      return withRemoteHostCredentialWrite({
        storage,
        run: () => {
          const { entry, current } = persistentOwner(hostId, client);
          entry.host = readExecutionHost(storage, current);
          if (entry.host.connectionOperationUnavailable)
            throw new Error('connection-operation-storage-unavailable');
          if (entry.host.pendingConnection || entry.host.connectionOwnerChanged)
            throw new Error('connection-management-unconfirmed');
          if (
            pending.deviceId !== current.deviceId ||
            pending.hostKey !== current.encryption?.hostKey
          )
            throw new Error('connection-operation-owner-changed');
          dispatch.check();
          setPendingConnection(hostId, client, pending, undefined, undefined, false);
          const response = dispatch.send();
          void response.catch(() => {});
          publish();
          return { response };
        },
      });
    },
    previousConnectionOperations(hostId, client) {
      requireOwner();
      const entry = clients.get(hostId);
      if (!entry || entry.client !== client) throw new Error('connection-host-changed');
      const records: PendingConnection[] = [];
      for (const item of operationIndex(storage)) {
        if (item.record === null || item.hostId !== hostId || item.key === operationKey(entry.host))
          continue;
        const record = indexedPending(storage, item);
        if (!record) throw new Error('connection-operation-storage-unavailable');
        if (record.hostKey !== entry.host.encryption?.hostKey)
          throw new Error('connection-operation-owner-changed');
        records.push(record);
      }
      return records;
    },
    setPendingConnection,
    async retireRelationship(relationshipId) {
      requireOwner();
      for (const entry of [...clients.values()]) {
        if (clients.get(entry.host.hostId) !== entry) continue;
        if (entry.host.relationshipId !== relationshipId) continue;
        const releasing = releaseRemoteHostViewers(entry.client);
        await forget(entry.host.hostId);
        await releasing;
      }
    },
    notifications,
    async learnRelationshipRoutes(peer, privateRelay, intent) {
      requireOwner();
      const entry = clients.get(peer.id);
      if (!entry || peer.routes.length === 0) return;
      if (entry.host.encryption?.hostKey !== peer.publicKey) throw new Error('host-key-mismatch');
      await saveHostChange(peer.id, entry.client, (current) => {
        if (intent === 'merge-existing' && current.encryption?.privateRelay) return current;
        const learned =
          intent === 'merge-existing'
            ? { ...peer, routes: [...new Set([...peer.routes, ...current.routes])] }
            : peer;
        if (intent === 'merge-existing' && learned.routes.length > 8)
          throw new Error('relationship-route-limit');
        const updated = updateRelationshipClientRoute({
          host: current,
          peer: learned,
          ...(privateRelay ? { privateRelay } : {}),
        });
        if (!updated.ok) throw new Error(updated.code);
        const pending = pendingEnrollmentSchema.safeParse(current).data?.relationshipEnrollment;
        return pending ? { ...updated.host, relationshipEnrollment: pending } : updated.host;
      }).catch((error) => {
        if (
          !privateRelay &&
          error instanceof Error &&
          error.message === 'relationship-route-admission-required'
        )
          return;
        throw error;
      });
      entry.client.updateRoutes?.(entry.host.routes, entry.host.encryption);
      entry.client.retryNow('manual_retry', { preserveConnected: true });
    },
    async enrollRelationship(relationship, name, signal, background) {
      if (!enabled) return { ok: false, code: 'owner-required' };
      const target = relationship.peer.id;
      const automaticSuppressed = () =>
        readAutomaticChoices(storage).some(
          (choice) =>
            choice.hostId === target &&
            (choice.publicKey === null || choice.publicKey === relationship.peer.publicKey),
        );
      const enroll = async (): Promise<HostPairResult> => {
        if (signal?.aborted) return { ok: false, code: 'cancelled' };
        if (background && automaticSuppressed())
          return { ok: false, code: 'client-automatic-enrollment-suppressed' };
        if (clients.has(target)) return { ok: false, code: 'already-paired' };
        const saved = readHosts(storage).find((host) => host.hostId === target);
        if (saved) {
          if (saved.encryption?.hostKey !== relationship.peer.publicKey)
            return { ok: false, code: 'host-key-changed' };
          attach(saved);
          publish();
          return { ok: true, host: saved };
        }
        if (pairing.has(target)) return { ok: false, code: 'pairing-in-progress' };
        const priorChoice = readAutomaticChoices(storage).find(
          (choice) => choice.hostId === target,
        );
        pairing.add(target);
        try {
          const result = await enrollRelationshipClient({
            relationshipId: relationship.id,
            expectedPeer: relationship.peer,
            name,
            carrier,
            request: (body) => relationshipRequest(body, signal),
            cleanupRequest: (body) => relationshipRequest(body),
            ...(signal ? { signal } : {}),
            ...(background ? { accountGeneration: background.accountGeneration } : {}),
          });
          if (!result.ok) return result;
          const tentativeHost = background
            ? result.host
            : {
                ...result.host,
                relationshipEnrollment: {
                  ...result.host.relationshipEnrollment,
                  clearAutomaticChoiceOnCommit: true as const,
                  expectedAutomaticChoice: choiceSnapshot(priorChoice),
                },
              };
          const preserveCommittedOnAbort = () =>
            signal?.reason === 'owner-disposed' || signal?.reason === 'account-changed';
          const cancelIssued = async (
            code: 'cancelled' | 'storage-failure' | 'already-paired',
          ): Promise<HostPairResult> => {
            await cancelRelationshipEnrollment({
              relationshipId: relationship.id,
              publicKey: result.enrollmentPublicKey,
              request: (body) => relationshipRequest(body),
            });
            await revoke(result.host);
            try {
              await persistCredential(
                target,
                result.host,
                () => undefined,
                priorChoice ? { kind: 'restore', choice: priorChoice } : { kind: 'preserve' },
              );
            } catch {}
            return { ok: false, code };
          };
          if (signal?.aborted || clients.has(result.host.hostId)) {
            return cancelIssued(signal?.aborted ? 'cancelled' : 'already-paired');
          }
          try {
            if (!storage) throw new Error('storage-unavailable');
            await persistCredential(target, undefined, () => {
              if (signal?.aborted || (background && automaticSuppressed()))
                throw new Error('enrollment-cancelled');
              return tentativeHost;
            });
          } catch {
            return cancelIssued(signal?.aborted ? 'cancelled' : 'storage-failure');
          }
          if (signal?.aborted) return cancelIssued('cancelled');
          const confirmation = await commitRelationshipEnrollment({
            relationshipId: relationship.id,
            publicKey: result.enrollmentPublicKey,
            request: (body) => relationshipRequest(body),
          });
          if (confirmation === 'cancelled') {
            return cancelIssued('cancelled');
          }
          if (background && automaticSuppressed())
            return { ok: false, code: 'client-automatic-enrollment-suppressed' };
          if (signal?.aborted)
            return preserveCommittedOnAbort()
              ? { ok: false, code: 'cancelled' }
              : cancelIssued('cancelled');
          if (confirmation === 'committed') {
            try {
              await persistCredential(
                target,
                result.host,
                (current) => {
                  if (signal?.aborted || (background && automaticSuppressed()))
                    throw new Error('enrollment-cancelled');
                  return current ? committedHost(current) : undefined;
                },
                background
                  ? { kind: 'preserve' }
                  : { kind: 'clear', expected: choiceSnapshot(priorChoice) },
              );
            } catch (error) {
              if (error instanceof Error && error.message === 'client-automatic-choice-changed')
                return cancelIssued('cancelled');
            }
          }
          if (signal?.aborted)
            return preserveCommittedOnAbort()
              ? { ok: false, code: 'cancelled' }
              : cancelIssued('cancelled');
          if (background && automaticSuppressed())
            return { ok: false, code: 'client-automatic-enrollment-suppressed' };
          const savedNow = readHosts(storage).find((item) => item.hostId === target);
          if (!savedNow || !sameCredential(savedNow, result.host))
            return automaticSuppressed()
              ? { ok: false, code: 'cancelled' }
              : cancelIssued('cancelled');
          const existing = clients.get(target);
          if (existing && !sameCredential(existing.host, savedNow))
            return cancelIssued('cancelled');
          if (!existing) attach(savedNow);
          if (!background) {
            tab = result.host.hostId;
            try {
              storage?.setItem(HOST_TAB_STORAGE_KEY, tab);
            } catch {}
          }
          publish();
          return result;
        } finally {
          pairing.delete(target);
        }
      };
      if (!background) return enroll();
      if (!storage) return { ok: false, code: 'storage-failure' };
      try {
        return await withRemoteHostStorageLock({
          storage,
          name: `enroll:${target}`,
          run: enroll,
          ...(signal ? { signal } : {}),
        });
      } catch (error) {
        return {
          ok: false,
          code: signal?.aborted
            ? 'cancelled'
            : error instanceof Error && error.message === 'client-storage-lock-unavailable'
              ? 'client-lock-unavailable'
              : 'storage-failure',
        };
      }
    },
    getSnapshot: () => snapshot,
    client: (hostId) => clients.get(hostId)?.client,
    activity(hostId, query) {
      const entry = clients.get(hostId);
      if (entry === undefined) return undefined;
      if (query !== undefined) return observeInbox(entry.client, query);
      let observed = activity.get(hostId);
      if (observed === undefined) {
        observed = {
          getSnapshot: () => entry.inbox?.feed.getSnapshot() ?? entry.retained,
          getInbox: () => entry.inbox?.feed,
          subscribe(listener) {
            return entry.inbox?.feed.subscribe(listener) ?? (() => {});
          },
          watching: () => entry.inbox !== undefined,
        };
        activity.set(hostId, observed);
      }
      return observed;
    },
    subscribe(listener) {
      const first = listeners.size === 0;
      listeners.add(listener);
      if (first) {
        globalThis.addEventListener?.('storage', storageChanged);
        refreshCredentials();
        for (const entry of clients.values()) start(entry);
        relationshipTimer = setInterval(() => {
          void reconcileRelationships();
        }, 2000);
        void reconcileRelationships();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        globalThis.removeEventListener?.('storage', storageChanged);
        if (relationshipTimer !== undefined) clearInterval(relationshipTimer);
        relationshipTimer = undefined;
        relationshipPoll?.abort();
        for (const entry of clients.values()) stop(entry);
        notifications.stop();
      };
    },
    async teamSignIn(target, localHostId, signal) {
      if (!enabled) return { ok: false, code: 'owner-required' };
      const preparedFlow = await prepareTeamSignIn({
        target,
        carrier,
        ...(signal ? { signal } : {}),
        previous: (hostId) => readHosts(storage).find((host) => host.hostId === hostId),
        async commit(host, confirmed, flowSignal) {
          if (host.hostId === localHostId) return { ok: false, code: 'this-host' };
          if (flowSignal.aborted) return { ok: false, code: 'request-cancelled' };
          if (
            hostSettingsDrafts.hasDirty(host.hostId) &&
            !(await hostSettingsDrafts.prepare(host.hostId))
          )
            return { ok: false, code: 'request-cancelled' };
          const previous = readHosts(storage).find((item) => item.hostId === host.hostId);
          let refusal: TeamSignInError | undefined;
          let saved: SavedHost | undefined;
          try {
            saved = await persistCredential(host.hostId, previous, (current) => {
              if (flowSignal.aborted) throw new Error('request-cancelled');
              const prepared = prepareMemberIdentity(
                { hosts: current ? [current] : [] },
                host,
                confirmed,
              );
              if (!prepared.ok) {
                refusal = prepared.code;
                throw new Error(prepared.code);
              }
              return host;
            });
          } catch {
            return {
              ok: false,
              code: refusal ?? (flowSignal.aborted ? 'request-cancelled' : 'storage-failed'),
            };
          }
          const existing = clients.get(host.hostId);
          if (existing) {
            const releasing = releaseRemoteHostViewers(existing.client);
            retireEntry(existing);
            await releasing.catch(() => undefined);
          }
          attach(saved ?? host);
          tab = host.hostId;
          try {
            storage?.setItem(HOST_TAB_STORAGE_KEY, tab);
          } catch {}
          publish();
          if (previous && previous.credential !== host.credential) {
            try {
              await revoke(previous);
            } catch {}
          }
          return { ok: true, value: saved ?? host };
        },
      });
      if (preparedFlow.ok) {
        const step = preparedFlow.value.getSnapshot();
        if (step.kind === 'fingerprint' && step.host.id === localHostId) {
          await preparedFlow.value.cancel();
          return { ok: false, code: 'this-host' };
        }
      }
      return preparedFlow;
    },
    async pair(link, deviceName, localHostId, trust) {
      if (!enabled) return { ok: false, code: 'owner-required' };
      if (trust?.signal?.aborted) return { ok: false, code: 'cancelled' };
      try {
        if (new URL(link.trim()).hostname === 'team') {
          const invitation = parseTeamInvitation(link);
          return invitation.ok
            ? { ok: false, code: 'team-sign-in-required', invitation: invitation.value }
            : invitation;
        }
      } catch {}
      const parsed = parsePairingLink(link);
      const refused = (code: 'this-host' | 'already-paired') => {
        record('remote_host:host_pair_complete', { outcome: 'refused' });
        return { ok: false, code } as const;
      };
      if (!parsed.ok) {
        record('remote_host:host_pair_complete', {
          outcome: PAIR_FAILURES.has(parsed.code) ? 'failed' : 'refused',
        });
        return parsed;
      }
      if (parsed.payload.host.id === localHostId) return refused('this-host');
      if (clients.has(parsed.payload.host.id)) return refused('already-paired');
      if (pairing.has(parsed.payload.host.id)) return { ok: false, code: 'pairing-in-progress' };
      const priorChoice = readAutomaticChoices(storage).find(
        (choice) => choice.hostId === parsed.payload.host.id,
      );
      pairing.add(parsed.payload.host.id);
      try {
        const redeemed = await redeemPairing({
          payload: parsed.payload,
          deviceName,
          carrier,
          ...trust,
        });
        if (!redeemed.ok) {
          if (trust?.signal?.aborted) return redeemed;
          record('remote_host:host_pair_complete', {
            outcome: PAIR_FAILURES.has(redeemed.code) ? 'failed' : 'refused',
          });
          return redeemed;
        }
        const cancelNew = async () => {
          try {
            await persistCredential(
              redeemed.host.hostId,
              redeemed.host,
              () => undefined,
              priorChoice ? { kind: 'restore', choice: priorChoice } : { kind: 'preserve' },
            );
          } catch {}
          await revoke(redeemed.host);
        };
        if (trust?.signal?.aborted) {
          await cancelNew();
          return { ok: false, code: 'cancelled' };
        }
        try {
          if (!storage) throw new Error('storage-unavailable');
          await persistCredential(redeemed.host.hostId, undefined, () => {
            if (trust?.signal?.aborted) throw new Error('pairing-cancelled');
            return redeemed.host;
          });
        } catch {
          await cancelNew();
          record('remote_host:host_pair_complete', { outcome: 'failed' });
          return { ok: false, code: trust?.signal?.aborted ? 'cancelled' : 'storage-failure' };
        }
        if (trust?.signal?.aborted) {
          await cancelNew();
          return { ok: false, code: 'cancelled' };
        }
        try {
          await persistCredential(
            redeemed.host.hostId,
            redeemed.host,
            (current) => {
              if (trust?.signal?.aborted) throw new Error('pairing-cancelled');
              return current;
            },
            { kind: 'clear', expected: choiceSnapshot(priorChoice) },
          );
        } catch {
          await cancelNew();
          return { ok: false, code: trust?.signal?.aborted ? 'cancelled' : 'storage-failure' };
        }
        if (trust?.signal?.aborted) {
          await cancelNew();
          return { ok: false, code: 'cancelled' };
        }
        const savedNow = readHosts(storage).find((item) => item.hostId === redeemed.host.hostId);
        const existing = clients.get(redeemed.host.hostId);
        if (
          !savedNow ||
          !sameCredential(savedNow, redeemed.host) ||
          (existing && !sameCredential(existing.host, redeemed.host))
        ) {
          await cancelNew();
          return { ok: false, code: 'cancelled' };
        }
        if (!existing) attach(savedNow);
        tab = redeemed.host.hostId;
        try {
          storage?.setItem(HOST_TAB_STORAGE_KEY, tab);
        } catch {}
        publish();
        record('remote_host:host_pair_complete', { outcome: 'success' });
        return redeemed;
      } finally {
        pairing.delete(parsed.payload.host.id);
      }
    },
    async forgetLocal(hostId) {
      requireOwner();
      const entry = clients.get(hostId);
      if (entry === undefined) return;
      if (hostSettingsDrafts.hasDirty(hostId) && !(await hostSettingsDrafts.prepare(hostId)))
        return;
      if (clients.get(hostId) !== entry) return;
      if (!storage) throw new Error('storage-unavailable');
      const releasing = releaseRemoteHostViewers(entry.client);
      await forget(hostId, true);
      await releasing;
      await releaseCustody(entry.host);
    },
    async remove(hostId) {
      requireOwner();
      const entry = clients.get(hostId);
      if (entry === undefined) return;
      if (hostSettingsDrafts.hasDirty(hostId) && !(await hostSettingsDrafts.prepare(hostId)))
        return;
      if (clients.get(hostId) !== entry) return;
      const releasing = releaseRemoteHostViewers(entry.client);
      await forget(hostId, true);
      await releasing;
      await revoke(entry.host);
      const publicKey = relationshipClientPublicKey(entry.host);
      if (entry.host.relationshipId && publicKey)
        await cancelRelationshipEnrollment({
          relationshipId: entry.host.relationshipId,
          publicKey,
          request: (body) => relationshipRequest(body),
        });
    },
    select(next) {
      requireOwner();
      if (tab !== next) notifications.cancel();
      tab = next;
      try {
        storage?.setItem(HOST_TAB_STORAGE_KEY, next);
      } catch {}
      publish();
    },
    open(target) {
      requireOwner();
      open = target;
      record('remote_host:conversation_open');
      publish();
    },
    close() {
      if (open === undefined) return;
      open = undefined;
      publish();
    },
    async markRead(target, messageId) {
      requireOwner();
      const entry = clients.get(target.hostId);
      if (entry === undefined) return;
      const channelId =
        target.channelId ??
        entry.client.getSnapshot().roster?.bots.find((bot) => bot.slug === target.botSlug)
          ?.dmChannelId;
      if (channelId === undefined) throw new Error('The remote Channel is not ready.');
      await markChannelRead(entry.client, channelId, messageId);
      await entry.inbox?.feed.refresh();
    },
    conversation(target) {
      const entry = clients.get(target.hostId);
      if (entry === undefined) return undefined;
      const key = conversationKey(target);
      let conversation = conversations.get(key);
      if (conversation === undefined) {
        conversation = createConversation({
          host: entry.client,
          displayName: target.title,
          ...(target.botSlug === undefined ? {} : { botSlug: target.botSlug }),
          ...(target.channelId === undefined ? {} : { channelId: target.channelId }),
        });
        conversations.set(key, conversation);
      }
      return conversation;
    },
    viewerClient(hostId) {
      return clients.get(hostId)?.client;
    },
  };
}

const TEAM_DEVICE_PATH = /^\/botharness-device\/team\/(device-sign-in|device-password)$/u;

export function browserCarrier(options: { teamViaHost?: boolean } = {}): HostCarrier {
  const carrier: HostCarrier = {
    custody: ({ credential }) => custodyCarrier(credential, carrier),
    async request(url, init) {
      const target = new URL(url);
      const team = TEAM_DEVICE_PATH.exec(target.pathname)?.[1];
      if (
        options.teamViaHost &&
        init.method === 'POST' &&
        typeof init.body === 'string' &&
        (team === 'device-sign-in' || team === 'device-password')
      ) {
        const response = await teamCustodyResponse(
          target.origin,
          team,
          { ...(init.headers ? { headers: init.headers } : {}), body: init.body },
          init.signal,
        );
        return {
          status: response.status,
          text: async () => new TextDecoder().decode(response.bytes),
        };
      }
      const response = await fetch(url, {
        method: init.method,
        signal: init.signal,
        credentials: 'omit',
        mode: 'cors',
        headers: {
          ...(typeof init.body === 'string' ? { 'content-type': 'application/json' } : {}),
          ...init.headers,
        },
        ...(init.body === undefined ? {} : { body: init.body }),
      });
      return { status: response.status, text: () => response.text() };
    },
    openSocket(url, events, headers = {}) {
      if (new URL(url).pathname === '/botharness-device/channel') {
        const admission = headers['X-BotHarness-Admission'];
        const target = new URL(url);
        if (
          admission !== undefined &&
          (target.protocol !== 'wss:' ||
            target.username ||
            target.password ||
            target.search ||
            target.hash ||
            !isPrivateRoute(url.replace(/^ws/u, 'http')))
        )
          throw new Error('private-admission-route-invalid');
        const socket =
          admission === undefined
            ? new WebSocket(url)
            : new WebSocket(url, browserAdmissionProtocols(admission));
        socket.onopen = () => events.open();
        socket.onmessage = (event) => events.message(String(event.data));
        socket.onerror = () =>
          events.closed(
            admission === undefined
              ? 'channel-disconnected'
              : 'private-route-browser-admission-unavailable',
          );
        socket.onclose = (event) => events.closed(event.reason);
        return {
          get bufferedAmount() {
            return socket.bufferedAmount;
          },
          send: (text) => socket.send(text),
          close: () => socket.close(),
        };
      }

      const controller = new AbortController();
      let socket: WebSocket | undefined;
      let done = false;
      const closed = (reason: string): void => {
        if (done) return;
        done = true;
        events.closed(reason);
      };
      void (async () => {
        let ticket: unknown;
        try {
          const origin = new URL(url.replace(/^ws/u, 'http')).origin;
          const response = await fetch(`${origin}${DEVICE_PREFIX}/stream-ticket`, {
            method: 'POST',
            credentials: 'omit',
            mode: 'cors',
            headers,
            signal: controller.signal,
          });
          ticket = ((await response.json()) as { ticket?: unknown }).ticket;
        } catch {
          return closed('The live connection could not start.');
        }
        if (controller.signal.aborted) return closed('closed');
        if (typeof ticket !== 'string')
          return closed('The Remote Host refused the live connection.');
        socket = new WebSocket(`${url}?ticket=${encodeURIComponent(ticket)}`);
        socket.onopen = () => events.open();
        socket.onmessage = (event) => events.message(String(event.data));
        socket.onerror = () => closed('socket error');
        socket.onclose = (event) => closed(event.reason);
      })();
      return {
        send: (text) => socket?.send(text),
        close: () => {
          controller.abort();
          if (socket === undefined) closed('closed');
          else socket.close();
        },
      };
    },
  };
  return carrier;
}

async function browserImage(
  url: string,
  headers: Record<string, string>,
): Promise<string | undefined> {
  const handle = /^Device (custody\.[A-Za-z0-9_-]{43})$/u.exec(headers['authorization'] ?? '')?.[1];
  if (handle !== undefined) {
    const response = await custodyResponse(handle, url, { method: 'GET', headers });
    if (response.status !== 200) return undefined;
    return URL.createObjectURL(
      new Blob([Uint8Array.from(response.bytes)], { type: response.contentType }),
    );
  }
  const response = await fetch(url, { credentials: 'omit', mode: 'cors', headers });
  if (!response.ok) return undefined;
  return URL.createObjectURL(await response.blob());
}

let shared: RemoteHosts | undefined;
let translate: NotificationTranslate = (key) => en[key];
let recordShared: RemoteHostTelemetry = () => {};

export function recordRemoteHosts(record: RemoteHostTelemetry): void {
  recordShared = record;
}

export function remoteHosts(translator?: NotificationTranslate): RemoteHosts {
  if (translator !== undefined) translate = translator;
  if (shared !== undefined) return shared;
  const enabled = !memberPage();
  shared = createRemoteHosts({
    enabled,
    ...(enabled ? { custody: { seal: sealRemoteHost, forget: forgetRemoteHost } } : {}),
    storage: (() => {
      if (!enabled) return undefined;
      try {
        return globalThis.localStorage;
      } catch {
        return undefined;
      }
    })(),
    carrier: browserCarrier({ teamViaHost: enabled }),
    loadImage: browserImage,
    releaseImage: (image) => URL.revokeObjectURL(image),
    translate: (key) => translate(key),
    hostName: (hostId, fallback) => shownHostName(hostLooks().look(hostId), fallback),
    record: (event, properties) => recordShared(event, properties),
  });
  const sources = shared;
  let selection = store.getSnapshot().selection;
  store.subscribe(() => {
    const next = store.getSnapshot().selection;
    if (next === selection) return;
    selection = next;
    sources.close();
  });
  return sources;
}
