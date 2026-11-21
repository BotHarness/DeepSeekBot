import { createHash } from 'node:crypto';
import { addAbortListener } from 'node:events';
import type { InboundMessaging, ExternalSource } from './inbound.js';
import { createMessagingFeedback } from './feedback.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { MessagingError, type MessagingAccount, type MessagingTarget } from './provider.js';
import { PRIVATE_REFERENCE_IN_TEXT } from '../credentials/references.js';
import { sourceReplyCapability, type SourceReplyCapability } from './source-reply-capability.js';
import type {
  MessagingGrant,
  AccountReader,
  ProviderRegistration,
  OutboxIntent,
  OutboundMessaging,
} from './outbound-types.js';

export function createOutboundReplies(context: {
  inbound: InboundMessaging;
  database: OperationalDatabaseModulePort;
  grant: (botSlug: string, id: string) => MessagingGrant;
  check: (
    value: MessagingGrant,
    readAccount?: AccountReader,
    recordChanges?: boolean,
  ) => Promise<
    ProviderRegistration & {
      inspected: { account: MessagingAccount; target: MessagingTarget };
      identityRevision: number;
    }
  >;
  current: (id: string, token: object) => void;
  service: OutboundMessaging;
  feedback: ReturnType<typeof createMessagingFeedback>;
  provider: (id: string) => ProviderRegistration;
  bounded: <T>(work: Promise<T>) => Promise<T>;
  privateNotices: Map<string, import('../credentials/im-origin.js').PrivateReplyAuthority>;
}) {
  const { inbound, database, check, current, provider, bounded, privateNotices } = context;

  const sourceForReply = (botSlug: string, sourceEventId: string, value: MessagingGrant) => {
    const source = inbound.readShared(botSlug, sourceEventId);
    if (source.grantId === value.id) {
      if (!inbound.available(botSlug, sourceEventId))
        throw new MessagingError('source-unavailable');
    } else {
      const ingress = database.read((db) =>
        db.prepare('SELECT body FROM messaging_grants WHERE id = ?').get(source.grantId),
      ) as { body: string } | undefined;
      if (!ingress) throw new MessagingError('source-unavailable');
      const owner = JSON.parse(ingress.body) as MessagingGrant;
      if (
        owner.botSlug === botSlug ||
        owner.providerId !== value.providerId ||
        source.platform !== value.platform ||
        (source.event.conversation.kind !== 'group' &&
          !(source.platform === 'weixin' && source.event.conversation.kind === 'dm')) ||
        !source.localChannelId
      )
        throw new MessagingError('source-unavailable');
    }
    return source;
  };

  const qualifyProviderReply = async (
    botSlug: string,
    source: ExternalSource,
    value: MessagingGrant,
    entry: Awaited<ReturnType<typeof check>>,
    signal: AbortSignal,
    ensureConsumer: boolean,
  ) => {
    if (
      entry.inspected.target.receiveScope?.conversationId !== source.event.conversation.id ||
      !entry.provider.qualifyReply ||
      !entry.provider.reply
    )
      throw new MessagingError('capability-unavailable');
    if (ensureConsumer) await inbound.ensureReplyConsumer(botSlug, value.id, signal);
    const qualification = entry.provider.qualifyReply({
      accountRef: value.accountRef,
      fingerprint: value.fingerprint,
      route: source.event.reply,
      signal,
    });
    const route = await (ensureConsumer ? qualification : bounded(qualification));
    signal.throwIfAborted();
    current(value.providerId, entry.token);
    sourceForReply(botSlug, source.id, value);
    if (
      !route.actorId ||
      route.actorId.length > 512 ||
      route.messageId !== source.event.reply.messageId ||
      route.conversationId !== source.event.reply.conversationId ||
      route.threadId !== source.event.reply.threadId ||
      route.rootId !== source.event.reply.rootId ||
      route.parentId !== source.event.reply.parentId
    )
      throw new MessagingError('stale-route');
    return route;
  };

  const qualifyReply = async (
    botSlug: string,
    sourceEventId: string,
    value: MessagingGrant,
    entry: Awaited<ReturnType<typeof check>>,
    signal: AbortSignal,
  ) => {
    const source = sourceForReply(botSlug, sourceEventId, value);
    if (source.grantId === value.id) return source.event.reply;
    return qualifyProviderReply(botSlug, source, value, entry, signal, true);
  };

  async function replyGrantId(
    botSlug: string,
    source: ExternalSource,
    recordChanges: boolean,
    signal?: AbortSignal,
  ) {
    const ingress = database.read((db) =>
      db.prepare('SELECT bot_slug FROM messaging_grants WHERE id = ?').get(source.grantId),
    ) as { bot_slug: string } | undefined;
    if (ingress?.bot_slug === botSlug) return source.grantId;
    const rows = database.read((db) =>
      db.prepare('SELECT body FROM messaging_grants WHERE bot_slug = ?').all(botSlug),
    ) as { body: string }[];
    const matches: MessagingGrant[] = [];
    for (const row of rows) {
      signal?.throwIfAborted();
      const value = JSON.parse(row.body) as MessagingGrant;
      if (
        value.platform !== source.platform ||
        value.revokedAt ||
        value.suspendedReason ||
        (value.receiveScope !== undefined &&
          value.receiveScope.conversationId !== source.event.conversation.id)
      )
        continue;
      sourceForReply(botSlug, source.id, value);
      if (value.origin !== 'implicit') {
        const registered = provider(value.providerId);
        const targets = await bounded(registered.provider.targets(value.accountRef));
        signal?.throwIfAborted();
        current(value.providerId, registered.token);
        if (
          !targets.some(
            (target) =>
              target.ref === value.targetRef &&
              target.receiveScope?.conversationId === source.event.conversation.id,
          )
        )
          continue;
      }
      const entry = await check(value, undefined, recordChanges);
      signal?.throwIfAborted();
      if (entry.inspected.target.receiveScope?.conversationId === source.event.conversation.id)
        matches.push(value);
    }
    if (matches.length !== 1)
      throw new MessagingError(
        matches.length ? 'reply-target-ambiguous' : 'own-reply-grant-unavailable',
      );
    return matches[0]!.id;
  }

  async function routedReply(
    botSlug: string,
    sourceEventId: string,
    text: string,
    noticeId?: string,
    messageKey?: string,
  ): Promise<OutboxIntent> {
    if (noticeId === undefined && PRIVATE_REFERENCE_IN_TEXT.test(text))
      throw new MessagingError('private-reference-not-deliverable');
    let source: ExternalSource;
    try {
      source = inbound.readShared(botSlug, sourceEventId);
    } catch (error) {
      if (error instanceof MessagingError && error.code === 'channel-unavailable')
        throw new MessagingError('source-unavailable');
      throw error;
    }
    const grantId = await replyGrantId(botSlug, source, true);
    if (grantId === source.grantId) {
      const result = await context.service.send(
        botSlug,
        source.grantId,
        noticeId ?? (messageKey === undefined ? 'reply-' + sourceEventId : 'message-' + messageKey),
        text,
        sourceEventId,
      );
      if (noticeId === undefined && result.state === 'provider-accepted')
        context.feedback.notify(botSlug, sourceEventId, 'answered', result.id);
      return result;
    }
    const requestId =
      noticeId ??
      (messageKey === undefined ? undefined : 'message-' + messageKey) ??
      'reply-' +
        createHash('sha256')
          .update(JSON.stringify([botSlug, sourceEventId]))
          .digest('hex');
    return context.service.send(botSlug, grantId, requestId, text, sourceEventId);
  }

  const methods: Pick<
    OutboundMessaging,
    'replyFile' | 'reply' | 'replyCapability' | 'privateInputNotice'
  > = {
    async replyCapability(botSlug, source, signal) {
      const capability = sourceReplyCapability(source);
      if (capability?.state !== 'requires-provider-check') return capability;
      const timeout = AbortSignal.timeout(10000);
      const probe = signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
      const inspect = async (): Promise<SourceReplyCapability> => {
        probe.throwIfAborted();
        const grantId = await replyGrantId(botSlug, source, false, probe);
        probe.throwIfAborted();
        const value = context.grant(botSlug, grantId);
        const entry = await check(value, undefined, false);
        probe.throwIfAborted();
        const admitted = sourceForReply(botSlug, source.id, value);
        if (!entry.provider.reply)
          return { state: 'unavailable', reason: 'capability-unavailable' };
        if (!entry.provider.qualifyReply) return capability;
        await qualifyProviderReply(botSlug, admitted, value, entry, probe, false);
        const latest = context.grant(botSlug, value.id);
        if (latest.revokedAt || latest.revision !== value.revision)
          return { state: 'unavailable', reason: 'grant-revoked' };
        return { state: 'provider-checked' };
      };
      try {
        return await new Promise<SourceReplyCapability>((resolve, reject) => {
          const listener = addAbortListener(probe, () => reject(new MessagingError('cancelled')));
          void inspect()
            .then(resolve, reject)
            .finally(() => listener[Symbol.dispose]());
        });
      } catch (error) {
        signal?.throwIfAborted();
        if (timeout.aborted) return { state: 'unavailable', reason: 'provider-timeout' };
        if (error instanceof MessagingError) return { state: 'unavailable', reason: error.code };
        throw error;
      }
    },
    async replyFile(botSlug, sourceEventId, file, messageKey) {
      if (!inbound.available(botSlug, sourceEventId))
        throw new MessagingError('source-unavailable');
      const source = inbound.read(botSlug, sourceEventId);
      const result = await context.service.send(
        botSlug,
        source.grantId,
        messageKey === undefined ? 'reply-' + sourceEventId : 'message-' + messageKey,
        'File reply: ' + file.name,
        sourceEventId,
        file,
      );
      if (result.state === 'provider-accepted')
        context.feedback.notify(botSlug, sourceEventId, 'answered', result.id);
      return result;
    },
    reply: (botSlug, sourceEventId, text, messageKey) =>
      routedReply(botSlug, sourceEventId, text, undefined, messageKey),
    async privateInputNotice(botSlug, sourceEventId, requestId, webUrl, authority) {
      if (!/^[0-9a-f-]{36}$/.test(requestId)) throw new MessagingError('source-unavailable');
      if (authority.signal.aborted || !authority.current())
        throw new MessagingError('source-unavailable');
      const url = webUrl === undefined ? undefined : new URL(webUrl);
      if (
        url !== undefined &&
        (!['http:', 'https:'].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.search ||
          !url.hash.startsWith('#botharness-private-input='))
      )
        throw new MessagingError('source-unavailable');
      const noticeId = 'private-input-' + requestId;
      privateNotices.set(noticeId, authority);
      try {
        const result = await routedReply(
          botSlug,
          sourceEventId,
          url === undefined
            ? "Owner action needed. Open this Bot's Chat in Web Chat or the app and fill in the private input card there. Do not send private values here."
            : 'Owner action needed. Open the private input card in Web Chat. Do not send private values here.\n' +
                url.href,
          noticeId,
        );
        if (result.state !== 'provider-accepted') throw new MessagingError('source-unavailable');
        return result;
      } finally {
        if (privateNotices.get(noticeId) === authority) privateNotices.delete(noticeId);
      }
    },
  };

  return { sourceForReply, qualifyReply, routedReply, methods };
}
