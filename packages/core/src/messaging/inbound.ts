import { ReceiverRecovery } from './receiver-recovery.js';
import { effectiveDmControls } from './dm-controls.js';
import type { BotPairing, PairingRequest } from './pairing.js';
import { recordLocalReception } from './reception-history.js';
import { fanoutMessagingConsumer } from './consumer-fanout.js';
import { createImCommandExecutor, type ImCommandServices } from './im-commands.js';
import type { ChannelMessageCommit, ChannelStore } from '../channels/store.js';
import type { DatabaseSync } from 'node:sqlite';
import { OperationalDatabaseError, type OperationalDatabaseModulePort } from '../database/owner.js';
import type { BotSourcePolicyStore } from '../runtime/source-policy.js';
import type { MessagingGrant } from './outbound.js';
import { MessagingError, type MessagingInboundEvent, type MessagingProvider } from './provider.js';
import type { InboundMessaging } from './inbound-contract.js';
import { createInboundSources } from './inbound-sources.js';
import { createInboundContext } from './inbound-context.js';
import { createInboundGrantReceiver } from './inbound-grant-receiver.js';
import { createInboundControlReceiver } from './inbound-control-receiver.js';
import { createInboundCommandIntake } from './inbound-command-intake.js';
import { createInboundDefaultTraffic } from './inbound-default-traffic.js';
import { createInboundChannelRoutes } from './inbound-channel-routes.js';
import { createInboundReceptionPolicy } from './inbound-reception-policy.js';
export type {
  ExternalContextRead,
  ExternalContextResult,
  ExternalContextQuery,
  ExternalSource,
  InboxSourceShare,
  InboundMessaging,
} from './inbound-contract.js';
export type InboundMessagingOptions = {
  onQuestionAction?(
    providerId: string,
    event: import('./provider.js').MessagingQuestionAction,
    signal: AbortSignal,
  ): Promise<import('./provider.js').MessagingApprovalAck>;
  onQuestionText?(
    providerId: string,
    event: MessagingInboundEvent,
    signal: AbortSignal,
  ): Promise<boolean>;
  onApprovalAction?(
    providerId: string,
    event: Exclude<
      import('./provider.js').MessagingCardAction,
      import('./provider.js').MessagingQuestionAction
    >,
    signal: AbortSignal,
  ): Promise<import('./provider.js').MessagingApprovalAck>;
  database: OperationalDatabaseModulePort;
  channels?: Pick<ChannelStore, 'getOrCreateDm'>;
  pairing?: BotPairing;
  onPairingRequest?(request: PairingRequest): void;
  bindingAvailable?(id: string): boolean;
  sourcePolicy: BotSourcePolicyStore;
  isBotActive(slug: string): boolean;
  imCommands?(): ImCommandServices | undefined;
  replyCommand?(botSlug: string, sourceEventId: string, text: string): Promise<void>;
  onAdmitted(botSlug: string, sourceEventId: string): void;
  onAdmissionCommitted?(botSlug: string, sourceEventId: string): void;
  onReceptionChanged?(): void;
  onPlaced?(commit: ChannelMessageCommit): void;
  onProjectionReady?(providerId: string): void;
  onShared?(botSlugs: string[]): void;
  onIngested?(channelId: string, messageId: string): void;
  warn?(message: string): void;
};

function prepareSourcePayloadUpdate(db: DatabaseSync) {
  return db.prepare('UPDATE source_events SET payload_json = ? WHERE source_event_id = ?');
}

function prepareExternalSourceInsert(db: DatabaseSync) {
  return db.prepare(`INSERT INTO source_events (source_event_id, source_kind, bot_slug, body, created_at, payload_json)
        VALUES (?, 'bridge-message', ?, ?, ?, ?)`);
}

function prepareSubscribedAdmissionInsert(db: DatabaseSync) {
  return db.prepare(`INSERT OR IGNORE INTO inbox_admissions (source_event_id, bot_slug, reason, source_policy_revision, source_policy_wake_mode,
                  wake_policy_revision, wake_mode, wake_count, wake_interval_ms, external_thread_policy_revision, external_default_revision)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
}

function prepareBridgeAdmissionInsert(db: DatabaseSync) {
  return db.prepare(`INSERT OR IGNORE INTO inbox_admissions
              (source_event_id, bot_slug, reason, source_policy_revision, source_policy_wake_mode,
               wake_policy_revision, wake_mode, wake_count, wake_interval_ms, external_thread_policy_revision, external_default_revision)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
}

function prepareCommandAdmissionStatus(db: DatabaseSync) {
  return db.prepare(
    'UPDATE inbox_admissions SET last_error = ? WHERE source_event_id = ? AND bot_slug = ?',
  );
}

function prepareDirectAdmissionInsert(db: DatabaseSync) {
  return db.prepare(`INSERT OR IGNORE INTO inbox_admissions
    (source_event_id, bot_slug, reason, source_policy_revision, source_policy_wake_mode,
     wake_policy_revision, wake_mode) VALUES (?, ?, ?, ?, ?, ?, ?)`);
}

function prepareMentionAdmissionInsert(db: DatabaseSync) {
  return db.prepare(`INSERT OR IGNORE INTO inbox_admissions
    (source_event_id, bot_slug, reason, source_policy_revision, source_policy_wake_mode,
     wake_policy_revision, wake_mode, external_thread_policy_revision, external_default_revision)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
}

function prepareCommandAdmissionHandled(db: DatabaseSync) {
  return db.prepare(
    "UPDATE inbox_admissions SET attempt_state = 'handled', handled_at = ?, last_error = 'im-command-pending' WHERE source_event_id = ? AND bot_slug = ?",
  );
}

function prepareEndedChannelAdmissionRepair(db: DatabaseSync) {
  return db.prepare(
    "UPDATE inbox_admissions SET attempt_state = 'needs-repair', last_error = 'channel-ended' WHERE source_event_id = ? AND bot_slug = ?",
  );
}

export function createInboundMessaging(options: InboundMessagingOptions): InboundMessaging {
  const { database } = options;
  const transaction = <T>(command: (db: DatabaseSync) => T, topics: string[] = []): T => {
    try {
      return database.transaction((db) => {
        const result = command(db);
        if (topics.includes('grants') || topics.includes('bindings'))
          recordLocalReception(db, new Date().toISOString(), options.isBotActive);
        return result;
      }, topics);
    } catch (error) {
      if (error instanceof OperationalDatabaseError && error.cause instanceof MessagingError)
        throw error.cause;
      throw error;
    }
  };
  const bounded = async <T>(pending: Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        pending,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new MessagingError('provider-unavailable')), 15000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  const providers = new Map<
    string,
    { provider: MessagingProvider; token: object; consume?: MessagingProvider['consume'] }
  >();
  const leases = new Map<
    string,
    {
      token: object;
      ordinaryVerified?: boolean;
      ordinaryThreads: Map<string, string>;
      revision: number;
      controller: AbortController;
      dispose: (() => void) | undefined;
    }
  >();

  const replyStarts = new Map<string, Promise<void>>();
  const executeCommand = createImCommandExecutor();
  let closed = false;
  const contextReader = createInboundContext({
    get read() {
      return read;
    },
    get grant() {
      return grant;
    },
    providers,
    leases,
    get valid() {
      return valid;
    },
    transaction,
    database,
    get sourceId() {
      return sourceId;
    },
    get persistSource() {
      return persistSource;
    },
    prepareSourcePayloadUpdate,
  });
  const {
    sourceId,
    ingestName,
    persistSource,
    mirrorDm,
    read,
    readShared,
    methods: sources,
  } = createInboundSources({
    options,
    transaction,
    get grant() {
      return grant;
    },
    get valid() {
      return valid;
    },
    database,
    get service() {
      return service;
    },
    leases,
    prepareSourcePayloadUpdate,
    prepareExternalSourceInsert,
  });
  const { admitDirect, conversationEntries, defaultTraffic, admitDefault } =
    createInboundDefaultTraffic({
      persistSource,
      options,
      database,
      providers,
      get closed() {
        return closed;
      },
      get controls() {
        return controls;
      },
      get commandIntake() {
        return commandIntake;
      },
      get placeIngests() {
        return placeIngests;
      },
      bounded,
      transaction,
      sourceId,
      get receptionChanged() {
        return receptionChanged;
      },
      mirrorDm,
      leases,
      get start() {
        return start;
      },
      get valid() {
        return valid;
      },
      get grant() {
        return grant;
      },
      prepareDirectAdmissionInsert,
      prepareMentionAdmissionInsert,
      prepareCommandAdmissionHandled,
    });
  const grant = (id: string): MessagingGrant => {
    const row = database.read((db) =>
      db.prepare('SELECT body FROM messaging_grants WHERE id = ?').get(id),
    ) as { body: string } | undefined;
    if (!row) throw new MessagingError('grant-unavailable');
    return database.read((db) => effectiveDmControls(db, JSON.parse(row.body) as MessagingGrant));
  };
  const receptionChanged = () => {
    if (closed) return;
    try {
      options.onReceptionChanged?.();
    } catch {
      options.warn?.('messaging-reception-publication-failed');
    }
  };
  const {
    retries,
    stop,
    targetAvailable,
    valid,
    inspectGrant,
    start,
    methods: grantReceiver,
  } = createInboundGrantReceiver({
    receptionChanged,
    leases,
    database,
    grant,
    get closed() {
      return closed;
    },
    options,
    providers,
    get controlRetries() {
      return controlRetries;
    },
    get startControl() {
      return startControl;
    },
    get controls() {
      return controls;
    },
    transaction,
    admitDirect,
    mirrorDm,
    sourceId,
    persistSource,
    replyStarts,
    bounded,
    prepareSubscribedAdmissionInsert,
    prepareBridgeAdmissionInsert,
  });
  const controlRetries = new ReceiverRecovery(receptionChanged);
  const {
    controls,
    stopControl,
    startControl,
    controlIntake,
    methods: controlReceiver,
  } = createInboundControlReceiver({
    controlRetries,
    options,
    get closed() {
      return closed;
    },
    database,
    providers,
    receptionChanged,
    bounded,
    transaction,
    defaultTraffic,
    retries,
    start,
    grant,
    conversationEntries,
    targetAvailable,
    stop,
  });
  const { placeIngests, methods: channelRoutes } = createInboundChannelRoutes({
    database,
    transaction,
    persistSource,
    options,
    ingestName,
    get service() {
      return service;
    },
    conversationEntries,
    receptionChanged,
    grant,
    providers,
    bounded,
    inspectGrant,
    leases,
    stop,
    valid,
    start,
    prepareEndedChannelAdmissionRepair,
  });
  const { commandIntake } = createInboundCommandIntake({
    options,
    database,
    controls,
    conversationEntries,
    targetAvailable,
    providers,
    admitDefault,
    read,
    get closed() {
      return closed;
    },
    grant,
    transaction,
    executeCommand,
    get service() {
      return service;
    },
    prepareCommandAdmissionStatus,
  });
  const receptionPolicy = createInboundReceptionPolicy({
    grant,
    options,
    providers,
    database,
    start,
    stop,
    valid,
    inspectGrant,
    leases,
    transaction,
    read,
  });
  const service: InboundMessaging = {
    pairingRouteAvailable: controlReceiver.pairingRouteAvailable,
    notifyPairing: controlReceiver.notifyPairing,
    readShared,
    register(provider) {
      const previous = providers.get(provider.id);
      if (previous) {
        for (const [id, control] of controls)
          if (control.token === previous.token) stopControl(id, 'provider-replaced');
        for (const [id, lease] of leases) if (lease.token === previous.token) stop(id);
        retries.clearOwner(previous.token);
        controlRetries.clearOwner(previous.token);
      }
      const token = {};
      providers.set(provider.id, {
        provider,
        token,
        ...(provider.consume
          ? {
              consume: fanoutMessagingConsumer(
                provider.consume.bind(provider),
                async (event, signal) =>
                  (await controlIntake(provider, event, signal)) ||
                  (await commandIntake(provider, event, signal)),
                options.onApprovalAction || options.onQuestionAction
                  ? (event, signal) =>
                      event.action === 'answer'
                        ? (options.onQuestionAction?.(provider.id, event, signal) ??
                          Promise.resolve({ accepted: true as const, status: 'refused' as const }))
                        : (options.onApprovalAction?.(provider.id, event, signal) ??
                          Promise.resolve({ accepted: true as const, status: 'refused' as const }))
                  : undefined,
              ),
            }
          : {}),
      });
      if (options.pairing) {
        const bindings = database.read((db) =>
          db
            .prepare(
              'SELECT id FROM messaging_bindings WHERE provider_id = ? AND revoked_at IS NULL',
            )
            .all(provider.id),
        ) as { id: string }[];
        for (const { id } of bindings) void startControl(id);
      }
      const rows = database.read((db) =>
        db.prepare('SELECT body FROM messaging_grants WHERE revoked_at IS NULL').all(),
      ) as { body: string }[];
      for (const row of rows) {
        const value = JSON.parse(row.body) as MessagingGrant;
        if (value.providerId === provider.id) void start(value);
      }
      return () => {
        if (providers.get(provider.id)?.token !== token) return;
        providers.delete(provider.id);
        for (const [id, control] of controls)
          if (control.token === token) stopControl(id, 'provider-disposed');
        for (const [id, lease] of leases) if (lease.token === token) stop(id);
        retries.clearOwner(token);
        controlRetries.clearOwner(token);
      };
    },
    ingests: channelRoutes.ingests,
    ingest: channelRoutes.ingest,
    channelBridge: channelRoutes.channelBridge,
    setEnabled: receptionPolicy.setEnabled,
    setChannelTarget: channelRoutes.setChannelTarget,
    policy: receptionPolicy.policy,
    setPolicy: receptionPolicy.setPolicy,
    threads: receptionPolicy.threads,
    setThread: receptionPolicy.setThread,
    ordinaryDelivery: grantReceiver.ordinaryDelivery,
    recovery: grantReceiver.recovery,
    pairingRecovery: controlReceiver.pairingRecovery,
    status: grantReceiver.status,
    pendingExternal: sources.pendingExternal,
    endChannel: channelRoutes.endChannel,
    available: sources.available,
    sourceSignal: sources.sourceSignal,
    read,
    share: sources.share,
    context: contextReader.context,
    ensureReplyConsumer: grantReceiver.ensureReplyConsumer,
    pairingReception: controlReceiver.pairingReception,
    reconcileBinding: controlReceiver.reconcileBinding,
    revoke: stop,
    startEntry: grantReceiver.startEntry,
    close() {
      closed = true;
      for (const id of controls.keys()) stopControl(id, 'host-shutdown');
      for (const id of leases.keys()) stop(id);
      controlRetries.close();
      retries.close();
      providers.clear();
    },
  };
  return service;
}
