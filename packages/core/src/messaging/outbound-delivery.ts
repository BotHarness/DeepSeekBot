import { effectiveDmControls } from './dm-controls.js';
import type { MessagingIdentity } from './identity.js';
import { initializeGroupReceptionPolicy } from './group-policy.js';
import { admissionBound, readBlock, removeHeld } from './conversations.js';
import { attachmentIdentity, type ChannelAttachmentRef } from '../attachments/ref.js';
import type { AttachmentStore } from '../attachments/store.js';
import { createHash, randomUUID } from 'node:crypto';
import type { InboundMessaging, ExternalSource } from './inbound.js';
import type { DatabaseSync } from 'node:sqlite';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import {
  MessagingError,
  MessagingProviderError,
  type MessagingAccount,
  type MessagingReachablePage,
  type MessagingTarget,
  type MessagingReceipt,
  type MessagingReplyRoute,
} from './provider.js';
import type { StoredIntent } from './outbound-outbox-store.js';
import type {
  ProviderRegistration,
  MessagingGrant,
  OutboundMessaging,
  AccountReader,
  OutboxState,
  OutboxIntent,
} from './outbound-types.js';
import type { StatementSync } from 'node:sqlite';
import type { OutboundMessagingOptions } from './outbound.js';

async function replyFileBytes(
  store: AttachmentStore,
  file: ChannelAttachmentRef,
  signal: AbortSignal,
) {
  try {
    const downloaded = await store.download(attachmentIdentity(file), file.name, signal);
    if (downloaded.ref.size < 1 || downloaded.ref.size > store.maxBytes) {
      await downloaded.body.cancel();
      throw new MessagingProviderError('invalid-file', 'not-started');
    }
    const reader = downloaded.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        signal.throwIfAborted();
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > store.maxBytes) throw new MessagingProviderError('invalid-file', 'not-started');
        chunks.push(next.value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    if (size !== downloaded.ref.size)
      throw new MessagingProviderError('file-changed', 'not-started');
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { name: downloaded.ref.name, bytes, mediaType: downloaded.ref.mime };
  } catch (error) {
    if (error instanceof MessagingProviderError) throw error;
    throw new MessagingProviderError('file-unavailable', 'not-started');
  }
}

export function createOutboundDelivery(context: {
  active: (slug: string) => void;
  postRequest: (
    botSlug: string,
    bindingId: string,
    conversationId: string,
    requestId: string,
    text: string,
  ) => StoredIntent | undefined;
  enabledBinding: (id: string, revision?: number) => MessagingIdentity;
  provider: (id: string) => ProviderRegistration;
  bounded: <T>(work: Promise<T>) => Promise<T>;
  database: OperationalDatabaseModulePort;
  service: OutboundMessaging;
  transaction: <T>(command: (db: DatabaseSync) => T, topics?: string[]) => T;
  current: (id: string, token: object) => void;
  now: () => string;
  inbound: InboundMessaging;
  grant: (slug: string, id: string) => MessagingGrant;
  savedDmGrant: (value: MessagingGrant) => Promise<string | undefined>;
  forwardingFences: Map<string, () => void>;
  readIntent: (id: string) => StoredIntent;
  sourceForReply: (botSlug: string, sourceEventId: string, value: MessagingGrant) => ExternalSource;
  check: (
    value: MessagingGrant,
    readAccount?: AccountReader,
  ) => Promise<
    ProviderRegistration & {
      inspected: { account: MessagingAccount; target: MessagingTarget };
      identityRevision: number;
    }
  >;
  qualifyReply: (
    botSlug: string,
    sourceEventId: string,
    value: MessagingGrant,
    entry: ProviderRegistration & {
      inspected: { account: MessagingAccount; target: MessagingTarget };
      identityRevision: number;
    },
    signal: AbortSignal,
  ) => Promise<MessagingReplyRoute>;
  options: OutboundMessagingOptions;
  assertConversationAllowed: (
    value: MessagingGrant,
    scope: MessagingTarget['receiveScope'],
  ) => void;
  forwardingSources: Map<string, string>;
  mirrorChoice: (
    value: MessagingGrant,
    conversationId: string | undefined,
  ) => { epoch: string; bindingId: string; conversationId: string } | undefined;
  privateNotices: Map<string, import('../credentials/im-origin.js').PrivateReplyAuthority>;
  privateReplies: Map<string, Set<import('../credentials/im-origin.js').PrivateReplyAuthority>>;
  privateReplyKey: (botSlug: string, sourceEventId: string) => string;
  checkPostLimit: (db: DatabaseSync, bindingId: string, reserved?: boolean) => void;
  inFlight: Map<
    string,
    { providerId: string; token: object; controller: AbortController; fileGrantId?: string }
  >;
  binding: (id: string) => MessagingIdentity;
  settle: (
    id: string,
    state: OutboxState,
    reason?: string,
    receipt?: MessagingReceipt,
  ) => OutboxIntent;
  prepareOutboxIntentInsert: (db: DatabaseSync) => StatementSync;
  prepareOutboxStateUpdate: (db: DatabaseSync) => StatementSync;
}): Pick<OutboundMessaging, 'postConversation' | 'postRequest' | 'post' | 'send'> {
  const {
    active,
    postRequest,
    enabledBinding,
    provider,
    bounded,
    database,
    transaction,
    current,
    now,
    inbound,
    grant,
    savedDmGrant,
    forwardingFences,
    readIntent,
    sourceForReply,
    check,
    qualifyReply,
    options,
    assertConversationAllowed,
    forwardingSources,
    mirrorChoice,
    privateNotices,
    privateReplies,
    privateReplyKey,
    checkPostLimit,
    inFlight,
    binding,
    settle,
    prepareOutboxIntentInsert,
    prepareOutboxStateUpdate,
  } = context;

  return {
    async postConversation(botSlug, bindingId, conversationId, requestId, text) {
      active(botSlug);
      const prior = postRequest(botSlug, bindingId, conversationId, requestId, text);
      if (prior) return prior;
      const identity = enabledBinding(bindingId);
      if (identity.botSlug !== botSlug) throw new MessagingError('identity-unavailable');
      const entry = provider(identity.providerId);
      if (!entry.provider.reachable || !entry.provider.postConversation)
        throw new MessagingError('capability-unavailable');
      const targets = await bounded(entry.provider.targets(identity.accountRef));
      const matching = targets.filter(
        (target) => target.receiveScope?.conversationId === conversationId,
      );
      const findExisting = (db: DatabaseSync) => {
        const rows = db
          .prepare('SELECT body FROM messaging_grants WHERE binding_id = ? AND revoked_at IS NULL')
          .all(bindingId) as { body: string }[];
        return rows
          .map((row) =>
            database.read((db) => effectiveDmControls(db, JSON.parse(row.body) as MessagingGrant)),
          )
          .find(
            (value) =>
              (value.receiveScope?.kind === 'group' &&
                value.receiveScope.conversationId === conversationId) ||
              (value.origin !== 'implicit' &&
                matching.some(
                  (target) =>
                    target.ref === value.targetRef && target.digest === value.targetDigest,
                )),
          );
      };
      const existing = database.read(findExisting);
      if (existing) return context.service.post(botSlug, existing.id, requestId, text);
      let found: MessagingReachablePage['conversations'][number] | undefined;
      let cursor: string | undefined;
      const seen = new Set<string>();
      do {
        const page = await context.service.reachable(botSlug, bindingId, cursor);
        found = page.conversations.find((value) => value.id === conversationId);
        if (found || !page.hasMore) break;
        if (!page.cursor || seen.has(page.cursor) || seen.size >= 20)
          throw new MessagingError('provider-unavailable');
        cursor = page.cursor;
        seen.add(cursor);
      } while (!found);
      if (!found) throw new MessagingError('send-permission-denied');
      const conversation = { kind: 'group' as const, id: conversationId };
      const created = transaction(
        (db) => {
          active(botSlug);
          current(identity.providerId, entry.token);
          enabledBinding(bindingId, identity.revision);
          if (readBlock(db, botSlug, identity.fingerprint, conversation))
            throw new MessagingError('grant-revoked');
          const repeated = findExisting(db);
          if (repeated) return repeated.id;
          if (admissionBound(db, bindingId, new Date(now())) === 'active-limit')
            throw new MessagingError('conversation-limit');
          const at = now();
          const value: MessagingGrant = {
            id: randomUUID(),
            bindingId,
            botSlug,
            providerId: identity.providerId,
            platform: identity.platform,
            accountRef: identity.accountRef,
            accountName: identity.name,
            fingerprint: identity.fingerprint,
            targetRef: '',
            targetDigest: '',
            targetName: found!.name,
            revision: 1,
            createdAt: at,
            receiveAfter: at,
            receiveScope: { kind: 'group', conversationId },
            origin: 'implicit',
          };
          db.prepare(
            'INSERT INTO messaging_grants (id, binding_id, bot_slug, revision, created_at, body) VALUES (?, ?, ?, ?, ?, ?)',
          ).run(value.id, bindingId, botSlug, 1, at, JSON.stringify(value));
          initializeGroupReceptionPolicy(db, value.id);
          removeHeld(db, bindingId, conversation);
          return value.id;
        },
        ['grants'],
      );
      inbound.startEntry(created);
      return context.service.post(botSlug, created, requestId, text);
    },
    postRequest(botSlug, bindingId, conversationId, requestId, text) {
      active(botSlug);
      return postRequest(botSlug, bindingId, conversationId, requestId, text);
    },
    async post(botSlug, grantId, requestId, text) {
      const value = grant(botSlug, grantId);
      if (value.origin === 'implicit' && value.receiveScope?.kind === 'dm') {
        const saved = await savedDmGrant(value);
        if (saved === undefined) throw new MessagingError('capability-unavailable');
        return context.service.post(botSlug, saved, requestId, text);
      }
      if (
        value.origin === 'implicit'
          ? provider(value.providerId).provider.postConversation === undefined
          : provider(value.providerId).provider.post === undefined &&
            provider(value.providerId).provider.postConversation === undefined
      )
        throw new MessagingError('capability-unavailable');
      return context.service.send(botSlug, grantId, requestId, text, undefined, undefined, true);
    },
    async send(botSlug, grantId, requestId, text, sourceEventId, file, report = false) {
      const forwardingFence = forwardingFences.get(requestId);
      forwardingFence?.();
      active(botSlug);
      if (
        (report && (sourceEventId !== undefined || file !== undefined)) ||
        (file !== undefined && sourceEventId === undefined) ||
        !/^[A-Za-z0-9_-]{8,128}$/.test(requestId) ||
        !text.trim() ||
        text.length > 4000
      )
        throw new MessagingError('invalid-input');
      const payloadHash = createHash('sha256')
        .update(
          file === undefined
            ? sourceEventId === undefined
              ? report
                ? JSON.stringify(['report', text])
                : text
              : JSON.stringify([text, sourceEventId])
            : JSON.stringify([text, sourceEventId, file]),
        )
        .digest('hex');
      const duplicate = database.read((db) =>
        db.prepare('SELECT id FROM messaging_outbox WHERE request_id = ?').get(requestId),
      ) as { id: string } | undefined;
      if (duplicate) {
        const value = readIntent(duplicate.id);
        if (
          value.botSlug !== botSlug ||
          value.grantId !== grantId ||
          value.payloadHash !== payloadHash
        )
          throw new MessagingError('request-conflict');
        return value;
      }
      const acceptedGrant = grant(botSlug, grantId);
      const source =
        sourceEventId === undefined
          ? undefined
          : sourceForReply(botSlug, sourceEventId, acceptedGrant);
      if (file && source?.grantId !== grantId) throw new MessagingError('capability-unavailable');
      if (acceptedGrant.origin === 'implicit' && source === undefined && !report)
        throw new MessagingError('capability-unavailable');
      const acceptedEntry = await check(acceptedGrant);
      const acceptedIdentity = acceptedEntry.identityRevision;
      const replyRoute =
        sourceEventId !== undefined && file === undefined
          ? await qualifyReply(
              botSlug,
              sourceEventId,
              acceptedGrant,
              acceptedEntry,
              AbortSignal.timeout(options.timeoutMs ?? 15000),
            )
          : undefined;
      const postScope = acceptedEntry.inspected.target.receiveScope;
      const conversationId = postScope?.conversationId;
      if (report && !conversationId) throw new MessagingError('capability-unavailable');
      const id = transaction(
        (db) => {
          active(botSlug);
          enabledBinding(acceptedGrant.bindingId, acceptedIdentity);
          const currentGrant = grant(botSlug, grantId);
          if (
            currentGrant.revokedAt !== undefined ||
            currentGrant.revision !== acceptedGrant.revision
          )
            throw new MessagingError('grant-revoked');
          if (report) assertConversationAllowed(currentGrant, postScope);
          if (sourceEventId !== undefined) sourceForReply(botSlug, sourceEventId, currentGrant);
          const existing = db
            .prepare('SELECT id FROM messaging_outbox WHERE request_id = ?')
            .get(requestId) as { id: string } | undefined;
          if (existing) return { id: existing.id, created: false };
          const value: StoredIntent = {
            id: randomUUID(),
            botSlug,
            grantId,
            grantRevision: currentGrant.revision,
            requestId,
            payloadHash,
            ...(forwardingSources.has(requestId)
              ? { forwardSourceEventId: forwardingSources.get(requestId)! }
              : {}),
            ...(sourceEventId === undefined ? {} : { sourceEventId }),
            ...(report
              ? {
                  report: {
                    providerId: currentGrant.providerId,
                    accountRef: currentGrant.accountRef,
                    fingerprint: currentGrant.fingerprint,
                    platform: currentGrant.platform,
                    accountName: currentGrant.accountName,
                    targetName: currentGrant.targetName,
                    conversationId: conversationId!,
                  },
                }
              : {}),
            ...(replyRoute
              ? {
                  reply: {
                    providerId: currentGrant.providerId,
                    accountRef: currentGrant.accountRef,
                    fingerprint: currentGrant.fingerprint,
                    platform: currentGrant.platform,
                    accountName: currentGrant.accountName,
                    targetName: currentGrant.targetName,
                    conversationId: replyRoute.conversationId,
                    route: replyRoute,
                  },
                }
              : {}),
            ...(file === undefined ? {} : { file }),
            text,
            ...(!requestId.startsWith('web-mirror-')
              ? {
                  dmMirror: mirrorChoice(
                    currentGrant,
                    replyRoute?.conversationId ?? conversationId,
                  ),
                }
              : {}),
            state: 'pending',
            createdAt: now(),
          };
          prepareOutboxIntentInsert(db).run(
            value.id,
            botSlug,
            grantId,
            requestId,
            value.state,
            value.createdAt,
            JSON.stringify(value),
          );
          return { id: value.id, created: true };
        },
        ['outbox'],
      );
      if (!id.created) {
        const value = readIntent(id.id);
        if (
          value.botSlug !== botSlug ||
          value.grantId !== grantId ||
          value.payloadHash !== payloadHash
        )
          throw new MessagingError('request-conflict');
        return value;
      }
      const beganAt = Date.now();
      let started = false;
      let postFenceReason: string | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const controller = new AbortController();
      const noticeAuthority = privateNotices.get(requestId);
      const privateAuthorities =
        noticeAuthority !== undefined
          ? [noticeAuthority]
          : sourceEventId === undefined
            ? []
            : [...(privateReplies.get(privateReplyKey(botSlug, sourceEventId)) ?? [])];
      const privateReplyCurrent = () =>
        privateAuthorities.every((authority) => !authority.signal.aborted && authority.current());
      const abortPrivateReply = () => controller.abort();
      for (const authority of privateAuthorities)
        authority.signal.addEventListener('abort', abortPrivateReply, { once: true });
      try {
        if (!privateReplyCurrent()) throw new MessagingError('source-unavailable');
        const entry = await check(grant(botSlug, grantId));
        transaction(
          (db) => {
            active(botSlug);
            current(acceptedGrant.providerId, entry.token);
            enabledBinding(acceptedGrant.bindingId, acceptedIdentity);
            const value = grant(botSlug, grantId);
            if (value.revokedAt !== undefined || value.revision !== acceptedGrant.revision)
              throw new MessagingError('grant-revoked');
            const intent = readIntent(id.id);
            if (intent.state !== 'pending') throw new MessagingError('grant-revoked');
            const at = now();
            if (sourceEventId === undefined) checkPostLimit(db, acceptedGrant.bindingId);
            prepareOutboxStateUpdate(db).run(
              'in-flight',
              JSON.stringify({ ...intent, state: 'in-flight' }),
              id.id,
            );
            db.prepare(
              'INSERT INTO messaging_outbox_attempts (intent_id, started_at, state) VALUES (?, ?, ?)',
            ).run(id.id, at, 'in-flight');
          },
          ['outbox'],
        );
        if (sourceEventId !== undefined) sourceForReply(botSlug, sourceEventId, acceptedGrant);
        started = true;
        options.warn?.(
          JSON.stringify({
            event: 'messaging-outbox',
            phase: 'starting',
            initiator: report
              ? 'bot-external-post'
              : sourceEventId === undefined
                ? 'human-profile'
                : 'bot-source-reply',
            intentId: id.id,
          }),
        );
        inFlight.set(id.id, {
          providerId: acceptedGrant.providerId,
          token: entry.token,
          controller,
          ...(file === undefined ? {} : { fileGrantId: acceptedGrant.id }),
        });
        const interrupted = new Promise<never>((_, reject) => {
          controller.signal.addEventListener(
            'abort',
            () => reject(new MessagingProviderError('provider-interrupted', 'unknown')),
            { once: true },
          );
          timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);
        });
        const beforePost = () => {
          try {
            forwardingFence?.();
            active(botSlug);
            current(acceptedGrant.providerId, entry.token);
            const latest = grant(botSlug, grantId);
            const currentIdentity = binding(acceptedGrant.bindingId);
            if (
              latest.revokedAt ||
              latest.revision !== acceptedGrant.revision ||
              currentIdentity.revokedAt
            )
              throw new MessagingError('grant-revoked');
            enabledBinding(acceptedGrant.bindingId, acceptedIdentity);
            assertConversationAllowed(latest, postScope);
            if (report) database.read((db) => checkPostLimit(db, acceptedGrant.bindingId, true));
            return !controller.signal.aborted;
          } catch (error) {
            postFenceReason =
              error instanceof MessagingError
                ? error.code === 'conversation-blocked'
                  ? 'grant-revoked'
                  : error.code
                : 'provider-unavailable';
            return false;
          }
        };
        const result = await Promise.race([
          file !== undefined && sourceEventId !== undefined
            ? (async () => {
                if (entry.provider.replyFile === undefined || options.attachments === undefined)
                  throw new MessagingProviderError('capability-unavailable', 'not-started');
                const result = await replyFileBytes(options.attachments, file, controller.signal);
                try {
                  await check(grant(botSlug, grantId));
                } catch (error) {
                  throw new MessagingProviderError(
                    error instanceof MessagingError ? error.code : 'grant-unavailable',
                    'not-started',
                  );
                }
                if (!inbound.available(botSlug, sourceEventId))
                  throw new MessagingProviderError('source-unavailable', 'not-started');
                return entry.provider.replyFile({
                  accountRef: acceptedGrant.accountRef,
                  fingerprint: acceptedGrant.fingerprint,
                  route: inbound.read(botSlug, sourceEventId).event.reply,
                  file: { id: id.id, ...result },
                  signal: controller.signal,
                  beforeSend: () => {
                    try {
                      active(botSlug);
                      current(acceptedGrant.providerId, entry.token);
                      enabledBinding(acceptedGrant.bindingId, acceptedIdentity);
                      const latest = grant(botSlug, grantId);
                      if (latest.revokedAt || latest.revision !== acceptedGrant.revision)
                        return false;
                      sourceForReply(botSlug, sourceEventId, latest);
                      return !controller.signal.aborted;
                    } catch {
                      return false;
                    }
                  },
                });
              })()
            : sourceEventId !== undefined
              ? entry.provider.reply === undefined
                ? Promise.reject(
                    new MessagingProviderError('capability-unavailable', 'not-started'),
                  )
                : (async () => {
                    let route: MessagingReplyRoute;
                    try {
                      route = await qualifyReply(
                        botSlug,
                        sourceEventId,
                        acceptedGrant,
                        entry,
                        controller.signal,
                      );
                      await check(grant(botSlug, grantId));
                      enabledBinding(acceptedGrant.bindingId, acceptedIdentity);
                      const latest = grant(botSlug, grantId);
                      if (latest.revokedAt || latest.revision !== acceptedGrant.revision)
                        throw new MessagingError('grant-revoked');
                      sourceForReply(botSlug, sourceEventId, latest);
                      if (
                        [
                          'messageId',
                          'conversationId',
                          'actorId',
                          'threadId',
                          'rootId',
                          'parentId',
                        ].some((key) => Reflect.get(route, key) !== Reflect.get(replyRoute!, key))
                      )
                        throw new MessagingError('stale-route');
                    } catch (error) {
                      throw new MessagingProviderError(
                        error instanceof MessagingError ? error.code : 'source-unavailable',
                        'not-started',
                      );
                    }
                    return entry.provider.reply!({
                      operationId: id.id,
                      accountRef: acceptedGrant.accountRef,
                      fingerprint: acceptedGrant.fingerprint,
                      route,
                      text,
                      signal: controller.signal,
                      beforeSend: () => {
                        try {
                          if (!privateReplyCurrent()) return false;
                          active(botSlug);
                          current(acceptedGrant.providerId, entry.token);
                          enabledBinding(acceptedGrant.bindingId, acceptedIdentity);
                          const latest = grant(botSlug, grantId);
                          if (latest.revokedAt || latest.revision !== acceptedGrant.revision)
                            return false;
                          sourceForReply(botSlug, sourceEventId, latest);
                          return !controller.signal.aborted;
                        } catch {
                          return false;
                        }
                      },
                    });
                  })()
              : report
                ? entry.provider.postConversation !== undefined &&
                  (acceptedGrant.origin === 'implicit' || entry.provider.post === undefined)
                  ? entry.provider.postConversation({
                      operationId: id.id,
                      accountRef: acceptedGrant.accountRef,
                      fingerprint: acceptedGrant.fingerprint,
                      conversationId: conversationId!,
                      text,
                      signal: controller.signal,
                      beforeSend: beforePost,
                    })
                  : entry.provider.post === undefined
                    ? Promise.reject(
                        new MessagingProviderError('capability-unavailable', 'not-started'),
                      )
                    : entry.provider.post({
                        operationId: id.id,
                        accountRef: acceptedGrant.accountRef,
                        targetRef: acceptedGrant.targetRef,
                        fingerprint: acceptedGrant.fingerprint,
                        targetDigest: acceptedGrant.targetDigest,
                        conversationId: conversationId!,
                        text,
                        signal: controller.signal,
                        beforeSend: beforePost,
                      })
                : entry.provider.send({
                    operationId: id.id,
                    beforeSend: beforePost,
                    accountRef: acceptedGrant.accountRef,
                    targetRef: acceptedGrant.targetRef,
                    fingerprint: acceptedGrant.fingerprint,
                    targetDigest: acceptedGrant.targetDigest,
                    text,
                    signal: controller.signal,
                  }),
          interrupted,
        ]);
        if (result.accepted !== true)
          throw new MessagingProviderError('provider-result-unknown', 'unknown');
        const receipt = 'receipt' in result ? (result.receipt as MessagingReceipt) : undefined;
        if (
          (report || (source !== undefined && source.grantId !== grantId)) &&
          (receipt?.version !== 1 ||
            typeof receipt.messageId !== 'string' ||
            !receipt.messageId ||
            receipt.messageId.length > 512 ||
            receipt.conversationId !== (replyRoute?.conversationId ?? conversationId!))
        )
          throw new MessagingProviderError('provider-result-unknown', 'unknown');
        return settle(id.id, 'provider-accepted', undefined, receipt);
      } catch (error) {
        const definite =
          !started ||
          (error instanceof MessagingProviderError && error.disposition === 'not-started');
        const reason =
          definite && postFenceReason !== undefined
            ? postFenceReason
            : error instanceof MessagingError || error instanceof MessagingProviderError
              ? error.code
              : 'provider-result-unknown';
        const state =
          reason === 'grant-revoked' && (!started || (report && definite))
            ? 'grant-revoked'
            : definite
              ? 'failed'
              : 'unknown-outcome';
        return settle(id.id, state, reason);
      } finally {
        for (const authority of privateAuthorities)
          authority.signal.removeEventListener('abort', abortPrivateReply);
        if (timer !== undefined) clearTimeout(timer);
        inFlight.delete(id.id);
        const value = readIntent(id.id);
        options.warn?.(
          JSON.stringify({
            event: 'messaging-outbox',
            intentId: id.id,
            phase: 'settled',
            durationMs: Date.now() - beganAt,
            state: value.state,
            reason: value.reason,
          }),
        );
      }
    },
  };
}
