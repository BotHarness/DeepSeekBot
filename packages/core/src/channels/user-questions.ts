import { randomUUID } from 'node:crypto';

import type { Agent } from '@deepseek-ai/dsh-agent';
import type {
  AskUserQuestionAnswer,
  AskUserQuestionAnswerItem,
  AskUserQuestionItem,
  AskUserQuestionRequestEvent,
} from '@deepseek-ai/dsh-user-questions/types';

import { dmChannelId, type ChannelMessage } from './channel.js';
import type { ChannelStore } from './store.js';
import type { SessionOwnership } from '../sessions/ownership.js';

export interface ChannelQuestionRequest {
  sessionId: string;
  callId?: string;
  questions: AskUserQuestionItem[];
}

export type ChannelQuestionStatus = 'pending' | 'submitted' | 'answered' | 'expired';

type NativeDelivery = (deliver: () => boolean) => Promise<boolean>;

export interface TimedQuestionPort {
  bind?(sessionId: string, channelId: string): NativeDelivery | undefined;
  recover?(
    sessionId: string,
    channelId: string,
    requestMessageId: string,
  ): NativeDelivery | undefined;
  available?(sessionId: string, channelId: string): boolean;
  load?(sessionIds: readonly string[]): Promise<void>;
  read(
    sessionId: string,
    callId: string,
  ):
    | { state: 'open' | 'continued' }
    | { state: 'answered'; answer: AskUserQuestionAnswer }
    | undefined;
  answer(sessionId: string, callId: string, answer: AskUserQuestionAnswer): boolean;
}

export interface ChannelQuestionCard {
  channelId: string;
  messageId: string;
}

export interface ChannelQuestionResolution {
  requestMessageId: string;
  state: 'answered' | 'cancelled';
  answers?: AskUserQuestionAnswerItem[];
}

export interface ChannelQuestionNotice extends ChannelQuestionRequest {
  botSlug: string;
  channelId: string;
  groupName?: string;
  messageId: string;
}

type Pending = {
  agent: Agent | undefined;
  sessionId: string;
  botSlug: string;
  channelId: string;
  groupName?: string;
  questions: AskUserQuestionItem[];
  signal?: AbortSignal;
  resolve(answer: AskUserQuestionAnswer): void;
  reject(reason: Error): void;
  abort(): void;
  deciding: boolean;
  committed: boolean;
  callId?: string;
  deferred: boolean;
  submitted: boolean;
  deliverNative?: NativeDelivery | undefined;
};

function validAnswer(questions: AskUserQuestionItem[], answer: AskUserQuestionAnswer): boolean {
  if (!Array.isArray(answer.answers) || answer.answers.length !== questions.length) return false;
  const seen = new Set<string>();
  for (const item of answer.answers) {
    if (typeof item !== 'object' || item === null) return false;
    const question = questions.find((entry) => entry.id === item.id);
    if (question === undefined || seen.has(item.id)) return false;
    seen.add(item.id);
    if (!Array.isArray(item.selected) || !item.selected.every((label) => typeof label === 'string'))
      return false;
    if (new Set(item.selected).size !== item.selected.length) return false;
    if (question.multiSelect !== true && item.selected.length > 1) return false;
    if (question.multiSelect !== true && item.selected.length > 0 && item.custom !== undefined)
      return false;
    const offered = new Set(question.options?.map((option) => option.label) ?? []);
    if (item.selected.some((label) => !offered.has(label))) return false;
    if (
      item.custom !== undefined &&
      (typeof item.custom !== 'string' ||
        item.custom.trim().length === 0 ||
        item.custom.length > 2_000)
    )
      return false;
    if (item.selected.length === 0 && item.custom === undefined) return false;
  }
  return true;
}

export class ChannelUserQuestions {
  readonly #channels: ChannelStore;
  readonly #ownership: SessionOwnership;
  readonly #isLive: (agent: Agent) => boolean;
  readonly #warn: (message: string) => void;
  readonly #changed: (slug: string, count: number) => void;
  readonly #pending = new Map<string, Pending>();
  readonly #listeners = new Set<() => void>();
  readonly #timed: TimedQuestionPort | undefined;
  readonly #askChannel: ((sessionId: string) => string | undefined) | undefined;

  constructor(
    channels: ChannelStore,
    ownership: SessionOwnership,
    isLive: (agent: Agent) => boolean = () => true,
    warn: (message: string) => void = () => undefined,
    changed: (slug: string, count: number) => void = () => undefined,
    timed?: TimedQuestionPort,
    askChannel?: (sessionId: string) => string | undefined,
  ) {
    this.#askChannel = askChannel;
    this.#channels = channels;
    this.#ownership = ownership;
    this.#isLive = isLive;
    this.#warn = warn;
    this.#changed = changed;
    this.#timed = timed;
  }

  async ask(request: AskUserQuestionRequestEvent): Promise<AskUserQuestionAnswer | undefined> {
    const agent = request.agent;
    if (agent === undefined) return undefined;
    const owner = this.#ownership.resolve(agent.session.id);
    if (owner?.rootRole !== 'orchestrator' || !this.#isLive(agent)) return undefined;
    const origin = this.#askChannel?.(agent.session.id);
    const originChannel = origin === undefined ? undefined : this.#channels.get(origin);
    const channelId =
      originChannel?.type === 'group' && originChannel.members.includes(owner.botSlug)
        ? originChannel.id
        : dmChannelId(owner.botSlug);
    const channel = this.#channels.get(channelId);
    if (channel === undefined) return undefined;
    if (channel.type !== 'group' && channel.botSlug !== owner.botSlug) return undefined;
    if (request.signal?.aborted) throw new Error('DSH user question was cancelled');
    const questions = request.questions.map((question) => ({
      ...question,
      ...(question.options === undefined
        ? {}
        : { options: question.options.map((option) => ({ ...option })) }),
    }));
    if (questions.length === 0) return undefined;
    const wait = 'wait' in request ? request.wait : undefined;
    const callId =
      this.#timed !== undefined &&
      typeof wait === 'object' &&
      wait !== null &&
      'timed' in wait &&
      wait.timed === true &&
      'callId' in wait &&
      typeof wait.callId === 'string' &&
      wait.callId.length > 0
        ? wait.callId
        : undefined;
    const message: ChannelMessage = {
      id: randomUUID(),
      at: new Date().toISOString(),
      author: { kind: 'bot', slug: owner.botSlug },
      body: questions.map((question) => question.question).join('\n'),
      userQuestionRequest: {
        sessionId: agent.session.id,
        questions,
        ...(callId === undefined ? {} : { callId }),
      },
    };
    let resolve!: (answer: AskUserQuestionAnswer) => void;
    let reject!: (reason: Error) => void;
    const answer = new Promise<AskUserQuestionAnswer>((yes, no) => {
      resolve = yes;
      reject = no;
    });

    void answer.catch(() => undefined);
    const pending: Pending = {
      agent,
      sessionId: agent.session.id,
      botSlug: owner.botSlug,
      channelId,
      ...(channel.type === 'group' ? { groupName: channel.name } : {}),
      questions,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      resolve,
      reject,
      abort: () => {
        const reason: unknown = request.signal?.reason;
        if (callId !== undefined) {
          pending.deferred = true;
          pending.reject(
            reason instanceof Error ? reason : new Error('Native question foreground ended'),
          );
        } else this.#cancel(message.id);
      },
      deciding: false,
      committed: false,
      ...(callId === undefined ? {} : { callId }),
      deferred: false,
      submitted: false,
      ...(callId === undefined || this.#timed?.bind === undefined
        ? {}
        : { deliverNative: this.#timed.bind(agent.session.id, channelId) }),
    };
    this.#pending.set(message.id, pending);
    request.signal?.addEventListener('abort', pending.abort, { once: true });
    try {
      if ((await this.#channels.appendMessage(channelId, message)) === undefined) return undefined;
      if (this.#pending.get(message.id) === pending) {
        pending.committed = true;
        if (this.status(pending.botSlug, message.id) === 'pending')
          this.#publishAttention(pending.botSlug);
      }
      return await answer;
    } finally {
      request.signal?.removeEventListener('abort', pending.abort);
      if (this.#pending.get(message.id) === pending && (!pending.deferred || !pending.committed)) {
        this.#pending.delete(message.id);
        if (pending.committed) this.#publishAttention(pending.botSlug);
      }
    }
  }

  activeMessageIds(): string[] {
    return [...this.#pending]
      .filter(([messageId, pending]) =>
        ['pending', 'submitted'].includes(this.status(pending.botSlug, messageId)),
      )
      .map(([messageId]) => messageId);
  }

  requests(botSlug: string): ChannelQuestionNotice[] {
    return [...this.#pending].flatMap(([messageId, pending]) =>
      pending.botSlug === botSlug &&
      pending.committed &&
      ['pending', 'submitted'].includes(this.status(botSlug, messageId))
        ? [
            {
              botSlug,
              channelId: pending.channelId,
              ...(pending.groupName === undefined ? {} : { groupName: pending.groupName }),
              messageId,
              sessionId: pending.sessionId,
              ...(pending.callId === undefined ? {} : { callId: pending.callId }),
              questions: pending.questions.map((question) => ({
                ...question,
                ...(question.options === undefined
                  ? {}
                  : {
                      options: question.options.map((option) => ({ ...option })),
                    }),
              })),
            },
          ]
        : [],
    );
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  activeSessionIds(): string[] {
    return this.activeMessageIds().flatMap((id) => {
      const pending = this.#pending.get(id);
      return pending === undefined ? [] : [pending.sessionId];
    });
  }

  status(
    botSlug: string,
    messageId: string,
    channelId = dmChannelId(botSlug),
  ): ChannelQuestionStatus {
    const pending = this.#pending.get(messageId);
    if (pending === undefined) {
      const messages = this.#channels.readMessages(channelId);
      const message = messages.find((entry) => entry.id === messageId);
      return message?.userQuestionRequest?.callId !== undefined &&
        messages.some(
          (entry) =>
            entry.userQuestionResolution?.requestMessageId === messageId &&
            entry.userQuestionResolution.state === 'answered',
        )
        ? 'answered'
        : 'expired';
    }
    if (pending.botSlug !== botSlug || !this.#holds(messageId, pending)) return 'expired';
    if (pending.deferred && pending.callId !== undefined) {
      const native = this.#timed?.read(pending.sessionId, pending.callId);
      if (native === undefined) {
        this.#cancel(messageId);
        return 'expired';
      }
      if (native.state === 'answered') return 'answered';
      if (pending.submitted) return 'submitted';
    }
    return 'pending';
  }

  async answer(
    botSlug: string,
    messageId: string,
    answer: AskUserQuestionAnswer,
  ): Promise<boolean> {
    const pending = this.#pending.get(messageId);
    if (
      pending === undefined ||
      pending.botSlug !== botSlug ||
      pending.deciding ||
      pending.submitted
    )
      return false;
    if (!this.#holds(messageId, pending)) return false;
    if (!validAnswer(pending.questions, answer)) return false;
    pending.deciding = true;
    try {
      if (pending.deferred && pending.callId !== undefined) {
        const timed = this.#timed;
        const callId = pending.callId;
        const state = timed?.read(pending.sessionId, callId)?.state;
        if (
          timed === undefined ||
          (state !== 'continued' && (state !== 'open' || pending.agent !== undefined))
        )
          return false;
        try {
          const submit = (): boolean => {
            if (
              this.#pending.get(messageId) !== pending ||
              !this.#holds(messageId, pending) ||
              timed.read(pending.sessionId, callId)?.state !== 'continued'
            )
              return false;
            return timed.answer(pending.sessionId, callId, answer);
          };
          const deliver =
            pending.deliverNative ??
            (pending.agent === undefined
              ? timed.recover?.(pending.sessionId, pending.channelId, messageId)
              : undefined);
          pending.submitted =
            deliver === undefined
              ? timed.bind === undefined && timed.recover === undefined
                ? submit()
                : false
              : await deliver(submit);
          return pending.submitted;
        } catch {
          this.#warn(`botharness.channel_question.late_answer_refused request=${messageId}`);
          return false;
        }
      }
      if (pending.callId !== undefined) {
        pending.deferred = true;
        pending.submitted = true;
        pending.resolve(answer);
        return true;
      }
      const decision: ChannelMessage = {
        id: randomUUID(),
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: answer.answers.map((item) => item.custom ?? item.selected.join(', ')).join('\n'),
        replyTo: messageId,
        userQuestionResolution: {
          requestMessageId: messageId,
          state: 'answered',
          answers: answer.answers,
        },
      };
      if ((await this.#channels.appendMessage(pending.channelId, decision)) === undefined)
        return false;
      if (this.#pending.get(messageId) !== pending || pending.signal?.aborted) return false;
      this.#pending.delete(messageId);
      this.#publishAttention(pending.botSlug);
      pending.signal?.removeEventListener('abort', pending.abort);
      pending.resolve(answer);
      return true;
    } finally {
      pending.deciding = false;
      if (pending.deferred && pending.submitted)
        void this.reconcileSession(pending.sessionId).catch(() =>
          this.#warn('user-question-reconciliation-failed'),
        );
    }
  }

  cancelSession(sessionId: string): void {
    for (const [id, pending] of this.#pending) {
      if (pending.sessionId !== sessionId) continue;
      if (pending.callId === undefined) this.#cancel(id);
      else this.#detach(pending);
    }
  }

  async recover(cards: readonly ChannelQuestionCard[]): Promise<void> {
    const sessions = new Set<string>();
    const bots = new Set<string>();
    const stored = cards.flatMap((card) => {
      const request = this.#channels.message(card.channelId, card.messageId)?.userQuestionRequest;
      return request?.callId === undefined ? [] : [request.sessionId];
    });
    await this.#timed?.load?.([...new Set(stored)]);
    for (const card of cards) {
      if (this.#pending.has(card.messageId)) continue;
      const message = this.#channels.message(card.channelId, card.messageId);
      const request = message?.userQuestionRequest;
      if (request?.callId === undefined || message?.author.kind !== 'bot') continue;
      const botSlug = message.author.slug;
      const owner = this.#ownership.resolve(request.sessionId);
      const channel = this.#channels.get(card.channelId);
      if (
        owner?.rootRole !== 'orchestrator' ||
        owner.botSlug !== botSlug ||
        channel === undefined ||
        (channel.type === 'group'
          ? !channel.members.includes(botSlug)
          : channel.botSlug !== botSlug)
      )
        continue;
      if (
        this.#timed === undefined ||
        this.#timed.read(request.sessionId, request.callId) === undefined ||
        this.#timed.available?.(request.sessionId, card.channelId) === false
      )
        continue;
      this.#pending.set(card.messageId, {
        agent: undefined,
        sessionId: request.sessionId,
        botSlug,
        channelId: card.channelId,
        ...(channel.type === 'group' ? { groupName: channel.name } : {}),
        questions: request.questions,
        resolve: () => undefined,
        reject: () => undefined,
        abort: () => undefined,
        deciding: false,
        committed: true,
        callId: request.callId,
        deferred: true,
        submitted: false,
      });
      sessions.add(request.sessionId);
      bots.add(botSlug);
    }
    for (const slug of bots) this.#publishAttention(slug);
    for (const sessionId of sessions) await this.reconcileSession(sessionId);
  }

  async reconcileSession(sessionId: string): Promise<void> {
    for (const [id, pending] of this.#pending) {
      if (
        pending.sessionId !== sessionId ||
        !pending.deferred ||
        pending.callId === undefined ||
        pending.deciding
      )
        continue;
      if (!this.#holds(id, pending)) continue;
      const native = this.#timed?.read(pending.sessionId, pending.callId);
      if (native === undefined) this.#cancel(id);
      else if (native.state === 'answered' && validAnswer(pending.questions, native.answer)) {
        pending.deciding = true;
        try {
          const saved = await this.#channels.appendMessage(pending.channelId, {
            id: randomUUID(),
            at: new Date().toISOString(),
            author: { kind: 'human' },
            body: native.answer.answers
              .map((item) => item.custom ?? item.selected.join(', '))
              .join('\n'),
            replyTo: id,
            userQuestionResolution: {
              requestMessageId: id,
              state: 'answered',
              answers: native.answer.answers,
            },
          });
          if (saved !== undefined && this.#pending.get(id) === pending) {
            this.#pending.delete(id);
            this.#publishAttention(pending.botSlug);
          }
        } finally {
          pending.deciding = false;
        }
      }
    }
  }

  discardReply(sessionId: string, callId: string): void {
    for (const pending of this.#pending.values())
      if (pending.sessionId === sessionId && pending.callId === callId) pending.submitted = false;
  }

  #publishAttention(slug: string): void {
    const count = [...this.#pending.values()].filter(
      (pending) => pending.botSlug === slug && pending.committed,
    ).length;
    try {
      this.#changed(slug, count);
    } catch {
      this.#warn('user-question-attention-publication-failed');
    }
    for (const listener of this.#listeners) {
      try {
        listener();
      } catch {
        this.#warn('user-question-notice-publication-failed');
      }
    }
  }

  close(): void {
    for (const [id, pending] of this.#pending) {
      if (pending.callId === undefined) this.#cancel(id);
      else {
        this.#pending.delete(id);
        pending.signal?.removeEventListener('abort', pending.abort);
        pending.reject(new Error('DSH user question was cancelled'));
      }
    }
  }

  #detach(pending: Pending): void {
    if (pending.agent === undefined) return;
    pending.agent = undefined;
    pending.deferred = true;
    pending.signal?.removeEventListener('abort', pending.abort);
    pending.reject(new Error('DSH user question foreground ended'));
  }

  #holds(messageId: string, pending: Pending): boolean {
    const owner = this.#ownership.resolve(pending.sessionId);
    if (pending.agent !== undefined && !this.#isLive(pending.agent)) {
      if (pending.callId === undefined) {
        this.#cancel(messageId);
        return false;
      }
      this.#detach(pending);
    }
    if (
      (!pending.deferred && pending.signal?.aborted) ||
      owner?.rootRole !== 'orchestrator' ||
      owner.botSlug !== pending.botSlug ||
      (pending.agent === undefined &&
        this.#timed?.available?.(pending.sessionId, pending.channelId) === false)
    ) {
      this.#cancel(messageId);
      return false;
    }
    return true;
  }

  #cancel(messageId: string): void {
    const pending = this.#pending.get(messageId);
    if (pending === undefined) return;
    this.#pending.delete(messageId);
    if (pending.committed) this.#publishAttention(pending.botSlug);
    pending.signal?.removeEventListener('abort', pending.abort);
    const resolution: ChannelMessage = {
      id: randomUUID(),
      at: new Date().toISOString(),
      author: { kind: 'bot', slug: pending.botSlug },
      body: '提问已取消',
      replyTo: messageId,
      userQuestionResolution: { requestMessageId: messageId, state: 'cancelled' },
    };

    void this.#channels.appendMessage(pending.channelId, resolution).then(
      (saved) => {
        if (saved === undefined)
          this.#warn(`botharness.channel_question.cancel_append_failed request=${messageId}`);
      },
      () => this.#warn(`botharness.channel_question.cancel_append_failed request=${messageId}`),
    );
    pending.reject(new Error('DSH user question was cancelled'));
  }
}
