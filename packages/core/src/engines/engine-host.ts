import type { OrchestratorRunner } from '@botharness/host-protocol/wire';

import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval';

import { AssignmentSteering } from './assignment-steering.js';
import { readEngineAccount, requireSubscription, statusReport } from './engine-account.js';
import {
  type CodexProcessOptions,
  type CodexTransport,
  CodexEngineSession,
  spawnCodexTransport,
} from './codex-engine.js';
import { type CodexStatus, detectCodex, startCodexLogin } from './codex-status.js';
import {
  CLAUDE_MIN_VERSION,
  type ClaudeEngineOptions,
  type ClaudeQueryFactory,
  ClaudeEngineSession,
  olderThan,
  sdkClaudeQuery,
} from './claude-engine.js';
import { type ClaudeStatus, detectClaude, startClaudeLogin } from './claude-status.js';
import { resolveEngineCommand } from './engine-launch.js';
import {
  buildEngineContextSeed,
  type EngineContextRecord,
  savedAssignmentRequest,
} from './engine-context.js';
import {
  type EngineSessionPersistence,
  type EngineSessionStore,
  type OpenedEngineDshSession,
  openEngineDshSession,
} from './engine-dsh-session.js';
import {
  type EngineGateway,
  type EngineGatewayTool,
  type EngineGrant,
  engineGatewayResult,
} from './engine-gateway.js';
import { EngineTurnLog } from './engine-log.js';
import {
  ENGINE_DEFINITIONS,
  type EngineChoice,
  type EngineEvent,
  type EngineId,
  type EngineModel,
  type EngineQuota,
  type EngineSession,
  type EngineWorkspaceMode,
  EngineLimitError,
  EngineRefusal,
} from './engine-session.js';
import {
  createEngineStore,
  type EngineRole,
  type EngineStore,
  engineStorePath,
} from './engine-store.js';

import {
  ENGINE_GATEWAY_TOOLS,
  type EngineTurnRequest,
  type EngineTurnOutcome,
  type EngineToolApproval,
  type EngineToolContext,
  type EngineSessionState,
  type EngineApprovalRequest,
  type EngineSessionDescription,
  type EngineQuotaView,
  type EngineStatusReport,
} from './engine-host-types.js';

export {
  ENGINE_GATEWAY_TOOLS,
  type EngineTool,
  type EngineTurnRequest,
  type EngineTurnOutcome,
  type EngineToolApproval,
  type EngineToolContext,
  type EngineSessionState,
  type EngineApprovalRequest,
  type EngineSessionDescription,
  type EngineQuotaView,
  type EngineStatusReport,
} from './engine-host-types.js';

export interface EngineHostOptions {
  root: string;
  local: boolean;
  codexCommand?: string;
  claudeCommand?: string;
  env?: Readonly<Record<string, string | undefined>>;
  gateway: EngineGateway;
  sessions(): EngineSessionStore | undefined;
  persistence(): EngineSessionPersistence | undefined;
  sessionIdsForBot?(botSlug: string): readonly string[];
  changed?(): void;
  observe?(botSlug: string, sessionId: string, state: EngineSessionState, role: EngineRole): void;
  approve?(request: EngineApprovalRequest): Promise<ApprovalOutcome>;
  idleMs?: number;
  releaseGraceMs?: number;
  now?: () => number;
  openCodex?(options: CodexProcessOptions): CodexTransport;
  detectCodex?(options: { command: string; home: string }): Promise<CodexStatus>;
  startCodexLogin?(options: { command: string; home: string }): Promise<{ url?: string }>;
  openClaude?: ClaudeQueryFactory;
  detectClaude?(options: { command: string; home: string }): Promise<ClaudeStatus>;
  startClaudeLogin?(options: { command: string; home: string }): Promise<{ url?: string }>;
}

interface TurnScope {
  channelId: string | undefined;
  execute: EngineTurnRequest['execute'];
  context?: EngineToolContext;
  signal: AbortSignal;
}

interface LiveEngineSession {
  botSlug: string;
  configuration: string;
  workspaceMode: EngineWorkspaceMode;
  engine: EngineSession;
  account: string;
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

const LIMIT_REST_MS = 60 * 60_000;
const MODELS_TTL_MS = 5 * 60_000;
const ORCHESTRATOR_IDLE_MS = 30_000;

function choiceKey(engine: EngineId | undefined, choice: EngineChoice): string | undefined {
  return engine === undefined ? undefined : JSON.stringify([engine, choice.model, choice.effort]);
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
  readonly #assignmentSteering = new Map<string, AssignmentSteering>();
  readonly #models = new Map<EngineId, { at: number; models: Promise<EngineModel[]> }>();
  readonly #states = new Map<string, EngineSessionDescription>();
  readonly #legacyAccounts = new Map<string, { engine: EngineId; account: string | undefined }>();
  #closed = false;
  readonly #releasing = new Map<string, Promise<void>>();
  readonly #cancels = new Map<string, () => void>();

  constructor(options: EngineHostOptions) {
    this.#options = options;
    this.store = createEngineStore(engineStorePath(options.root));
  }

  get #codex(): {
    command: string;
    home: string;
    env?: Readonly<Record<string, string | undefined>>;
  } {
    return {
      command: this.#options.codexCommand ?? 'codex',
      home: join(this.#options.root, 'codex', 'home'),
      ...(this.#options.env === undefined ? {} : { env: this.#options.env }),
    };
  }

  get #claude(): {
    command: string;
    home: string;
    env?: Readonly<Record<string, string | undefined>>;
  } {
    return {
      command: this.#options.claudeCommand ?? 'claude',
      home: join(this.#options.root, 'claude', 'home'),
      ...(this.#options.env === undefined ? {} : { env: this.#options.env }),
    };
  }

  engineFor(botSlug: string, role: EngineRole = 'orchestrator'): EngineId | undefined {
    if (!this.#options.local) return undefined;
    return this.store.selection(botSlug, role);
  }

  choiceFor(botSlug: string, role: EngineRole = 'orchestrator'): string | undefined {
    return choiceKey(this.engineFor(botSlug, role), this.store.choice(botSlug, role));
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
    this.store.select(botSlug, role, engine, options);
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
    return !(this.fallsBack(botSlug, role) && this.limit(engine) !== undefined);
  }

  limit(engine: EngineId): { account: string; until: string } | undefined {
    const quota = this.store.quota(engine);
    if (quota?.limited !== true) return undefined;
    const until =
      quota.resetsAt !== undefined && Number.isFinite(Date.parse(quota.resetsAt))
        ? Date.parse(quota.resetsAt)
        : Date.parse(quota.observedAt) + LIMIT_REST_MS;
    if (!(until > this.#now())) return undefined;
    return { account: quota.account ?? engine, until: new Date(until).toISOString() };
  }

  quota(engine: EngineId): EngineQuotaView | undefined {
    const quota = this.store.quota(engine);
    if (quota === undefined) return undefined;
    const limit = this.limit(engine);
    const current =
      quota.resetsAt === undefined || Date.parse(quota.resetsAt) > this.#now()
        ? quota.usedPercent
        : undefined;
    return {
      ...(current === undefined ? {} : { usedPercent: current }),
      ...(quota.resetsAt === undefined ? {} : { resetsAt: quota.resetsAt }),
      ...(limit === undefined ? {} : { limitedUntil: limit.until }),
      observedAt: quota.observedAt,
    };
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
            state: 'idle',
          });
    if (base === undefined) return undefined;
    const quota = this.quota(base.engine);
    return quota === undefined ? base : { ...base, quota };
  }

  #now(): number {
    return (this.#options.now ?? Date.now)();
  }

  #record(engine: EngineId, account: string, event: Extract<EngineEvent, { kind: 'rate-limit' }>) {
    const previous = this.store.quota(engine);
    const resetsAt =
      event.resetsAt !== undefined
        ? new Date(event.resetsAt * 1000).toISOString()
        : event.limited && previous?.limited === true && previous.account === account
          ? previous.resetsAt
          : undefined;
    const usedPercent =
      event.usedPercent ?? (event.limited ? 100 : undefined) ?? previous?.usedPercent;
    const quota: EngineQuota = {
      account,
      ...(usedPercent === undefined ? {} : { usedPercent }),
      ...(resetsAt === undefined ? {} : { resetsAt }),
      limited: event.limited,
      observedAt: new Date(this.#now()).toISOString(),
    };
    this.store.rememberQuota(engine, quota);
  }

  async status(): Promise<EngineStatusReport[]> {
    if (!this.#options.local) return [];
    const [codex, claude] = await Promise.all([
      probeStatus(() => (this.#options.detectCodex ?? detectCodex)(this.#codex)),
      probeStatus(() => (this.#options.detectClaude ?? detectClaude)(this.#claude)),
    ]);
    return [
      statusReport('codex', codex, 'chatgpt', this.quota('codex')),
      statusReport('claude', claude, 'subscription', this.quota('claude')),
    ];
  }

  async login(engine: EngineId): Promise<{ engine: EngineId; started: true; url?: string }> {
    if (!this.#options.local)
      throw new EngineRefusal(
        'engine-unavailable',
        'Subscription Engines run only on a local Host',
      );
    const started =
      engine === 'codex'
        ? await (this.#options.startCodexLogin ?? startCodexLogin)(this.#codex)
        : await (this.#options.startClaudeLogin ?? startClaudeLogin)(this.#claude);
    return { engine, started: true, ...started };
  }

  async validateChoice(engine: EngineId, choice: EngineChoice): Promise<void> {
    const models = await this.models(engine);
    if (choice.model === undefined && choice.effort === undefined) return;
    const picked =
      choice.model === undefined
        ? (models.find((entry) => entry.isDefault === true) ?? models[0])
        : models.find((entry) => entry.id === choice.model);
    if (picked === undefined)
      throw new EngineRefusal(
        'unknown-model',
        `${choice.model ?? 'The default model'} is not offered by this ${engine} subscription. List them with deepseekbot engine models ${engine}`,
      );
    if (
      choice.effort !== undefined &&
      !picked.efforts.some((option) => option.id === choice.effort)
    )
      throw new EngineRefusal(
        'unknown-effort',
        picked.efforts.length === 0
          ? `${picked.id} takes no effort level`
          : `${picked.id} takes effort ${picked.efforts.map((option) => option.id).join(', ')}`,
      );
  }

  async models(engine: EngineId): Promise<EngineModel[]> {
    if (!this.#options.local)
      throw new EngineRefusal(
        'engine-unavailable',
        'Subscription Engines run only on a local Host',
      );
    const cached = this.#models.get(engine);
    if (cached !== undefined && this.#now() - cached.at < MODELS_TTL_MS) return cached.models;
    const models = this.#listModels(engine);
    const entry = { at: this.#now(), models };
    this.#models.set(engine, entry);
    models.catch(() => {
      if (this.#models.get(engine) === entry) this.#models.delete(engine);
    });
    return models;
  }

  async #listModels(engine: EngineId): Promise<EngineModel[]> {
    const cwd = join(this.#options.root, 'workdirs', '.models');
    mkdirSync(cwd, { recursive: true });
    const session =
      engine === 'codex'
        ? new CodexEngineSession(
            (this.#options.openCodex ?? spawnCodexTransport)({ ...this.#codex, cwd }),
            { cwd, instructions: '' },
          )
        : await this.#claudeSession({ cwd, instructions: '' });
    try {
      requireSubscription(await readEngineAccount(session));
      return await session.models();
    } finally {
      await session.close().catch(() => undefined);
    }
  }

  async #claudeSession(
    options: { cwd: string; instructions: string; resume?: string } & Pick<
      ClaudeEngineOptions,
      'gateway' | 'model' | 'effort' | 'permissionMode' | 'contextSeed' | 'workspaceMode'
    >,
  ): Promise<ClaudeEngineSession> {
    const claude = this.#claude;
    const executable = resolveEngineCommand(claude.command, { env: claude.env ?? process.env });
    if (executable === undefined)
      throw new EngineRefusal(
        'engine-not-installed',
        'Claude Code is not installed on this computer',
      );
    const { version } = await (this.#options.detectClaude ?? detectClaude)({
      ...claude,
      command: executable,
    });
    if (version === undefined || olderThan(version, CLAUDE_MIN_VERSION))
      throw new EngineRefusal(
        'engine-unavailable',
        `Claude Code ${version ?? 'of an unknown version'} cannot run a Bot here. Update it to ${CLAUDE_MIN_VERSION} or newer`,
      );
    return new ClaudeEngineSession({
      query: this.#options.openClaude ?? sdkClaudeQuery,
      executable,
      home: claude.home,
      ...(claude.env === undefined ? {} : { env: claude.env }),
      ...options,
    });
  }

  steerAssignment(sessionId: string, text: string): boolean {
    return this.#assignmentSteering.get(sessionId)?.offer(text) ?? false;
  }

  async runTurn(request: EngineTurnRequest): Promise<EngineTurnOutcome> {
    if (request.role !== 'assignment') return this.#runTurn(request);
    const { sessionId, signal } = request;
    if (this.#assignmentSteering.has(sessionId))
      throw new EngineRefusal('engine-unavailable', 'This engine Assignment is already running');
    const steering = new AssignmentSteering(() => !signal.aborted && !this.#closed);
    this.#assignmentSteering.set(sessionId, steering);
    try {
      return await steering.run(
        request.input,
        (input, continuation) => this.#runTurn({ ...request, input }, steering, continuation),
        () => this.#assignmentSteering.delete(sessionId),
      );
    } finally {
      await this.release(sessionId);
    }
  }

  async #runTurn(
    request: EngineTurnRequest,
    steering?: AssignmentSteering,
    continuation = false,
  ): Promise<EngineTurnOutcome> {
    const role = request.role ?? 'orchestrator';
    this.#roles.set(request.sessionId, role);
    const selected = this.engineFor(request.botSlug, role);
    if (selected === undefined)
      throw new EngineRefusal(
        'engine-unavailable',
        role === 'assignment'
          ? 'This Bot does not run its Assignments on a Subscription Engine'
          : 'This Bot does not run on a Subscription Engine',
      );
    if (request.signal.aborted) return {};
    const limited = this.limit(selected);
    if (limited !== undefined) throw new EngineLimitError(selected, limited.account, limited.until);
    const live = await this.#open(request);
    clearTimeout(live.idleTimer);
    live.idleTimer = undefined;
    const engine = live.engine.engine;
    if (engine !== selected) {
      const opened = this.limit(engine);
      if (opened !== undefined) throw new EngineLimitError(engine, opened.account, opened.until);
    }
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
        if (!accountChecked) live.account = requireSubscription(await live.engine.account());
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
        if (live.workspaceMode !== mode) return this.#runTurn(request, steering, continuation);
        if (role === 'orchestrator') this.#rememberAccount(request.botSlug, engine, live.account);
        const input = steering?.takeInput(request.input) ?? request.input;
        const stop = new AbortController();
        live.stop = stop;
        const signal = AbortSignal.any([request.signal, stop.signal]);
        const scope: TurnScope = { channelId: request.channelId, execute: request.execute, signal };
        live.turn = scope;
        this.#setState(
          request.sessionId,
          { engine, account: live.account, state: 'running' },
          live.botSlug,
        );
        const log = new EngineTurnLog(live.dsh, engine, live.account, input);
        if (live.rebuilt) {
          log.rebuilt();
          live.rebuilt = false;
        }
        outcome.turn = log.turn;
        let limitedNow = false;
        scope.context = {
          session: live.dsh.session,
          get assignmentInputRevision() {
            return steering?.inputRevision;
          },
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
          const sending = live.engine.send(input, {
            signal,
            verbatimInput: continuation,
            onEvent: (event) => {
              log.accept(event);
              if (event.kind === 'text') outcome.text = event.text;
              if (event.kind === 'tool-call') delete outcome.text;
              if (event.kind === 'approval')
                void this.#approve(live, scope, log, event, request.sessionId, signal);
              if (event.kind === 'rate-limit') {
                limitedNow = event.limited;
                this.#record(engine, live.account, event);
              }
            },
          });
          const steered =
            steering === undefined
              ? undefined
              : await steering.duringTurn({ sending, engine: live.engine, signal, stop, log });
          const end = steered?.end ?? (await sending);
          if (role === 'orchestrator')
            this.#rememberModel(request.botSlug, engine, live.engine.model);
          try {
            await log.end(end);
            broken = live.seed !== undefined && end.status !== 'completed';
            if (!broken) {
              this.store.rememberNativeSession(
                request.sessionId,
                engine,
                live.nativeId,
                live.account,
                log.turn,
              );
              live.seed = undefined;
            }
          } catch (error) {
            broken = true;
            throw error;
          }
          if (steered?.failure !== undefined) throw steered.failure.error;
          const last = live.dsh.session.snapshotEvents().at(-1);
          if (last !== undefined) outcome.endSeq = Number(last.seq);
          if (end.status === 'failed') {
            const limit = limitedNow ? this.limit(engine) : undefined;
            if (limit !== undefined) throw new EngineLimitError(engine, limit.account, limit.until);
            if (steered?.replacing !== true || !current())
              throw new EngineRefusal('engine-failed', end.message);
          }
        } finally {
          if (!current()) steering?.discard();
          if (live.turn === scope) live.turn = undefined;
          if (live.stop === stop) live.stop = undefined;
        }
      }
    } finally {
      if (current() && live.running === running)
        this.#setState(
          request.sessionId,
          { engine, account: live.account, state: 'idle' },
          live.botSlug,
        );
      finish();
      if (current() && (broken || live.engine.ended)) {
        live.recover = true;
        void this.release(request.sessionId);
      } else if (current() && role === 'orchestrator' && live.running === running) {
        live.idleTimer = setTimeout(
          () => void this.release(request.sessionId),
          this.#options.idleMs ?? ORCHESTRATOR_IDLE_MS,
        ).unref();
      }
    }
    if (reopen) return this.#runTurn(request, steering, continuation);
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
      { engine, account: live.account, state: 'waiting-approval' },
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
          { engine, account: live.account, state: 'running' },
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
    const released = this.#dispose(sessionId, live).finally(() => {
      if (this.#releasing.get(sessionId) === released) this.#releasing.delete(sessionId);
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
    const live = this.#live.get(request.sessionId);
    const role = request.role ?? 'orchestrator';
    let mode: EngineWorkspaceMode;
    try {
      mode = workspaceModeFor(request);
    } catch (error) {
      if (live !== undefined) await this.release(request.sessionId);
      throw error;
    }
    const selected = sessionKey(this.choiceFor(request.botSlug, role), request.cwd, mode);
    if (live !== undefined && !live.engine.ended && live.configuration === selected) return live;
    if (live !== undefined) await this.release(request.sessionId);
    await this.#releasing.get(request.sessionId);
    if (this.#closed) throw new EngineRefusal('engine-unavailable', 'The Host is shutting down');
    const engineId = this.engineFor(request.botSlug, role);
    const choice = this.store.choice(request.botSlug, role);
    const key = sessionKey(choiceKey(engineId, choice), request.cwd, mode);
    const pending = this.#opening.get(request.sessionId);
    if (pending !== undefined) {
      if (this.#openingConfiguration.get(request.sessionId) === key) return pending;
      await pending.catch(() => undefined);
      return this.#open(request);
    }
    const opening = this.#start(request, engineId, choice, mode, key).finally(() => {
      this.#opening.delete(request.sessionId);
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
    this.#roles.set(sessionId, request.role ?? 'orchestrator');
    this.#setState(sessionId, { engine: engineId, state: 'starting' }, botSlug);
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
      if (request.cwd === undefined) mkdirSync(cwd, { recursive: true });
      await this.#options.gateway.start();
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
        channelless: request.role === 'assignment',
        call: async (name, args, signal) => {
          const turn = holder.live?.turn;
          if (turn?.context === undefined)
            return { text: 'refused: session-not-running', isError: true };
          const callSignal =
            request.role === 'assignment' ? AbortSignal.any([signal, turn.signal]) : signal;
          return engineGatewayResult(await turn.execute(name, args, callSignal, turn.context));
        },
      });
      const stored = this.store.nativeSession(sessionId);
      let resume = stored?.engine === engineId ? stored.nativeId : undefined;
      let recovery: readonly EngineContextRecord[] | undefined;
      const restore = async () => {
        dsh ??= await openEngineDshSession(sessions, persistence, sessionId, cwd);
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
        dsh = await openEngineDshSession(sessions, persistence, sessionId, cwd);
        const last = dsh.session.snapshotEvents().findLast((event) => event.type === 'turn/start');
        if (last?.data.turn !== stored.lastTurn) resume = undefined;
        if (last === undefined || last.data.turn < stored.lastTurn) recovery = await restore();
      }
      const gatewayEndpoint = { url: grant.url, token: grant.token };
      const contextSeed = () => holder.live?.seed;
      let opened: EngineSession;
      if (engineId === 'codex') {
        const options: CodexProcessOptions = { ...this.#codex, cwd, gateway: gatewayEndpoint };
        const transport = (this.#options.openCodex ?? spawnCodexTransport)(options);
        opened = new CodexEngineSession(transport, {
          cwd,
          workspaceMode: mode,
          instructions: request.instructions,
          contextSeed,
          ...choice,
        });
      } else {
        opened = await this.#claudeSession({
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
      const label = requireSubscription(account);
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
      dsh ??= await openEngineDshSession(sessions, persistence, sessionId, cwd);
      if (this.#closed) throw new EngineRefusal('engine-unavailable', 'The Host is shutting down');
      const live: LiveEngineSession = {
        botSlug,
        configuration: key,
        workspaceMode: mode,
        engine: opened,
        account: label,
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

async function probeStatus(detect: () => Promise<CodexStatus | ClaudeStatus>) {
  try {
    return await detect();
  } catch {
    return { installed: true, login: 'unknown' } satisfies CodexStatus | ClaudeStatus;
  }
}
