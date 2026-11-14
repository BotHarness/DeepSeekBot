import { hostLooks } from './host-looks.js';
import { memberPage } from './member-page.js';
import { secureRandom, keyHex } from '../../../../apps/mobile/src/host/encrypted-carrier.js';
import { browserAdmissionProtocols } from '../../../../deploy/private-relay/admission.mjs';
import { isPrivateRoute } from '../../../../apps/mobile/src/host/route.js';
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
import { shownHostName } from '../../../../apps/mobile/src/ui/design/host-look.js';
import type { HostCarrier } from '../../../../apps/mobile/src/host/carrier.js';
import {
  createHostClient,
  type HostClient,
  type HostSnapshot,
} from '../../../../apps/mobile/src/host/client.js';
import {
  createConversation,
  type Conversation,
} from '../../../../apps/mobile/src/host/conversation.js';
import {
  parseSavedHost,
  serializeSavedHost,
  type SavedHost,
  type PrivateAdmission,
} from '../../../../apps/mobile/src/host/hosts.js';
import {
  createInbox,
  prepareNotificationBaseline,
  type Inbox,
  type InboxSnapshot,
  observeInbox,
  type InboxQuery,
} from '../../../../apps/mobile/src/host/inbox.js';
import {
  DEVICE_PREFIX,
  parsePairingLink,
  redeemPairing,
  revokePairing,
  type PairingRefusal,
} from '../../../../apps/mobile/src/host/pairing.js';
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
export const ALL_HOSTS = 'all';
export const THIS_HOST = 'local';

export interface RemoteConversationTarget {
  hostId: string;
  title: string;
  botSlug?: string;
  channelId?: string;
}

export interface RemoteHost {
  host: SavedHost;
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
  | { ok: true; host: SavedHost }
  | {
      ok: false;
      code:
        | PairingRefusal
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

function readHosts(storage: HostStorage | undefined): SavedHost[] {
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
    return [];
  }
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
  host: SavedHost;
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

export function createRemoteHosts(options: {
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
              await revokePairing({ host: entry.host, carrier });
              await persistCredential(entry.host.hostId, entry.host, () => undefined);
              if (clients.get(entry.host.hostId) === entry) retireEntry(entry);
              publish();
            }
          }
          if (state === 'cancelled') {
            await revokePairing({ host: entry.host, carrier });
            await forget(entry.host.hostId);
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

  const sameCredential = (a: SavedHost, b: SavedHost): boolean =>
    a.hostId === b.hostId &&
    a.deviceId === b.deviceId &&
    a.credential === b.credential &&
    a.encryption?.hostKey === b.encryption?.hostKey &&
    a.encryption?.deviceKey === b.encryption?.deviceKey &&
    a.relationshipId === b.relationshipId;
  const persistCredential = async (
    hostId: string,
    expected: SavedHost | undefined,
    change: (current: SavedHost | undefined) => SavedHost | undefined,
    choiceChange: ChoiceChange = { kind: 'preserve' },
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
    entry.host = next;
    if (wasPending && listeners.size > 0 && !relationshipEnrollmentPending(next)) start(entry);
    publish();
  };

  const attach = (host: SavedHost): void => {
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

  const retireEntry = (entry: HostEntry): void => {
    const hostId = entry.host.hostId;
    if (clients.get(hostId) !== entry) return;
    notifications.forget(hostId);
    entry.release();
    stop(entry);
    clients.delete(hostId);
    activity.delete(hostId);
    for (const [key, conversation] of conversations)
      if ((JSON.parse(key) as string[])[0] === hostId) {
        conversation.stop();
        conversations.delete(key);
      }
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
        entry.host = current;
        if (wasPending && listeners.size > 0 && !relationshipEnrollmentPending(current))
          start(entry);
      }
    }
    for (const host of saved) if (!clients.has(host.hostId)) attach(host);
    publish();
  };
  const storageChanged = (event: StorageEvent) => {
    if (
      event.storageArea !== storage ||
      (event.key !== null && event.key !== REMOTE_HOSTS_STORAGE_KEY)
    )
      return;
    refreshCredentials();
  };

  return {
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
            await revokePairing({ host: result.host, carrier });
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
    async pair(link, deviceName, localHostId, trust) {
      if (!enabled) return { ok: false, code: 'owner-required' };
      if (trust?.signal?.aborted) return { ok: false, code: 'cancelled' };
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
          await revokePairing({ host: redeemed.host, carrier });
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
      await revokePairing({ host: entry.host, carrier });
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
      await entry.client.call('channelMarkRead', { channelId, messageId });
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

export function browserCarrier(): HostCarrier {
  return {
    async request(url, init) {
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
}

async function browserImage(
  url: string,
  headers: Record<string, string>,
): Promise<string | undefined> {
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
    storage: (() => {
      if (!enabled) return undefined;
      try {
        return globalThis.localStorage;
      } catch {
        return undefined;
      }
    })(),
    carrier: browserCarrier(),
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
