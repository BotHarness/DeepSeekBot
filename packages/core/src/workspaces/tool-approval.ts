import type { ToolApprovalActor } from './tool-approval-actor.js';
export type { ToolApprovalActor } from './tool-approval-actor.js';
import { randomUUID } from 'node:crypto';

import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval';

import { dmChannelId, type ChannelMessage } from '../channels/channel.js';
import type { ChannelStore } from '../channels/store.js';
import type { SessionOwnership, SessionOwnershipRecord } from '../sessions/ownership.js';
import {
  secretCliKind,
  type ToolApprovalRuleStore,
  type ToolApprovalRule,
} from './tool-approval-rules.js';
import type { AssignmentApprovalWaitLease } from '../runtime/assignment-approval-capacity.js';
import {
  approvalSessionExcerpt,
  reviewerCallInput,
  type ApprovalReview,
  type ApprovalReviewRequest,
  type ApprovalReviewResult,
} from './approval-reviewer.js';
import { changesApprovalPolicy } from './approval-templates.js';

export interface BotCreatePreview {
  memoryFolder: string;
  defaultLocation: boolean;
  avatar?: string;
  avatarError?: string;
}

export interface ToolApprovalRequestCard {
  sessionId: string;
  callId: string;
  toolName: string;
  role: 'orchestrator' | 'assignment';
  cwd: string;
  input: string;
  externalDecision?: 'operation' | 'web-only' | 'each-use';
  botCreatePreview?: BotCreatePreview;
}

export interface ToolApprovalNotice extends ToolApprovalRequestCard {
  botSlug: string;
  channelId: string;
  groupName?: string;
  messageId: string;
  expiresAt: string;
}

export interface ToolApprovalDecision {
  requestMessageId: string;
  actor?: ToolApprovalActor;
  outcome: 'allowed-once' | 'allowed-always-exact' | 'allowed-always-all' | 'rejected';
}

export interface ToolAutoApproval {
  template(botSlug: string): { name: string; text: string } | undefined;
  templateInUse?(template: string): boolean;
  review(request: ApprovalReviewRequest): Promise<ApprovalReviewResult>;
  log(entry: {
    botSlug: string;
    template: string;
    toolName: string;
    outcome: ApprovalReview['outcome'];
    latencyMs: number;
    model?: string;
    reviewSession?: string;
    fallback?: string;
    detail?: string;
  }): void;
}

type TrackedCall = ToolApprovalRequestCard & {
  botSlug: string;
  agent: Agent;
  scopeKey: string;
  automatic?: boolean;
  requireHumanReview?: boolean;
  humanReviewed?: boolean;
  rememberable?: boolean;
  remembered?: boolean;
  execution: ToolExecution;
  authorized?: () => boolean;
  device?: 'computer' | 'browser';
};
type Pending = {
  botSlug: string;
  channelId: string;
  resolve(outcome: ApprovalOutcome): void;
  signal?: AbortSignal;
  sessionId: string;
  callId: string;
  abort(): void;
  deciding: boolean;
  committed: boolean;
  notice: ToolApprovalNotice;
  timer: ReturnType<typeof setTimeout>;
};

export const AUTO_APPROVAL_CONSECUTIVE_REJECTIONS = 3;
export const AUTO_APPROVAL_SESSION_REJECTIONS = 20;

type Breaker = {
  botSlug: string;
  channelId: string;
  template: string;
  consecutive: number;
  total: number;
  paused: boolean;
};

export type AutoRejectionOverrideResult =
  | { ok: true; message: ChannelMessage }
  | { ok: false; code: 'not-rejected' | 'already-overridden' | 'unavailable' };

function callKey(sessionId: string, callId: string): string {
  return sessionId + ':' + callId;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
  );
}

function canonicalInput(input: string): string {
  try {
    return JSON.stringify(canonical(JSON.parse(input)));
  } catch {
    return input;
  }
}

function overrideKey(call: { sessionId: string; toolName: string; input: string }): string {
  return JSON.stringify([call.sessionId, call.toolName, canonicalInput(call.input)]);
}

function bounded(set: Set<string>, limit: number): void {
  while (set.size > limit) set.delete(set.values().next().value!);
}

function inputOf(execution: ToolExecution): string | undefined {
  try {
    const input = JSON.stringify(execution.arguments, null, 2);
    return typeof input === 'string' && input.length > 0 ? input : undefined;
  } catch {
    return undefined;
  }
}

export class ChannelToolApproval {
  readonly #channels: ChannelStore;
  readonly #ownership: SessionOwnership;
  readonly #rules: ToolApprovalRuleStore | undefined;
  readonly #beginWait:
    | ((
        sessionId: string,
        callId: string,
        signal: AbortSignal,
      ) => AssignmentApprovalWaitLease | undefined)
    | undefined;
  readonly #scope: (agent: Agent, owner: SessionOwnershipRecord) => string | undefined;
  readonly #askChannel: ((sessionId: string) => string | undefined) | undefined;
  readonly #tracked = new Map<string, TrackedCall>();
  readonly #pending = new Map<string, Pending>();
  readonly #listeners = new Set<
    (notice: ToolApprovalNotice, status: 'pending' | ApprovalOutcome) => void
  >();
  readonly #attention:
    | { changed(slug: string, count: number): void; warn(message: string): void }
    | undefined;
  readonly #autoApproval: ToolAutoApproval | undefined;
  readonly #reviewRejections = new Map<string, string>();
  readonly #breakers = new Map<string, Breaker>();
  readonly #overrides = new Set<string>();
  readonly #overridden = new Set<string>();

  constructor(
    channels: ChannelStore,
    ownership: SessionOwnership,
    rules?: ToolApprovalRuleStore,
    scope?: (agent: Agent, owner: SessionOwnershipRecord) => string | undefined,
    attention?: { changed(slug: string, count: number): void; warn(message: string): void },
    beginWait?: (
      sessionId: string,
      callId: string,
      signal: AbortSignal,
    ) => AssignmentApprovalWaitLease | undefined,
    askChannel?: (sessionId: string) => string | undefined,
    autoApproval?: ToolAutoApproval,
  ) {
    this.#autoApproval = autoApproval;
    this.#askChannel = askChannel;
    this.#channels = channels;
    this.#ownership = ownership;
    this.#rules = rules;
    this.#attention = attention;
    this.#beginWait = beginWait;
    this.#scope =
      scope ?? ((agent, owner) => JSON.stringify([owner.rootRole, agent.session.header.cwd]));
  }

  track(
    execution: ToolExecution,
    externalDecision: 'operation' | 'web-only' | 'each-use' = 'operation',
    rememberable = false,
    device?: 'computer' | 'browser',
    botCreatePreview?: BotCreatePreview,
    options?: { requireHumanReview?: boolean },
  ): (() => void) | undefined {
    const agent = execution.agent;
    if (agent === undefined) return undefined;
    const owner = this.#ownership.resolve(agent.session.id);
    if (
      owner === undefined ||
      (owner.rootRole !== 'orchestrator' && owner.rootRole !== 'assignment')
    ) {
      return undefined;
    }
    const input = inputOf(execution);
    const cwd = agent.session.header.cwd;
    if (input === undefined || cwd === undefined) return undefined;
    const scopeKey = this.#scope(agent, owner);
    if (scopeKey === undefined) return undefined;
    const key = callKey(agent.session.id, execution.callId);
    this.#tracked.set(key, {
      agent,
      botSlug: owner.botSlug,
      sessionId: agent.session.id,
      callId: execution.callId,
      toolName: execution.name,
      role: owner.rootRole,
      cwd,
      input,
      scopeKey,
      execution,
      externalDecision: options?.requireHumanReview ? 'each-use' : externalDecision,
      ...(options?.requireHumanReview ? { requireHumanReview: true } : {}),
      ...(rememberable && !options?.requireHumanReview ? { rememberable } : {}),
      ...(device === undefined ? {} : { device }),
      ...(botCreatePreview === undefined ? {} : { botCreatePreview }),
    });
    return () => {
      if (this.#tracked.get(key)?.agent === agent) {
        this.#tracked.delete(key);
        this.cancelInvalid();
      }
    };
  }

  async ask(request: {
    agent: Agent;
    toolName: string;
    callId?: string;
    signal?: AbortSignal;
  }): Promise<ApprovalOutcome | undefined> {
    if (request.callId === undefined) return undefined;
    const tracked = this.#tracked.get(callKey(request.agent.session.id, request.callId));
    if (
      tracked === undefined ||
      tracked.agent !== request.agent ||
      tracked.toolName !== request.toolName
    ) {
      return undefined;
    }
    if (request.signal?.aborted) return 'cancelled';
    const owner = this.#ownership.resolve(request.agent.session.id);
    if (
      owner === undefined ||
      owner.botSlug !== tracked.botSlug ||
      this.#scope(request.agent, owner) !== tracked.scopeKey
    )
      return 'unavailable';
    const policyChange = this.#changesPolicy(tracked);
    if (
      !policyChange &&
      !tracked.requireHumanReview &&
      tracked.externalDecision !== 'each-use' &&
      this.#rules?.match(tracked) !== undefined
    ) {
      tracked.automatic = true;
      return 'allowed-once';
    }
    const origin =
      tracked.role === 'orchestrator' ? this.#askChannel?.(tracked.sessionId) : undefined;
    const originChannel = origin === undefined ? undefined : this.#channels.get(origin);
    const channelId =
      originChannel?.type === 'group' && originChannel.members.includes(tracked.botSlug)
        ? originChannel.id
        : dmChannelId(tracked.botSlug);
    const channel = this.#channels.get(channelId) ?? this.#channels.getOrCreateDm(tracked.botSlug);
    if (channel === undefined) return 'unavailable';
    if (channel.type !== 'group' && channel.botSlug !== tracked.botSlug) return 'unavailable';
    if (
      !policyChange &&
      !tracked.requireHumanReview &&
      this.#overrides.delete(overrideKey(tracked))
    )
      return 'allowed-once';
    const template =
      policyChange || tracked.requireHumanReview
        ? undefined
        : this.#autoApproval?.template(tracked.botSlug);
    if (template !== undefined && this.#breakers.get(tracked.sessionId)?.paused !== true) {
      const reviewed = await this.#review(tracked, template, channelId, request.signal);
      if (reviewed !== undefined) return reviewed;
      if (request.signal?.aborted) return 'cancelled';
    }
    const message: ChannelMessage = {
      id: randomUUID(),
      at: new Date().toISOString(),
      author: { kind: 'bot', slug: tracked.botSlug },
      body: '请求批准执行 ' + tracked.toolName,
      toolApprovalRequest: {
        sessionId: tracked.sessionId,
        callId: tracked.callId,
        toolName: tracked.toolName,
        role: tracked.role,
        cwd: tracked.cwd,
        input: tracked.input,
        externalDecision: tracked.externalDecision ?? 'operation',
        ...(tracked.botCreatePreview === undefined
          ? {}
          : { botCreatePreview: tracked.botCreatePreview }),
      },
    };
    let resolve!: (outcome: ApprovalOutcome) => void;
    const answer = new Promise<ApprovalOutcome>((done) => {
      resolve = done;
    });
    const pending: Pending = {
      botSlug: tracked.botSlug,
      channelId,
      sessionId: tracked.sessionId,
      callId: tracked.callId,
      resolve,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      abort: () => this.#settle(message.id, 'cancelled'),
      deciding: false,
      committed: false,
      notice: {
        ...message.toolApprovalRequest!,
        botSlug: tracked.botSlug,
        channelId,
        ...(channel.type === 'group' ? { groupName: channel.name } : {}),
        messageId: message.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      timer: setTimeout(() => this.#settle(message.id, 'cancelled'), 24 * 60 * 60 * 1000),
    };
    pending.timer.unref();
    this.#pending.set(message.id, pending);
    request.signal?.addEventListener('abort', pending.abort, { once: true });
    let wait: AssignmentApprovalWaitLease | undefined;
    try {
      if (tracked.role === 'assignment')
        wait = this.#beginWait?.(
          tracked.sessionId,
          tracked.callId,
          request.signal ?? new AbortController().signal,
        );
      const committed = await this.#channels.appendMessage(channelId, message);
      if (committed === undefined) return 'unavailable';
      if (this.#pending.get(message.id) === pending) {
        pending.committed = true;
        this.#publishAttention(pending.botSlug);
        this.#publishNotice(pending, 'pending');
      }
      const outcome = await answer;
      await wait?.resume();
      return outcome;
    } catch {
      return 'unavailable';
    } finally {
      this.#settle(message.id, 'unavailable');
      wait?.release();
    }
  }

  executionGuard(
    agent: Agent,
    callId: string,
  ): ((name: string, args: unknown) => boolean) | undefined {
    const tracked = this.#tracked.get(callKey(agent.session.id, callId));
    if (!tracked || tracked.agent !== agent) return undefined;
    return (name, args) => {
      const owner = this.#ownership.resolve(agent.session.id);
      return (
        owner !== undefined &&
        owner.botSlug === tracked.botSlug &&
        this.#scope(agent, owner) === tracked.scopeKey &&
        tracked.execution.name === tracked.toolName &&
        tracked.execution.callId === tracked.callId &&
        name === tracked.toolName &&
        inputOf({ ...tracked.execution, arguments: args }) === tracked.input &&
        tracked.authorized?.() !== false &&
        (!tracked.requireHumanReview || tracked.humanReviewed === true) &&
        (!tracked.automatic || this.#rules?.match(tracked) !== undefined)
      );
    };
  }

  validAfterDecision(agent: Agent, callId: string): boolean {
    const tracked = this.#tracked.get(callKey(agent.session.id, callId));
    return (
      tracked !== undefined &&
      this.executionGuard(agent, callId)?.(tracked.execution.name, tracked.execution.arguments) ===
        true
    );
  }

  cancelInvalid(): void {
    for (const [messageId, pending] of this.#pending) {
      const tracked = this.#tracked.get(callKey(pending.sessionId, pending.callId));
      const owner = tracked === undefined ? undefined : this.#ownership.resolve(tracked.sessionId);
      if (
        tracked === undefined ||
        owner === undefined ||
        owner.botSlug !== tracked.botSlug ||
        this.#scope(tracked.agent, owner) !== tracked.scopeKey
      ) {
        this.#settle(messageId, 'unavailable');
      }
    }
  }

  subscribe(
    listener: (notice: ToolApprovalNotice, status: 'pending' | ApprovalOutcome) => void,
  ): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  remembered(agent: Agent, callId: string): boolean {
    const tracked = this.#tracked.get(callKey(agent.session.id, callId));
    return tracked?.agent === agent && tracked.remembered === true;
  }

  willPrompt(agent: Agent, callId: string): boolean {
    const tracked = this.#tracked.get(callKey(agent.session.id, callId));
    return (
      tracked !== undefined &&
      tracked.agent === agent &&
      (tracked.requireHumanReview === true ||
        tracked.externalDecision === 'each-use' ||
        this.#changesPolicy(tracked) ||
        this.#rules?.match(tracked) === undefined)
    );
  }

  pending(botSlug: string, messageId: string): ToolApprovalNotice | undefined {
    this.cancelInvalid();
    const pending = this.#pending.get(messageId);
    if (
      !pending ||
      !pending.committed ||
      pending.botSlug !== botSlug ||
      pending.deciding ||
      pending.signal?.aborted ||
      Date.parse(pending.notice.expiresAt) <= Date.now()
    )
      return undefined;
    return { ...pending.notice };
  }

  activeMessageIds(): string[] {
    this.cancelInvalid();
    return [...this.#pending.keys()];
  }

  requests(botSlug: string): ToolApprovalNotice[] {
    this.cancelInvalid();
    return [...this.#pending.values()]
      .filter(
        (pending) =>
          pending.botSlug === botSlug &&
          pending.committed &&
          !pending.signal?.aborted &&
          Date.parse(pending.notice.expiresAt) > Date.now(),
      )
      .map((pending) => ({ ...pending.notice }));
  }

  activeSessionIds(): string[] {
    this.cancelInvalid();
    return [...this.#pending.values()].map((pending) => pending.sessionId);
  }

  status(botSlug: string, messageId: string): 'pending' | 'expired' {
    return this.#pending.get(messageId)?.botSlug === botSlug ? 'pending' : 'expired';
  }

  expiresAt(botSlug: string, messageId: string): string | undefined {
    const pending = this.#pending.get(messageId);
    return pending?.botSlug === botSlug ? pending.notice.expiresAt : undefined;
  }

  async decide(
    botSlug: string,
    messageId: string,
    outcome: ToolApprovalDecision['outcome'],
    external?: {
      actor: ToolApprovalActor;
      authorized(): boolean;
      rule?: { kind: ToolApprovalRule['kind']; scopeKey: string; authorized(): boolean };
      onRuleSaved?(rule: ToolApprovalRule): void;
    },
  ): Promise<boolean> {
    const pending = this.#pending.get(messageId);
    if (
      pending === undefined ||
      pending.botSlug !== botSlug ||
      pending.deciding ||
      !pending.committed ||
      Date.parse(pending.notice.expiresAt) <= Date.now()
    )
      return false;
    const eachUse = pending.notice.externalDecision === 'each-use';
    const remember =
      eachUse &&
      outcome === 'allowed-always-exact' &&
      this.#tracked.get(callKey(pending.sessionId, pending.callId))?.rememberable === true;
    if (
      eachUse &&
      (external !== undefined || (!remember && !['allowed-once', 'rejected'].includes(outcome)))
    )
      return false;
    const secretCli = pending.notice.toolName === 'secret_cli';
    if (secretCli && outcome === 'allowed-always-all') return false;
    if (
      external &&
      (pending.notice.externalDecision === 'web-only' ||
        (!['allowed-once', 'rejected'].includes(outcome) &&
          !(
            ((outcome === 'allowed-always-exact' && external.rule?.kind === 'exact') ||
              (outcome === 'allowed-always-all' && external.rule?.kind === 'all-opaque')) &&
            external.rule &&
            external.rule.authorized()
          )) ||
        !external.authorized())
    )
      return false;
    if (pending.signal?.aborted) {
      this.#settle(messageId, 'cancelled');
      return false;
    }
    pending.deciding = true;
    try {
      const tracked = this.#tracked.get(callKey(pending.sessionId, pending.callId));
      if (
        tracked === undefined ||
        tracked.botSlug !== botSlug ||
        inputOf(tracked.execution) !== tracked.input ||
        tracked.execution.name !== tracked.toolName ||
        tracked.execution.callId !== tracked.callId
      )
        return false;
      const owner = this.#ownership.resolve(tracked.sessionId);
      if (
        owner === undefined ||
        owner.botSlug !== tracked.botSlug ||
        this.#scope(tracked.agent, owner) !== tracked.scopeKey
      ) {
        this.#settle(messageId, 'unavailable');
        return false;
      }
      const kind: ToolApprovalRule['kind'] | undefined = eachUse
        ? undefined
        : outcome === 'allowed-always-exact'
          ? secretCli
            ? 'secret-cli'
            : 'exact'
          : outcome === 'allowed-always-all'
            ? 'all-opaque'
            : undefined;
      const externalKind = kind === 'secret-cli' ? 'exact' : kind;
      const ruleInput =
        kind === 'secret-cli'
          ? secretCliKind(tracked.input)
          : kind === 'exact'
            ? tracked.input
            : '';
      if (ruleInput === undefined) return false;
      if (
        external &&
        kind &&
        (!external.rule ||
          external.rule.kind !== externalKind ||
          external.rule.scopeKey !== tracked.scopeKey ||
          !external.rule.authorized())
      )
        return false;
      const rule =
        kind === undefined
          ? undefined
          : this.#rules?.createPending({
              botSlug,
              role: tracked.role,
              scopeKey: tracked.scopeKey,
              kind,
              toolName: kind === 'all-opaque' ? '*' : tracked.toolName,
              input: ruleInput,
              ...(external ? { externalCreator: external.actor } : {}),
            });
      if (kind !== undefined && rule === undefined) return false;
      const decision: ChannelMessage = {
        id: randomUUID(),
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body:
          outcome === 'rejected'
            ? '已拒绝这一次工具调用'
            : remember
              ? '已批准并记住这个服务'
              : kind === undefined
                ? '已批准这一次工具调用'
                : kind === 'secret-cli'
                  ? '已总是允许此类命令并批准这一次调用'
                  : '已保存自动批准规则并批准这一次调用',
        replyTo: messageId,
        toolApprovalDecision: {
          requestMessageId: messageId,
          outcome,
          ...(external ? { actor: external.actor } : {}),
        },
      };
      if ((await this.#channels.appendMessage(pending.channelId, decision)) === undefined) {
        if (rule !== undefined) this.#rules?.revoke(botSlug, rule.id);
        return false;
      }
      const currentOwner = this.#ownership.resolve(tracked.sessionId);
      if (
        this.#pending.get(messageId) !== pending ||
        pending.signal?.aborted ||
        Date.parse(pending.notice.expiresAt) <= Date.now() ||
        this.#tracked.get(callKey(pending.sessionId, pending.callId)) !== tracked ||
        !currentOwner ||
        currentOwner.botSlug !== tracked.botSlug ||
        this.#scope(tracked.agent, currentOwner) !== tracked.scopeKey ||
        inputOf(tracked.execution) !== tracked.input ||
        tracked.execution.name !== tracked.toolName ||
        tracked.execution.callId !== tracked.callId ||
        (external && (!external.authorized() || (kind && !external.rule?.authorized())))
      ) {
        if (rule) this.#rules?.revoke(botSlug, rule.id);
        this.#settle(messageId, 'unavailable');
        return false;
      }
      if (rule !== undefined) this.#rules?.activate(botSlug, rule.id);
      if (rule !== undefined) external?.onRuleSaved?.(rule);
      if (external && outcome !== 'rejected')
        tracked.authorized = () =>
          external.authorized() && (!kind || external.rule?.authorized() === true);
      if (remember) tracked.remembered = true;
      if (tracked.requireHumanReview && outcome === 'allowed-once' && external === undefined)
        tracked.humanReviewed = true;
      this.#settle(messageId, outcome === 'rejected' ? 'rejected' : 'allowed-once');
      if (outcome !== 'rejected') await this.#resume(tracked.sessionId);
      return true;
    } finally {
      pending.deciding = false;
    }
  }

  close(): void {
    for (const id of this.#pending.keys()) this.#settle(id, 'cancelled');
    this.#tracked.clear();
    this.#reviewRejections.clear();
    this.#breakers.clear();
    this.#overrides.clear();
    this.#overridden.clear();
  }

  autoApprovalPaused(sessionId: string): boolean {
    return this.#breakers.get(sessionId)?.paused === true;
  }

  async overrideRejection(
    channelId: string,
    recordMessageId: string,
  ): Promise<AutoRejectionOverrideResult> {
    const record = this.#channels.message(channelId, recordMessageId)?.toolAutoApproval;
    if (record === undefined || record.outcome !== 'rejected')
      return { ok: false, code: 'not-rejected' };
    const recordKey = channelId + ':' + recordMessageId;
    if (this.#overridden.has(recordKey)) return { ok: false, code: 'already-overridden' };
    this.#overridden.add(recordKey);
    const message: ChannelMessage = {
      id: randomUUID(),
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: '已允许这一次被自动拒绝的 ' + record.toolName + ' 调用',
      replyTo: recordMessageId,
      toolAutoApprovalOverride: {
        recordMessageId,
        botSlug: record.botSlug,
        sessionId: record.sessionId,
        toolName: record.toolName,
      },
    };
    let appended: ChannelMessage | undefined;
    try {
      appended = await this.#channels.appendMessage(channelId, message);
    } catch {
      appended = undefined;
    }
    if (appended === undefined) {
      this.#overridden.delete(recordKey);
      return { ok: false, code: 'unavailable' };
    }
    bounded(this.#overridden, 1024);
    this.#overrides.add(overrideKey(record));
    bounded(this.#overrides, 256);
    await this.#resume(record.sessionId);
    return { ok: true, message: appended };
  }

  async #trip(
    tracked: TrackedCall,
    template: string,
    channelId: string,
    allowed: boolean,
  ): Promise<void> {
    const breaker = this.#breakers.get(tracked.sessionId) ?? {
      botSlug: tracked.botSlug,
      channelId,
      template,
      consecutive: 0,
      total: 0,
      paused: false,
    };
    breaker.channelId = channelId;
    breaker.template = template;
    if (allowed) {
      breaker.consecutive = 0;
    } else {
      breaker.consecutive += 1;
      breaker.total += 1;
    }
    this.#breakers.delete(tracked.sessionId);
    this.#breakers.set(tracked.sessionId, breaker);
    if (this.#breakers.size > 1024) this.#breakers.delete(this.#breakers.keys().next().value!);
    const reason =
      breaker.consecutive >= AUTO_APPROVAL_CONSECUTIVE_REJECTIONS
        ? 'consecutive'
        : breaker.total >= AUTO_APPROVAL_SESSION_REJECTIONS
          ? 'session'
          : undefined;
    if (reason === undefined || breaker.paused) return;
    breaker.paused = true;
    await this.#pauseNotice(tracked.sessionId, breaker, 'paused', reason);
  }

  async #resume(sessionId: string): Promise<void> {
    const breaker = this.#breakers.get(sessionId);
    if (breaker?.paused !== true) return;
    this.#breakers.delete(sessionId);
    await this.#pauseNotice(sessionId, breaker, 'resumed');
  }

  async #pauseNotice(
    sessionId: string,
    breaker: Breaker,
    state: 'paused' | 'resumed',
    reason?: 'consecutive' | 'session',
  ): Promise<void> {
    const body =
      state === 'resumed'
        ? 'Auto approval resumed for this Session.'
        : reason === 'consecutive'
          ? 'Auto approval paused for this Session after ' +
            AUTO_APPROVAL_CONSECUTIVE_REJECTIONS +
            ' rejections in a row. Every request posts a card until you approve one.'
          : 'Auto approval paused for this Session after ' +
            AUTO_APPROVAL_SESSION_REJECTIONS +
            ' rejections. Every request posts a card until you approve one.';
    try {
      await this.#channels.appendMessage(breaker.channelId, {
        id: randomUUID(),
        at: new Date().toISOString(),
        author: { kind: 'system' },
        body,
        toolAutoApprovalPause: {
          botSlug: breaker.botSlug,
          sessionId,
          template: breaker.template,
          state,
          ...(reason === undefined ? {} : { reason }),
        },
      });
    } catch {
      this.#attention?.warn('auto-approval-pause-notice-failed');
    }
  }

  #changesPolicy(tracked: TrackedCall): boolean {
    const inUse = this.#autoApproval?.templateInUse;
    return changesApprovalPolicy(
      tracked.toolName + ' ' + tracked.input,
      inUse === undefined ? undefined : (name) => inUse(name),
    );
  }

  takeReviewRejection(sessionId: string, callId: string): string | undefined {
    const key = callKey(sessionId, callId);
    const reason = this.#reviewRejections.get(key);
    this.#reviewRejections.delete(key);
    return reason;
  }

  async #review(
    tracked: TrackedCall,
    template: { name: string; text: string },
    channelId: string,
    signal: AbortSignal | undefined,
  ): Promise<'allowed-once' | 'rejected' | undefined> {
    const auto = this.#autoApproval;
    if (auto === undefined) return undefined;
    const started = Date.now();
    let model: string | undefined;
    let reviewSession: string | undefined;
    const log = (outcome: ApprovalReview['outcome'], fallback?: string, detail?: string) => {
      try {
        auto.log({
          botSlug: tracked.botSlug,
          template: template.name,
          toolName: tracked.toolName,
          outcome,
          latencyMs: Date.now() - started,
          ...(model === undefined ? {} : { model }),
          ...(reviewSession === undefined ? {} : { reviewSession }),
          ...(fallback === undefined ? {} : { fallback }),
          ...(detail === undefined ? {} : { detail }),
        });
      } catch {
        this.#attention?.warn('approval-review-log-failed');
      }
    };
    let review: ApprovalReviewResult;
    try {
      review = await auto.review({
        botSlug: tracked.botSlug,
        template,
        call: {
          toolName: tracked.toolName,
          input: reviewerCallInput(tracked.toolName, tracked.input),
          cwd: tracked.cwd,
          role: tracked.role,
          channelId,
          ...(tracked.device === undefined
            ? {}
            : { authorization: { device: tracked.device, sessionId: tracked.sessionId } }),
        },
        excerpt: approvalSessionExcerpt(tracked.agent.session.snapshotEvents(), tracked.callId),
        signal: signal ?? new AbortController().signal,
      });
    } catch (error) {
      const failure = error as
        | { code?: unknown; detail?: unknown; model?: unknown; sessionId?: unknown }
        | undefined;
      const code = typeof failure?.code === 'string' ? failure.code : 'review-failed';
      if (typeof failure?.model === 'string') model = failure.model;
      if (typeof failure?.sessionId === 'string') reviewSession = failure.sessionId;
      log('ask-human', code, typeof failure?.detail === 'string' ? failure.detail : undefined);
      return undefined;
    }
    model = review.model;
    reviewSession = review.sessionId;
    if (signal?.aborted) {
      log('ask-human', 'cancelled');
      return undefined;
    }
    if (review.outcome === 'ask-human') {
      log('ask-human');
      return undefined;
    }
    const allowed = review.outcome === 'allow';
    const key = callKey(tracked.sessionId, tracked.callId);
    if (this.#tracked.get(key) !== tracked) {
      log(review.outcome, 'call-changed');
      return undefined;
    }
    const record: ChannelMessage = {
      id: randomUUID(),
      at: new Date().toISOString(),
      author: { kind: 'system' },
      body:
        (allowed ? 'Auto-approved by ' : 'Auto-rejected by ') +
        template.name +
        ': ' +
        review.reason,
      toolAutoApproval: {
        botSlug: tracked.botSlug,
        sessionId: tracked.sessionId,
        callId: tracked.callId,
        toolName: tracked.toolName,
        input: reviewerCallInput(tracked.toolName, tracked.input),
        template: template.name,
        outcome: allowed ? 'allowed' : 'rejected',
        reason: review.reason,
      },
    };
    try {
      if ((await this.#channels.appendMessage(channelId, record)) === undefined) {
        log(review.outcome, 'record-unavailable');
        return undefined;
      }
    } catch {
      log(review.outcome, 'record-failed');
      return undefined;
    }
    log(review.outcome);
    await this.#trip(tracked, template.name, channelId, allowed);
    if (!allowed) {
      if (this.#reviewRejections.size >= 256)
        this.#reviewRejections.delete(this.#reviewRejections.keys().next().value!);
      this.#reviewRejections.set(key, review.reason);
    }
    return allowed ? 'allowed-once' : 'rejected';
  }

  rule(botSlug: string, ruleId: string): ToolApprovalRule | undefined {
    return this.#rules?.list(botSlug).find((rule) => rule.id === ruleId);
  }

  ruleScope(
    botSlug: string,
    messageId: string,
  ):
    | {
        scopeKey: string;
        role: 'orchestrator' | 'assignment';
        cwd: string;
        toolName: string;
        input: string;
      }
    | undefined {
    const notice = this.pending(botSlug, messageId);
    if (!notice || notice.externalDecision === 'web-only' || notice.externalDecision === 'each-use')
      return;
    const tracked = this.#tracked.get(callKey(notice.sessionId, notice.callId));
    if (!tracked || this.validAfterDecision(tracked.agent, tracked.callId) !== true) return;
    return {
      scopeKey: tracked.scopeKey,
      role: tracked.role,
      cwd: tracked.cwd,
      toolName: tracked.toolName,
      input: tracked.input,
    };
  }

  #publishNotice(pending: Pending, status: 'pending' | ApprovalOutcome): void {
    for (const listener of this.#listeners) {
      try {
        listener({ ...pending.notice }, status);
      } catch {
        this.#attention?.warn('tool-approval-notice-publication-failed');
      }
    }
  }

  #publishAttention(slug: string): void {
    if (this.#attention === undefined) return;
    const count = [...this.#pending.values()].filter(
      (pending) => pending.botSlug === slug && pending.committed,
    ).length;
    try {
      this.#attention.changed(slug, count);
    } catch {
      this.#attention.warn('tool-approval-attention-publication-failed');
    }
  }

  #settle(messageId: string, outcome: ApprovalOutcome): void {
    const pending = this.#pending.get(messageId);
    if (pending === undefined) return;
    this.#pending.delete(messageId);
    clearTimeout(pending.timer);
    if (pending.committed) this.#publishNotice(pending, outcome);
    if (pending.committed) this.#publishAttention(pending.botSlug);
    pending.signal?.removeEventListener('abort', pending.abort);
    pending.resolve(outcome);
  }
}
