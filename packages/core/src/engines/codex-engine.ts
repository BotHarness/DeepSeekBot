import { spawn } from 'node:child_process';
import readline from 'node:readline';

import { engineLaunch } from './engine-launch.js';

import {
  type EngineAccount,
  type EngineApprovalDecision,
  type EngineChoice,
  type EngineEvent,
  type EngineModel,
  type EngineSendOptions,
  type EngineSession,
  type EngineStartOptions,
  type EngineTurnEnd,
  EngineRefusal,
  engineEffort,
  engineEnvironment,
} from './engine-session.js';

export const CODEX_GATEWAY_SERVER = 'deepseekbot';
const GATEWAY_TOKEN_VARIABLE = 'DEEPSEEKBOT_ENGINE_GATEWAY_TOKEN';

export interface CodexTransport {
  send(message: unknown): void;
  onMessage(listener: (message: unknown) => void): void;
  onExit(listener: (detail: string) => void): void;
  close(): Promise<void>;
}

export interface CodexProcessOptions {
  command: string;
  home: string;
  cwd: string;
  gateway?: EngineStartOptions['gateway'];
  env?: Readonly<Record<string, string | undefined>>;
}

export function codexProcessSpec(options: CodexProcessOptions): {
  args: string[];
  env: Record<string, string>;
} {
  const server = `mcp_servers.${CODEX_GATEWAY_SERVER}`;
  const { gateway } = options;
  return {
    args:
      gateway === undefined
        ? ['app-server']
        : [
            'app-server',
            '-c',
            `${server}.url=${JSON.stringify(gateway.url)}`,
            '-c',
            `${server}.bearer_token_env_var=${JSON.stringify(GATEWAY_TOKEN_VARIABLE)}`,
            '-c',
            `${server}.default_tools_approval_mode="approve"`,
          ],
    env: engineEnvironment(options.env ?? process.env, {
      CODEX_HOME: options.home,
      ...(gateway === undefined ? {} : { [GATEWAY_TOKEN_VARIABLE]: gateway.token }),
    }),
  };
}

export function spawnCodexTransport(options: CodexProcessOptions): CodexTransport {
  const spec = codexProcessSpec(options);
  const target = engineLaunch(options.command, spec.args, { env: options.env ?? process.env });
  const child = spawn(target.file, target.args, {
    cwd: options.cwd,
    env: spec.env,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    ...(target.windowsVerbatimArguments === true ? { windowsVerbatimArguments: true } : {}),
  });
  const listeners: Array<(message: unknown) => void> = [];
  const exits: Array<(detail: string) => void> = [];
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString('utf8')).slice(-4000);
  });
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    for (const listener of listeners) listener(message);
  });
  const exited = (detail: string) => {
    for (const listener of exits.splice(0)) listener(detail);
  };
  let ended = false;
  child.on('error', (error) => {
    exited(error.message);
  });
  child.stdin.on('error', (error) => {
    exited(`codex app-server input closed: ${error.message}`);
    if (!ended && child.pid !== undefined) child.kill('SIGTERM');
  });
  child.on('exit', (code, signal) => {
    ended = true;
    exited(`codex app-server exited (${signal ?? code})${stderr ? `: ${stderr.trim()}` : ''}`);
  });
  return {
    send: (message) => {
      if (ended || child.stdin.destroyed || !child.stdin.writable) return;
      child.stdin.write(`${JSON.stringify(message)}\n`);
    },
    onMessage: (listener) => void listeners.push(listener),
    onExit: (listener) => void exits.push(listener),
    close: async () => {
      if (ended || child.pid === undefined || child.exitCode !== null || child.signalCode !== null)
        return;
      const done = new Promise<void>((resolve) => child.once('exit', () => resolve()));
      child.kill('SIGTERM');
      const kill = setTimeout(() => child.kill('SIGKILL'), 3000);
      let giveUp: NodeJS.Timeout | undefined;
      await Promise.race([
        done,
        new Promise<void>((resolve) => {
          giveUp = setTimeout(resolve, 6000);
        }),
      ]);
      clearTimeout(kill);
      clearTimeout(giveUp);
    },
  };
}

type Json = Record<string, unknown>;
const record = (value: unknown): Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {};
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export function codexAccount(result: unknown): EngineAccount {
  const account = record(record(result)['account']);
  if (account['type'] === 'chatgpt')
    return { kind: 'subscription', engine: 'codex', plan: text(account['planType']) || 'chatgpt' };
  if (account['type'] === 'apiKey')
    return { kind: 'metered', engine: 'codex', detail: 'Codex is signed in with an API key' };
  if (typeof account['type'] === 'string')
    return { kind: 'metered', engine: 'codex', detail: `Codex login ${account['type']}` };
  return { kind: 'signed-out', engine: 'codex' };
}

const USAGE_LIMIT = /usage limit|hit your limit|rate limit reached/iu;

export function codexUsageLimit(error: Json): boolean {
  const info = error['codexErrorInfo'];
  if (info === 'usageLimitExceeded' || record(info)['usageLimitExceeded'] !== undefined)
    return true;
  return USAGE_LIMIT.test(text(error['message']));
}

export function codexRateLimit(limits: Json): Extract<EngineEvent, { kind: 'rate-limit' }> {
  const limited = limits['rateLimitReachedType'] != null || limits['spendControlReached'] === true;
  const windows = [record(limits['primary']), record(limits['secondary'])].filter(
    (window) => typeof window['usedPercent'] === 'number',
  );
  const percent = (window: Json) => window['usedPercent'] as number;
  const reset = (window: Json) =>
    typeof window['resetsAt'] === 'number' ? window['resetsAt'] : undefined;
  const spent = windows.filter((window) => percent(window) >= 100);
  const shown =
    limited && spent.length
      ? spent.reduce((latest, window) =>
          (reset(window) ?? 0) > (reset(latest) ?? 0) ? window : latest,
        )
      : windows.reduce<Json | undefined>(
          (most, window) => (most === undefined || percent(window) > percent(most) ? window : most),
          undefined,
        );
  const resetsAt = shown === undefined ? undefined : reset(shown);
  return {
    kind: 'rate-limit',
    ...(shown === undefined ? {} : { usedPercent: percent(shown) }),
    ...(resetsAt === undefined ? {} : { resetsAt }),
    limited: limited || spent.length > 0,
  };
}

export function codexModels(pages: readonly unknown[]): EngineModel[] {
  return pages.flatMap((page) => {
    const data = record(page)['data'];
    return (Array.isArray(data) ? data : []).flatMap((raw): EngineModel[] => {
      const entry = record(raw);
      const id = text(entry['model']) || text(entry['id']);
      if (id === '' || entry['hidden'] === true) return [];
      const efforts = Array.isArray(entry['supportedReasoningEfforts'])
        ? entry['supportedReasoningEfforts'].flatMap((option) => {
            const effort = text(record(option)['reasoningEffort']);
            return effort === '' ? [] : [engineEffort(effort)];
          })
        : [];
      const description = text(entry['description']);
      const defaultEffort = text(entry['defaultReasoningEffort']);
      return [
        {
          id,
          name: text(entry['displayName']) || id,
          ...(description === '' ? {} : { description }),
          efforts,
          ...(defaultEffort === '' ? {} : { defaultEffort }),
          ...(entry['isDefault'] === true ? { isDefault: true } : {}),
        },
      ];
    });
  });
}

const MODEL_PAGES = 10;

export const CODEX_TURN_SANDBOX = {
  type: 'workspaceWrite',
  writableRoots: [],
  networkAccess: false,
  excludeTmpdirEnvVar: true,
  excludeSlashTmp: true,
} as const;

const SERVER_APPROVALS = new Set([
  'item/commandExecution/requestApproval',
  'item/fileChange/requestApproval',
]);

interface ActiveTurn {
  options: EngineSendOptions;
  resolve(end: EngineTurnEnd): void;
  started?: Promise<string>;
  failure?: string;
  stopping?: boolean;
}

class CodexRequestRefused extends Error {}

const REQUEST_TIMEOUT_MS = 60_000;
const THREAD_GONE =
  /\b(?:thread|rollout)(?: [\w:./-]+)? (?:not found|does not exist)\b|no rollout|unknown thread|no such thread/iu;

export class CodexEngineSession implements EngineSession {
  readonly engine = 'codex' as const;
  readonly #transport: CodexTransport;
  readonly #cwd: string;
  readonly #instructions: string;
  readonly #contextSeed: EngineStartOptions['contextSeed'];
  readonly #choice: EngineChoice;
  #next = 1;
  readonly #pending = new Map<number, { resolve(value: unknown): void; reject(e: Error): void }>();
  readonly #approvals = new Map<string, number | string>();
  readonly #patches = new Map<string, string[]>();
  #initialized: Promise<void> | undefined;
  #threadId: string | undefined;
  #turn: ActiveTurn | undefined;
  #exited: string | undefined;
  #abandoned = false;
  readonly #requestTimeoutMs: number;

  constructor(
    transport: CodexTransport,
    options: Pick<EngineStartOptions, 'cwd' | 'instructions' | 'contextSeed'> &
      EngineChoice & { requestTimeoutMs?: number },
  ) {
    this.#transport = transport;
    this.#cwd = options.cwd;
    this.#instructions = options.instructions;
    this.#contextSeed = options.contextSeed;
    this.#choice = {
      ...(options.model === undefined ? {} : { model: options.model }),
      ...(options.effort === undefined ? {} : { effort: options.effort }),
    };
    this.#requestTimeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
    transport.onMessage((message) => this.#receive(record(message)));
    transport.onExit((detail) => {
      this.#exited = detail;
      for (const pending of this.#pending.values()) pending.reject(new Error(detail));
      this.#pending.clear();
      const turn = this.#turn;
      this.#turn = undefined;
      turn?.resolve(
        turn.stopping === true ? { status: 'interrupted' } : { status: 'failed', message: detail },
      );
    });
  }

  get ended(): boolean {
    return this.#exited !== undefined || this.#abandoned;
  }

  #model: string | undefined;

  get model(): string | undefined {
    return this.#model;
  }

  async account(): Promise<EngineAccount> {
    await this.#initialize();
    return codexAccount(await this.#request('account/read', {}));
  }

  async start(resume?: string): Promise<string> {
    await this.#initialize();
    const common = {
      cwd: this.#cwd,
      approvalPolicy: 'on-request',
      sandbox: 'workspace-write',
      developerInstructions: this.#instructions,
      ...(this.#choice.model === undefined ? {} : { model: this.#choice.model }),
    };
    let result: Json;
    if (resume === undefined)
      result = record(await this.#request('thread/start', { ...common, ephemeral: false }));
    else
      try {
        result = record(await this.#request('thread/resume', { ...common, threadId: resume }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (this.#exited === undefined && THREAD_GONE.test(message))
          throw new EngineRefusal('engine-thread-gone', message);
        throw new EngineRefusal('engine-failed', `Codex could not resume its thread: ${message}`);
      }
    const model = text(result['model']) || text(record(result['thread'])['model']);
    if (model) this.#model = model;
    const id = text(record(result['thread'])['id']);
    if (!id) throw new EngineRefusal('engine-failed', 'Codex did not return a thread id');
    this.#threadId = id;
    return id;
  }

  async send(currentInput: string, options: EngineSendOptions): Promise<EngineTurnEnd> {
    if (this.#threadId === undefined) throw new Error('Codex thread is not started');
    if (this.#turn !== undefined) throw new Error('A Codex turn is already running');
    if (options.signal?.aborted === true) return { status: 'interrupted' };
    const input = (this.#contextSeed?.() ?? '') + currentInput;
    const threadId = this.#threadId;
    let active!: ActiveTurn;
    const ended = new Promise<EngineTurnEnd>((resolve) => {
      active = { options, resolve };
      this.#turn = active;
    });
    let turnId: string | undefined;
    let acknowledged = false;
    const interrupt = () => {
      if (turnId === undefined) {
        void this.#transport.close();
        return;
      }
      this.#request('turn/interrupt', { threadId, turnId }).catch(() => {
        void this.#transport.close();
      });
    };
    const abort = () => {
      active.stopping = true;
      if (acknowledged) interrupt();
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    try {
      active.started = this.#request('turn/start', {
        threadId,
        input: [{ type: 'text', text: input, text_elements: [] }],
        sandboxPolicy: CODEX_TURN_SANDBOX,
        ...this.#choice,
      }).then((response) => text(record(record(response)['turn'])['id']));
      turnId = (await active.started) || undefined;
      acknowledged = true;
      if (active.stopping === true) interrupt();
      return await ended;
    } catch (error) {
      if (this.#turn === active) this.#turn = undefined;
      if (active.stopping === true) return { status: 'interrupted' };
      return { status: 'failed', message: error instanceof Error ? error.message : String(error) };
    } finally {
      options.signal?.removeEventListener('abort', abort);
    }
  }

  async steer(input: string): Promise<boolean> {
    const turn = this.#turn;
    if (turn?.started === undefined || turn.stopping === true) return false;
    const expectedTurnId = await turn.started;
    if (expectedTurnId === '' || this.#turn !== turn || turn.options.signal?.aborted === true)
      return false;
    try {
      await this.#request('turn/steer', {
        threadId: this.#threadId,
        expectedTurnId,
        input: [{ type: 'text', text: input, text_elements: [] }],
      });
      return true;
    } catch (error) {
      if (error instanceof CodexRequestRefused) return false;
      throw error;
    }
  }

  answer(approvalId: string, decision: EngineApprovalDecision): void {
    const id = this.#approvals.get(approvalId);
    if (id === undefined) return;
    this.#approvals.delete(approvalId);
    this.#transport.send({ id, result: { decision } });
  }

  async models(): Promise<EngineModel[]> {
    await this.#initialize();
    const pages: unknown[] = [];
    let cursor: string | undefined;
    do {
      const page = record(
        await this.#request('model/list', {
          limit: 100,
          includeHidden: false,
          ...(cursor === undefined ? {} : { cursor }),
        }),
      );
      pages.push(page);
      cursor = text(page['nextCursor']) || undefined;
    } while (cursor !== undefined && pages.length < MODEL_PAGES);
    return codexModels(pages);
  }

  async close(): Promise<void> {
    await this.#transport.close();
  }

  #initialize(): Promise<void> {
    this.#initialized ??= (async () => {
      await this.#request('initialize', {
        clientInfo: { name: 'deepseekbot', title: 'DeepSeekBot', version: '1' },
        capabilities: null,
      });
      this.#transport.send({ method: 'initialized' });
    })();
    return this.#initialized;
  }

  #request(method: string, params: unknown): Promise<unknown> {
    if (this.#exited !== undefined) return Promise.reject(new Error(this.#exited));
    if (this.#abandoned) return Promise.reject(new Error('The Codex process is closing'));
    const id = this.#next++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.#pending.delete(id)) return;
        this.#abandoned = true;
        reject(new Error(`Codex did not answer ${method} within ${this.#requestTimeoutMs} ms`));
        void this.#transport.close();
      }, this.#requestTimeoutMs);
      timer.unref?.();
      this.#pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.#transport.send({ id, method, params });
    });
  }

  #emit(event: EngineEvent): void {
    this.#turn?.options.onEvent(event);
  }

  #receive(message: Json): void {
    const method = typeof message['method'] === 'string' ? message['method'] : undefined;
    const id = message['id'];
    if (method === undefined) {
      if (typeof id !== 'number') return;
      const pending = this.#pending.get(id);
      this.#pending.delete(id);
      if (pending === undefined) return;
      const error = record(message['error']);
      if (message['error'] !== undefined)
        pending.reject(new CodexRequestRefused(text(error['message']) || 'Codex request failed'));
      else pending.resolve(message['result']);
      return;
    }
    const params = record(message['params']);
    if (typeof id === 'number' || typeof id === 'string') {
      this.#serverRequest(id, method, params);
      return;
    }
    switch (method) {
      case 'item/started':
        this.#itemStarted(record(params['item']));
        return;
      case 'item/completed':
        this.#itemCompleted(record(params['item']));
        return;
      case 'account/rateLimits/updated':
        this.#emit(codexRateLimit(record(params['rateLimits'])));
        return;
      case 'error': {
        if (params['willRetry'] === true || this.#turn === undefined) return;
        const error = record(params['error']);
        this.#turn.failure = text(error['message']) || 'Codex turn failed';
        if (codexUsageLimit(error)) this.#emit({ kind: 'rate-limit', limited: true });
        return;
      }
      case 'turn/completed': {
        const turn = record(params['turn']);
        const active = this.#turn;
        if (active === undefined) return;
        this.#turn = undefined;
        const status = turn['status'];
        if (status === 'completed') active.resolve({ status: 'completed' });
        else if (status === 'interrupted') active.resolve({ status: 'interrupted' });
        else {
          if (codexUsageLimit(record(turn['error'])))
            active.options.onEvent({ kind: 'rate-limit', limited: true });
          active.resolve({
            status: 'failed',
            message:
              text(record(turn['error'])['message']) || active.failure || 'Codex turn failed',
          });
        }
        return;
      }
      default:
        return;
    }
  }

  #serverRequest(id: number | string, method: string, params: Json): void {
    if (SERVER_APPROVALS.has(method)) {
      const itemId = text(params['itemId']);
      const approvalId = `${itemId}:${text(params['approvalId']) || String(id)}`;
      this.#approvals.set(approvalId, id);
      const command = text(params['command']);
      const reason = text(params['reason']);
      const patch = method === 'item/fileChange/requestApproval';
      const input: Record<string, unknown> = patch
        ? {
            files: this.#patches.get(itemId) ?? [],
            ...(text(params['grantRoot']) ? { grantRoot: text(params['grantRoot']) } : {}),
          }
        : { command, ...(text(params['cwd']) ? { cwd: text(params['cwd']) } : {}) };
      if (reason) input['reason'] = reason;
      this.#emit({
        kind: 'approval',
        approvalId,
        ...(itemId ? { callId: itemId } : {}),
        tool: patch ? 'apply_patch' : 'shell',
        summary: command || reason || 'Codex asks to change files',
        input,
      });
      if (this.#turn === undefined) this.answer(approvalId, 'decline');
      return;
    }
    if (method === 'mcpServer/elicitation/request') {
      const accept = params['serverName'] === CODEX_GATEWAY_SERVER && params['mode'] === 'form';
      this.#transport.send({
        id,
        result: { action: accept ? 'accept' : 'decline', content: null, _meta: null },
      });
      return;
    }
    this.#transport.send({
      id,
      error: { code: -32601, message: `${method} is not available to a PersonaBot` },
    });
  }

  #itemStarted(item: Json): void {
    const callId = text(item['id']);
    switch (item['type']) {
      case 'commandExecution':
        this.#emit({
          kind: 'tool-call',
          callId,
          name: 'shell',
          arguments: JSON.stringify({ command: text(item['command']) }),
        });
        return;
      case 'fileChange': {
        const files = (Array.isArray(item['changes']) ? item['changes'] : []).map((change) =>
          text(record(change)['path']),
        );
        this.#patches.set(callId, files);
        this.#emit({
          kind: 'tool-call',
          callId,
          name: 'apply_patch',
          arguments: JSON.stringify({ files }),
        });
        return;
      }
      case 'mcpToolCall': {
        const server = text(item['server']);
        const tool = text(item['tool']);
        this.#emit({
          kind: 'tool-call',
          callId,
          name: server === CODEX_GATEWAY_SERVER ? tool : `mcp__${server}__${tool}`,
          arguments: JSON.stringify(item['arguments'] ?? {}),
        });
        return;
      }
      case 'webSearch':
        this.#emit({
          kind: 'tool-call',
          callId,
          name: 'web_search',
          arguments: JSON.stringify({ query: text(item['query']) }),
        });
        return;
      default:
        return;
    }
  }

  #itemCompleted(item: Json): void {
    const callId = text(item['id']);
    switch (item['type']) {
      case 'agentMessage': {
        const value = text(item['text']);
        if (value) this.#emit({ kind: 'text', text: value });
        return;
      }
      case 'reasoning': {
        const parts = [item['summary'], item['content']].flatMap((part) =>
          Array.isArray(part) ? part.filter((entry) => typeof entry === 'string') : [],
        );
        if (parts.length) this.#emit({ kind: 'reasoning', text: parts.join('\n\n') });
        return;
      }
      case 'commandExecution': {
        const exitCode = item['exitCode'];
        this.#emit({
          kind: 'tool-result',
          callId,
          text: text(item['aggregatedOutput']) || `exit ${String(exitCode ?? '?')}`,
          isError:
            item['status'] !== 'completed' || (typeof exitCode === 'number' && exitCode !== 0),
        });
        return;
      }
      case 'fileChange':
        this.#patches.delete(callId);
        this.#emit({
          kind: 'tool-result',
          callId,
          text: text(item['status']),
          isError: item['status'] !== 'completed',
        });
        return;
      case 'mcpToolCall': {
        const error = record(item['error']);
        const content = record(item['result'])['content'];
        const output = (Array.isArray(content) ? content : [])
          .map((block) => text(record(block)['text']))
          .filter(Boolean)
          .join('\n');
        this.#emit({
          kind: 'tool-result',
          callId,
          text: text(error['message']) || output,
          isError: item['status'] !== 'completed',
        });
        return;
      }
      case 'webSearch':
        this.#emit({ kind: 'tool-result', callId, text: 'done', isError: false });
        return;
      default:
        return;
    }
  }
}
