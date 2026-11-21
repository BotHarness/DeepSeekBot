import { OWNER_HUMAN_CONTEXT } from '../humans/context.js';
import { effectiveDmControls } from './dm-controls.js';
import type { FailureAlerts } from './failure-alerts.js';
import type { ApprovalMessaging } from './approval-messaging.js';
import { externalPermissionGroups } from './permission-groups.js';
import { behaviorPermissions } from './behavior-permissions.js';
import type { QuestionMessaging } from './question-messaging.js';
import type { BotPairing } from './pairing.js';
import { externalUserRoles, readSenderPolicy } from './sender-access.js';
import {
  readMessagingIdentity,
  type MessagingIdentity,
  type MessagingIdentityView,
} from './identity.js';
import {
  observeReception,
  receptionObservationDue,
  receptionHistory,
} from './reception-history.js';
import { listBlocks, listHeld } from './conversations.js';
import { bridgeChannel, humanBridgeChannel } from './channel-target.js';
import { channelBridgeRoutes } from './channel-bridge.js';
import type { InboundMessaging } from './inbound.js';
import { createMessagingTyping } from './typing.js';
import type { SourceFeedback } from './feedback.js';
import type { DatabaseSync } from 'node:sqlite';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { MessagingError, type MessagingAccount, type MessagingTarget } from './provider.js';
import type {
  OutboundMessaging,
  MessagingSnapshot,
  ProviderRegistration,
  MessagingApp,
  AccountReader,
  MessagingGrant,
  OutboxIntent,
} from './outbound-types.js';
import type { OutboundMessagingOptions } from './outbound.js';

export function createOutboundSnapshot(context: {
  database: OperationalDatabaseModulePort;
  service: OutboundMessaging;
  providers: Map<string, ProviderRegistration>;
  bounded: <T>(work: Promise<T>) => Promise<T>;
  current: (id: string, token: object) => void;
  binding: (id: string) => MessagingIdentity;
  inspectIdentity: (
    value: Pick<MessagingIdentity, 'providerId' | 'accountRef' | 'fingerprint'>,
    readAccount?: AccountReader,
  ) => Promise<MessagingAccount & { token: object }>;
  inbound: InboundMessaging;
  typing: ReturnType<typeof createMessagingTyping>;
  check: (
    value: MessagingGrant,
    readAccount?: AccountReader,
  ) => Promise<
    ProviderRegistration & {
      inspected: { account: MessagingAccount; target: MessagingTarget };
      identityRevision: number;
    }
  >;
  grant: (slug: string, id: string) => MessagingGrant;
  options: OutboundMessagingOptions;
  history: (botSlug: string) => OutboxIntent[];
  now: () => string;
  closed: boolean;
  receptionHostId: string;
  transaction: <T>(command: (db: DatabaseSync) => T, topics?: string[]) => T;
  pairing: BotPairing;
  approvals: ApprovalMessaging;
  questions: QuestionMessaging;
  failureAlerts: FailureAlerts;
}): Pick<OutboundMessaging, 'channelBridges' | 'apps' | 'setups' | 'snapshot'> {
  const {
    database,
    providers,
    bounded,
    current,
    binding,
    inspectIdentity,
    inbound,
    typing,
    check,
    grant,
    options,
    history,
    now,
    receptionHostId,
    transaction,
    pairing,
    approvals,
    questions,
    failureAlerts,
  } = context;

  return {
    async channelBridges(channelId, mode) {
      const channel = database.read((db) => humanBridgeChannel(OWNER_HUMAN_CONTEXT, db, channelId));
      const snapshots = await Promise.all(
        channel.members.map((slug) => context.service.snapshot(slug, mode)),
      );
      const current = database.read((db) => humanBridgeChannel(OWNER_HUMAN_CONTEXT, db, channelId));
      const grants = snapshots.flatMap((snapshot, index) =>
        current.members.includes(channel.members[index]!)
          ? snapshot.grants.filter(
              (grant) => grant.platform === 'weixin' || grant.receiveScope?.kind !== 'dm',
            )
          : [],
      );
      const source = (g: MessagingSnapshot['grants'][number]) => ({
        grantId: g.id,
        grantRevision: g.revision,
        dmMirror: g.dmMirror === true,
        dmForward: g.dmForward === true,
        dmForwardAvailable: grants.some(
          (other) =>
            other.botSlug === g.botSlug &&
            other.bindingId === g.bindingId &&
            other.platform === 'weixin' &&
            other.canPost === true &&
            other.postConversationId === g.receiveScope?.conversationId,
        ),
        botSlug: g.botSlug,
        platform: g.platform,
        accountName: g.accountName,
        conversationName: g.targetName,
        ordinaryDelivery: g.ordinaryDelivery ?? ('unverified' as const),
        defaultRevision: context.service.defaults(g.platform).revision,
      });
      return {
        channelId,
        ...(mode
          ? { checks: mode === 'saved' ? ('pending' as const) : ('complete' as const) }
          : {}),
        canTargetInbox: current.type === 'dm',
        receptionNeedsAttention: snapshots.some(
          (snapshot, index) =>
            current.members.includes(channel.members[index]!) &&
            (snapshot.grants.some(
              (grant) =>
                grant.receiveScope &&
                !grant.revokedAt &&
                !grant.suspendedReason &&
                grant.recovery?.kind === 'action-required',
            ) ||
              snapshot.identities?.some(
                (identity) =>
                  identity.enabled &&
                  !identity.revokedAt &&
                  (identity.recovery?.kind === 'action-required' ||
                    identity.availability === 'rebind-required'),
              )),
        ),
        bridges: grants.flatMap((g) =>
          channelBridgeRoutes(g)
            .filter(
              (route) =>
                route.channelId === channelId ||
                (current.type === 'dm' && route.channelId === null && g.origin !== 'implicit'),
            )
            .map((route) => ({
              ...source(g),
              ...route,
              routeId: route.id,
              delivery: route.channelId === null ? ('inbox' as const) : ('channel' as const),
              collection:
                route.collectionInheritance === 'inherit'
                  ? context.service.defaults(g.platform).collection
                  : route.collection,
              defaultRevision: context.service.defaults(g.platform).revision,
              availability: g.availability,
              reception: route.enabled ? g.reception : ('off' as const),
              ...(route.enabled && g.recovery ? { recovery: g.recovery } : {}),
            })),
        ),
        sources: grants
          .filter((g) => !g.revokedAt && g.availability === 'available' && g.canReceive)
          .map(source),
      };
    },
    async apps() {
      const accounts = (
        await Promise.allSettled(
          [...providers.values()].map(async (entry) =>
            (await bounded(entry.provider.accounts())).map((account) => ({
              ...account,
              providerId: entry.provider.id,
            })),
          ),
        )
      ).flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
      const bindings = database.read((db) =>
        db
          .prepare(
            'SELECT id, bot_slug, provider_id, account_ref, fingerprint FROM messaging_bindings WHERE revoked_at IS NULL',
          )
          .all(),
      ) as {
        id: string;
        bot_slug: string;
        provider_id: string;
        account_ref: string;
        fingerprint: string;
      }[];
      return accounts.map((account) => {
        const bound = bindings.find(
          (b) =>
            b.provider_id === account.providerId &&
            (b.account_ref === account.ref || b.fingerprint === account.fingerprint),
        );
        return bound ? { ...account, boundBotSlug: bound.bot_slug, bindingId: bound.id } : account;
      });
    },
    async setups() {
      return (
        await Promise.allSettled(
          [...providers.values()].map(async ({ provider }) => {
            const setup = await bounded(provider.setup?.() ?? Promise.resolve(undefined));
            return setup ? { ...setup, providerId: provider.id } : undefined;
          }),
        )
      ).flatMap((result) => (result.status === 'fulfilled' && result.value ? [result.value] : []));
    },
    async snapshot(botSlug, mode) {
      const reads = new Map<object, Map<string, Promise<MessagingAccount | undefined>>>();
      const statusAccounts: MessagingApp[] = [];
      const retained = new Map<object, string>();
      const readAccount: AccountReader = (entry, ref) => {
        retained.set(entry.token, entry.provider.id);
        let byRef = reads.get(entry.token);
        if (!byRef) {
          byRef = new Map();
          reads.set(entry.token, byRef);
        }
        const pending = byRef.get(ref);
        if (pending) return pending;
        const work = bounded(
          entry.provider.inspectAccount
            ? entry.provider.inspectAccount(ref)
            : entry.provider
                .accounts()
                .then((rows) => rows.find((row) => row.ref === ref && !row.unsupported)),
        ).then((account) => {
          current(entry.provider.id, entry.token);
          if (account) statusAccounts.push({ ...account, providerId: entry.provider.id });
          return account;
        });
        byRef.set(ref, work);
        return work;
      };
      const accounts: MessagingApp[] = mode ? [] : await context.service.apps();
      const appSetups = mode ? [] : await context.service.setups();
      const rows = database.read((db) =>
        db
          .prepare('SELECT body FROM messaging_grants WHERE bot_slug = ? ORDER BY created_at DESC')
          .all(botSlug),
      ) as unknown as { body: string }[];
      const identityRows = database.read((db) =>
        db
          .prepare(
            'SELECT id FROM messaging_bindings WHERE bot_slug = ? AND revoked_at IS NULL ORDER BY created_at',
          )
          .all(botSlug),
      ) as { id: string }[];
      const identities: MessagingIdentityView[] = await Promise.all(
        identityRows.map(async ({ id }) => {
          const value = binding(id);
          let availability: MessagingIdentityView['availability'] = value.enabled
            ? 'unavailable'
            : 'paused';
          if (value.enabled && mode !== 'saved') {
            try {
              await inspectIdentity(value, readAccount);
              availability = 'available';
            } catch (error) {
              if (error instanceof MessagingError && error.code === 'rebind-required')
                availability = 'rebind-required';
            }
          }
          const latest = binding(id);
          if (latest.revision !== value.revision)
            availability = latest.enabled ? 'unavailable' : 'paused';
          const recovery = inbound.pairingRecovery(id);
          const scopes = rows
            .map((r) => JSON.parse(r.body) as MessagingGrant)
            .filter((g) => g.bindingId === id && !g.revokedAt);
          return {
            ...latest,
            availability,
            reception:
              (mode === 'saved' && latest.enabled) || availability === 'available'
                ? inbound.pairingReception(id)
                : availability === 'paused'
                  ? ('off' as const)
                  : ('unavailable' as const),
            ...(recovery ? { recovery } : {}),
            grantCount: scopes.length,
            scopes: scopes.map((g) => g.targetName),
            ...(latest.platform === 'weixin'
              ? {
                  typing: {
                    supported: (mode === 'status' ? statusAccounts : accounts).some(
                      (account) =>
                        account.providerId === latest.providerId &&
                        account.ref === latest.accountRef &&
                        account.fingerprint === latest.fingerprint &&
                        account.typingSupported === true,
                    ),
                    ...typing.state(id),
                  },
                }
              : {}),
          };
        }),
      );
      const grants = await Promise.all(
        rows.map(async (row) => {
          const value = database.read((db) =>
            effectiveDmControls(db, JSON.parse(row.body) as MessagingGrant),
          );
          let availability: 'available' | 'unavailable' | 'rebind-required' = 'unavailable';
          let canReceive = false;
          let canPost = false;
          let postConversationId: string | undefined;
          if (value.revokedAt === undefined && mode !== 'saved') {
            try {
              const checked = await check(value, readAccount);
              canPost =
                checked.inspected.account.postSupported !== false &&
                (value.origin === 'implicit'
                  ? checked.provider.postConversation !== undefined &&
                    checked.inspected.target.receiveScope?.kind === 'group'
                  : checked.provider.post !== undefined ||
                    checked.provider.postConversation !== undefined) &&
                checked.inspected.target.receiveScope !== undefined;
              if (canPost)
                postConversationId = checked.inspected.target.receiveScope?.conversationId;
              canReceive =
                checked.provider.consume !== undefined &&
                checked.provider.reply !== undefined &&
                checked.inspected.target.receiveScope !== undefined;
              availability = 'available';
            } catch (error) {
              if (error instanceof MessagingError && error.code === 'rebind-required')
                availability = 'rebind-required';
            }
          }
          const current = grant(botSlug, value.id);
          const recovery = inbound.recovery(value.id);
          const lastMessageAt =
            current.origin === 'implicit' && mode !== 'saved'
              ? (
                  database.read((db) =>
                    db
                      .prepare(
                        "SELECT max(created_at) AS at FROM source_events WHERE source_kind = 'bridge-message' AND json_extract(payload_json, '$.external.grantId') = ?",
                      )
                      .get(current.id),
                  ) as { at: string | null }
                ).at
              : null;
          return {
            ...current,
            ...(lastMessageAt ? { lastMessageAt } : {}),
            availability,
            reception: inbound.status(value.id),
            ...(recovery ? { recovery } : {}),
            canReceive,
            canPost,
            ...(postConversationId ? { postConversationId } : {}),
            ...(current.revokedAt === undefined &&
            !current.suspendedReason &&
            options.isBotActive(botSlug) &&
            current.receiveScope?.kind !== 'dm' &&
            current.platform !== 'weixin'
              ? {
                  groupPolicy: inbound.policy(botSlug, value.id),
                  threadPolicies: inbound.threads(botSlug, value.id),
                  ordinaryDelivery: inbound.ordinaryDelivery(value.id),
                }
              : {}),
          };
        }),
      );
      const replaced = new Set(
        [...retained]
          .filter(([token, id]) => providers.get(id)?.token !== token)
          .map(([, id]) => id),
      );
      for (const identity of identities)
        if (replaced.has(identity.providerId)) {
          identity.availability = identity.enabled ? 'unavailable' : 'paused';
          identity.reception = identity.enabled ? 'unavailable' : 'off';
          if (identity.typing) identity.typing.supported = false;
        }
      for (const grant of grants)
        if (replaced.has(grant.providerId)) {
          grant.availability = 'unavailable';
          grant.reception = 'unavailable';
          grant.canReceive = false;
          grant.canPost = false;
        }
      for (let index = accounts.length - 1; index >= 0; index--)
        if (replaced.has(accounts[index]!.providerId)) accounts.splice(index, 1);
      if (mode === 'status')
        accounts.push(
          ...statusAccounts
            .filter((account) => !replaced.has(account.providerId))
            .map((account) => {
              const identity = identities.find(
                (row) => row.providerId === account.providerId && row.accountRef === account.ref,
              );
              return identity
                ? { ...account, bindingId: identity.id, boundBotSlug: identity.botSlug }
                : account;
            }),
        );
      const channelTargets = database.read((db) => {
        const rows = db.prepare('SELECT channel_id FROM channel_records').all() as {
          channel_id: string;
        }[];
        return rows.flatMap(({ channel_id }) => {
          try {
            const channel = bridgeChannel(OWNER_HUMAN_CONTEXT, db, channel_id, botSlug, true);
            return channel.type === 'group' ? [{ id: channel.id, name: channel.name }] : [];
          } catch (error) {
            if (error instanceof MessagingError) return [];
            throw error;
          }
        });
      });
      const intents = history(botSlug);
      const setupRows = database.read((db) =>
        db
          .prepare(`SELECT source_event_id FROM source_events
          WHERE bot_slug = ? AND source_kind = 'bridge-message'
          AND instr(body, '[BH-LARK-SETUP]') > 0
          ORDER BY created_at DESC, source_event_id DESC LIMIT 20`)
          .all(botSlug),
      ) as { source_event_id: string }[];
      const receipts: NonNullable<MessagingSnapshot['setup']>['receipts'] = [];
      for (const row of setupRows) {
        try {
          const source = inbound.read(botSlug, row.source_event_id);
          const current = grants.find((g) => g.id === source.grantId);
          if (
            source.platform !== 'feishu' ||
            !source.event.mentionedAccount ||
            current?.availability !== 'available' ||
            current.revokedAt ||
            current.reception !== 'receiving' ||
            current.receiveScope?.conversationId !== source.event.conversation.id ||
            !source.event.reply.threadId
          )
            continue;
          const threadId = source.event.reply.threadId;
          const setupReplies = database.read((db) =>
            db
              .prepare(`SELECT body FROM messaging_outbox
                WHERE bot_slug = ?
                  AND json_extract(body, '$.sourceEventId') = ?
                  AND json_extract(body, '$.grantId') = ?
                  AND json_extract(body, '$.reply.route.threadId') = ?
                ORDER BY created_at DESC, id DESC`)
              .all(botSlug, source.id, current.id, threadId),
          ) as { body: string }[];
          const candidate = setupReplies
            .map(({ body }) => JSON.parse(body) as OutboxIntent)
            .find((reply) => reply.text.trim() === 'LARK-SETUP-OK');
          const intent =
            candidate?.sourceEventId === source.id &&
            candidate.grantId === current.id &&
            candidate.reply?.route.threadId === source.event.reply.threadId &&
            candidate.text.trim() === 'LARK-SETUP-OK'
              ? candidate
              : undefined;
          receipts.push({
            sourceEventId: source.id,
            grantId: current.id,
            messageId: source.event.messageId,
            conversationId: source.event.conversation.id,
            threadId: source.event.reply.threadId,
            at: source.at,
            ...(intent ? { replyState: intent.state } : {}),
            ...(intent?.receipt?.conversationId === source.event.conversation.id
              ? { replyMessageId: intent.receipt.messageId }
              : {}),
            echoObserved:
              intent?.state === 'provider-accepted' &&
              !!intent.echo &&
              intent.receipt?.conversationId === source.event.conversation.id,
          });
        } catch (error) {
          if (!(error instanceof MessagingError)) throw error;
        }
      }
      const qqIdentities = identities.filter((identity) => identity.platform === 'qq');
      const observedAt = now();
      const observations =
        context.closed || mode === 'saved'
          ? []
          : database.read((db) =>
              qqIdentities.filter((identity) =>
                receptionObservationDue(db, identity, receptionHostId, observedAt),
              ),
            );
      if (observations.length)
        transaction((db) => {
          for (const identity of observations)
            if (readMessagingIdentity(db, identity.id).revision === identity.revision)
              observeReception(db, identity, receptionHostId, observedAt);
        });
      return {
        ...(mode
          ? { checks: mode === 'saved' ? ('pending' as const) : ('complete' as const) }
          : {}),
        ...(qqIdentities.length
          ? { receptionHistory: database.read((db) => receptionHistory(db, botSlug)) }
          : {}),
        accounts,
        appSetups,
        feedback: database.read((db) =>
          (
            db
              .prepare(`SELECT s.source_event_id, s.payload_json, g.binding_id
          FROM source_events s JOIN inbox_admissions a USING(source_event_id)
          JOIN messaging_grants g ON g.id = json_extract(s.payload_json, '$.external.grantId')
          WHERE a.bot_slug = ? AND json_type(s.payload_json, '$.feedback') = 'object'
          ORDER BY s.created_at DESC, s.source_event_id DESC LIMIT 30`)
              .all(botSlug) as {
              source_event_id: string;
              payload_json: string;
              binding_id: string;
            }[]
          ).map((row) => ({
            sourceEventId: row.source_event_id,
            bindingId: row.binding_id,
            attempts: (JSON.parse(row.payload_json) as { feedback: SourceFeedback }).feedback,
          })),
        ),
        identities,
        roles: database.read((db) => externalUserRoles(db, botSlug)),
        permissionGroups: database.read((db) => externalPermissionGroups(db, botSlug)),
        behaviorPermissions: database.read((db) => behaviorPermissions(db, botSlug)),
        senderPolicy: database.read((db) => readSenderPolicy(db, botSlug)),
        pairings: pairing.list(botSlug),
        approvals: approvals.snapshot(botSlug),
        questions: questions.snapshot(botSlug),
        failureAlerts: failureAlerts.snapshot(botSlug),
        pairingReceivers: identities
          .filter((i) => ['feishu', 'slack'].includes(i.platform) && !i.revokedAt)
          .map((i) => ({ name: i.name, status: i.reception ?? 'unavailable' })),
        grants,
        heldConversations: database.read((db) =>
          identities.flatMap((identity) => listHeld(db, identity.id)),
        ),
        blockedConversations: database
          .read((db) => listBlocks(db, botSlug))
          .map((block) => {
            const owner = identities.find((identity) => identity.fingerprint === block.fingerprint);
            return owner ? { ...block, bindingId: owner.id } : block;
          }),
        channelTargets,
        intents,
        setup: {
          providerReady: [...providers.values()].some(
            ({ provider }) =>
              provider.id === 'dsh-im/feishu' && !!provider.consume && !!provider.reply,
          ),
          receipts,
        },
      };
    },
  };
}
