import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  type CodexProcessOptions,
  type CodexTransport,
  CodexEngineSession,
  spawnCodexTransport,
} from './codex-engine.js';
import { type CodexStatus, detectCodex, startCodexLogin } from './codex-status.js';
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

export type EngineSessionState = 'starting' | 'running' | 'idle';

export interface EngineSessionDescription {
  engine: EngineId;
  account?: string;
  state: EngineSessionState;
}

export interface EngineStatusReport {
  engine: EngineId;
  available: boolean;
  reason?: 'host-not-local' | 'not-installed' | 'signed-out' | 'not-subscription';
  installed: boolean;
  version?: string;
  login: CodexStatus['login'];
}

export interface EngineHostOptions {
  root: string;
  local: boolean;
  codexCommand?: string;
  env?: Readonly<Record<string, string | undefined>>;
  gateway: EngineGateway;
  sessions(): EngineSessionStore | undefined;
  persistence(): EngineSessionPersistence | undefined;
  observe?(botSlug: string, sessionId: string, state: EngineSessionState): void;
  openCodex?(options: CodexProcessOptions): CodexTransport;
  detectCodex?(options: { command: string; home: string }): Promise<CodexStatus>;
  startCodexLogin?(options: { command: string; home: string }): Promise<{ url?: string }>;
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
  running: Promise<void>;
}

const SIGN_IN_HINT =
  'Sign the Bot in with your ChatGPT subscription: run `deepseekbot engine login codex` on this computer.';

export class EngineHost {
  readonly store: EngineStore;
  readonly #options: EngineHostOptions;
  readonly #live = new Map<string, LiveEngineSession>();
  readonly #opening = new Map<string, Promise<LiveEngineSession>>();
  readonly #states = new Map<string, EngineSessionDescription>();

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
    const detected = await (this.#options.detectCodex ?? detectCodex)(this.#codex);
    const reason: EngineStatusReport['reason'] = !detected.installed
      ? 'not-installed'
      : detected.login === 'chatgpt'
        ? undefined
        : detected.login === 'api-key'
          ? 'not-subscription'
          : 'signed-out';
    return [
      {
        engine: 'codex',
        available: reason === undefined,
        ...(reason === undefined ? {} : { reason }),
        installed: detected.installed,
        ...(detected.version === undefined ? {} : { version: detected.version }),
        login: detected.login,
      },
    ];
  }

  async login(engine: EngineId): Promise<{ engine: EngineId; started: true; url?: string }> {
    if (!this.#options.local)
      throw new EngineRefusal(
        'engine-unavailable',
        'Subscription Engines run only on a local Host',
      );
    const started = await (this.#options.startCodexLogin ?? startCodexLogin)(this.#codex);
    return { engine, started: true, ...started };
  }

  async runTurn(request: EngineTurnRequest): Promise<void> {
    const engine = this.engineFor(request.botSlug);
    if (engine === undefined)
      throw new EngineRefusal(
        'engine-unavailable',
        'This Bot does not run on a Subscription Engine',
      );
    const live = await this.#open(request);
    await live.running;
    let finish!: () => void;
    live.running = new Promise((resolve) => (finish = resolve));
    try {
      live.turn = { channelId: request.channelId, execute: request.execute };
      this.#setState(
        request.sessionId,
        { engine, account: live.account, state: 'running' },
        live.botSlug,
      );
      const log = new EngineTurnLog(live.dsh, engine, live.account, request.input);
      const end = await live.engine.send(request.input, {
        signal: request.signal,
        onEvent: (event) => {
          log.accept(event);
          if (event.kind === 'approval') live.engine.answer(event.approvalId, 'decline');
        },
      });
      await log.end(end);
      if (end.status === 'failed') throw new EngineRefusal('engine-failed', end.message);
    } finally {
      live.turn = undefined;
      this.#setState(
        request.sessionId,
        { engine, account: live.account, state: 'idle' },
        live.botSlug,
      );
      finish();
    }
  }

  async release(sessionId: string): Promise<void> {
    const opening = this.#opening.get(sessionId);
    if (opening !== undefined) await opening.catch(() => undefined);
    const live = this.#live.get(sessionId);
    if (live === undefined) return;
    this.#live.delete(sessionId);
    this.#states.delete(sessionId);
    live.grant.revoke();
    await live.running;
    await Promise.allSettled([live.engine.close(), live.dsh.close()]);
  }

  async close(): Promise<void> {
    await Promise.allSettled([...this.#live.keys()].map((id) => this.release(id)));
  }

  isLive(sessionId: string): boolean {
    return this.#live.has(sessionId) || this.#opening.has(sessionId);
  }

  #setState(sessionId: string, description: EngineSessionDescription, botSlug: string): void {
    this.#states.set(sessionId, description);
    this.#options.observe?.(botSlug, sessionId, description.state);
  }

  #open(request: EngineTurnRequest): Promise<LiveEngineSession> {
    const live = this.#live.get(request.sessionId);
    if (live !== undefined) return Promise.resolve(live);
    const pending = this.#opening.get(request.sessionId);
    if (pending !== undefined) return pending;
    const opening = this.#start(request).finally(() => this.#opening.delete(request.sessionId));
    this.#opening.set(request.sessionId, opening);
    return opening;
  }

  async #start(request: EngineTurnRequest): Promise<LiveEngineSession> {
    const { botSlug, sessionId } = request;
    this.#setState(sessionId, { engine: 'codex', state: 'starting' }, botSlug);
    const sessions = this.#options.sessions();
    const persistence = this.#options.persistence();
    if (sessions === undefined || persistence === undefined) {
      this.#states.delete(sessionId);
      throw new EngineRefusal('engine-unavailable', 'DSH Session Persistence is unavailable');
    }
    const cwd = join(this.#options.root, 'workdirs', botSlug);
    mkdirSync(cwd, { recursive: true });
    const holder: { live?: LiveEngineSession } = {};
    await this.#options.gateway.start();
    const tools: EngineGatewayTool[] = request.tools
      .filter((tool) => ENGINE_GATEWAY_TOOLS.has(tool.name))
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.parameters,
      }));
    const grant = this.#options.gateway.grant({
      botSlug,
      sessionId,
      tools,
      channelId: () => holder.live?.turn?.channelId,
      call: async (name, args, signal) => {
        const turn = holder.live?.turn;
        if (turn === undefined) return { text: 'refused: session-not-running', isError: true };
        const value = await turn.execute(name, args, signal);
        return { text: typeof value === 'string' ? value : JSON.stringify(value), isError: false };
      },
    });
    const codex = this.#codex;
    let engine: EngineSession | undefined;
    let dsh: OpenedEngineDshSession | undefined;
    try {
      const options: CodexProcessOptions = {
        ...codex,
        cwd,
        gateway: { url: grant.url, token: grant.token },
      };
      const transport = (this.#options.openCodex ?? spawnCodexTransport)(options);
      engine = new CodexEngineSession(transport, {
        cwd,
        instructions: request.instructions,
      });
      const account = await engine.account().catch((error: unknown) => {
        throw new EngineRefusal(
          'engine-not-installed',
          `Codex did not start: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
      const label = requireSubscription(account);
      const stored = this.store.nativeSession(sessionId);
      let nativeId: string;
      try {
        nativeId = await engine.start(stored?.engine === 'codex' ? stored.nativeId : undefined);
      } catch (error) {
        if (stored === undefined) throw error;
        nativeId = await engine.start();
      }
      this.store.rememberNativeSession(sessionId, 'codex', nativeId, label);
      dsh = await openEngineDshSession(sessions, persistence, sessionId, cwd);
      const live: LiveEngineSession = {
        botSlug,
        engine,
        account: label,
        grant,
        dsh,
        turn: undefined,
        running: Promise.resolve(),
      };
      holder.live = live;
      this.#live.set(sessionId, live);
      return live;
    } catch (error) {
      grant.revoke();
      this.#states.delete(sessionId);
      this.#options.observe?.(botSlug, sessionId, 'idle');
      await Promise.allSettled([engine?.close(), dsh?.close()]);
      throw error;
    }
  }
}

export function requireSubscription(account: EngineAccount): string {
  if (account.kind === 'subscription') return `ChatGPT ${account.plan}`;
  if (account.kind === 'metered')
    throw new EngineRefusal(
      'engine-not-subscription',
      `${account.detail}, which bills per use. ${SIGN_IN_HINT}`,
    );
  throw new EngineRefusal('engine-signed-out', `Codex is not signed in. ${SIGN_IN_HINT}`);
}
