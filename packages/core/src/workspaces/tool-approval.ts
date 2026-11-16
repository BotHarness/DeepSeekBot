import type { ApprovalAuthority, ApprovalDecider } from '../team/approval-contract.js';
import { OWNER_HUMAN_CONTEXT, type HumanContext } from '../humans/context.js';
import type { Context } from '@deepseek-ai/cordis';
import type { ToolApprovalActor } from './tool-approval-actor.js';
export type { ToolApprovalActor } from './tool-approval-actor.js';
import { createHash, randomUUID } from 'node:crypto';

import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import type { ApprovalOutcome, ApprovalService } from '@deepseek-ai/dsh-user-approval';

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
  type ApprovalExcerptLimits,
  type ApprovalReview,
  type ApprovalReviewRequest,
  type ApprovalReviewResult,
} from './approval-reviewer.js';
import { requiresHumanDecision } from './approval-templates.js';
import { decideToolApproval, toolEffects, type ToolEffects } from './tool-effects.js';

export interface BotCreatePreview {
  memoryFolder: string;
  defaultLocation: boolean;
  avatar?: string;
  avatarError?: string;
}

export type ToolApprovalReview =
  | { kind: 'template-unavailable'; reason: string }
  | { kind: 'review'; template: string; version: string; reason: string; fallback?: string };

export interface ToolApprovalRequestCard {
  effects?: ToolEffects;
  approvalReview?: ToolApprovalReview;
  opaque?: boolean;
  decidedBy?: ApprovalDecider;
  sessionId: string;
  callId: string;
  toolName: string;
  role: 'orchestrator' | 'assignment';
  cwd: string;
  input: string;
  externalDecision?: 'operation' | 'web-only' | 'each-use';
  botCreatePreview?: BotCreatePreview;
  allowAlways?: boolean;
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
  decidedBy?: ApprovalDecider;
  outcome:
    | 'allowed-once'
    | 'allowed-always-tool'
    | 'allowed-always-exact'
    | 'allowed-always-all'
    | 'rejected';
}

export interface ToolAutoApproval {
  template(botSlug: string): { name: string; text: string } | undefined;
  templateInUse?(template: string): boolean;
  review(request: ApprovalReviewRequest): Promise<ApprovalReviewResult>;
  excerptLimits?(botSlug: string): ApprovalExcerptLimits;
  log(entry: {
    botSlug: string;
    template: string;
    templateVersion?: string;
    toolName: string;
    outcome: ApprovalReview['outcome'];
    latencyMs: number;
    model?: string;
    reviewSession?: string;
    fallback?: string;
  }): void;
}

type TrackedCall = ToolApprovalRequestCard & {
  botSlug: string;
  agent: Agent;
  scopeKey: string;
  automatic?: boolean;
  requireExplicitApproval?: boolean;
  humanReviewed?: boolean;
  reviewerApproved?: boolean;
  authorizationScope?: () => string;
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

const STOPPED_REQUEST_MEMORY = 500;

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
  readonly #stopped = new Set<string>();
  readonly #listeners = new Set<
    (notice: ToolApprovalNotice, status: 'pending' | ApprovalOutcome) => void
  >();
  readonly #attention:
    | { changed(slug: string, count: number): void; warn(message: string): void }
    | undefined;
  readonly #autoApproval: ToolAutoApproval | undefined;
  readonly #fullAccess: ((sessionId: string) => boolean) | undefined;
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
    fullAccess?: (sessionId: string) => boolean,
    private readonly approvals?: ApprovalAuthority,
  ) {
    this.#fullAccess = fullAccess;
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
    options?: { requireExplicitApproval?: boolean; authorizationScope?: () => string },
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
    const effects = toolEffects(execution.name, execution.arguments);
    const tracked: TrackedCall = {
      agent,
      botSlug: owner.botSlug,
      sessionId: agent.session.id,
      callId: execution.callId,
      toolName: execution.name,
      role: owner.rootRole,
      cwd,
      input,
      scopeKey,
      ...(options?.authorizationScope ? { authorizationScope: options.authorizationScope } : {}),
      execution,
      ...(effects === undefined ? {} : { effects }),
      externalDecision,
      ...(options?.requireExplicitApproval ? { requireExplicitApproval: true } : {}),
      ...(rememberable && !options?.requireExplicitApproval ? { rememberable } : {}),
      ...(device === undefined ? {} : { device }),
      ...(botCreatePreview === undefined ? {} : { botCreatePreview }),
    };
    tracked.scopeKey = this.#currentScope(tracked, owner)!;
    this.#tracked.set(key, tracked);
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
      this.#currentScope(tracked, owner) !== tracked.scopeKey
    )
      return 'unavailable';
    const policy = this.#decisionPolicy(tracked, {
      fullAccess: this.#fullAccess?.(tracked.sessionId) === true,
    });
    if (policy.path === 'full-access') {
      tracked.authorized = () => this.#fullAccess?.(tracked.sessionId) === true;
      return 'allowed-once';
    }
    const standing =
      tracked.externalDecision === 'each-use' ? undefined : this.#matchingRule(tracked);
    if (
      standing !== undefined &&
      this.#decisionPolicy(tracked, {
        standingRule: this.#explicitRuleRequired(tracked) ? 'explicit' : 'ordinary',
      }).path === 'standing-rule'
    ) {
      tracked.automatic = true;
      this.#rules?.recordAutoApproval(standing.botSlug, standing.id);
      return 'allowed-once';
    }
    const origin =
      tracked.role === 'orchestrator' ? this.#askChannel?.(tracked.sessionId) : undefined;
    if (tracked.role === 'orchestrator' && this.#askChannel !== undefined && origin === undefined)
      return 'unavailable';
    const originChannel = origin === undefined ? undefined : this.#channels.get(origin);
    const channel =
      origin === undefined
        ? (this.#channels.get(dmChannelId(tracked.botSlug)) ??
          this.#channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, tracked.botSlug))
        : originChannel;
    if (channel === undefined) return 'unavailable';
    if (
      channel.type === 'group'
        ? !channel.members.includes(tracked.botSlug)
        : channel.botSlug !== tracked.botSlug
    )
      return 'unavailable';
    const channelId = channel.id;
    if (
      this.#decisionPolicy(tracked, { reviewer: true }).path === 'reviewer' &&
      this.#overrides.delete(overrideKey(tracked))
    ) {
      tracked.humanReviewed = true;
      return 'allowed-once';
    }
    let template: { name: string; text: string } | undefined;
    try {
      template =
        this.#decisionPolicy(tracked, { reviewer: true }).path === 'reviewer'
          ? this.#autoApproval?.template(tracked.botSlug)
          : undefined;
    } catch {
      tracked.approvalReview = {
        kind: 'template-unavailable',
        reason: 'The selected approval template could not be read.',
      };
      try {
        this.#autoApproval?.log({
          botSlug: tracked.botSlug,
          template: '',
          toolName: tracked.toolName,
          outcome: 'ask-human',
          latencyMs: 0,
          fallback: 'selected-template-unavailable',
        });
      } catch {}
    }
    if (template !== undefined) {
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
        ...(tracked.effects === undefined ? {} : { effects: tracked.effects }),
        ...(tracked.approvalReview === undefined ? {} : { approvalReview: tracked.approvalReview }),
        externalDecision: tracked.externalDecision ?? 'operation',
        allowAlways: policy.rememberable,
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
      const committed = await this.#channels.appendMessage(OWNER_HUMAN_CONTEXT, channelId, message);
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
        this.#currentScope(tracked, owner) === tracked.scopeKey &&
        tracked.execution.name === tracked.toolName &&
        tracked.execution.callId === tracked.callId &&
        name === tracked.toolName &&
        inputOf({ ...tracked.execution, arguments: args }) === tracked.input &&
        tracked.authorized?.() !== false &&
        (!tracked.automatic || this.#matchingRule(tracked) !== undefined)
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

  approvedExecutionGuard(
    agent: Agent,
    callId: string,
  ): ((name: string, args: unknown) => boolean) | undefined {
    const tracked = this.#tracked.get(callKey(agent.session.id, callId));
    if (
      !tracked ||
      (!tracked.automatic &&
        !tracked.humanReviewed &&
        !(tracked.reviewerApproved && !this.#explicitRuleRequired(tracked)))
    )
      return;
    return this.executionGuard(agent, callId);
  }

  usesStandingRule(agent: Agent, callId: string): boolean {
    const tracked = this.#tracked.get(callKey(agent.session.id, callId));
    return tracked?.agent === agent && tracked.automatic === true;
  }

  cancelChannel(channelId: string): void {
    for (const [messageId, pending] of this.#pending)
      if (pending.channelId === channelId) this.#settle(messageId, 'cancelled');
  }

  cancelInvalid(): void {
    for (const [messageId, pending] of this.#pending) {
      const tracked = this.#tracked.get(callKey(pending.sessionId, pending.callId));
      const owner = tracked === undefined ? undefined : this.#ownership.resolve(tracked.sessionId);
      if (
        tracked === undefined ||
        owner === undefined ||
        owner.botSlug !== tracked.botSlug ||
        this.#currentScope(tracked, owner) !== tracked.scopeKey
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
      (tracked.externalDecision === 'each-use' || this.#matchingRule(tracked) === undefined)
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

  status(botSlug: string, messageId: string): 'pending' | 'expired' | 'stopped' {
    if (this.#pending.get(messageId)?.botSlug === botSlug) return 'pending';
    return this.#stopped.has(messageId) ? 'stopped' : 'expired';
  }

  closeSessions(sessionIds: readonly string[]): string[] {
    const ids = new Set(sessionIds);
    const closed: string[] = [];
    for (const [messageId, pending] of this.#pending) {
      if (!ids.has(pending.sessionId)) continue;
      this.#stopped.add(messageId);
      while (this.#stopped.size > STOPPED_REQUEST_MEMORY) {
        const oldest = this.#stopped.values().next().value;
        if (oldest === undefined) break;
        this.#stopped.delete(oldest);
      }
      closed.push(messageId);
      this.#settle(messageId, 'cancelled');
    }
    return closed;
  }

  expiresAt(botSlug: string, messageId: string): string | undefined {
    const pending = this.#pending.get(messageId);
    return pending?.botSlug === botSlug ? pending.notice.expiresAt : undefined;
  }

  async decide(
    human: HumanContext,
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
    this.approvals?.requireRequest(human, pending.channelId, messageId);
    const eachUse = pending.notice.externalDecision === 'each-use';
    const remember =
      eachUse &&
      (outcome === 'allowed-always-exact' || outcome === 'allowed-always-tool') &&
      this.#tracked.get(callKey(pending.sessionId, pending.callId))?.rememberable === true;
    if (
      eachUse &&
      (external !== undefined || (!remember && !['allowed-once', 'rejected'].includes(outcome)))
    )
      return false;
    if (
      outcome === 'allowed-always-tool' &&
      (external !== undefined || pending.notice.allowAlways !== true)
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
        this.#currentScope(tracked, owner) !== tracked.scopeKey
      ) {
        this.#settle(messageId, 'unavailable');
        return false;
      }
      if (this.#explicitRuleRequired(tracked) && outcome === 'allowed-always-all') return false;
      const kind: ToolApprovalRule['kind'] | undefined = eachUse
        ? undefined
        : outcome === 'allowed-always-tool'
          ? secretCli
            ? 'secret-cli'
            : 'tool'
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
                : kind === 'tool'
                  ? '已始终允许此工具并批准这一次调用'
                  : kind === 'secret-cli'
                    ? '已总是允许此类命令并批准这一次调用'
                    : '已保存自动批准规则并批准这一次调用',
        replyTo: messageId,
        toolApprovalDecision: {
          requestMessageId: messageId,
          decidedBy: this.approvals?.decider(human) ?? { humanId: human.humanId },
          outcome,
          ...(external ? { actor: external.actor } : {}),
        },
      };
      if (
        (await this.#channels.appendMessage(human, pending.channelId, decision, undefined, () => {
          this.approvals?.requireRequest(human, pending.channelId, messageId);
          return true;
        })) === undefined
      ) {
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
        this.#currentScope(tracked, currentOwner) !== tracked.scopeKey ||
        inputOf(tracked.execution) !== tracked.input ||
        tracked.execution.name !== tracked.toolName ||
        tracked.execution.callId !== tracked.callId ||
        (external && (!external.authorized() || (kind && !external.rule?.authorized())))
      ) {
        if (rule) this.#rules?.revoke(botSlug, rule.id);
        this.#settle(messageId, 'unavailable');
        return false;
      }
      if (rule !== undefined) {
        this.#rules?.activate(botSlug, rule.id);
        tracked.automatic = true;
      }
      if (rule !== undefined) external?.onRuleSaved?.(rule);
      if (external && outcome !== 'rejected')
        tracked.authorized = () =>
          external.authorized() && (!kind || external.rule?.authorized() === true);
      if (!external && this.approvals && outcome !== 'rejected') {
        tracked.authorized = () => {
          try {
            this.approvals?.requireRequest(human, pending.channelId, messageId);
            return true;
          } catch {
            return false;
          }
        };
      }
      if (remember) tracked.remembered = true;
      if (outcome !== 'rejected') tracked.humanReviewed = true;
      this.#settle(messageId, outcome === 'rejected' ? 'rejected' : 'allowed-once');
      return true;
    } finally {
      pending.deciding = false;
    }
  }

  close(): void {
    for (const id of this.#pending.keys()) this.#settle(id, 'cancelled');
    this.#tracked.clear();
    this.#overrides.clear();
    this.#overridden.clear();
  }

  autoApprovalPaused(_sessionId: string): boolean {
    return false;
  }

  async overrideRejection(
    human: HumanContext,
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
      appended = await this.#channels.appendMessage(human, channelId, message);
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
    return { ok: true, message: appended };
  }

  #changesPolicy(tracked: TrackedCall): boolean {
    const inUse = this.#autoApproval?.templateInUse;
    return requiresHumanDecision(
      tracked.toolName + ' ' + tracked.input,
      inUse === undefined ? undefined : (name) => inUse(name),
    );
  }

  #currentScope(tracked: TrackedCall, owner: SessionOwnershipRecord): string | undefined {
    const scope = this.#scope(tracked.agent, owner);
    if (scope === undefined) return;
    if (tracked.authorizationScope)
      return JSON.stringify([scope, tracked.device, tracked.authorizationScope()]);
    return this.#explicitRuleRequired(tracked)
      ? JSON.stringify([scope, 'explicit-approval'])
      : scope;
  }

  #decisionPolicy(
    tracked: TrackedCall,
    options: {
      fullAccess?: boolean;
      standingRule?: 'none' | 'ordinary' | 'explicit';
      reviewer?: boolean;
    } = {},
  ) {
    return decideToolApproval(tracked.effects, {
      stage: 'request',
      legacyProtected: this.#changesPolicy(tracked),
      explicitApproval: tracked.requireExplicitApproval === true,
      eachUse: tracked.externalDecision === 'each-use',
      device: tracked.device !== undefined,
      fullAccess: options.fullAccess === true,
      standingRule: options.standingRule ?? 'none',
      reviewer: options.reviewer === true,
      rememberable: tracked.rememberable === true,
    });
  }

  #explicitRuleRequired(tracked: TrackedCall): boolean {
    return this.#decisionPolicy(tracked).explicitRule;
  }

  #matchingRule(tracked: TrackedCall): ToolApprovalRule | undefined {
    return this.#rules?.match({ ...tracked, explicitOnly: this.#explicitRuleRequired(tracked) });
  }

  takeReviewRejection(_sessionId: string, _callId: string): string | undefined {
    return undefined;
  }

  async #review(
    tracked: TrackedCall,
    template: { name: string; text: string },
    channelId: string,
    signal: AbortSignal | undefined,
  ): Promise<'allowed-once' | undefined> {
    const auto = this.#autoApproval;
    if (auto === undefined) return undefined;
    template = { ...template };
    const templateVersion = createHash('sha256').update(template.text).digest('hex');
    tracked.approvalReview = {
      kind: 'review',
      template: template.name,
      version: templateVersion,
      reason: 'Automatic review unavailable.',
    };
    const started = Date.now();
    let model: string | undefined;
    let reviewSession: string | undefined;
    const log = (outcome: ApprovalReview['outcome'], fallback?: string) => {
      try {
        auto.log({
          botSlug: tracked.botSlug,
          template: template.name,
          templateVersion,
          toolName: tracked.toolName,
          outcome,
          latencyMs: Date.now() - started,
          ...(model === undefined ? {} : { model }),
          ...(reviewSession === undefined ? {} : { reviewSession }),
          ...(fallback === undefined ? {} : { fallback }),
        });
      } catch {
        try {
          this.#attention?.warn('approval-review-log-failed');
        } catch {}
      }
    };
    const recordReview = async (
      outcome: 'allowed' | 'ask-human',
      reason: string,
    ): Promise<boolean> => {
      const key = callKey(tracked.sessionId, tracked.callId);
      if (signal?.aborted || this.#tracked.get(key) !== tracked) return false;
      const record: ChannelMessage = {
        id: randomUUID(),
        at: new Date().toISOString(),
        author: { kind: 'system' },
        body:
          (outcome === 'allowed' ? 'Auto-approved by ' : 'Sent to Human by ') +
          template.name +
          ': ' +
          reason,
        toolAutoApproval: {
          botSlug: tracked.botSlug,
          sessionId: tracked.sessionId,
          callId: tracked.callId,
          toolName: tracked.toolName,
          input: reviewerCallInput(tracked.toolName, tracked.input),
          template: template.name,
          templateVersion,
          outcome,
          reason,
        },
      };
      try {
        const appended = await this.#channels.appendMessage(
          OWNER_HUMAN_CONTEXT,
          channelId,
          record,
          undefined,
          () => !signal?.aborted && this.#tracked.get(key) === tracked,
        );
        return appended !== undefined && !signal?.aborted && this.#tracked.get(key) === tracked;
      } catch {
        return false;
      }
    };
    let review: ApprovalReviewResult;
    try {
      review = await auto.review({
        botSlug: tracked.botSlug,
        template: { ...template, version: templateVersion },
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
        excerpt: approvalSessionExcerpt(
          tracked.agent.session.snapshotEvents(),
          tracked.callId,
          auto.excerptLimits?.(tracked.botSlug),
        ),
        signal: signal ?? new AbortController().signal,
      });
    } catch (error) {
      const failure = error as
        | { code?: unknown; detail?: unknown; model?: unknown; sessionId?: unknown }
        | undefined;
      const code =
        typeof failure?.code === 'string' &&
        [
          'no-model',
          'model-unavailable',
          'settings-invalid',
          'llm-unavailable',
          'timeout',
          'model-error',
          'unparseable',
        ].includes(failure.code)
          ? failure.code
          : 'review-failed';
      tracked.approvalReview = {
        kind: 'review',
        template: template.name,
        version: templateVersion,
        reason: 'Automatic review unavailable (' + code + ').',
        fallback: code,
      };
      if (typeof failure?.model === 'string') model = failure.model;
      if (typeof failure?.sessionId === 'string') reviewSession = failure.sessionId;
      await recordReview('ask-human', tracked.approvalReview.reason);
      log('ask-human', code);
      return undefined;
    }
    model = review.model;
    reviewSession = review.sessionId;
    if (signal?.aborted) {
      log('ask-human', 'cancelled');
      return undefined;
    }
    if (review.outcome !== 'allow') {
      tracked.approvalReview = {
        kind: 'review',
        template: template.name,
        version: templateVersion,
        reason: review.reason,
      };
      await recordReview('ask-human', review.reason);
      log('ask-human');
      return undefined;
    }
    if (!(await recordReview('allowed', review.reason))) {
      log(review.outcome, 'record-unavailable');
      return undefined;
    }
    log(review.outcome);
    tracked.reviewerApproved = true;
    return 'allowed-once';
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
        allOpaque: boolean;
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
      allOpaque: !this.#explicitRuleRequired(tracked),
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

export async function requestRequiredToolApproval({
  approval,
  channelApproval,
  ownership,
  request,
  forceChannel,
}: {
  approval: Pick<ApprovalService, 'request'>;
  channelApproval: Pick<ChannelToolApproval, 'ask'>;
  ownership: Pick<SessionOwnership, 'resolve'>;
  request: Parameters<ApprovalService['request']>[0];
  forceChannel: boolean;
}): Promise<ApprovalOutcome> {
  const owner = ownership.resolve(request.agent.session.id);
  if (forceChannel && owner !== undefined && owner.parentSessionId === undefined)
    return (await channelApproval.ask(request)) ?? 'unavailable';
  return approval.request(request);
}

export function registerChannelToolApproval(
  ctx: Context,
  approval: Pick<ChannelToolApproval, 'ask'>,
): void {
  ctx.on('approval/request', async (request, next) => (await approval.ask(request)) ?? next(), {
    global: true,
    prepend: true,
  });
}
