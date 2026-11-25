import { OWNER_HUMAN_CONTEXT } from '../humans/context.js';
import { createHash } from 'node:crypto';
import type { AskUserQuestionAnswer } from '@deepseek-ai/dsh-user-questions/types';
import type { ChannelStore } from '../channels/store.js';
import type { ChannelQuestionNotice, ChannelUserQuestions } from '../channels/user-questions.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { ApprovalMessaging, ApprovalRoute } from './approval-messaging.js';
import {
  createInteractionAuthority,
  type InteractionContext,
  type InteractionDestination,
  withoutFailedGroup,
} from './authority.js';
import { isMessagingPlatform, messagingPlatform } from './platforms/index.js';
import {
  explainQuestionReply,
  parseQuestionReply,
  renderQuestionText,
} from './interactions/text-answers.js';
import type { BotPairing } from './pairing.js';
import {
  MessagingError,
  MessagingProviderError,
  type MessagingInboundEvent,
  type MessagingProvider,
  type MessagingQuestionAction,
  type MessagingQuestionCard,
  type MessagingReceipt,
} from './provider.js';

export interface QuestionDelivery {
  id: string;
  botSlug: string;
  channelId: string;
  sessionId: string;
  reference: string;
  questionHash: string;
  route: ApprovalRoute;
  createdAt: string;
  status: 'pending' | 'answered' | 'cancelled' | 'expired';
  delivery: 'pending' | 'sending' | 'sent' | 'failed' | 'unknown-outcome';
  attempts: number;
  receipt?: MessagingReceipt;
  destination?: InteractionDestination;
  submission: 'none' | 'submitting' | 'accepted' | 'refused' | 'unknown-outcome';
  update: 'none' | 'sending' | 'updated' | 'failed' | 'unknown-outcome';
  reason?: string;
}

export interface QuestionMessaging {
  attach(owner: ChannelUserQuestions, channels: ChannelStore): () => void;
  refresh(): void;
  snapshot(botSlug: string): QuestionDelivery[];
  retry(botSlug: string, id: string): Promise<void>;
  action(
    providerId: string,
    event: MessagingQuestionAction,
    signal: AbortSignal,
  ): Promise<{ accepted: true; status: 'queued' | 'refused' }>;
  text(providerId: string, event: MessagingInboundEvent, signal: AbortSignal): Promise<boolean>;
  close(): void;
}

export function createQuestionMessaging(options: {
  database: OperationalDatabaseModulePort;
  pairing: BotPairing;
  approvals: ApprovalMessaging;
  provider(id: string): MessagingProvider;
  isBotActive(slug: string): boolean;
  turnSources?(botSlug: string, sessionId: string): readonly string[] | undefined;
  recover?: boolean;
  warn?(message: string): void;
}): QuestionMessaging {
  const { database } = options;
  const authority = createInteractionAuthority(options);
  let owner: ChannelUserQuestions | undefined;
  let channels: ChannelStore | undefined;
  let detach: (() => void) | undefined;
  let closed = false;
  const controller = new AbortController();
  const busy = new Set<string>();
  const rows = (slug: string): QuestionDelivery[] =>
    database.read((db) =>
      (
        db
          .prepare(
            'SELECT body FROM messaging_question_deliveries WHERE bot_slug = ? ORDER BY rowid DESC LIMIT 50',
          )
          .all(slug) as { body: string }[]
      ).map((row) => JSON.parse(row.body) as QuestionDelivery),
    );
  const read = (id: string): QuestionDelivery | undefined =>
    closed
      ? undefined
      : database.read((db) => {
          const row = db
            .prepare('SELECT body FROM messaging_question_deliveries WHERE id = ?')
            .get(id) as { body: string } | undefined;
          return row ? (JSON.parse(row.body) as QuestionDelivery) : undefined;
        });
  const write = (value: QuestionDelivery) => {
    if (closed) return;
    database.transaction(
      (db) =>
        db
          .prepare(
            'INSERT INTO messaging_question_deliveries(id, bot_slug, body) VALUES(?, ?, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body',
          )
          .run(value.id, value.botSlug, JSON.stringify(value)),
      ['question-messaging'],
    );
  };
  const request = (value: QuestionDelivery) => {
    const question = channels?.message(value.channelId, value.id)?.userQuestionRequest;
    return question?.sessionId === value.sessionId &&
      createHash('sha256').update(JSON.stringify(question.questions)).digest('hex') ===
        value.questionHash
      ? question
      : undefined;
  };
  const resolution = (value: QuestionDelivery) =>
    channels
      ?.readMessages(value.channelId)
      .find((message) => message.userQuestionResolution?.requestMessageId === value.id)
      ?.userQuestionResolution;
  const context = (value: QuestionDelivery) => {
    if (closed || !options.isBotActive(value.botSlug)) throw new MessagingError('bot-unavailable');
    const selected = options.approvals.snapshot(value.botSlug).route;
    if (
      !selected ||
      selected.revision !== value.route.revision ||
      selected.pairingId !== value.route.pairingId
    )
      throw new MessagingError('approval-route-stale');
    let granted: InteractionContext;
    try {
      granted = authority.context(value.route);
    } catch (error) {
      if (error instanceof MessagingError && error.code === 'untrusted-source') throw error;
      throw new MessagingError('question-answer-unavailable');
    }
    const { identity, paired, provider } = granted;
    if (!paired.capabilities.includes('answer'))
      throw new MessagingError('question-answer-unavailable');
    if (!provider.questionCard) throw new MessagingError('capability-unavailable');
    return { identity, paired, provider };
  };
  const safe = (value: QuestionDelivery) => {
    try {
      context(value);
      return !!request(value);
    } catch {
      return false;
    }
  };
  const live = (value: QuestionDelivery) =>
    !!owner?.pending(value.botSlug, value.id) && !!request(value);
  const state = (value: QuestionDelivery): QuestionDelivery['status'] =>
    resolution(value)?.state ??
    (value.submission === 'accepted'
      ? 'answered'
      : value.status === 'pending' && !live(value)
        ? 'expired'
        : value.status);
  const render = (value: QuestionDelivery): MessagingQuestionCard => {
    const status = state(value);
    const answers = resolution(value)?.answers;
    const detail = answers
      ? answers.map((answer) => answer.custom ?? answer.selected.join(', ')).join('\n')
      : value.submission === 'unknown-outcome'
        ? 'Answer not confirmed; inspect and reconcile in Web / 回答结果未确认，请在 Web 核对'
        : value.submission === 'refused'
          ? 'Answer not accepted; the original question still waits / 回答未被接受，原提问继续等待'
          : value.submission === 'submitting'
            ? 'Checking the native question owner / 正在核验原生提问'
            : `Choose answers or enter your own, then Submit / 选择或填写答案后提交。\nYou may also reply to this card with letters such as A or A C, or 1A 2B for several questions. / 也可回复此卡片：字母如 A、A C，多题写成 1A 2B。`;
    return {
      requestId: value.id,
      reference: value.reference,
      questions: request(value)?.questions ?? [],
      status: value.submission === 'unknown-outcome' && live(value) ? 'web-required' : status,
      detail,
    };
  };
  const trace = (phase: string, value: QuestionDelivery, startedAt: number) =>
    options.warn?.(
      `question-notification ${JSON.stringify({
        initiator: 'native-question',
        phase,
        outcome: value.delivery,
        submission: value.submission,
        update: value.update,
        durationMs: Math.round(performance.now() - startedAt),
        reason: value.reason ?? 'none',
      })}`,
    );
  const bounded = <T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
    return Promise.race([
      run(signal),
      new Promise<never>((_, reject) =>
        signal.addEventListener(
          'abort',
          () => reject(new MessagingProviderError('question-result-unknown', 'unknown')),
          { once: true },
        ),
      ),
    ]);
  };
  const update = async (id: string): Promise<void> => {
    const value = read(id);
    if (!value?.receipt || busy.has(id) || !safe(value)) return;
    const startedAt = performance.now();
    const card = render(value);
    busy.add(id);
    write({ ...value, status: state(value), update: 'sending' });
    try {
      const { identity, provider } = context(value);
      const result = await bounded((signal) =>
        provider.questionCard!({
          accountRef: identity.accountRef,
          fingerprint: identity.fingerprint,
          route: value.receipt!,
          card,
          signal,
          update: true,
          beforeSend: () => safe(value) && render(read(id)!).status === card.status,
        }),
      );
      if (result.updated !== true)
        throw new MessagingProviderError('provider-result-unknown', 'unknown');
      const latest = read(id);
      if (latest) write({ ...latest, update: 'updated' });
    } catch (error) {
      const latest = read(id);
      if (latest)
        write({
          ...latest,
          update:
            error instanceof MessagingProviderError && error.disposition === 'not-started'
              ? 'failed'
              : 'unknown-outcome',
        });
    } finally {
      busy.delete(id);
      const latest = read(id);
      if (latest) {
        trace('update', latest, startedAt);
        if (render(latest).status !== card.status) void update(id);
      }
    }
  };
  const send = async (id: string): Promise<void> => {
    const value = read(id);
    if (
      !value ||
      busy.has(id) ||
      value.attempts >= 3 ||
      !['pending', 'failed'].includes(value.delivery)
    )
      return;
    const startedAt = performance.now();
    busy.add(id);
    let started = false;
    let fallback = false;
    write({ ...value, attempts: value.attempts + 1 });
    try {
      const { identity, paired, provider } = context(value);
      const target =
        value.destination?.reply ??
        (paired.messageIds?.[0]
          ? {
              messageId: paired.messageIds[0],
              actorId: paired.actorId,
              conversationId: paired.conversationId,
            }
          : undefined);
      if (!live(value) || !target)
        throw new MessagingProviderError('question-owner-unavailable', 'not-started');
      write({ ...value, attempts: value.attempts + 1, delivery: 'sending' });
      started = true;
      const result = await bounded((signal) =>
        provider.questionCard!({
          accountRef: identity.accountRef,
          fingerprint: identity.fingerprint,
          route: target,
          card: render(value),
          signal,
          beforeSend: () => safe(value) && live(value),
        }),
      );
      if (
        result.sent !== true ||
        result.receipt?.version !== 1 ||
        result.receipt.conversationId !== target.conversationId
      )
        throw new MessagingProviderError('provider-result-unknown', 'unknown');
      const latest = read(id);
      if (latest) write({ ...latest, delivery: 'sent', receipt: result.receipt });
    } catch (error) {
      const latest = read(id);
      if (latest) {
        const remaining = withoutFailedGroup(latest, error);
        fallback = remaining !== latest;
        write({
          ...remaining,
          delivery:
            !started ||
            (error instanceof MessagingProviderError && error.disposition === 'not-started')
              ? 'failed'
              : 'unknown-outcome',
          reason:
            error instanceof MessagingError || error instanceof MessagingProviderError
              ? error.code
              : 'provider-result-unknown',
        });
      }
    } finally {
      busy.delete(id);
      const latest = read(id);
      if (latest) {
        trace('send', latest, startedAt);
        if (latest.receipt && state(latest) !== 'pending') void update(id);
      }
    }
    if (fallback) await send(id).catch(() => options.warn?.('question-notification-send-failed'));
  };
  const notify = (notice: ChannelQuestionNotice, status: 'pending' | 'answered' | 'cancelled') => {
    if (closed) return;
    if (status === 'pending') {
      if (read(notice.messageId)) return;
      const route = options.approvals.snapshot(notice.botSlug).route;
      const question = channels?.message(notice.channelId, notice.messageId)?.userQuestionRequest;
      if (!route || !question) return;
      const destination = authority.groupDestination(route, notice);
      write({
        ...(destination ? { destination } : {}),
        id: notice.messageId,
        botSlug: notice.botSlug,
        channelId: notice.channelId,
        sessionId: notice.sessionId,
        reference: notice.messageId.replaceAll('-', '').slice(0, 12).toUpperCase(),
        questionHash: createHash('sha256').update(JSON.stringify(question.questions)).digest('hex'),
        route,
        createdAt: new Date().toISOString(),
        status: 'pending',
        delivery: 'pending',
        attempts: 0,
        submission: 'none',
        update: 'none',
      });
      void send(notice.messageId).catch(() => options.warn?.('question-notification-send-failed'));
    } else {
      const value = read(notice.messageId);
      if (!value) return;
      write({
        ...value,
        status,
        submission: status === 'answered' ? 'accepted' : value.submission,
      });
      void update(value.id);
    }
  };
  const answerer = (
    value: QuestionDelivery,
    providerId: string,
    event: {
      botId: string;
      fingerprint: string;
      actorId: string;
      conversationId: string;
      messageId: string;
    },
  ) =>
    safe(value) && live(value)
      ? authority.authorize({
          grant: value.route,
          source: { ...event, providerId },
          capability: 'answer',
          expected: {
            conversationId: value.receipt?.conversationId ?? event.conversationId,
            shared: value.destination !== undefined,
          },
        })
      : undefined;
  const authorized = (...input: Parameters<typeof answerer>) => answerer(...input) !== undefined;
  const submit = (
    value: QuestionDelivery,
    answer: AskUserQuestionAnswer,
    providerId: string,
    event: {
      botId: string;
      fingerprint: string;
      actorId: string;
      conversationId: string;
      messageId: string;
    },
    signal: AbortSignal,
  ) => {
    if (
      signal.aborted ||
      value.status !== 'pending' ||
      ['submitting', 'unknown-outcome'].includes(value.submission) ||
      value.delivery !== 'sent'
    )
      return false;
    const actor = answerer(value, providerId, event);
    if (!actor) return false;
    write({ ...value, submission: 'submitting' });
    queueMicrotask(() => {
      void owner
        ?.answer(value.botSlug, value.id, answer, OWNER_HUMAN_CONTEXT, {
          actor,
          authorized: () => !signal.aborted && authorized(value, providerId, event),
        })
        .then((accepted) => {
          const latest = read(value.id);
          if (latest)
            write({
              ...latest,
              status: state(latest),
              submission: accepted ? 'accepted' : 'refused',
            });
          void update(value.id);
        })
        .catch(() => {
          const latest = read(value.id);
          if (latest)
            write({
              ...latest,
              submission: 'unknown-outcome',
              reason: 'question-answer-unconfirmed',
            });
          void update(value.id);
        });
    });
    return true;
  };
  if (options.recover !== false)
    database.transaction((db) =>
      db
        .prepare(
          "UPDATE messaging_question_deliveries SET body = json_set(body, '$.status', CASE WHEN json_extract(body, '$.status') = 'pending' THEN 'expired' ELSE json_extract(body, '$.status') END, '$.delivery', CASE WHEN json_extract(body, '$.delivery') = 'sending' THEN 'unknown-outcome' ELSE json_extract(body, '$.delivery') END, '$.submission', CASE WHEN json_extract(body, '$.submission') = 'submitting' THEN 'unknown-outcome' ELSE json_extract(body, '$.submission') END, '$.update', CASE WHEN json_extract(body, '$.status') = 'pending' AND json_extract(body, '$.receipt') IS NOT NULL THEN 'none' WHEN json_extract(body, '$.update') = 'sending' THEN 'unknown-outcome' ELSE json_extract(body, '$.update') END)",
        )
        .run(),
    );
  const service: QuestionMessaging = {
    attach(nextOwner, nextChannels) {
      detach?.();
      owner = nextOwner;
      channels = nextChannels;
      const unsubscribe = owner.observe(notify);
      detach = unsubscribe;
      service.refresh();
      return () => {
        unsubscribe();
        if (detach === unsubscribe) {
          owner = undefined;
          channels = undefined;
          detach = undefined;
        }
      };
    },
    refresh() {
      if (closed || !channels) return;
      const pendingUpdates = database.read((db) =>
        (
          db
            .prepare(
              "SELECT body FROM messaging_question_deliveries WHERE json_extract(body, '$.receipt') IS NOT NULL AND json_extract(body, '$.status') != 'pending' AND json_extract(body, '$.update') IN ('none', 'failed') ORDER BY rowid DESC LIMIT 50",
            )
            .all() as { body: string }[]
        ).map((row) => JSON.parse(row.body) as QuestionDelivery),
      );
      for (const value of pendingUpdates) void update(value.id);
    },
    snapshot(botSlug) {
      return closed ? [] : rows(botSlug).map((value) => ({ ...value, status: state(value) }));
    },
    async retry(botSlug, id) {
      const value = read(id);
      if (!value || value.botSlug !== botSlug || !safe(value))
        throw new MessagingError('question-repair-unavailable');
      if (value.submission === 'unknown-outcome') {
        if (owner?.reconcile(botSlug, id)) return;
        if (!live(value) || resolution(value))
          throw new MessagingError('question-owner-unavailable');
        write({ ...value, submission: 'refused', reason: 'original-question-still-pending' });
        await update(id);
      } else if (value.delivery === 'failed' && live(value) && value.attempts < 3) await send(id);
      else if (value.receipt && value.update === 'failed') await update(id);
      else throw new MessagingError('question-repair-unavailable');
    },
    async action(providerId, event, signal) {
      const value = read(event.requestId);
      const question = value && request(value);
      if (
        !value ||
        !question ||
        value.receipt?.messageId !== event.messageId ||
        value.receipt.conversationId !== event.conversationId ||
        event.values.length !== question.questions.length ||
        event.values.some((answer, index) =>
          answer.selected.some(
            (pick) =>
              !Number.isSafeInteger(pick) ||
              pick < 0 ||
              pick >= (question.questions[index]!.options?.length ?? 0),
          ),
        )
      )
        return { accepted: true, status: 'refused' };
      const answers = event.values.map((answer, index) => ({
        id: question.questions[index]!.id,
        selected: answer.selected.map((pick) => question.questions[index]!.options![pick]!.label),
        ...(answer.custom === undefined ? {} : { custom: answer.custom }),
      }));
      return {
        accepted: true,
        status: submit(value, { answers }, providerId, event, signal) ? 'queued' : 'refused',
      };
    },
    async text(providerId, event, signal) {
      if (closed) return false;
      const body = event.text.trim();
      const command = /^\/answer(?:\s|$)/.test(body);
      const explicit = /^(?:\/answer\s+|#)([A-Fa-f0-9]{12})(?:\s+([\s\S]*))?$/.exec(body);
      const candidates = database.read((db) =>
        (
          db
            .prepare(
              "SELECT body FROM messaging_question_deliveries WHERE json_extract(body, '$.status') = 'pending' AND json_extract(body, '$.receipt.conversationId') = ? ORDER BY rowid DESC LIMIT 100",
            )
            .all(event.conversation.id) as { body: string }[]
        ).map((row) => JSON.parse(row.body) as QuestionDelivery),
      );
      const sender = { ...event, actorId: event.actor.id, conversationId: event.conversation.id };
      const supported =
        isMessagingPlatform(event.channel) &&
        !!messagingPlatform(event.channel).features.interactions &&
        !event.attachments?.length;
      const quoted = candidates.find((value) => value.receipt?.messageId === event.reply.parentId);
      if (!command && !quoted && !explicit) {
        if (!supported || event.conversation.kind !== 'dm' || signal.aborted) return false;
        const mine = candidates.filter((item) => authorized(item, providerId, sender));
        const only = mine.length === 1 ? mine[0]! : undefined;
        const question = only && request(only);
        const reply = question && parseQuestionReply(question.questions, body);
        if (!only || reply?.kind !== 'answer' || !reply.structured) return false;
        submit(only, reply.answer, providerId, sender, signal);
        return true;
      }
      if (!supported) return true;
      const reference = explicit?.[1]!.toUpperCase();
      const value =
        quoted ?? (reference ? candidates.find((item) => item.reference === reference) : undefined);
      const ambiguous =
        (command || !!explicit) &&
        (!explicit || (quoted !== undefined && quoted.reference !== reference));
      const trusted = candidates.find((item) => authorized(item, providerId, sender));
      if (!trusted || signal.aborted) return true;
      const question = value && request(value);
      const reply =
        !ambiguous && question
          ? parseQuestionReply(question.questions, explicit ? (explicit[2] ?? '') : body)
          : undefined;
      if (value && reply?.kind === 'answer') {
        submit(value, reply.answer, providerId, sender, signal);
        return true;
      }
      const { identity, provider } = context(trusted);
      await provider.reply?.({
        accountRef: identity.accountRef,
        fingerprint: identity.fingerprint,
        route: event.reply,
        text:
          value && question && reply?.kind === 'invalid'
            ? `${explainQuestionReply(reply, question.questions)}\n\n${renderQuestionText(question.questions, value.reference)}`
            : 'Reply to the question, or start with its reference such as #<reference> A. / 请回复原提问，或以编号开头，如 #<编号> A。\n' +
              candidates
                .filter((item) => authorized(item, providerId, sender))
                .map((item) => `#${item.reference}`)
                .join('\n'),
        signal,
        beforeSend: () => authorized(trusted, providerId, sender),
      });
      return true;
    },
    close() {
      closed = true;
      controller.abort();
      detach?.();
      busy.clear();
      owner = undefined;
      channels = undefined;
    },
  };
  return service;
}
