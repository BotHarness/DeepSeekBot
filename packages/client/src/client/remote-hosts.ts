import type {
  TeamSignInTarget,
  TeamSignInFlow,
  TeamSignInError,
} from '@botharness/host-client/team-sign-in';
import type { TeamResult } from '@botharness/host-protocol/team-invitation';
import {
  connectionOperationIndexSchema,
  pendingConnectionSchema,
  type PendingConnection,
} from '../../../core/src/devices/connection-operation.js';
import { hostLooks } from './host-looks.js';
import { memberPage } from './member-page.js';
import { forgetRemoteHost, sealRemoteHost } from './remote-custody.js';
import {
  enrollRelationshipClient,
  commitRelationshipEnrollment,
  cancelRelationshipEnrollment,
  relationshipClientPublicKey,
  updateRelationshipClientRoute,
} from '../../../core/src/devices/relationship-enrollment.js';
import { pendingRelationshipEnrollmentSchema as pendingEnrollmentSchema } from '../../../core/src/devices/relationship-contract.js';
import { automaticEnrollmentChoiceSchema } from '../../../core/src/devices/relationship-contract.js';
import { withRemoteHostStorageLock } from './remote-host-storage-lock.js';
import { relationshipRequest, type ClientRelationship } from './relationships.js';
import { shownHostName } from '@botharness/host-client/ui/design/host-look';
import type { HostCarrier } from '@botharness/host-protocol/carrier';
import { createHostClient, type HostClient } from '@botharness/host-client/client';
import type { Conversation } from '@botharness/host-client/conversation';
import {
  isCustodyHandle,
  parseSavedHost,
  type SavedHost,
  type PrivateAdmission,
} from '@botharness/host-client/hosts';
import {
  createInbox,
  prepareNotificationBaseline,
  type InboxSnapshot,
  observeInbox,
  type InboxQuery,
} from '@botharness/host-client/inbox';
import { store } from './store.js';
import { createRemoteActivityProjection } from './remote-host-activity.js';
import { releaseRemoteHostViewers } from './remote-host-viewer.js';
import { browserNotificationApi } from './desktop-notifications.js';
import { createRemoteNotifications, type RemoteNotifications } from './remote-notifications.js';
import { en } from './locale.js';
import { hostSettingsDrafts } from './host-settings-drafts.js';
import { relationshipListSchema } from '../../../core/src/devices/relationship-contract.js';
import { observeResource } from './messaging-defaults-live.js';
import { createRemoteHostAvatars } from './features/environments/remote-host-avatars.js';
import { createRemoteHostConversations } from './features/environments/remote-host-conversations.js';
import {
  createRemoteHostCredentials,
  type ChoiceChange,
} from './features/environments/remote-host-credentials.js';
import { createRemoteHostOperations } from './features/environments/remote-host-operations.js';
import { createRemoteHostPairing } from './features/environments/remote-host-pairing.js';
import {
  readStorage,
  readTab,
  REMOTE_HOSTS_STORAGE_KEY,
  HOST_TAB_STORAGE_KEY,
  ALL_HOSTS,
  THIS_HOST,
} from './features/environments/remote-host-storage.js';
import type {
  HostEntry,
  HostPairResult,
  HostStorage,
  ManagedSavedHost,
  NotificationTranslate,
  RemoteConversationTarget,
  RemoteHostCustody,
  RemoteHostsSnapshot,
  RemoteHostTelemetry,
  RemotePairTrust,
} from './features/environments/remote-host-types.js';
import { browserCarrier, browserImage } from './features/environments/remote-host-browser.js';

export { browserCarrier } from './features/environments/remote-host-browser.js';
export { conversationKey } from './features/environments/remote-host-conversations.js';
export {
  ALL_HOSTS,
  THIS_HOST,
  REMOTE_HOSTS_STORAGE_KEY,
  HOST_TAB_STORAGE_KEY,
  REMOTE_HOST_RELEASE_STORAGE_KEY,
} from './features/environments/remote-host-storage.js';
export type {
  HostPairResult,
  HostStorage,
  RemoteConversationTarget,
  RemoteHost,
  RemoteHostCustody,
  RemoteHostsSnapshot,
  RemoteHostTelemetry,
  RemotePairTrust,
} from './features/environments/remote-host-types.js';

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

const executionIndexSchema = connectionOperationIndexSchema.element
  .extend({ record: pendingConnectionSchema.nullable().optional() })
  .array()
  .max(32);

const { readExecutionHost, connectionOperations } = createRemoteHostOperations(
  (value) => executionIndexSchema.parse(value),
  (value) => pendingConnectionSchema.parse(value),
);

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
type CredentialChoiceChange = ChoiceChange<AutomaticChoice>;
const choiceSnapshot = (choice: AutomaticChoice | undefined): string | null =>
  choice ? JSON.stringify(choice) : null;
const idleInbox: InboxSnapshot = { status: 'idle' };
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
  const conversations = createRemoteHostConversations({ clients, requireOwner });
  const avatars = createRemoteHostAvatars({
    loadImage,
    releaseImage,
    listeners,
    publish: () => publish(),
  });
  let tab = readTab(storage);
  let open: RemoteConversationTarget | undefined;
  let snapshot: RemoteHostsSnapshot = { hosts: [], avatars: avatars.getAvatars(), tab };
  let stopRelationships: (() => void) | undefined;
  let relationshipPoll: AbortController | undefined;
  let reconcileAgain = false;
  const reconcileRelationships = async (): Promise<void> => {
    if (relationshipPoll) {
      reconcileAgain = true;
      return;
    }
    if (listeners.size === 0 || ![...clients.values()].some((entry) => entry.host.relationshipId))
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
      if (reconcileAgain && relationshipPoll === undefined && listeners.size > 0) {
        reconcileAgain = false;
        void reconcileRelationships();
      }
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

  const publish = (): void => {
    const hosts = [...clients.values()].map(({ host, client, inbox, retained, activity }) => ({
      host,
      snapshot: client.getSnapshot(),
      inbox: inbox?.feed.getSnapshot() ?? retained,
      activity,
    }));
    avatars.fetchAvatars(hosts);
    if (listeners.size > 0) notifications.update(hosts);
    const known = tab === ALL_HOSTS || tab === THIS_HOST || clients.has(tab);
    snapshot = {
      hosts,
      avatars: avatars.getAvatars(),
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
  const { releasePending, sameCredential, releaseCustody, revoke, persistCredential } =
    createRemoteHostCredentials({
      storage,
      custody,
      carrier,
      readHosts,
      readAutomaticChoices,
      choiceSnapshot,
      preserveEnrollment(next, sealed) {
        const pending = pendingEnrollmentSchema.safeParse(next).data?.relationshipEnrollment;
        return pending ? Object.assign(sealed, { relationshipEnrollment: pending }) : sealed;
      },
    });

  const saveHostChange = async (
    hostId: string,
    client: HostClient,
    change: (host: SavedHost) => SavedHost,
    choiceChange: CredentialChoiceChange = { kind: 'preserve' },
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
    conversations.detach(hostId);
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

  const { teamSignIn, pair } = createRemoteHostPairing({
    enabled,
    carrier,
    storage,
    record,
    clients,
    pairing,
    readHosts,
    readAutomaticChoices,
    choiceSnapshot,
    persistCredential,
    sameCredential,
    revoke,
    attach,
    retireEntry,
    selectHost(hostId) {
      tab = hostId;
      try {
        storage?.setItem(HOST_TAB_STORAGE_KEY, tab);
      } catch {}
    },
    publish,
  });

  return {
    ...connectionOperations(options, {
      storage,
      clients,
      requireOwner,
      publish,
      persistentOwner,
    }),
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
    activity: conversations.activity,
    subscribe(listener) {
      const first = listeners.size === 0;
      listeners.add(listener);
      if (first) {
        globalThis.addEventListener?.('storage', storageChanged);
        refreshCredentials();
        for (const entry of clients.values()) start(entry);
        stopRelationships = observeResource(
          'relationships',
          () => void reconcileRelationships(),
          2000,
        );
        void reconcileRelationships();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        globalThis.removeEventListener?.('storage', storageChanged);
        stopRelationships?.();
        stopRelationships = undefined;
        relationshipPoll?.abort();
        for (const entry of clients.values()) stop(entry);
        notifications.stop();
      };
    },
    teamSignIn,
    pair,
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
    markRead: conversations.markRead,
    conversation: conversations.conversation,
    viewerClient(hostId) {
      return clients.get(hostId)?.client;
    },
  };
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
