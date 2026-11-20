import { OWNER_HUMAN_CONTEXT } from '../humans/context.js';
import { listHeld } from './conversations.js';
import {
  DEFAULT_INGEST_WAKE,
  admitIngestMembers,
  channelIngests,
  deleteIngest,
  matchingIngests,
  readIngest,
  writeIngest,
  type ConversationIngest,
  type ConversationIngestSnapshot,
} from './conversation-ingest.js';
import type { MessagingIdentity } from './identity.js';
import { readMessagingIdentity } from './identity.js';
import { currentReceptionPaths, grantReception } from './reception-paths.js';
import { groupReceptionPolicy } from './group-policy.js';
import { bridgeChannel, humanBridgeChannel, placeBridgeSource } from './channel-target.js';
import { messagingDefaults } from './defaults.js';
import { assertMessagingIdentity } from './identity.js';
import { channelBridgeRoutes, channelBridgeInput } from './channel-bridge.js';
import type { ChannelMessageCommit } from '../channels/store.js';
import type { ChannelRecord } from '../channels/channel.js';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { MessagingGrant } from './outbound.js';
import { MessagingError, type MessagingInboundEvent, type MessagingProvider } from './provider.js';
import type { ExternalSource, InboundMessaging } from './inbound-types.js';
import type { StatementSync } from 'node:sqlite';
import type { InboundMessagingOptions } from './inbound.js';

export function createInboundChannelRoutes(wiring: {
  database: OperationalDatabaseModulePort;
  transaction: <T>(command: (db: DatabaseSync) => T, topics?: string[]) => T;
  persistSource: (
    db: DatabaseSync,
    value: MessagingGrant | { ingest: ConversationIngest; botSlug: string; bindingId: string },
    event: MessagingInboundEvent,
  ) => string;
  options: InboundMessagingOptions;
  ingestName: (ingest: ConversationIngest, event: MessagingInboundEvent) => string;
  service: InboundMessaging;
  conversationEntries: (
    db: DatabaseSync,
    bindingId: string,
    conversation: MessagingInboundEvent['conversation'],
  ) => MessagingGrant[];
  receptionChanged: () => void;
  grant: (id: string) => MessagingGrant;
  providers: Map<
    string,
    { provider: MessagingProvider; token: object; consume?: MessagingProvider['consume'] }
  >;
  bounded: <T>(pending: Promise<T>) => Promise<T>;
  inspectGrant: (
    provider: MessagingProvider,
    value: MessagingGrant,
  ) => Promise<{
    account: import('./provider.js').MessagingAccount;
    target: import('./provider.js').MessagingTarget;
  }>;
  leases: Map<
    string,
    {
      token: object;
      ordinaryVerified?: boolean;
      ordinaryThreads: Map<string, string>;
      revision: number;
      controller: AbortController;
      dispose: (() => void) | undefined;
    }
  >;
  stop: (id: string) => void;
  valid: (value: MessagingGrant, reception?: boolean) => boolean;
  start: (value: MessagingGrant, attempt?: number, replyOnly?: boolean) => Promise<void>;
  prepareEndedChannelAdmissionRepair: (db: DatabaseSync) => StatementSync;
}) {
  const {
    database,
    transaction,
    persistSource,
    options,
    ingestName,
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
  } = wiring;

  const placeIngests = (identity: MessagingIdentity, event: MessagingInboundEvent) => {
    if (event.conversation.kind !== 'group') return;
    const current = (db: DatabaseSync) =>
      matchingIngests(db, identity.providerId, identity.fingerprint, event.conversation).filter(
        (item) =>
          item.enabled &&
          item.accountRef === identity.accountRef &&
          Date.parse(event.at) >= Date.parse(item.intakeAfter),
      );
    if (!database.read(current).length) return;
    const placed: ChannelMessageCommit[] = [];
    const members = new Set<string>();
    transaction(
      (db) => {
        for (const ingest of current(db)) {
          let channel: ChannelRecord;
          try {
            channel = humanBridgeChannel(OWNER_HUMAN_CONTEXT, db, ingest.channelId);
          } catch (error) {
            if (!(error instanceof MessagingError)) throw error;
            continue;
          }
          if (channel.type !== 'group') continue;
          const id = persistSource(
            db,
            { ingest, botSlug: identity.botSlug, bindingId: identity.id },
            event,
          );
          const row = db
            .prepare('SELECT payload_json FROM source_events WHERE source_event_id = ?')
            .get(id) as { payload_json: string };
          const source = (JSON.parse(row.payload_json) as { external: ExternalSource }).external;
          const commit = placeBridgeSource(
            OWNER_HUMAN_CONTEXT,
            db,
            { ...source, body: event.text, localChannelId: ingest.channelId },
            undefined,
          );
          if (!commit) continue;
          placed.push(commit);
          for (const slug of admitIngestMembers(
            db,
            id,
            channel,
            ingest,
            options.sourcePolicy,
            options.isBotActive,
          ))
            members.add(slug);
          writeIngest(db, {
            ...ingest,
            conversation: { ...ingest.conversation, name: ingestName(ingest, event) },
            lastMessageAt: event.at,
          });
        }
      },
      ['source-event', 'channel', 'bot-inbox'],
    );
    for (const commit of placed) {
      try {
        options.onPlaced?.(commit);
      } catch {
        options.warn?.('ingest-channel-publication-failed');
      }
      try {
        options.onIngested?.(commit.channelId, commit.message.id);
      } catch {
        options.warn?.('ingest-admission-wake-failed');
      }
    }
    try {
      if (members.size) options.onShared?.([...members]);
    } catch {
      options.warn?.('ingest-share-wake-failed');
    }
  };

  const methods: Pick<
    InboundMessaging,
    'ingests' | 'ingest' | 'channelBridge' | 'setChannelTarget' | 'endChannel'
  > = {
    ingests(channelId) {
      return database.read((db) => {
        humanBridgeChannel(OWNER_HUMAN_CONTEXT, db, channelId);
        const bindings = (
          db
            .prepare(
              "SELECT id FROM messaging_bindings WHERE revoked_at IS NULL AND platform <> 'weixin' ORDER BY created_at",
            )
            .all() as { id: string }[]
        ).map((row) => readMessagingIdentity(db, row.id));
        const state = (
          ingest: ConversationIngest,
        ): ConversationIngestSnapshot['ingests'][number]['state'] => {
          if (!ingest.enabled) return 'paused';
          const binding = bindings.find(
            (item) =>
              item.providerId === ingest.providerId &&
              item.fingerprint === ingest.fingerprint &&
              item.accountRef === ingest.accountRef,
          );
          if (!binding || wiring.service.pairingReception(binding.id) !== 'receiving')
            return 'unavailable';
          return ingest.lastMessageAt ? 'receiving' : 'waiting';
        };
        return {
          channelId,
          ingests: channelIngests(db, channelId).map((ingest) => {
            const binding = bindings.find(
              (item) =>
                item.providerId === ingest.providerId && item.fingerprint === ingest.fingerprint,
            );
            return {
              ...ingest,
              ...(binding ? { botSlug: binding.botSlug } : {}),
              state: state(ingest),
            };
          }),
          candidates: bindings.map((binding) => {
            const known = new Map<string, string>();
            for (const row of db
              .prepare(
                `SELECT body FROM messaging_grants WHERE binding_id = ? AND revoked_at IS NULL
                AND json_extract(body, '$.receiveScope.kind') = 'group' ORDER BY created_at`,
              )
              .all(binding.id) as { body: string }[]) {
              const value = JSON.parse(row.body) as MessagingGrant;
              if (value.receiveScope)
                known.set(value.receiveScope.conversationId, value.targetName);
            }
            for (const held of listHeld(db, binding.id))
              if (held.conversation.kind === 'group' && !known.has(held.conversation.id))
                known.set(held.conversation.id, held.name);
            return {
              bindingId: binding.id,
              botSlug: binding.botSlug,
              platform: binding.platform,
              accountName: binding.name,
              conversations: [...known].map(([id, name]) => ({ kind: 'group' as const, id, name })),
            };
          }),
        };
      });
    },
    async ingest(channelId, input) {
      transaction(
        (db) => {
          const channel = humanBridgeChannel(OWNER_HUMAN_CONTEXT, db, channelId);
          if (channel.type !== 'group') throw new MessagingError('channel-unavailable');
          if (input.kind === 'add') {
            const identity = readMessagingIdentity(db, input.bindingId);
            if (identity.revokedAt || identity.platform === 'weixin')
              throw new MessagingError('identity-unavailable');
            const entry = conversationEntries(db, identity.id, input.conversation).find(
              (item) => item.receiveScope?.kind === 'group',
            );
            const held = listHeld(db, identity.id).find(
              (item) =>
                item.conversation.kind === 'group' &&
                item.conversation.id === input.conversation.id,
            );
            if (!entry && !held) throw new MessagingError('conversation-unavailable');
            if (
              matchingIngests(
                db,
                identity.providerId,
                identity.fingerprint,
                input.conversation,
              ).some((item) => item.channelId === channelId)
            )
              throw new MessagingError('ingest-exists');
            const at = new Date().toISOString();
            writeIngest(db, {
              id: randomUUID(),
              channelId,
              providerId: identity.providerId,
              accountRef: identity.accountRef,
              fingerprint: identity.fingerprint,
              platform: identity.platform,
              accountName: identity.name,
              conversation: {
                kind: 'group',
                id: input.conversation.id,
                name: entry?.targetName ?? held?.name ?? input.conversation.id,
              },
              revision: 1,
              enabled: true,
              intakeAfter: at,
              wake: input.wake ?? DEFAULT_INGEST_WAKE,
              createdAt: at,
            });
            return;
          }
          const value = readIngest(db, input.ingestId);
          if (value.channelId !== channelId) throw new MessagingError('ingest-unavailable');
          if (value.revision !== input.expectedRevision) throw new MessagingError('ingest-changed');
          if (input.kind === 'delete') {
            deleteIngest(db, value.id);
            return;
          }
          writeIngest(db, {
            ...value,
            revision: value.revision + 1,
            ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
            ...(input.enabled === true && !value.enabled
              ? { intakeAfter: new Date().toISOString() }
              : {}),
            ...(input.wake ? { wake: input.wake } : {}),
          });
        },
        ['grants'],
      );
      receptionChanged();
    },
    async channelBridge(channelId, rawInput) {
      const input = channelBridgeInput.parse(rawInput);
      const value = grant(input.grantId);
      const privateSource = value.platform === 'weixin';
      if (value.receiveScope?.kind === 'dm' && !privateSource)
        throw new MessagingError('capability-unavailable');
      if (
        privateSource &&
        input.kind !== 'delete' &&
        (input.collection !== 'all' || input.collectionInheritance === 'inherit')
      )
        throw new MessagingError('capability-unavailable');
      const channel = database.read((db) =>
        bridgeChannel(OWNER_HUMAN_CONTEXT, db, channelId, value.botSlug, true),
      );
      const target = input.delivery === 'inbox' ? null : channelId;
      if (target === null && channel.type !== 'dm') throw new MessagingError('channel-unavailable');
      if (value.platform === 'qq' && target !== null && channel.type !== 'group')
        throw new MessagingError('channel-unavailable');
      const routes = channelBridgeRoutes(value);
      const configuration = routes.find((route) =>
        input.routeId ? route.id === input.routeId : route.channelId === target,
      );
      if (
        value.revision !== input.expectedGrantRevision ||
        (input.kind !== 'add' &&
          (!configuration || configuration.revision !== input.expectedRevision))
      )
        throw new MessagingError('bridge-stale');
      if (
        input.kind === 'add'
          ? routes.some((route) => route.channelId === target)
          : configuration?.channelId !== target
      )
        throw new MessagingError('bridge-unavailable');
      let inspected: Awaited<ReturnType<MessagingProvider['inspect']>> | undefined;
      let entry: { provider: MessagingProvider; token: object } | undefined;
      const disablingOnly =
        input.kind === 'update' &&
        configuration !== undefined &&
        input.enabled === configuration.enabled &&
        input.name === configuration.name &&
        input.collection === configuration.collection &&
        (input.dmMirror !== undefined || input.dmForward !== undefined) &&
        !(input.dmMirror === true && value.dmMirror !== true) &&
        !(input.dmForward === true && value.dmForward !== true);
      if (input.kind === 'add' || (input.kind === 'update' && input.enabled && !disablingOnly)) {
        if (value.revokedAt || value.suspendedReason || !options.isBotActive(value.botSlug))
          throw new MessagingError('grant-unavailable');
        database.read((db) => assertMessagingIdentity(db, value.bindingId));
        entry = providers.get(value.providerId);
        if (!entry?.provider.consume || !entry.provider.reply)
          throw new MessagingError('provider-incompatible');
        inspected = await bounded(inspectGrant(entry.provider, value));
        if (
          providers.get(value.providerId) !== entry ||
          !inspected.account.connected ||
          inspected.account.ref !== value.accountRef ||
          inspected.account.platform !== value.platform ||
          inspected.account.fingerprint !== value.fingerprint ||
          inspected.target.ref !== value.targetRef ||
          inspected.target.digest !== value.targetDigest ||
          !inspected.target.receiveScope ||
          (privateSource && inspected.target.receiveScope.kind !== 'dm')
        )
          throw new MessagingError('rebind-required');
        if (
          !privateSource &&
          input.collectionInheritance !== 'inherit' &&
          input.collection === 'all' &&
          !leases.get(value.id)?.ordinaryVerified
        )
          throw new MessagingError('ordinary-delivery-unverified');
      }
      const updated = transaction(
        (db) => {
          const latest = grant(value.id);
          const currentRoutes = channelBridgeRoutes(latest);
          const current = currentRoutes.find((route) => route.id === configuration?.id);
          bridgeChannel(OWNER_HUMAN_CONTEXT, db, channelId, latest.botSlug, true);
          if (
            latest.revision !== input.expectedGrantRevision ||
            (input.kind !== 'add' && (!current || current.revision !== input.expectedRevision)) ||
            (input.kind === 'add' && currentRoutes.some((route) => route.channelId === target))
          )
            throw new MessagingError('bridge-stale');
          if (
            input.kind !== 'delete' &&
            input.expectedDefaultRevision !== undefined &&
            input.expectedDefaultRevision !== messagingDefaults(db, latest.platform).revision
          )
            throw new MessagingError('defaults-stale');
          if (entry) {
            assertMessagingIdentity(db, latest.bindingId);
            if (
              providers.get(latest.providerId) !== entry ||
              latest.revokedAt ||
              latest.suspendedReason ||
              !options.isBotActive(latest.botSlug)
            )
              throw new MessagingError('grant-unavailable');
          }
          const nextRoutes =
            input.kind === 'delete'
              ? currentRoutes.filter((route) => route.id !== current!.id)
              : [
                  ...currentRoutes.filter((route) => route.id !== current?.id),
                  {
                    id: current?.id ?? randomUUID(),
                    channelId: target,
                    name: input.name,
                    enabled: input.enabled,
                    collection: input.collection,
                    collectionInheritance: input.collectionInheritance ?? 'custom',
                    revision: (current?.revision ?? 0) + 1,
                    ...(input.kind === 'add' || (input.enabled && !current?.enabled)
                      ? { intakeAfter: new Date().toISOString() }
                      : current?.intakeAfter
                        ? { intakeAfter: current.intakeAfter }
                        : {}),
                  },
                ];
          const { channelBridge: _bridge, receiveTargetChannelId: _target, ...rest } = latest;
          const { receiveScope: priorScope, ...withoutScope } = rest;
          const switchesChanged =
            privateSource &&
            input.kind === 'update' &&
            ((input.dmMirror !== undefined && input.dmMirror !== (latest.dmMirror === true)) ||
              (input.dmForward !== undefined && input.dmForward !== (latest.dmForward === true)));
          const next: MessagingGrant = {
            ...withoutScope,
            ...(switchesChanged ? { dmSyncRevision: (latest.dmSyncRevision ?? 0) + 1 } : {}),
            bridgeRoutes: switchesChanged
              ? nextRoutes.map((route) =>
                  route.id === current?.id ? route : { ...route, revision: route.revision + 1 },
                )
              : nextRoutes,
            revision: nextRoutes.length ? latest.revision : latest.revision + 1,
            ...(nextRoutes.length && (inspected?.target.receiveScope ?? priorScope)
              ? { receiveScope: inspected?.target.receiveScope ?? priorScope }
              : {}),
            ...(privateSource && input.kind === 'update' && input.dmMirror !== undefined
              ? {
                  dmMirror: input.dmMirror,
                  ...(input.dmMirror && latest.dmMirror !== true
                    ? { dmMirrorEpoch: randomUUID() }
                    : {}),
                }
              : {}),
            ...(privateSource && input.kind === 'update' && input.dmForward !== undefined
              ? {
                  dmForward: input.dmForward,
                  ...(input.dmForward && latest.dmForward !== true
                    ? { dmForwardAfter: new Date().toISOString() }
                    : {}),
                }
              : {}),
          };
          db.prepare('UPDATE messaging_grants SET body = ?, revision = ? WHERE id = ?').run(
            JSON.stringify(next),
            next.revision,
            latest.id,
          );
          if (switchesChanged && next.receiveScope?.kind === 'dm') {
            for (const row of db
              .prepare('SELECT body FROM messaging_grants WHERE binding_id = ? AND id != ?')
              .all(next.bindingId, next.id)) {
              const sibling = JSON.parse(String(row.body)) as MessagingGrant;
              if (
                sibling.receiveScope?.kind !== 'dm' ||
                sibling.receiveScope.conversationId !== next.receiveScope.conversationId
              )
                continue;
              db.prepare('UPDATE messaging_grants SET body = ? WHERE id = ?').run(
                JSON.stringify({
                  ...sibling,
                  dmMirror: next.dmMirror,
                  dmForward: next.dmForward,
                  dmMirrorEpoch: next.dmMirrorEpoch,
                  dmSyncRevision: next.dmSyncRevision,
                  dmForwardAfter: next.dmForwardAfter,
                  bridgeRoutes: channelBridgeRoutes(sibling).map((route) => ({
                    ...route,
                    revision: route.revision + 1,
                  })),
                }),
                sibling.id,
              );
            }
          }
          return next;
        },
        ['grants', 'channel', 'bot-inbox'],
      );
      if (!updated.receiveScope) stop(value.id);
      else if (!valid(updated)) await bounded(start(updated));
      options.warn?.(
        JSON.stringify({
          event: 'messaging-channel-bridge',
          phase: 'committed',
          initiator: 'human-profile',
          channelId,
          grantId: value.id,
          operation: input.kind,
          routeId: configuration?.id,
        }),
      );
    },
    async setChannelTarget(botSlug, id, channelId) {
      const updated = transaction(
        (db) => {
          const value = grant(id);
          if (
            value.botSlug !== botSlug ||
            value.revokedAt ||
            value.suspendedReason ||
            !options.isBotActive(botSlug)
          )
            throw new MessagingError('grant-unavailable');
          if (value.bridgeRoutes) throw new MessagingError('bridge-stale');
          if (
            channelId !== null &&
            bridgeChannel(OWNER_HUMAN_CONTEXT, db, channelId, botSlug, true).type !== 'group'
          )
            throw new MessagingError('channel-unavailable');
          const { receiveTargetChannelId: _old, channelBridge: _bridge, ...rest } = value;
          const next: MessagingGrant = {
            ...rest,
            revision: value.revision + 1,
            ...(channelId === null
              ? {}
              : {
                  receiveTargetChannelId: channelId,
                  channelBridge: {
                    name: value.targetName,
                    enabled: !!value.receiveScope,
                    collection: groupReceptionPolicy(db, id).collection,
                    revision: 1,
                  },
                }),
          };
          db.prepare('UPDATE messaging_grants SET body = ?, revision = ? WHERE id = ?').run(
            JSON.stringify(next),
            next.revision,
            id,
          );
          return next;
        },
        ['grants', 'bindings', 'bot-inbox'],
      );
      stop(id);
      if (updated.receiveScope) await start(updated);
    },
    endChannel(channelId) {
      transaction(
        (db) => {
          for (const row of db.prepare('SELECT id, body FROM messaging_grants').all()) {
            const value = JSON.parse(String(row.body)) as MessagingGrant;
            const routes = channelBridgeRoutes(value);
            if (!routes.some((route) => route.channelId === channelId)) continue;
            const next = {
              ...value,
              bridgeRoutes: routes.filter((route) => route.channelId !== channelId),
            };
            delete next.receiveTargetChannelId;
            db.prepare('UPDATE messaging_grants SET body = ? WHERE id = ?').run(
              JSON.stringify(next),
              String(row.id),
            );
          }
          for (const row of db
            .prepare('SELECT id, body FROM messaging_conversation_ingests WHERE channel_id = ?')
            .all(channelId)) {
            const value = JSON.parse(String(row.body));
            db.prepare(
              'UPDATE messaging_conversation_ingests SET body = ?, revision = revision + 1 WHERE id = ?',
            ).run(
              JSON.stringify({ ...value, enabled: false, revision: Number(value.revision) + 1 }),
              String(row.id),
            );
          }
          for (const row of db
            .prepare(`SELECT a.source_event_id, a.bot_slug FROM inbox_admissions a
          WHERE a.attempt_state IN ('pending', 'retryable', 'running') AND EXISTS
            (SELECT 1 FROM messaging_source_paths p WHERE p.source_event_id = a.source_event_id
              AND p.bot_slug = a.bot_slug AND p.channel_id = ?)`)
            .all(channelId)) {
            if (
              grantReception(db, String(row.source_event_id), String(row.bot_slug)) ||
              currentReceptionPaths(
                db,
                String(row.bot_slug),
                String(row.source_event_id),
                undefined,
                'reply',
              ).length
            )
              continue;
            prepareEndedChannelAdmissionRepair(db).run(
              String(row.source_event_id),
              String(row.bot_slug),
            );
          }
        },
        ['channel', 'bot-inbox', 'messaging'],
      );
      options.onReceptionChanged?.();
    },
  };

  return { placeIngests, methods };
}
