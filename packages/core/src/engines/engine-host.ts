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
import { type ClaudeQueryFactory, ClaudeEngineSession, sdkClaudeQuery } from './claude-engine.js';
import { type ClaudeStatus, detectClaude, startClaudeLogin } from './claude-status.js';
import { resolveEngineCommand } from './engine-launch.js';
import {
  type EngineSessionPersistence,
  type EngineSessionStore,
  type OpenedEngineDshSession,
  openEngineDshSession,
} from './engine-dsh-session.js';
import type { EngineGateway, EngineGatewayTool, EngineGrant } from './engine-gateway.js';
import { EngineTurnLog } from './engine-log.js';
import {
  type EngineAccount,
  type EngineEvent,
  type EngineId,
  type EngineSession,
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
]);

export interface EngineTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface EngineTurnRequest {
  botSlug: string;
  sessionId: string;
  channelId: string | undefined;
  input: string;
  instructions: string;
  tools: readonly EngineTool[];
  execute(name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
  signal: AbortSignal;
}

export type EngineSessionState = 'starting' | 'running' | 'waiting-approval' | 'idle';

export interface EngineApprovalRequest {
  botSlug: string;
  sessionId: string;
  session: Session;
  callId: string;
  toolName: string;
  input: Record<string, unknown>;
  signal: AbortSignal;
}

export interface EngineSessionDescription {
  engine: EngineId;
  account?: string;
  state: EngineSessionState;
}

export interface EngineStatusReport {
  engine: EngineId;
  available: boolean;
  reason?: 'host-not-local' | 'not-installed' | 'signed-out' | 'not-subscription' | 'login-unknown';
  installed: boolean;
  version?: string;
  login: CodexStatus['login'] | ClaudeStatus['login'];
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
  observe?(botSlug: string, sessionId: string, state: EngineSessionState): void;
  approve?(request: EngineApprovalRequest): Promise<ApprovalOutcome>;
  releaseGraceMs?: number;
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
}

interface LiveEngineSession {
  botSlug: string;
  engine: EngineSession;
  account: string;
  grant: EngineGrant;
  dsh: OpenedEngineDshSession;
  turn: TurnScope | undefined;
  stop: AbortController | undefined;
  closing: boolean;
  approvals: number;
  recover: boolean;
  accountChecked: boolean;
  running: Promise<void>;
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
  readonly #states = new Map<string, EngineSessionDescription>();
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

  use(botSlug: string, role: EngineRole, engine: EngineId | undefined): void {
    if (engine !== undefined && !this.#options.local)
      throw new EngineRefusal(
        'engine-unavailable',
        'Subscription Engines run only on a local Host',
      );
    this.store.select(botSlug, role, engine);
  }

  describe(sessionId: string): EngineSessionDescription | undefined {
    const live = this.#states.get(sessionId);
    if (live !== undefined) return live;
    const stored = this.store.nativeSession(sessionId);
    if (stored === undefined) return undefined;
    return {
      engine: stored.engine,
      ...(stored.account === undefined ? {} : { account: stored.account }),
      state: 'idle',
    };
  }

  async status(): Promise<EngineStatusReport[]> {
    if (!this.#options.local) return [];
    const [codex, claude] = await Promise.all([
      (this.#options.detectCodex ?? detectCodex)(this.#codex),
      (this.#options.detectClaude ?? detectClaude)(this.#claude),
    ]);
    return [
      statusReport('codex', codex, 'chatgpt'),
      statusReport('claude', claude, 'subscription'),
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

  async runTurn(request: EngineTurnRequest): Promise<void> {
    const engine = this.engineFor(request.botSlug);
    if (engine === undefined)
      throw new EngineRefusal(
        'engine-unavailable',
        'This Bot does not run on a Subscription Engine',
      );
    if (request.signal.aborted) return;
    const live = await this.#open(request);
    const accountChecked = live.accountChecked;
    live.accountChecked = false;
    const previous = live.running;
    let finish!: () => void;
    live.running = new Promise((resolve) => (finish = resolve));
    const current = () => !live.closing && this.#live.get(request.sessionId) === live;
    let broken = false;
    let reopen = false;
    try {
      await previous;
      if (!current()) {
        reopen = live.recover && !this.#closed;
        if (!reopen)
          throw new EngineRefusal('engine-unavailable', 'This engine Session was released');
      } else if (!request.signal.aborted) {
        if (!accountChecked) live.account = requireSubscription(await live.engine.account());
        if (request.signal.aborted) return;
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
        const signal = AbortSignal.any([request.signal, stop.signal]);
        try {
          const end = await live.engine.send(request.input, {
            signal,
            onEvent: (event) => {
              log.accept(event);
              if (event.kind === 'approval')
                void this.#approve(live, scope, log, event, request.sessionId, signal);
            },
          });
          try {
            await log.end(end);
          } catch (error) {
            broken = true;
            throw error;
          }
          if (end.status === 'failed') throw new EngineRefusal('engine-failed', end.message);
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
    if (reopen) await this.runTurn(request);
  }

  async #approve(
    live: LiveEngineSession,
    scope: TurnScope,
    log: EngineTurnLog,
    event: Extract<EngineEvent, { kind: 'approval' }>,
    sessionId: string,
    signal: AbortSignal,
  ): Promise<void> {
    const engine = live.engine.engine;
    const asked = log.approvalAsked({
      toolName: event.tool,
      ...(event.callId === undefined ? {} : { callId: event.callId }),
      reason: event.summary,
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
          callId: event.approvalId,
          toolName: event.tool,
          input: event.input,
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
    live.engine.answer(event.approvalId, outcome === 'allowed-once' ? 'accept' : 'decline');
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
    this.#options.observe?.(live.botSlug, sessionId, 'idle');
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
    return this.#live.has(sessionId) || this.#opening.has(sessionId);
  }

  #setState(sessionId: string, description: EngineSessionDescription, botSlug: string): void {
    this.#states.set(sessionId, description);
    this.#options.observe?.(botSlug, sessionId, description.state);
  }

  async #open(request: EngineTurnRequest): Promise<LiveEngineSession> {
    if (this.#closed) throw new EngineRefusal('engine-unavailable', 'The Host is shutting down');
    const live = this.#live.get(request.sessionId);
    const selected = this.engineFor(request.botSlug);
    if (live !== undefined && !live.engine.ended && live.engine.engine === selected) return live;
    if (live !== undefined) await this.release(request.sessionId);
    await this.#releasing.get(request.sessionId);
    if (this.#closed) throw new EngineRefusal('engine-unavailable', 'The Host is shutting down');
    const pending = this.#opening.get(request.sessionId);
    if (pending !== undefined) return pending;
    const opening = this.#start(request).finally(() => this.#opening.delete(request.sessionId));
    this.#opening.set(request.sessionId, opening);
    return opening;
  }

  async #start(request: EngineTurnRequest): Promise<LiveEngineSession> {
    const { botSlug, sessionId } = request;
    const engineId = this.engineFor(botSlug);
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
      const cwd = join(this.#options.root, 'workdirs', botSlug);
      mkdirSync(cwd, { recursive: true });
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
        call: async (name, args, signal) => {
          const turn = holder.live?.turn;
          if (turn === undefined) return { text: 'refused: session-not-running', isError: true };
          const value = await turn.execute(name, args, signal);
          return {
            text: typeof value === 'string' ? value : JSON.stringify(value),
            isError: false,
          };
        },
      });
      const stored = this.store.nativeSession(sessionId);
      const resume = stored?.engine === engineId ? stored.nativeId : undefined;
      const gatewayEndpoint = { url: grant.url, token: grant.token };
      let opened: EngineSession;
      if (engineId === 'codex') {
        const options: CodexProcessOptions = { ...this.#codex, cwd, gateway: gatewayEndpoint };
        const transport = (this.#options.openCodex ?? spawnCodexTransport)(options);
        opened = new CodexEngineSession(transport, { cwd, instructions: request.instructions });
      } else {
        const claude = this.#claude;
        const executable = resolveEngineCommand(claude.command, {
          env: claude.env ?? process.env,
        });
        if (executable === undefined)
          throw new EngineRefusal(
            'engine-not-installed',
            'Claude Code is not installed on this computer',
          );
        opened = new ClaudeEngineSession({
          query: this.#options.openClaude ?? sdkClaudeQuery,
          executable,
          home: claude.home,
          cwd,
          instructions: request.instructions,
          gateway: gatewayEndpoint,
          ...(claude.env === undefined ? {} : { env: claude.env }),
          ...(resume === undefined ? {} : { resume }),
        });
      }
      engine = opened;
      const started = opened;
      this.#cancels.set(sessionId, () => void started.close());
      if (this.#closed) throw new EngineRefusal('engine-unavailable', 'The Host is shutting down');
      const name = ENGINE_LABELS[engineId];
      const account = await opened.account().catch((error: unknown) => {
        if (error instanceof EngineRefusal) throw error;
        const message = error instanceof Error ? error.message : String(error);
        throw /ENOENT/u.test(message)
          ? new EngineRefusal('engine-not-installed', `${name} is not installed on this computer`)
          : new EngineRefusal('engine-failed', `${name} did not start: ${message}`);
      });
      const label = requireSubscription(account);
      let nativeId: string;
      try {
        nativeId = await opened.start(resume);
      } catch (error) {
        if (!(error instanceof EngineRefusal && error.code === 'engine-thread-gone')) throw error;
        nativeId = await opened.start();
      }
      this.store.rememberNativeSession(sessionId, engineId, nativeId, label);
      dsh = await openEngineDshSession(sessions, persistence, sessionId, cwd);
      if (this.#closed) throw new EngineRefusal('engine-unavailable', 'The Host is shutting down');
      const live: LiveEngineSession = {
        botSlug,
        engine: opened,
        account: label,
        grant,
        dsh,
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
      this.#options.observe?.(botSlug, sessionId, 'idle');
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
    available: reason === undefined,
    ...(reason === undefined ? {} : { reason }),
    installed: detected.installed,
    ...(detected.version === undefined ? {} : { version: detected.version }),
    login: detected.login,
  };
}
