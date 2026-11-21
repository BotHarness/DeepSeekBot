import { ReceiverRecovery } from './receiver-recovery.js';
import { admissionBound, readBlock } from './conversations.js';
import type { PairingRequest } from './pairing.js';
import { chatPairingApplies } from './chat-sender.js';
import { readSenderPolicy, senderAdmissionAllowed } from './sender-access.js';
import { readMessagingIdentity } from './identity.js';
import { assertMessagingIdentity } from './identity.js';
import type { DatabaseSync } from 'node:sqlite';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { MessagingGrant } from './outbound.js';
import {
  MessagingError,
  type MessagingInboundEvent,
  type MessagingProvider,
  type MessagingReplyRoute,
} from './provider.js';
import type { InboundMessaging } from './inbound-types.js';
import type { InboundMessagingOptions } from './inbound.js';

export function createInboundControlReceiver(wiring: {
  controlRetries: ReceiverRecovery;
  options: InboundMessagingOptions;
  closed: boolean;
  database: OperationalDatabaseModulePort;
  providers: Map<
    string,
    { provider: MessagingProvider; token: object; consume?: MessagingProvider['consume'] }
  >;
  receptionChanged: () => void;
  bounded: <T>(pending: Promise<T>) => Promise<T>;
  transaction: <T>(command: (db: DatabaseSync) => T, topics?: string[]) => T;
  defaultTraffic: (
    id: string,
    lease: { controller: AbortController; token: object },
    event: MessagingInboundEvent,
    signal: AbortSignal,
  ) => Promise<{ accepted: true }>;
  retries: ReceiverRecovery;
  start: (value: MessagingGrant, attempt?: number, replyOnly?: boolean) => Promise<void>;
  grant: (id: string) => MessagingGrant;
  conversationEntries: (
    db: DatabaseSync,
    bindingId: string,
    conversation: MessagingInboundEvent['conversation'],
  ) => MessagingGrant[];
  targetAvailable: (value: MessagingGrant) => boolean;
  stop: (id: string) => void;
}) {
  const {
    controlRetries,
    options,
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
  } = wiring;

  const controls = new Map<
    string,
    {
      controller: AbortController;
      token: object;
      startedAt: number;
      ready: Promise<void>;
      dispose?: (() => void) | undefined;
    }
  >();

  const stopControl = (id: string, reason = 'identity-reconciled') => {
    controlRetries.clear(id);
    const value = controls.get(id);
    if (!value) return;
    value.controller.abort();
    value.dispose?.();
    controls.delete(id);
    options.warn?.(
      JSON.stringify({
        event: 'bot-pairing',
        phase: 'receiver-released',
        initiator: 'account-lifecycle',
        externalResource: 'checked-account-consumer',
        reason,
        durationMs: Math.max(0, Math.round(performance.now() - value.startedAt)),
      }),
    );
  };

  const startControl = async (id: string, attempt = 0) => {
    if (!options.pairing || wiring.closed) return;
    const identity = database.read((db) => readMessagingIdentity(db, id));
    if (!identity.enabled || identity.revokedAt || !options.isBotActive(identity.botSlug)) return;
    const entry = providers.get(identity.providerId);
    if (!entry?.consume || !entry.provider.reply || !entry.provider.inspectAccount) return;
    if (controlRetries.state(id)) return;
    const prior = controls.get(id);
    if (prior?.token === entry.token) return prior.ready;
    stopControl(id, 'provider-replaced');
    const controller = new AbortController();
    const lease = {
      controller,
      token: entry.token,
      startedAt: performance.now(),
      ready: Promise.resolve(),
      dispose: undefined as (() => void) | undefined,
    };
    controls.set(id, lease);
    receptionChanged();
    lease.ready = (async () => {
      try {
        const account = await bounded(entry.provider.inspectAccount!(identity.accountRef));
        controller.signal.throwIfAborted();
        if (account.fingerprint !== identity.fingerprint)
          throw new MessagingError('rebind-required');
        if (!account.connected) throw new MessagingError('provider-unavailable');
        if (identity.platform === 'qq')
          transaction((db) => {
            controller.signal.throwIfAborted();
            const latest = readMessagingIdentity(db, id);
            if (!latest.enabled || latest.revokedAt || controls.get(id) !== lease)
              throw new MessagingError('consumer-unavailable');
            db.prepare('UPDATE messaging_bindings SET receive_after = ? WHERE id = ?').run(
              new Date().toISOString(),
              id,
            );
          });
        lease.dispose = await bounded(
          entry.consume!({
            accountRef: identity.accountRef,
            fingerprint: identity.fingerprint,
            signal: controller.signal,
            onEvent: (event, signal) => defaultTraffic(id, lease, event, signal),
          }),
        );
        if (controller.signal.aborted || controls.get(id) !== lease) lease.dispose();
        else {
          receptionChanged();
          retryBoundGrants(id);
          options.warn?.(
            JSON.stringify({
              event: 'bot-pairing',
              phase: 'receiver-ready',
              initiator: 'account-lifecycle',
              externalResource: 'checked-account-consumer',
              botSlug: identity.botSlug,
              bindingId: id,
              durationMs: Math.max(0, Math.round(performance.now() - lease.startedAt)),
            }),
          );
        }
      } catch (error) {
        if (controls.get(id) !== lease) return;
        stopControl(id, 'receiver-acquisition-failed');
        const reason = error instanceof MessagingError ? error.code : 'consumer-unavailable';
        if (!wiring.closed && providers.get(identity.providerId) === entry) {
          controlRetries.fail(id, entry.token, reason, attempt, () => {
            if (!wiring.closed && providers.get(identity.providerId) === entry)
              void startControl(id, attempt + 1);
          });
          if (reason !== 'provider-unavailable') retryBoundGrants(id);
        }
        options.warn?.(
          JSON.stringify({
            event: 'bot-pairing',
            phase: 'receiver-unavailable',
            initiator: 'account-lifecycle',
            externalResource: 'checked-account-consumer',
            durationMs: Math.max(0, Math.round(performance.now() - lease.startedAt)),
            reason,
            retryAttempt: attempt,
            recovery: controlRetries.state(id),
            botSlug: identity.botSlug,
            bindingId: id,
          }),
        );
      }
    })();
    return lease.ready;
  };

  const retryBoundGrants = (bindingId: string) => {
    const rows = database.read((db) =>
      db.prepare('SELECT id FROM messaging_grants WHERE binding_id = ?').all(bindingId),
    );
    for (const row of rows) {
      const id = String(row.id);
      if (retries.pending(id)) void start(grant(id));
    }
  };

  const sendPairingNotice = async (
    request: PairingRequest,
    key: string,
    route: MessagingReplyRoute,
    signal?: AbortSignal,
    conversationKind = request.conversationKind ?? 'dm',
  ) => {
    if (!options.pairing || !options.pairing.notice(request.id, key)) return;
    let outcome: 'accepted' | 'unconfirmed' = 'unconfirmed';
    try {
      const identity = database.read((db) => assertMessagingIdentity(db, request.bindingId));
      const entry = providers.get(identity.providerId);
      const lease = controls.get(request.bindingId);
      if (!entry?.provider.reply || !lease || lease.controller.signal.aborted)
        throw new MessagingError('consumer-unavailable');
      const text = key.startsWith('approved:')
        ? 'Pairing approved. Please send your question again as a new message. Your earlier request will not run. / 配对已批准，请重新发送新问题。之前的请求不会执行。'
        : `Pairing request ${request.reference} is waiting for Human review and expires in 10 minutes. Your message will not run. / 配对申请 ${request.reference} 等待人工审核，10 分钟后过期。该消息不会执行。`;
      await bounded(
        entry.provider.reply({
          accountRef: identity.accountRef,
          fingerprint: identity.fingerprint,
          route,
          text,
          signal: AbortSignal.any([
            lease.controller.signal,
            AbortSignal.timeout(15000),
            ...(signal ? [signal] : []),
          ]),
          beforeSend: () => {
            try {
              const current = database.read((db) => assertMessagingIdentity(db, request.bindingId));
              const paired = options
                .pairing!.list(request.botSlug)
                .find((item) => item.id === request.id);
              return (
                !wiring.closed &&
                controls.get(request.bindingId) === lease &&
                providers.get(identity.providerId) === entry &&
                options.isBotActive(request.botSlug) &&
                options.bindingAvailable?.(request.bindingId) !== false &&
                current.fingerprint === identity.fingerprint &&
                paired?.revision === request.revision &&
                paired.status === request.status &&
                !database.read((db) =>
                  readBlock(db, request.botSlug, identity.fingerprint, {
                    kind: conversationKind,
                    id: route.conversationId,
                  }),
                )
              );
            } catch {
              return false;
            }
          },
        }),
      );
      outcome = 'accepted';
    } catch {}
    options.pairing.notice(request.id, key, outcome);
    options.warn?.(
      JSON.stringify({
        event: 'bot-pairing',
        phase: 'notification',
        initiator: key.startsWith('approved:') ? 'authenticated-web' : 'sender-intake',
        outcome,
        requestId: request.id,
      }),
    );
  };

  const controlIntake = async (
    provider: MessagingProvider,
    event: MessagingInboundEvent,
    signal: AbortSignal,
  ) => {
    if (await options.onQuestionText?.(provider.id, event, signal)) return true;
    if (!options.pairing || !chatPairingApplies(event) || provider.id !== `dsh-im/${event.channel}`)
      return false;
    signal.throwIfAborted();
    const explicit = /^\/pair(?:\s|$)/.test(event.text.trim());
    if (explicit && event.channel === 'slack') return true;
    const row = database.read((db) =>
      db
        .prepare(
          'SELECT id FROM messaging_bindings WHERE provider_id = ? AND account_ref = ? AND fingerprint = ? AND revoked_at IS NULL',
        )
        .get(provider.id, event.botId, event.fingerprint),
    ) as { id: string } | undefined;
    if (!row) return explicit;
    const lease = controls.get(row.id);
    if (!lease || lease.controller.signal.aborted) return explicit;
    const identity = database.read((db) => readMessagingIdentity(db, row.id));
    options.pairing.observePrivate(row.id, event);
    const restricted = database.read((db) => readSenderPolicy(db, identity.botSlug).restricted);
    const intentional = event.conversation.kind === 'dm' || event.mentionedAccount;
    if (restricted && intentional && !explicit) {
      const allowedConversation = database.read((db) => {
        if (readBlock(db, identity.botSlug, identity.fingerprint, event.conversation)) return false;
        const entries = conversationEntries(db, row.id, event.conversation);
        if (entries.length)
          return entries.some(
            (value) =>
              !value.revokedAt &&
              !value.suspendedReason &&
              targetAvailable(value) &&
              value.channelBridge?.enabled !== false &&
              (!value.bridgeRoutes || value.bridgeRoutes.some((route) => route.enabled)),
          );
        return (
          identity.newConversations === 'auto' &&
          admissionBound(db, row.id, new Date()) === undefined
        );
      });
      if (
        !allowedConversation ||
        !identity.enabled ||
        identity.revokedAt ||
        options.bindingAvailable?.(row.id) === false ||
        !options.isBotActive(identity.botSlug) ||
        (identity.receiveAfter && Date.parse(event.at) < Date.parse(identity.receiveAfter))
      )
        return true;
      if (!database.read((db) => senderAdmissionAllowed(db, identity.botSlug, event))) {
        try {
          const request = options.pairing.request(row.id, event, 'conversation');
          if (request.status === 'pending' && event.channel === 'feishu')
            options.onPairingRequest?.(request);
          if (request.status === 'pending')
            setImmediate(() => {
              if (wiring.closed || signal.aborted || lease.controller.signal.aborted) return;
              void sendPairingNotice(
                request,
                `pending:${event.messageId}`,
                event.reply,
                signal,
                event.conversation.kind,
              ).catch(() => options.warn?.('pairing-notification-state-unconfirmed'));
            });
        } catch (error) {
          if (
            !(error instanceof MessagingError) ||
            !['pairing-rate-limited', 'pairing-capacity'].includes(error.code)
          )
            throw error;
          options.warn?.(
            JSON.stringify({
              event: 'bot-pairing',
              phase: 'request-refused',
              initiator: 'sender-intake',
              reason: error.code,
            }),
          );
        }
        return true;
      }
      return false;
    }
    if (!explicit) return false;
    if (
      event.conversation.kind !== 'dm' ||
      event.text.trim() !== '/pair' ||
      event.attachments?.length
    )
      return true;
    let text: string;
    try {
      const request = options.pairing.request(row.id, event);
      text =
        request.status === 'approved'
          ? 'This account is already paired with this Bot. / 此账号已与当前 Bot 配对。'
          : request.status === 'expired'
            ? 'This pairing request expired. Send a new /pair message to request review. / 配对申请已过期，请重新发送 /pair 申请审核。'
            : `Pairing request ${request.reference} is waiting for Web administrator review. It expires in 10 minutes and grants no permission until approved. / 配对申请 ${request.reference} 等待 Web 管理员审核，10 分钟后过期；审核前没有管理权限。`;
    } catch (error) {
      if (
        !(error instanceof MessagingError) ||
        !['pairing-rate-limited', 'pairing-capacity'].includes(error.code)
      )
        throw error;
      return true;
    }
    setImmediate(() => {
      if (
        wiring.closed ||
        signal.aborted ||
        lease.controller.signal.aborted ||
        controls.get(row.id) !== lease
      )
        return;
      void bounded(
        provider.reply!({
          accountRef: event.botId,
          fingerprint: event.fingerprint,
          route: event.reply,
          text,
          signal: AbortSignal.any([signal, lease.controller.signal]),
          beforeSend: () => {
            try {
              const current = database.read((db) => assertMessagingIdentity(db, row.id));
              return (
                current.fingerprint === event.fingerprint &&
                current.accountRef === event.botId &&
                options.isBotActive(current.botSlug)
              );
            } catch {
              return false;
            }
          },
        }),
      ).catch(() =>
        options.warn?.(
          JSON.stringify({
            event: 'bot-pairing',
            phase: 'reply-unconfirmed',
            initiator: 'control-intake',
          }),
        ),
      );
    });
    return true;
  };

  const methods: Pick<
    InboundMessaging,
    | 'pairingRouteAvailable'
    | 'notifyPairing'
    | 'pairingRecovery'
    | 'pairingReception'
    | 'reconcileBinding'
  > = {
    pairingRouteAvailable(request) {
      try {
        const binding = database.read((db) => assertMessagingIdentity(db, request.bindingId));
        if (
          wiring.closed ||
          !controls.has(binding.id) ||
          controls.get(binding.id)!.controller.signal.aborted ||
          !options.isBotActive(request.botSlug) ||
          options.bindingAvailable?.(binding.id) === false
        )
          return false;
        return database.read((db) => {
          const conversation = {
            kind: request.conversationKind ?? 'dm',
            id: request.conversationId,
          };
          if (readBlock(db, request.botSlug, binding.fingerprint, conversation)) return false;
          const entries = conversationEntries(db, binding.id, conversation);
          return entries.length
            ? entries.some(
                (value) =>
                  !value.revokedAt &&
                  !value.suspendedReason &&
                  targetAvailable(value) &&
                  value.channelBridge?.enabled !== false &&
                  (!value.bridgeRoutes || value.bridgeRoutes.some((route) => route.enabled)),
              )
            : binding.newConversations === 'auto' &&
                admissionBound(db, binding.id, new Date()) === undefined;
        });
      } catch {
        return false;
      }
    },
    async notifyPairing(request) {
      if (request.purpose === 'conversation' && request.status === 'approved' && request.reply)
        await sendPairingNotice(request, `approved:${request.revision}`, request.reply);
    },
    pairingRecovery(id) {
      return controlRetries.state(id);
    },
    pairingReception(bindingId) {
      const identity = database.read((db) => readMessagingIdentity(db, bindingId));
      if (!identity.enabled || identity.revokedAt || !options.isBotActive(identity.botSlug))
        return 'off';
      const lease = controls.get(bindingId);
      if (!lease || lease.controller.signal.aborted) return 'unavailable';
      return lease.dispose ? 'receiving' : 'connecting';
    },
    async reconcileBinding(bindingId) {
      stopControl(bindingId);
      await startControl(bindingId);
      const rows = database.read((db) =>
        db.prepare('SELECT body FROM messaging_grants WHERE binding_id = ?').all(bindingId),
      ) as { body: string }[];
      const values = rows.map((r) => JSON.parse(r.body) as MessagingGrant);
      for (const value of values) stop(value.id);
      await Promise.all(values.filter((v) => !v.revokedAt).map((value) => start(value)));
    },
  };

  return { controls, stopControl, startControl, controlIntake, methods };
}
