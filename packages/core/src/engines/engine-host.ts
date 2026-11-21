import type { TurnTarget } from '@botharness/host-protocol/turn-target';
import type { OrchestratorRunner } from '@botharness/host-protocol/wire';
import {
  engineAccountKey,
  type NamedEngineAccount,
  type RoutingGroupEngineMember,
} from '@botharness/host-protocol/subscription-engine';

import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval';

import { EngineHostAccounts } from './engine-host-accounts.js';
import { EngineSteering, type SteeringInput } from './assignment-steering.js';
import { readEngineAccount, requireSubscription } from './engine-account.js';
import {
  type CodexProcessOptions,
  CodexEngineSession,
  spawnCodexTransport,
} from './codex-engine.js';
import {
  buildEngineContextSeed,
  type EngineContextRecord,
  savedAssignmentRequest,
} from './engine-context.js';
import { type OpenedEngineDshSession, openEngineDshSession } from './engine-dsh-session.js';
import { type EngineGatewayTool, type EngineGrant, engineGatewayResult } from './engine-gateway.js';
import {
  ENGINE_GATEWAY_TOOLS,
  type EngineTurnRequest,
  type EngineTurnOutcome,
  type EngineToolApproval,
  type EngineSessionState,
  type EngineHostOptions,
  type EngineSessionDescription,
} from './engine-host-types.js';
import { EngineTurnLog } from './engine-log.js';
import { executeEngineTurnTool, type TurnScope } from './engine-turn-scope.js';
import {
  ENGINE_DEFINITIONS,
  type EngineChoice,
  type EngineEvent,
  type EngineId,
  type EngineSession,
  type EngineWorkspaceMode,
  EngineLimitError,
  EngineRefusal,
  routingGroupEngineChoice,
} from './engine-session.js';
import {
  createEngineStore,
  type EngineRole,
  type EngineStore,
  engineStorePath,
} from './engine-store.js';

export { engineGatewayResult };

export {
  ENGINE_GATEWAY_TOOLS,
  type EngineTool,
  type EngineTurnRequest,
  type EngineTurnOutcome,
  type EngineToolApproval,
  type EngineToolContext,
  type EngineSessionState,
  type EngineApprovalRequest,
  type EngineHostOptions,
  type EngineSessionDescription,
  type EngineQuotaView,
  type EngineStatusReport,
} from './engine-host-types.js';

interface LiveEngineSession {
  botSlug: string;
  configuration: string;
  choice: EngineChoice;
  workspaceMode: EngineWorkspaceMode;
  engine: EngineSession;
  account: string;
  accountId: string;
  grant: EngineGrant;
  dsh: OpenedEngineDshSession;
  nativeId: string;
  seed: string | undefined;
  rebuilt: boolean;
  turn: TurnScope | undefined;
  stop: AbortController | undefined;
  closing: boolean;
  approvals: number;
  recover: boolean;
  accountChecked: boolean;
  running: Promise<void>;
  idleTimer?: NodeJS.Timeout | undefined;
}

const ORCHESTRATOR_IDLE_MS = 30_000;

function choiceKey(engine: EngineId | undefined, choice: EngineChoice): string | undefined {
  return engine === undefined
    ? undefined
    : JSON.stringify([engineAccountKey(engine, choice.accountId), choice.model, choice.effort]);
}

function sessionAccount(engine: EngineId, accountId: string): { accountId?: string } {
  return engineAccountKey(engine) === accountId ? {} : { accountId };
}

function workspaceModeFor(request: EngineTurnRequest): EngineWorkspaceMode {
  return (
    request.workspaceMode?.() ?? (request.role === 'assignment' ? 'read-only' : 'workspace-write')
  );
}

function sessionKey(
  choice: string | undefined,
  cwd: string | undefined,
  mode: EngineWorkspaceMode,
): string {
  return JSON.stringify([choice, cwd, mode]);
}

export class EngineHost {
  readonly store: EngineStore;
  readonly #options: EngineHostOptions;
  readonly #live = new Map<string, LiveEngineSession>();
  readonly #opening = new Map<string, Promise<LiveEngineSession>>();
  readonly #openingConfiguration = new Map<string, string>();
  readonly #roles = new Map<string, EngineRole>();
  readonly #assignmentSteering = new Map<string, EngineSteering>();
  readonly #accounts: EngineHostAccounts;
  readonly #openingAccounts = new Map<string, string>();
  readonly #states = new Map<string, EngineSessionDescription>();
  readonly #legacyAccounts = new Map<string, { engine: EngineId; account: string | undefined }>();
  #closed = false;
  readonly #releasing = new Map<string, Promise<void>>();
  readonly #releasingAccounts = new Map<string, string>();
  readonly #cancels = new Map<string, () => void>();

  constructor(options: EngineHostOptions) {
    this.#options = options;
    this.store = createEngineStore(engineStorePath(options.root));
    this.#accounts = new EngineHostAccounts(
      this.store,
      options,
      (id) =>
        [...this.#openingAccounts.values()].includes(id) ||
        [...this.#releasingAccounts.values()].includes(id) ||
        [...this.#live.values()].some((session) => session.accountId === id),
    );
  }

  accounts() {
    return this.#accounts.accounts();
  }
  resolveAccount(engine: EngineId, id?: string): NamedEngineAccount {
    return this.#accounts.resolveAccount(engine, id);
  }
  target(id: string): NamedEngineAccount {
    return this.#accounts.target(id);
  }
  addAccount(engine: EngineId, name: string, revision: number) {
    return this.#accounts.addAccount(engine, name, revision);
  }
  renameAccount(id: string, name: string, revision: number) {
    return this.#accounts.renameAccount(id, name, revision);
  }
  removeAccount(id: string, revision: number) {
    return this.#accounts.removeAccount(id, revision);
  }
  status(target?: string, allowed?: (accountId: string) => boolean) {
    return this.#accounts.status(target, allowed);
  }
  login(engine: EngineId, id?: string) {
    return this.#accounts.login(engine, id);
  }
  submitClaudeCode(id: string, code: string) {
    return this.#accounts.submitClaudeCode(id, code);
  }
  models(engine: EngineId, id?: string) {
    return this.#accounts.models(engine, id);
  }
  validateChoice(engine: EngineId, choice: EngineChoice) {
    return this.#accounts.validateChoice(engine, choice);
  }
  limit(engine: EngineId, id?: string) {
    return this.#accounts.limit(engine, id);
  }
  quota(engine: EngineId, id?: string) {
    return this.#accounts.quota(engine, id);
  }

  engineFor(botSlug: string, role: EngineRole = 'orchestrator'): EngineId | undefined {
    if (!this.#options.local) return undefined;
    return this.store.selection(botSlug, role);
  }

  choiceFor(botSlug: string, role: EngineRole = 'orchestrator'): string | undefined {
    return choiceKey(this.engineFor(botSlug, role), this.store.choice(botSlug, role));
  }

  #directSelection(request: EngineTurnRequest) {
    const role = request.role ?? 'orchestrator';
    return {
      engine: this.engineFor(request.botSlug, role),
      choice: this.store.choice(request.botSlug, role),
    };
  }

  async #routingGroupSelection(request: EngineTurnRequest, target: RoutingGroupEngineMember) {
    this.#requireAccountGrant(request.botSlug, target.engine, target.accountId);
    const groupEffort =
      request.role === 'assignment'
        ? request.groupEffort
        : this.#options.routingGroupEffort?.(request.botSlug);
    const shared = target.reasoningEffort === undefined ? groupEffort : undefined;
    const models =
      shared === undefined
        ? []
        : await this.models(target.engine, target.accountId).catch(() => []);
    return { engine: target.engine, choice: routingGroupEngineChoice(target, shared, models) };
  }

  use(
    botSlug: string,
    role: EngineRole,
    engine: EngineId | undefined,
    options: { fallback?: boolean } & EngineChoice = {},
  ): void {
    if (engine !== undefined && !this.#options.local)
      throw new EngineRefusal(
        'engine-unavailable',
        'Subscription Engines run only on a local Host',
      );
    if (engine !== undefined) this.#requireAccountGrant(botSlug, engine, options.accountId);
    const previous = this.choiceFor(botSlug, role);
    this.store.select(botSlug, role, engine, options);
    if (previous !== this.choiceFor(botSlug, role))
      for (const [id, session] of this.#live)
        if (session.botSlug === botSlug && this.#role(id) === role && session.turn === undefined)
          void this.release(id).catch(() => undefined);
    this.#options.changed?.();
  }

  orchestratorRunner(botSlug: string): OrchestratorRunner | undefined {
    const engine = this.engineFor(botSlug);
    if (engine === undefined) return undefined;
    const account = this.store.account(botSlug, engine) ?? this.#previousAccount(botSlug, engine);
    const model =
      this.store.choice(botSlug, 'orchestrator').model ?? this.store.model(botSlug, engine);
    return {
      engine,
      displayName: ENGINE_DEFINITIONS[engine].displayName,
      ...(account === undefined ? {} : { account }),
      ...(model === undefined ? {} : { model }),
    };
  }

  #previousAccount(botSlug: string, engine: EngineId): string | undefined {
    const cached = this.#legacyAccounts.get(botSlug);
    if (cached?.engine === engine) return cached.account;
    let account: string | undefined;
    for (const id of this.#options.sessionIdsForBot?.(botSlug) ?? []) {
      const session = this.store.nativeSession(id);
      if (session?.engine === engine && session.account !== undefined) {
        account = session.account;
        break;
      }
    }
    this.#legacyAccounts.set(botSlug, { engine, account });
    return account;
  }

  #rememberModel(botSlug: string, engine: EngineId, model: string | undefined): void {
    if (model === undefined || this.store.model(botSlug, engine) === model) return;
    this.store.rememberModel(botSlug, engine, model);
    this.#options.changed?.();
  }

  #rememberAccount(botSlug: string, engine: EngineId, account: string): void {
    if (this.store.account(botSlug, engine) === account) return;
    this.store.rememberAccount(botSlug, engine, account);
    this.#options.changed?.();
  }

  fallsBack(botSlug: string, role: EngineRole = 'orchestrator'): boolean {
    return this.engineFor(botSlug, role) !== undefined && this.store.fallback(botSlug, role);
  }

  runsOnEngine(botSlug: string, role: EngineRole = 'orchestrator'): boolean {
    const engine = this.engineFor(botSlug, role);
    if (engine === undefined) return false;
    const { accountId } = this.store.choice(botSlug, role);
    this.#requireAccountGrant(botSlug, engine, accountId);
    return !(this.fallsBack(botSlug, role) && this.limit(engine, accountId) !== undefined);
  }

  assertAssignmentAccount(botSlug: string, target?: RoutingGroupEngineMember): void {
    const engine = this.#options.local
      ? (target?.engine ?? this.engineFor(botSlug, 'assignment'))
      : undefined;
    if (engine === undefined)
      throw new EngineRefusal(
        'engine-unavailable',
        'This Bot does not run its Assignments on a Subscription Engine',
      );
    const accountId =
      target === undefined ? this.store.choice(botSlug, 'assignment').accountId : target.accountId;
    this.#requireAccountGrant(botSlug, engine, accountId);
    const limited = this.limit(engine, accountId);
    if (limited !== undefined) throw new EngineLimitError(engine, limited.account, limited.until);
  }

  describe(sessionId: string): EngineSessionDescription | undefined {
    const live = this.#states.get(sessionId);
    const stored = live === undefined ? this.store.nativeSession(sessionId) : undefined;
    const base: EngineSessionDescription | undefined =
      live ??
      (stored === undefined
        ? undefined
        : {
            engine: stored.engine,
            ...(stored.account === undefined ? {} : { account: stored.account }),
            ...(stored.accountId === undefined ? {} : { accountId: stored.accountId }),
            state: 'idle',
          });
    if (base === undefined) return undefined;
    const quota = this.quota(base.engine, base.accountId);
    return quota === undefined ? base : { ...base, quota };
  }

  #requireAccountGrant(botSlug: string, engine: EngineId, accountId: string | undefined) {
    const account = this.store.resolveAccount(engine, accountId);
    this.#options.requireAccountGrant?.(botSlug, account.id);
    return account;
  }

  steerAssignment(sessionId: string, text: string): boolean {
    return this.#assignmentSteering.get(sessionId)?.offer(text) ?? false;
  }

  steerOrchestrator(sessionId: string, text: string, requireAccess: () => void) {
    if (this.#role(sessionId) !== 'orchestrator') return false;
    return this.#live.get(sessionId)?.turn?.steer?.(text, requireAccess) ?? false;
  }

  async runTurn(request: EngineTurnRequest): Promise<EngineTurnOutcome> {
    const { sessionId, signal } = request;
    const assignment = request.role === 'assignment';
    if (assignment && this.#assignmentSteering.has(sessionId))
      throw new EngineRefusal('engine-unavailable', 'This engine Assignment is already running');
    const steering = new EngineSteering(() => !signal.aborted && !this.#closed, assignment);
    if (assignment) this.#assignmentSteering.set(sessionId, steering);
    try {
      return await steering.run(
        (updates) => this.#runTurn(request, steering, updates),
        () => {
          if (assignment) this.#assignmentSteering.delete(sessionId);
        },
      );
    } finally {
      if (assignment) await this.release(sessionId);
    }
  }

  async #runTurn(
    request: EngineTurnRequest,
    steering: EngineSteering,
    updates: readonly SteeringInput[],
  ): Promise<EngineTurnOutcome> {
    const role = request.role ?? 'orchestrator';
    const continuation = updates.length > 0;
    this.#roles.set(request.sessionId, role);
    const target = this.#options.local ? request.target : undefined;
    const direct = this.#directSelection(request);
    const selected = target?.engine ?? direct.engine;
    if (selected === undefined)
      throw new EngineRefusal(
        'engine-unavailable',
        role === 'assignment'
          ? 'This Bot does not run its Assignments on a Subscription Engine'
          : 'This Bot does not run on a Subscription Engine',
      );
    if (request.signal.aborted) return {};
    const selectedAccount = this.#requireAccountGrant(
      request.botSlug,
      selected,
      target === undefined ? direct.choice.accountId : target.accountId,
    );
    const limited = this.limit(selected, selectedAccount.id);
    if (limited !== undefined) throw new EngineLimitError(selected, limited.account, limited.until);
    const live = await this.#open(request);
    const engine = live.engine.engine;
    if (engine !== selected || live.accountId !== selectedAccount.id) {
      const opened = this.limit(engine, live.accountId);
      if (opened !== undefined) throw new EngineLimitError(engine, opened.account, opened.until);
    }
    clearTimeout(live.idleTimer);
    live.idleTimer = undefined;
    const accountChecked = live.accountChecked;
    live.accountChecked = false;
    const previous = live.running;
    let finish!: () => void;
    const running = new Promise<void>((resolve) => (finish = resolve));
    live.running = running;
    const current = () => !live.closing && this.#live.get(request.sessionId) === live;
    let broken = false;
    let reopen = false;
    const outcome: EngineTurnOutcome = {};
    try {
      await previous;
      if (!current()) {
        reopen = live.recover && !this.#closed;
        if (!reopen)
          throw new EngineRefusal('engine-unavailable', 'This engine Session was released');
      } else if (!request.signal.aborted) {
        if (!accountChecked)
          live.account = requireSubscription(await live.engine.account(), live.accountId);
        if (!current())
          throw new EngineRefusal('engine-unavailable', 'This engine Session was released');
        if (request.signal.aborted) return outcome;
        let mode: EngineWorkspaceMode;
        try {
          mode = workspaceModeFor(request);
        } catch (error) {
          broken = true;
          throw error;
        }
        if (live.workspaceMode !== mode) return this.#runTurn(request, steering, updates);
        this.#options.requireAccountGrant?.(request.botSlug, live.accountId);
        if (role === 'orchestrator') this.#rememberAccount(request.botSlug, engine, live.account);
        const priorReplies = continuation ? request.priorReplies?.() : undefined;
        const prepared = steering.prepareInput(request.input, updates, priorReplies);
        if (prepared === undefined) return outcome;
        const { input } = prepared;
        const stop = new AbortController();
        live.stop = stop;
        const signal = AbortSignal.any([request.signal, stop.signal]);
        const scope: TurnScope = {
          channelId: request.channelId,
          canUseChannel: request.canUseChannel,
          pendingReplies: new Set(),
          execute: (...args) => {
            observeTarget();
            return request.execute(...args);
          },
          signal,
        };
        live.turn = scope;
        this.#setState(
          request.sessionId,
          {
            engine,
            ...sessionAccount(engine, live.accountId),
            account: live.account,
            state: 'running',
          },
          live.botSlug,
        );
        const log = new EngineTurnLog(live.dsh, engine, live.account, input);
        let previousTarget: Extract<TurnTarget, { kind: 'engine' }> | undefined;
        const observeTarget = () => {
          const model = live.engine.model ?? live.choice.model;
          const effort = live.engine.reasoningEffort ?? live.choice.effort;
          if (
            previousTarget !== undefined &&
            model === previousTarget.model &&
            effort === previousTarget.reasoningEffort
          )
            return;
          const target: TurnTarget = {
            kind: 'engine',
            engine,
            ...(model === undefined ? {} : { model }),
            ...(effort === undefined ? {} : { reasoningEffort: effort }),
          };
          previousTarget = target;
          if (request.observeTurnTarget !== undefined)
            request.observeTurnTarget(log.turn, 0, target);
          else this.#options.observeTurnTarget?.(request.sessionId, log.turn, target);
        };
        if (live.rebuilt) {
          log.rebuilt();
          live.rebuilt = false;
        }
        outcome.turn = log.turn;
        let limitedNow = false;
        scope.context = {
          session: live.dsh.session,
          get assignmentInputRevision() {
            return role === 'assignment' ? steering.inputRevision : undefined;
          },
          priorReplies,
          ask: (approval) =>
            this.#ask(
              live,
              scope,
              log,
              { ...approval, callId: `${request.sessionId}:engine:${randomUUID()}` },
              request.sessionId,
              signal,
            ),
        };
        try {
          observeTarget();
          if (role === 'orchestrator')
            scope.steer = (text, requireAccess) => steering.steer(text, requireAccess);
          const sending = live.engine.send(input, {
            signal,
            verbatimInput: continuation,
            onInputAccepted: () => {
              for (const update of prepared.updates) update.settle?.(true);
            },
            onEvent: (event) => {
              observeTarget();
              log.accept(event);
              if (event.kind === 'text') outcome.text = event.text;
              if (event.kind === 'tool-call') delete outcome.text;
              if (event.kind === 'approval')
                void this.#approve(live, scope, log, event, request.sessionId, signal);
              if (event.kind === 'rate-limit') {
                limitedNow = event.limited;
                this.#accounts.record(engine, live.accountId, live.account, event);
              }
            },
          });
          const steered = await steering.duringTurn({
            sending,
            engine: live.engine,
            signal,
            stop,
            log,
          });
          const end = steered.end;
          if (steered.replacing) await Promise.allSettled(scope.pendingReplies);
          observeTarget();
          if (role === 'orchestrator')
            this.#rememberModel(request.botSlug, engine, live.engine.model);
          try {
            await log.end(end);
            const interruptedForSteer =
              role === 'orchestrator' &&
              steered.replacing &&
              end.status === 'interrupted' &&
              !live.engine.ended;
            broken = live.seed !== undefined && end.status !== 'completed' && !interruptedForSteer;
            if (!broken) {
              this.store.rememberNativeSession(
                request.sessionId,
                engine,
                live.nativeId,
                live.account,
                log.turn,
                sessionAccount(engine, live.accountId).accountId,
              );
              live.seed = undefined;
            }
          } catch (error) {
            broken = true;
            throw error;
          }
          if (steered.failure !== undefined) throw steered.failure.error;
          const last = live.dsh.session.snapshotEvents().at(-1);
          if (last !== undefined) outcome.endSeq = Number(last.seq);
          if (end.status === 'failed') {
            const limit = limitedNow ? this.limit(engine, live.accountId) : undefined;
            if (limit !== undefined)
              throw new EngineLimitError(engine, limit.account, limit.until, true);
            if (!steered.replacing || !current())
              throw new EngineRefusal('engine-failed', end.message);
          }
        } finally {
          if (!current()) steering.discard();
          if (live.turn === scope) live.turn = undefined;
          if (live.stop === stop) live.stop = undefined;
        }
      }
    } finally {
      if (current() && live.running === running)
        this.#setState(
          request.sessionId,
          {
            engine,
            ...sessionAccount(engine, live.accountId),
            account: live.account,
            state: 'idle',
          },
          live.botSlug,
        );
      finish();
      if (current() && live.running === running) {
        const selectionChanged =
          request.target === undefined &&
          live.configuration !==
            sessionKey(this.choiceFor(request.botSlug, role), request.cwd, live.workspaceMode);
        if (broken || live.engine.ended || selectionChanged) {
          if (broken || live.engine.ended) live.recover = true;
          void this.release(request.sessionId);
        } else if (role === 'orchestrator') {
          live.idleTimer = setTimeout(() => {
            if (current() && live.running === running) void this.release(request.sessionId);
          }, this.#options.idleMs ?? ORCHESTRATOR_IDLE_MS).unref();
        }
      }
    }
    if (reopen) return this.#runTurn(request, steering, updates);
    return outcome;
  }

  async #approve(
    live: LiveEngineSession,
    scope: TurnScope,
    log: EngineTurnLog,
    event: Extract<EngineEvent, { kind: 'approval' }>,
    sessionId: string,
    signal: AbortSignal,
  ): Promise<void> {
    const outcome = await this.#ask(
      live,
      scope,
      log,
      {
        callId: event.approvalId,
        logCallId: event.callId,
        toolName: event.tool,
        input: event.input,
        reason: event.summary,
      },
      sessionId,
      signal,
    );
    live.engine.answer(event.approvalId, outcome === 'allowed-once' ? 'accept' : 'decline');
  }

  async #ask(
    live: LiveEngineSession,
    scope: TurnScope,
    log: EngineTurnLog,
    request: EngineToolApproval & { callId: string; logCallId?: string | undefined },
    sessionId: string,
    signal: AbortSignal,
  ): Promise<ApprovalOutcome> {
    const engine = live.engine.engine;
    const logCallId = 'logCallId' in request ? request.logCallId : request.callId;
    const asked = log.approvalAsked({
      toolName: request.toolName,
      ...(logCallId === undefined ? {} : { callId: logCallId }),
      ...(request.reason === undefined ? {} : { reason: request.reason }),
    });
    live.approvals += 1;
    this.#setState(
      sessionId,
      {
        engine,
        ...sessionAccount(engine, live.accountId),
        account: live.account,
        state: 'waiting-approval',
      },
      live.botSlug,
    );
    let outcome: ApprovalOutcome = 'unavailable';
    try {
      const approve = this.#options.approve;
      if (approve !== undefined && !signal.aborted)
        outcome = await approve({
          botSlug: live.botSlug,
          sessionId,
          session: live.dsh.session,
          callId: request.callId,
          toolName: request.toolName,
          input: request.input,
          ...(request.reason === undefined ? {} : { reason: request.reason }),
          ...(request.device === undefined ? {} : { device: request.device }),
          signal,
        });
    } catch {
      outcome = 'unavailable';
    } finally {
      live.approvals -= 1;
      log.approvalDecided(asked, outcome);
      if (live.approvals === 0 && live.turn === scope && this.#live.get(sessionId) === live)
        this.#setState(
          sessionId,
          {
            engine,
            ...sessionAccount(engine, live.accountId),
            account: live.account,
            state: 'running',
          },
          live.botSlug,
        );
    }
    return outcome;
  }

  async release(sessionId: string): Promise<void> {
    const opening = this.#opening.get(sessionId);
    if (opening !== undefined) await opening.catch(() => undefined);
    const live = this.#live.get(sessionId);
    if (live === undefined) {
      await this.#releasing.get(sessionId);
      return;
    }
    this.#releasingAccounts.set(sessionId, live.accountId);
    const released = this.#dispose(sessionId, live).finally(() => {
      if (this.#releasing.get(sessionId) === released) {
        this.#releasing.delete(sessionId);
        this.#releasingAccounts.delete(sessionId);
      }
    });
    this.#releasing.set(sessionId, released);
    await released;
  }

  async #dispose(sessionId: string, live: LiveEngineSession): Promise<void> {
    live.closing = true;
    clearTimeout(live.idleTimer);
    this.#live.delete(sessionId);
    this.#states.delete(sessionId);
    this.#options.observe?.(live.botSlug, sessionId, 'idle', this.#role(sessionId));
    this.#roles.delete(sessionId);
    live.grant.revoke();
    live.stop?.abort();
    const grace = this.#options.releaseGraceMs ?? RELEASE_GRACE_MS;
    if (!(await settlesWithin(live.running, grace))) {
      await live.engine.close().catch(() => undefined);
      await settlesWithin(live.running, grace);
    }
    await Promise.allSettled([live.engine.close(), live.dsh.close()]);
  }

  async close(): Promise<void> {
    this.#closed = true;
    this.#accounts.close();
    for (const cancel of this.#cancels.values()) cancel();
    await Promise.allSettled([...this.#opening.values()]);
    await Promise.allSettled([...this.#live.keys()].map((id) => this.release(id)));
    await Promise.allSettled([...this.#releasing.values()]);
  }

  isLive(sessionId: string): boolean {
    return (
      this.#live.has(sessionId) || this.#opening.has(sessionId) || this.#releasing.has(sessionId)
    );
  }

  #role(sessionId: string): EngineRole {
    return this.#roles.get(sessionId) ?? 'orchestrator';
  }

  #setState(sessionId: string, description: EngineSessionDescription, botSlug: string): void {
    this.#states.set(sessionId, description);
    this.#options.observe?.(botSlug, sessionId, description.state, this.#role(sessionId));
  }

  async #open(request: EngineTurnRequest): Promise<LiveEngineSession> {
    if (this.#closed) throw new EngineRefusal('engine-unavailable', 'The Host is shutting down');
    const { cwd, sessionId } = request;
    const live = this.#live.get(sessionId);
    const target = this.#options.local ? request.target : undefined;
    let routed: { engine: EngineId; choice: EngineChoice } | undefined;
    if (live !== undefined) {
      let mode: EngineWorkspaceMode;
      try {
        mode = workspaceModeFor(request);
      } catch (error) {
        await this.release(sessionId);
        throw error;
      }
      if (target !== undefined) {
        routed = await this.#routingGroupSelection(request, target);
        if (live.closing)
          throw new EngineRefusal('engine-unavailable', 'This engine Session was released');
      }
      const initial = routed ?? this.#directSelection(request);
      const selected = sessionKey(choiceKey(initial.engine, initial.choice), cwd, mode);
      if (!live.engine.ended && live.configuration === selected) return live;
      await this.release(sessionId);
    }
    await this.#releasing.get(sessionId);
    if (this.#closed) throw new EngineRefusal('engine-unavailable', 'The Host is shutting down');
    if (target !== undefined && routed === undefined) {
      routed = await this.#routingGroupSelection(request, target);
      if (this.#closed) throw new EngineRefusal('engine-unavailable', 'The Host is shutting down');
    }
    const mode = workspaceModeFor(request);
    const { engine: engineId, choice } = routed ?? this.#directSelection(request);
    const key = sessionKey(choiceKey(engineId, choice), cwd, mode);
    const pending = this.#opening.get(request.sessionId);
    if (pending !== undefined) {
      if (this.#openingConfiguration.get(request.sessionId) === key) return pending;
      await pending.catch(() => undefined);
      return this.#open(request);
    }
    const opening = this.#start(request, engineId, choice, mode, key).finally(() => {
      this.#opening.delete(request.sessionId);
      this.#openingAccounts.delete(request.sessionId);
      this.#openingConfiguration.delete(request.sessionId);
    });
    this.#opening.set(request.sessionId, opening);
    this.#openingConfiguration.set(request.sessionId, key);
    return opening;
  }

  async #start(
    request: EngineTurnRequest,
    engineId: EngineId | undefined,
    choice: EngineChoice,
    mode: EngineWorkspaceMode,
    key: string,
  ): Promise<LiveEngineSession> {
    const { botSlug, sessionId } = request;
    if (engineId === undefined)
      throw new EngineRefusal(
        'engine-unavailable',
        'This Bot does not run on a Subscription Engine',
      );
    const selectedAccount = this.#requireAccountGrant(botSlug, engineId, choice.accountId);
    const accountId = selectedAccount.id;
    this.#openingAccounts.set(sessionId, accountId);
    this.#roles.set(sessionId, request.role ?? 'orchestrator');
    this.#setState(
      sessionId,
      { engine: engineId, ...sessionAccount(engineId, accountId), state: 'starting' },
      botSlug,
    );
    const holder: { live?: LiveEngineSession } = {};
    let grant: EngineGrant | undefined;
    let engine: EngineSession | undefined;
    let dsh: OpenedEngineDshSession | undefined;
    try {
      const sessions = this.#options.sessions();
      const persistence = this.#options.persistence();
      if (sessions === undefined || persistence === undefined)
        throw new EngineRefusal('engine-unavailable', 'DSH Session Persistence is unavailable');
      const cwd = request.cwd ?? join(this.#options.root, 'workdirs', botSlug);
      const sessionCwd = request.sessionCwd ?? cwd;
      if (request.cwd === undefined) mkdirSync(cwd, { recursive: true });
      await this.#options.gateway.start();
      request.signal.throwIfAborted();
      const releasedNative = await request.releaseNativeSession?.();
      if (releasedNative) {
        request.signal.throwIfAborted();
        dsh = await openEngineDshSession(sessions, persistence, sessionId, sessionCwd);
      }
      const tools: EngineGatewayTool[] = request.tools
        .filter((tool) => ENGINE_GATEWAY_TOOLS.has(tool.name))
        .map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.parameters,
        }));
      grant = this.#options.gateway.grant({
        botSlug,
        sessionId,
        tools,
        channelId: () => holder.live?.turn?.channelId,
        canUseChannel: (channelId) => holder.live?.turn?.canUseChannel?.(channelId) === true,
        channelless: request.role === 'assignment',
        call: (name, args, signal) => executeEngineTurnTool(holder.live?.turn, name, args, signal),
      });
      const stored = this.store.nativeSession(sessionId);
      let resume =
        stored?.engine === engineId &&
        engineAccountKey(stored.engine, stored.accountId) === accountId
          ? stored.nativeId
          : undefined;
      let recovery: readonly EngineContextRecord[] | undefined;
      const restore = async () => {
        dsh ??= await openEngineDshSession(sessions, persistence, sessionId, sessionCwd);
        const records = request.readRecoveryContext?.();
        if (request.role !== 'assignment') return records ?? [];
        const priorRequest = savedAssignmentRequest(dsh.session, stored?.lastTurn);
        if (records === undefined || priorRequest === undefined)
          throw new EngineRefusal(
            'engine-recovery-unavailable',
            'The engine session was lost and the saved Assignment records are incomplete.',
          );
        return [...records, { label: 'Latest saved Assignment Request', text: priorRequest }];
      };
      if (resume !== undefined && stored?.lastTurn !== undefined) {
        dsh ??= await openEngineDshSession(sessions, persistence, sessionId, sessionCwd);
        const lastTurn = dsh.session
          .snapshotEvents()
          .findLast((event) => event.type === 'turn/start')?.data.turn;
        if (lastTurn !== stored.lastTurn) {
          resume = undefined;
          const nativeContinuation =
            request.continuingFromNativeRoute &&
            releasedNative &&
            lastTurn !== undefined &&
            lastTurn > stored.lastTurn;
          if (!nativeContinuation) recovery = await restore();
        }
      }
      const gatewayEndpoint = { url: grant.url, token: grant.token };
      const contextSeed = () => holder.live?.seed;
      let opened: EngineSession;
      if (engineId === 'codex') {
        const options: CodexProcessOptions = {
          ...this.#accounts.codex(selectedAccount),
          cwd,
          gateway: gatewayEndpoint,
        };
        const transport = (this.#options.openCodex ?? spawnCodexTransport)(options);
        opened = new CodexEngineSession(transport, {
          cwd,
          workspaceMode: mode,
          instructions: request.instructions,
          contextSeed,
          ...choice,
        });
      } else {
        opened = await this.#accounts.openClaudeSession(selectedAccount, {
          cwd,
          instructions: request.instructions,
          contextSeed,
          gateway: gatewayEndpoint,
          workspaceMode: mode,
          ...(request.role === 'assignment' && mode === 'workspace-write'
            ? { permissionMode: 'acceptEdits' as const }
            : {}),
          ...choice,
          ...(resume === undefined ? {} : { resume }),
        });
      }
      engine = opened;
      const started = opened;
      this.#cancels.set(sessionId, () => void started.close());
      if (this.#closed) throw new EngineRefusal('engine-unavailable', 'The Host is shutting down');
      const account = await readEngineAccount(opened);
      const label = requireSubscription(account, accountId);
      this.#rememberAccount(botSlug, opened.engine, label);
      let nativeId: string;
      try {
        nativeId = await opened.start(resume);
      } catch (error) {
        if (!(error instanceof EngineRefusal && error.code === 'engine-thread-gone')) throw error;
        resume = undefined;
        recovery = await restore();
        nativeId = await opened.start();
      }
      this.#rememberModel(botSlug, opened.engine, opened.model);
      dsh ??= await openEngineDshSession(sessions, persistence, sessionId, sessionCwd);
      if (this.#closed) throw new EngineRefusal('engine-unavailable', 'The Host is shutting down');
      const live: LiveEngineSession = {
        botSlug,
        configuration: key,
        choice,
        workspaceMode: mode,
        engine: opened,
        account: label,
        accountId,
        grant,
        dsh,
        nativeId,
        seed:
          resume === undefined
            ? buildEngineContextSeed(dsh.session, undefined, recovery)
            : undefined,
        rebuilt: recovery !== undefined,
        turn: undefined,
        stop: undefined,
        closing: false,
        approvals: 0,
        recover: false,
        accountChecked: true,
        running: Promise.resolve(),
      };
      holder.live = live;
      this.#cancels.delete(sessionId);
      this.#live.set(sessionId, live);
      return live;
    } catch (error) {
      this.#cancels.delete(sessionId);
      grant?.revoke();
      this.#states.delete(sessionId);
      this.#options.observe?.(botSlug, sessionId, 'idle', this.#role(sessionId));
      await Promise.allSettled([engine?.close(), dsh?.close()]);
      throw error;
    }
  }
}

const RELEASE_GRACE_MS = 10_000;

async function settlesWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const settled = await Promise.race([
    promise.then(
      () => true,
      () => true,
    ),
    new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), ms);
    }),
  ]);
  clearTimeout(timer);
  return settled;
}
