import type { RoutingGroupEngineMember } from '@botharness/host-protocol/subscription-engine';
import type { OrchestratorRunner } from '@botharness/host-protocol/wire';

import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import type { Session } from '@deepseek-ai/dsh-session';
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval';

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
import { buildEngineContextSeed } from './engine-context.js';
import {
  type EngineSessionPersistence,
  type EngineSessionStore,
  type OpenedEngineDshSession,
  openEngineDshSession,
} from './engine-dsh-session.js';
import type {
  EngineGateway,
  EngineGatewayCallResult,
  EngineGatewayTool,
  EngineGrant,
} from './engine-gateway.js';
import { EngineTurnLog } from './engine-log.js';
import {
  engineQuotaLimit,
  engineQuotaView,
  recordEngineQuota,
  type EngineQuotaView,
} from './engine-quota.js';
import {
  ENGINE_DEFINITIONS,
  type EngineAccount,
  type EngineChoice,
  type EngineEvent,
  type EngineId,
  type EngineModel,
  type EngineSession,
  EngineLimitError,
  EngineRefusal,
} from './engine-session.js';
import {
  createEngineStore,
  type EngineRole,
  type EngineStore,
  engineStorePath,
} from './engine-store.js';

export const ENGINE_GATEWAY_TOOLS: ReadonlySet<string> = new Set([
  'bot_send_message',
  'channel_read',
  'inbox_resolve',
  'tool_search',
  'tool_call',
  'report_to_orchestrator',
]);

export interface EngineTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface EngineTurnRequest {
  botSlug: string;
  role?: EngineRole;
  target?: RoutingGroupEngineMember;
  cwd?: string;
  sessionCwd?: string;
  sessionId: string;
  channelId: string | undefined;
  input: string;
  instructions: string;
  tools: readonly EngineTool[];
  execute(
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
    context: EngineToolContext,
  ): Promise<unknown>;
  signal: AbortSignal;
}

export interface EngineTurnOutcome {
  turn?: number;
  endSeq?: number;
  text?: string;
}

export interface EngineToolApproval {
  toolName: string;
  input: Record<string, unknown>;
  reason?: string;
  device?: { kind: 'computer' | 'browser'; authorizationScope?: () => string };
}

export interface EngineToolContext {
  session: Session;
  ask(request: EngineToolApproval): Promise<ApprovalOutcome>;
}

export type EngineSessionState = 'starting' | 'running' | 'waiting-approval' | 'idle';

export interface EngineApprovalRequest {
  botSlug: string;
  sessionId: string;
  session: Session;
  callId: string;
  toolName: string;
  input: Record<string, unknown>;
  reason?: string;
  device?: EngineToolApproval['device'];
  signal: AbortSignal;
}

export interface EngineSessionDescription {
  engine: EngineId;
  account?: string;
  state: EngineSessionState;
  quota?: EngineQuotaView;
}

export type { EngineQuotaView } from './engine-quota.js';

export interface EngineStatusReport {
  displayName: string;
  engine: EngineId;
  available: boolean;
  reason?: 'host-not-local' | 'not-installed' | 'signed-out' | 'not-subscription' | 'login-unknown';
  installed: boolean;
  version?: string;
  login: CodexStatus['login'] | ClaudeStatus['login'];
  quota?: EngineQuotaView;
}

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
}

interface LiveEngineSession {
  botSlug: string;
  choice: string;
  engine: EngineSession;
  account: string;
  grant: EngineGrant;
  dsh: OpenedEngineDshSession;
  nativeId: string;
  seed: string | undefined;
  turn: TurnScope | undefined;
  stop: AbortController | undefined;
  closing: boolean;
  approvals: number;
  recover: boolean;
  accountChecked: boolean;
  running: Promise<void>;
}

const MODELS_TTL_MS = 5 * 60_000;

function choiceKey(engine: EngineId | undefined, choice: EngineChoice): string | undefined {
  return engine === undefined ? undefined : JSON.stringify([engine, choice.model, choice.effort]);
}

const SIGN_IN_HINTS: Record<EngineId, string> = {
  codex:
    'Sign the Bot in with your ChatGPT subscription: run `deepseekbot engine login codex` on this computer.',
  claude:
    'Sign the Bot in with your Claude subscription: run `deepseekbot engine login claude` on this computer.',
};

const ENGINE_LABELS: Record<EngineId, string> = { codex: 'Codex', claude: 'Claude Code' };

export class EngineHost {
  readonly store: EngineStore;
  readonly #options: EngineHostOptions;
  readonly #live = new Map<string, LiveEngineSession>();
  readonly #opening = new Map<string, Promise<LiveEngineSession>>();
  readonly #openingChoice = new Map<string, string>();
  readonly #roles = new Map<string, EngineRole>();
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

  #turnSelection(request: EngineTurnRequest): {
    engine: EngineId | undefined;
    choice: EngineChoice;
  } {
    const role = request.role ?? 'orchestrator';
    const target = request.target;
    if (target !== undefined && role === 'orchestrator' && this.#options.local)
      return {
        engine: target.engine,
        choice: target.model === undefined ? {} : { model: target.model },
      };
    return {
      engine: this.engineFor(request.botSlug, role),
      choice: this.store.choice(request.botSlug, role),
    };
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
    const model = this.store.model(botSlug, engine);
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
    return engineQuotaLimit(engine, this.store.quota(engine), this.#now());
  }

  quota(engine: EngineId): EngineQuotaView | undefined {
    return engineQuotaView(engine, this.store.quota(engine), this.#now());
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
    this.store.rememberQuota(
      engine,
      recordEngineQuota(account, event, this.store.quota(engine), this.#now()),
    );
  }

  async status(): Promise<EngineStatusReport[]> {
    if (!this.#options.local) return [];
    const [codex, claude] = await Promise.all([
      (this.#options.detectCodex ?? detectCodex)(this.#codex),
      (this.#options.detectClaude ?? detectClaude)(this.#claude),
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
      requireSubscription(await this.#account(session));
      return await session.models();
    } finally {
      await session.close().catch(() => undefined);
    }
  }

  async #account(session: EngineSession): Promise<EngineAccount> {
    const name = ENGINE_LABELS[session.engine];
    return session.account().catch((error: unknown) => {
      if (error instanceof EngineRefusal) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw /ENOENT/u.test(message)
        ? new EngineRefusal('engine-not-installed', `${name} is not installed on this computer`)
        : new EngineRefusal('engine-failed', `${name} did not start: ${message}`);
    });
  }

  async #claudeSession(
    options: { cwd: string; instructions: string; resume?: string } & Pick<
      ClaudeEngineOptions,
      'gateway' | 'model' | 'effort' | 'permissionMode' | 'contextSeed'
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

  async runTurn(request: EngineTurnRequest): Promise<EngineTurnOutcome> {
    const role = request.role ?? 'orchestrator';
    this.#roles.set(request.sessionId, role);
    const selected = this.#turnSelection(request).engine;
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
    const engine = live.engine.engine;
    if (engine !== selected) {
      const opened = this.limit(engine);
      if (opened !== undefined) throw new EngineLimitError(engine, opened.account, opened.until);
    }
    const accountChecked = live.accountChecked;
    live.accountChecked = false;
    const previous = live.running;
    let finish!: () => void;
    live.running = new Promise((resolve) => (finish = resolve));
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
        if (request.signal.aborted) return outcome;
        if (role === 'orchestrator') this.#rememberAccount(request.botSlug, engine, live.account);
        const stop = new AbortController();
        live.stop = stop;
        const scope: TurnScope = { channelId: request.channelId, execute: request.execute };
        live.turn = scope;
        this.#setState(
          request.sessionId,
          { engine, account: live.account, state: 'running' },
          live.botSlug,
        );
        const log = new EngineTurnLog(live.dsh, engine, live.account, request.input);
        outcome.turn = log.turn;
        let limitedNow = false;
        const signal = AbortSignal.any([request.signal, stop.signal]);
        scope.context = {
          session: live.dsh.session,
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
          const end = await live.engine.send(request.input, {
            signal,
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
          const last = live.dsh.session.snapshotEvents().at(-1);
          if (last !== undefined) outcome.endSeq = Number(last.seq);
          if (end.status === 'failed') {
            const limit = limitedNow ? this.limit(engine) : undefined;
            if (limit !== undefined) throw new EngineLimitError(engine, limit.account, limit.until);
            throw new EngineRefusal('engine-failed', end.message);
          }
        } finally {
          if (live.turn === scope) live.turn = undefined;
          if (live.stop === stop) live.stop = undefined;
        }
      }
    } finally {
      if (current())
        this.#setState(
          request.sessionId,
          { engine, account: live.account, state: 'idle' },
          live.botSlug,
        );
      finish();
      if (current() && (broken || live.engine.ended)) {
        live.recover = true;
        void this.release(request.sessionId);
      }
    }
    if (reopen) return this.runTurn(request);
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
    const initial = this.#turnSelection(request);
    const selected = choiceKey(initial.engine, initial.choice);
    if (live !== undefined && !live.engine.ended && live.choice === selected) return live;
    if (live !== undefined) await this.release(request.sessionId);
    await this.#releasing.get(request.sessionId);
    if (this.#closed) throw new EngineRefusal('engine-unavailable', 'The Host is shutting down');
    const { engine: engineId, choice } = this.#turnSelection(request);
    const key = choiceKey(engineId, choice);
    const pending = this.#opening.get(request.sessionId);
    if (pending !== undefined) {
      if (this.#openingChoice.get(request.sessionId) === key) return pending;
      await pending.catch(() => undefined);
      return this.#open(request);
    }
    const opening = this.#start(request, engineId, choice).finally(() => {
      this.#opening.delete(request.sessionId);
      this.#openingChoice.delete(request.sessionId);
    });
    this.#opening.set(request.sessionId, opening);
    if (key !== undefined) this.#openingChoice.set(request.sessionId, key);
    return opening;
  }

  async #start(
    request: EngineTurnRequest,
    engineId: EngineId | undefined,
    choice: EngineChoice,
  ): Promise<LiveEngineSession> {
    const { botSlug, sessionId } = request;
    if (engineId === undefined)
      throw new EngineRefusal(
        'engine-unavailable',
        'This Bot does not run on a Subscription Engine',
      );
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
      const sessionCwd = request.sessionCwd ?? cwd;
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
          return engineGatewayResult(await turn.execute(name, args, signal, turn.context));
        },
      });
      const stored = this.store.nativeSession(sessionId);
      let resume = stored?.engine === engineId ? stored.nativeId : undefined;
      if (resume !== undefined && stored?.lastTurn !== undefined) {
        dsh = await openEngineDshSession(sessions, persistence, sessionId, sessionCwd);
        const last = dsh.session.snapshotEvents().findLast((event) => event.type === 'turn/start');
        if (last?.data.turn !== stored.lastTurn) resume = undefined;
      }
      const gatewayEndpoint = { url: grant.url, token: grant.token };
      const contextSeed = () => holder.live?.seed;
      let opened: EngineSession;
      if (engineId === 'codex') {
        const options: CodexProcessOptions = { ...this.#codex, cwd, gateway: gatewayEndpoint };
        const transport = (this.#options.openCodex ?? spawnCodexTransport)(options);
        opened = new CodexEngineSession(transport, {
          cwd,
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
          ...(request.role === 'assignment' ? { permissionMode: 'acceptEdits' as const } : {}),
          ...choice,
          ...(resume === undefined ? {} : { resume }),
        });
      }
      engine = opened;
      const started = opened;
      this.#cancels.set(sessionId, () => void started.close());
      if (this.#closed) throw new EngineRefusal('engine-unavailable', 'The Host is shutting down');
      const account = await this.#account(opened);
      const label = requireSubscription(account);
      this.#rememberAccount(botSlug, opened.engine, label);
      let nativeId: string;
      try {
        nativeId = await opened.start(resume);
      } catch (error) {
        if (!(error instanceof EngineRefusal && error.code === 'engine-thread-gone')) throw error;
        resume = undefined;
        nativeId = await opened.start();
      }
      this.#rememberModel(botSlug, opened.engine, opened.model);
      dsh ??= await openEngineDshSession(sessions, persistence, sessionId, sessionCwd);
      if (this.#closed) throw new EngineRefusal('engine-unavailable', 'The Host is shutting down');
      const live: LiveEngineSession = {
        botSlug,
        choice: choiceKey(engineId, choice) ?? '',
        engine: opened,
        account: label,
        grant,
        dsh,
        nativeId,
        seed: resume === undefined ? buildEngineContextSeed(dsh.session) : undefined,
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

export function engineGatewayResult(value: unknown): EngineGatewayCallResult {
  if (typeof value === 'string') return { text: value, isError: false };
  const content =
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { content?: unknown }).content)
      ? ((value as { content: unknown[] }).content.filter(
          (part) =>
            typeof part === 'object' &&
            part !== null &&
            (((part as { type?: unknown }).type === 'text' &&
              typeof (part as { text?: unknown }).text === 'string') ||
              ((part as { type?: unknown }).type === 'image' &&
                typeof (part as { data?: unknown }).data === 'string' &&
                typeof (part as { mimeType?: unknown }).mimeType === 'string')),
        ) as EngineGatewayCallResult['content'])
      : undefined;
  if (content !== undefined && content.length > 0)
    return {
      text: content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n'),
      content,
      isError: (value as { isError?: unknown }).isError === true,
    };
  return { text: JSON.stringify(value) ?? 'null', isError: false };
}

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

export function requireSubscription(account: EngineAccount): string {
  const hint = SIGN_IN_HINTS[account.engine];
  if (account.kind === 'subscription')
    return account.engine === 'codex'
      ? `ChatGPT ${account.plan}`
      : `Claude ${account.plan.replace(/^claude\s+/iu, '')}`;
  if (account.kind === 'metered')
    throw new EngineRefusal(
      'engine-not-subscription',
      `${account.detail}, which bills per use. ${hint}`,
    );
  throw new EngineRefusal(
    'engine-signed-out',
    `${ENGINE_LABELS[account.engine]} is not signed in. ${hint}`,
  );
}

function statusReport(
  engine: EngineId,
  detected: CodexStatus | ClaudeStatus,
  subscription: string,
  quota: EngineQuotaView | undefined,
): EngineStatusReport {
  const reason: EngineStatusReport['reason'] = !detected.installed
    ? 'not-installed'
    : detected.login === subscription
      ? undefined
      : detected.login === 'api-key'
        ? 'not-subscription'
        : detected.login === 'unknown'
          ? 'login-unknown'
          : 'signed-out';
  return {
    engine,
    displayName: ENGINE_DEFINITIONS[engine].displayName,
    available: reason === undefined,
    ...(reason === undefined ? {} : { reason }),
    installed: detected.installed,
    ...(detected.version === undefined ? {} : { version: detected.version }),
    login: detected.login,
    ...(quota === undefined ? {} : { quota }),
  };
}
