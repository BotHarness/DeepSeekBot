import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { engineLaunch } from './engine-launch.js';
import {
  type EngineAccount,
  type EngineApprovalDecision,
  type EngineChoice,
  type EngineEvent,
  type EngineGatewayEndpoint,
  type EngineModel,
  type EngineSendOptions,
  type EngineSession,
  type EngineTurnEnd,
  EngineRefusal,
  engineEffort,
  engineEnvironment,
} from './engine-session.js';

export const CLAUDE_GATEWAY_SERVER = 'deepseekbot';
const GATEWAY_PREFIX = `mcp__${CLAUDE_GATEWAY_SERVER}__`;

export interface ClaudeUserMessage {
  type: 'user';
  message: { role: 'user'; content: string };
  parent_tool_use_id: null;
}

export interface ClaudePermissionContext {
  signal: AbortSignal;
  toolUseID: string;
  title?: string;
  description?: string;
  decisionReason?: string;
}

export type ClaudePermission =
  | { behavior: 'allow'; updatedInput: Record<string, unknown> }
  | { behavior: 'deny'; message: string };

export interface ClaudeSpawnOptions {
  command: string;
  args: string[];
  cwd?: string;
  env: Record<string, string | undefined>;
  signal: AbortSignal;
}

export interface ClaudeQueryOptions {
  cwd: string;
  env: Record<string, string>;
  pathToClaudeCodeExecutable: string;
  settingSources: [];
  strictMcpConfig: true;
  mcpServers: Record<
    string,
    { type: 'http'; url: string; headers: Record<string, string>; alwaysLoad: true }
  >;
  mcpServersDelivery?: 'initialize';
  permissionMode: 'default';
  model?: string;
  effort?: string;
  systemPrompt: { type: 'preset'; preset: 'claude_code'; append: string };
  resume?: string;
  sessionId?: string;
  canUseTool(
    toolName: string,
    input: Record<string, unknown>,
    context: ClaudePermissionContext,
  ): Promise<ClaudePermission>;
  stderr(data: string): void;
  spawnClaudeCodeProcess(options: ClaudeSpawnOptions): unknown;
}

export interface ClaudeQuery extends AsyncIterable<unknown> {
  accountInfo(): Promise<unknown>;
  supportedModels(): Promise<unknown>;
  interrupt(): Promise<unknown>;
  close(): void;
}

export type ClaudeQueryFactory = (params: {
  prompt: AsyncIterable<ClaudeUserMessage>;
  options: ClaudeQueryOptions;
}) => ClaudeQuery | Promise<ClaudeQuery>;

export const sdkClaudeQuery: ClaudeQueryFactory = async (params) => {
  const sdk = await import('@anthropic-ai/claude-agent-sdk');
  return sdk.query(params as unknown as Parameters<typeof sdk.query>[0]) as unknown as ClaudeQuery;
};

const PROVIDER_VARIABLE =
  /^(?:anthropic_|claude_code_use_|claude_code_oauth|aws_bearer_token_bedrock)/iu;

export function spawnClaudeProcess(
  options: ClaudeSpawnOptions,
  onStderr: (data: string) => void,
): unknown {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(options.env))
    if (value !== undefined && !PROVIDER_VARIABLE.test(key)) env[key] = value;
  const target = engineLaunch(options.command, options.args, { env });
  const child = spawn(target.file, target.args, {
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    env,
    signal: options.signal,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    ...(target.windowsVerbatimArguments === true ? { windowsVerbatimArguments: true } : {}),
  });
  child.stderr.on('data', (chunk: Buffer) => onStderr(chunk.toString('utf8')));
  child.on('error', () => undefined);
  return child;
}

export interface ClaudeProcessOptions extends EngineChoice {
  executable: string;
  home: string;
  cwd: string;
  instructions: string;
  gateway?: EngineGatewayEndpoint;
  env?: Readonly<Record<string, string | undefined>>;
}

export function claudeQueryOptions(
  options: ClaudeProcessOptions,
  handlers: Pick<ClaudeQueryOptions, 'canUseTool' | 'stderr'>,
  session: { resume: string } | { sessionId: string },
): ClaudeQueryOptions {
  return {
    cwd: options.cwd,
    env: engineEnvironment(options.env ?? process.env, {
      CLAUDE_CONFIG_DIR: options.home,
      CLAUDE_AGENT_SDK_CLIENT_APP: 'deepseekbot',
    }),
    pathToClaudeCodeExecutable: options.executable,
    settingSources: [],
    strictMcpConfig: true,
    mcpServers:
      options.gateway === undefined
        ? {}
        : {
            [CLAUDE_GATEWAY_SERVER]: {
              type: 'http',
              url: options.gateway.url,
              headers: { Authorization: `Bearer ${options.gateway.token}` },
              alwaysLoad: true,
            },
          },
    ...(options.gateway === undefined ? {} : { mcpServersDelivery: 'initialize' as const }),
    permissionMode: 'default',
    ...(options.model === undefined ? {} : { model: options.model }),
    ...(options.effort === undefined ? {} : { effort: options.effort }),
    systemPrompt: { type: 'preset', preset: 'claude_code', append: options.instructions },
    ...session,
    ...handlers,
    spawnClaudeCodeProcess: (spawnOptions) => spawnClaudeProcess(spawnOptions, handlers.stderr),
  };
}

type Json = Record<string, unknown>;
const record = (value: unknown): Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {};
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export const CLAUDE_MIN_VERSION = '2.1.326';

export function olderThan(version: string, minimum: string): boolean {
  const parts = (value: string) => (value.match(/\d+/gu) ?? []).slice(0, 3).map(Number);
  const have = parts(version);
  const need = parts(minimum);
  for (let index = 0; index < need.length; index += 1) {
    const difference = (have[index] ?? 0) - need[index]!;
    if (difference !== 0) return difference < 0;
  }
  return false;
}

export function claudeAccount(info: unknown): EngineAccount {
  const account = record(info);
  const provider = text(account['apiProvider']);
  if (provider !== '' && provider !== 'firstParty')
    return { kind: 'metered', engine: 'claude', detail: `Claude Code runs on ${provider}` };
  const keySource = text(account['apiKeySource']);
  if (keySource !== '' && keySource !== 'none')
    return {
      kind: 'metered',
      engine: 'claude',
      detail: `Claude Code is signed in with an API key (${keySource})`,
    };
  const plan = text(account['subscriptionType']);
  if (plan !== '') return { kind: 'subscription', engine: 'claude', plan };
  if (text(account['tokenSource']) !== '' || text(account['email']) !== '')
    return {
      kind: 'metered',
      engine: 'claude',
      detail: 'Claude Code is not signed in with a Claude subscription',
    };
  return { kind: 'signed-out', engine: 'claude' };
}

export function claudeModels(list: unknown): EngineModel[] {
  return (Array.isArray(list) ? list : []).flatMap((raw): EngineModel[] => {
    const entry = record(raw);
    const id = text(entry['value']);
    if (id === '') return [];
    const levels = entry['supportedEffortLevels'];
    const description = text(entry['description']);
    return [
      {
        id,
        name: text(entry['displayName']) || id,
        ...(description === '' ? {} : { description }),
        efforts:
          entry['supportsEffort'] === false || !Array.isArray(levels)
            ? []
            : levels.flatMap((level) =>
                typeof level === 'string' && level !== '' ? [engineEffort(level)] : [],
              ),
        ...(id === 'default' ? { isDefault: true } : {}),
      },
    ];
  });
}

export function claudeToolName(name: string): string {
  return name.startsWith(GATEWAY_PREFIX) ? name.slice(GATEWAY_PREFIX.length) : name;
}

function resultText(content: unknown): string {
  if (typeof content === 'string') return content;
  return (Array.isArray(content) ? content : [])
    .map((block) => {
      const entry = record(block);
      return entry['type'] === 'text' ? text(entry['text']) : '';
    })
    .filter(Boolean)
    .join('\n');
}

export function claudeRateLimit(info: unknown): Extract<EngineEvent, { kind: 'rate-limit' }> {
  const limit = record(info);
  const utilization = limit['utilization'];
  const resetsAt = limit['resetsAt'];
  return {
    kind: 'rate-limit',
    ...(typeof utilization === 'number'
      ? { usedPercent: utilization <= 1 ? Math.round(utilization * 1000) / 10 : utilization }
      : {}),
    ...(typeof resetsAt === 'number' ? { resetsAt } : {}),
    limited:
      limit['status'] === 'rejected' ||
      limit['isUsingOverage'] === true ||
      limit['overageInUse'] === true,
  };
}

class InputQueue implements AsyncIterable<ClaudeUserMessage> {
  readonly #items: ClaudeUserMessage[] = [];
  readonly #waiters: Array<(result: IteratorResult<ClaudeUserMessage>) => void> = [];
  #closed = false;

  push(message: ClaudeUserMessage): void {
    const waiter = this.#waiters.shift();
    if (waiter !== undefined) waiter({ value: message, done: false });
    else this.#items.push(message);
  }

  close(): void {
    this.#closed = true;
    for (const waiter of this.#waiters.splice(0)) waiter({ value: undefined, done: true });
  }

  [Symbol.asyncIterator](): AsyncIterator<ClaudeUserMessage> {
    return {
      next: () => {
        const item = this.#items.shift();
        if (item !== undefined) return Promise.resolve({ value: item, done: false });
        if (this.#closed) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => this.#waiters.push(resolve));
      },
      return: () => {
        this.close();
        return Promise.resolve({ value: undefined, done: true });
      },
    };
  }
}

interface ActiveTurn {
  options: EngineSendOptions;
  resolve(end: EngineTurnEnd): void;
  failure?: string;
  stopping?: boolean;
}

interface OpenQuery {
  query: ClaudeQuery;
  input: InputQueue;
  sessionId: string;
  resumed: boolean;
  exited: Promise<string>;
}

const SESSION_GONE = /no conversation found|session(?: id)? [\w-]+ (?:not found|does not exist)/iu;
const DENIED = 'The Human did not approve this tool call.';

export interface ClaudeEngineOptions extends ClaudeProcessOptions {
  query: ClaudeQueryFactory;
  resume?: string;
  newSessionId?: () => string;
}

export class ClaudeEngineSession implements EngineSession {
  readonly engine = 'claude' as const;
  readonly #options: ClaudeEngineOptions;
  #open: Promise<OpenQuery> | undefined;
  #current: OpenQuery | undefined;
  #turn: ActiveTurn | undefined;
  #exited: string | undefined;
  #closed = false;
  #resumeLost = false;
  #metered: string | undefined;
  #outdated: string | undefined;
  #stderr = '';
  readonly #approvals = new Map<string, (decision: EngineApprovalDecision) => void>();

  constructor(options: ClaudeEngineOptions) {
    this.#options = options;
  }

  get ended(): boolean {
    return this.#exited !== undefined || this.#closed;
  }

  async account(): Promise<EngineAccount> {
    const open = await this.#ensure(this.#options.resume);
    const info = await Promise.race([
      open.query.accountInfo(),
      open.exited.then((detail) => Promise.reject(new Error(detail))),
    ]);
    if (this.#metered !== undefined)
      return { kind: 'metered', engine: 'claude', detail: this.#metered };
    return claudeAccount(info);
  }

  async start(resume?: string): Promise<string> {
    if (resume !== undefined && resume === this.#options.resume && this.#resumeLost)
      throw new EngineRefusal('engine-thread-gone', `Claude Code has no session ${resume}`);
    const open = await this.#ensure(resume);
    return open.sessionId;
  }

  async send(input: string, options: EngineSendOptions): Promise<EngineTurnEnd> {
    const open = this.#current;
    if (open === undefined) throw new Error('Claude Code session is not started');
    if (this.#turn !== undefined) throw new Error('A Claude Code turn is already running');
    if (this.ended) return { status: 'failed', message: this.#exited ?? 'Claude Code is closed' };
    if (this.#metered !== undefined)
      return { status: 'failed', message: `${this.#metered}, which bills per use` };
    if (this.#outdated !== undefined) return { status: 'failed', message: this.#outdated };
    if (options.signal?.aborted === true) return { status: 'interrupted' };
    let active!: ActiveTurn;
    const ended = new Promise<EngineTurnEnd>((resolve) => {
      active = { options, resolve };
      this.#turn = active;
    });
    const abort = () => {
      active.stopping = true;
      for (const answer of [...this.#approvals.values()]) answer('decline');
      open.query.interrupt().catch(() => this.close());
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    try {
      open.input.push({
        type: 'user',
        message: { role: 'user', content: input },
        parent_tool_use_id: null,
      });
      return await ended;
    } finally {
      options.signal?.removeEventListener('abort', abort);
    }
  }

  async models(): Promise<EngineModel[]> {
    const open = await this.#ensure(this.#options.resume);
    return claudeModels(
      await Promise.race([
        open.query.supportedModels(),
        open.exited.then((detail) => Promise.reject(new Error(detail))),
      ]),
    );
  }

  answer(approvalId: string, decision: EngineApprovalDecision): void {
    const answer = this.#approvals.get(approvalId);
    if (answer === undefined) return;
    this.#approvals.delete(approvalId);
    answer(decision);
  }

  async close(): Promise<void> {
    this.#closed = true;
    for (const answer of [...this.#approvals.values()]) answer('decline');
    const open = this.#current;
    if (open === undefined) return;
    open.input.close();
    try {
      open.query.close();
    } catch {
      return;
    }
    await Promise.race([open.exited, new Promise((resolve) => setTimeout(resolve, 6000))]);
  }

  #ensure(resume: string | undefined): Promise<OpenQuery> {
    const current = this.#current;
    if (current !== undefined) {
      const matches = resume === undefined ? !current.resumed : current.sessionId === resume;
      if (matches || (resume === this.#options.resume && this.#resumeLost))
        return Promise.resolve(current);
      this.#current = undefined;
      this.#open = undefined;
      current.input.close();
      current.query.close();
    }
    this.#open ??= this.#launch(resume);
    return this.#open;
  }

  async #launch(resume: string | undefined): Promise<OpenQuery> {
    if (this.#closed) throw new EngineRefusal('engine-unavailable', 'Claude Code is closing');
    const attempt = async (id: string | undefined): Promise<OpenQuery> => {
      const sessionId = id ?? this.#options.newSessionId?.() ?? randomUUID();
      const input = new InputQueue();
      const query = await this.#options.query({
        prompt: input,
        options: claudeQueryOptions(
          this.#options,
          {
            canUseTool: (name, args, context) => this.#permission(name, args, context),
            stderr: (data) => {
              this.#stderr = (this.#stderr + data).slice(-4000);
            },
          },
          id === undefined ? { sessionId } : { resume: id },
        ),
      });
      if (this.#closed) {
        input.close();
        query.close();
        throw new EngineRefusal('engine-unavailable', 'Claude Code is closing');
      }
      let exited!: (detail: string) => void;
      const open: OpenQuery = {
        query,
        input,
        sessionId,
        resumed: id !== undefined,
        exited: new Promise((resolve) => (exited = resolve)),
      };
      this.#current = open;
      void this.#pump(open, exited);
      if (id !== undefined) {
        const detail = await Promise.race([
          query.accountInfo().then(
            () => undefined,
            (error: unknown) => (error instanceof Error ? error.message : String(error)),
          ),
          open.exited,
        ]);
        if (detail !== undefined && SESSION_GONE.test(`${detail}\n${this.#stderr}`)) {
          this.#resumeLost = true;
          this.#current = undefined;
          this.#exited = undefined;
          input.close();
          query.close();
          return attempt(undefined);
        }
      }
      return open;
    };
    return attempt(resume);
  }

  async #pump(open: OpenQuery, exited: (detail: string) => void): Promise<void> {
    let detail = 'Claude Code exited';
    try {
      for await (const message of open.query) {
        if (this.#current !== open) continue;
        this.#receive(record(message));
      }
    } catch (error) {
      detail = error instanceof Error ? error.message : String(error);
    }
    const stderr = this.#stderr.trim();
    if (stderr !== '' && !detail.includes(stderr)) detail = `${detail}: ${stderr.slice(-1000)}`;
    exited(detail);
    if (this.#current !== open) return;
    this.#exited = detail;
    for (const answer of [...this.#approvals.values()]) answer('decline');
    const turn = this.#turn;
    this.#turn = undefined;
    turn?.resolve(
      turn.stopping === true ? { status: 'interrupted' } : { status: 'failed', message: detail },
    );
  }

  #emit(event: EngineEvent): void {
    this.#turn?.options.onEvent(event);
  }

  #permission(
    name: string,
    input: Record<string, unknown>,
    context: ClaudePermissionContext,
  ): Promise<ClaudePermission> {
    if (name.startsWith(GATEWAY_PREFIX))
      return Promise.resolve({ behavior: 'allow', updatedInput: input });
    const approvalId = context.toolUseID || randomUUID();
    if (this.#turn === undefined || context.signal.aborted)
      return Promise.resolve({ behavior: 'deny', message: DENIED });
    return new Promise((resolve) => {
      const answer = (decision: EngineApprovalDecision) => {
        this.#approvals.delete(approvalId);
        resolve(
          decision === 'accept'
            ? { behavior: 'allow', updatedInput: input }
            : { behavior: 'deny', message: DENIED },
        );
      };
      this.#approvals.set(approvalId, answer);
      context.signal.addEventListener('abort', () => answer('decline'), { once: true });
      this.#emit({
        kind: 'approval',
        approvalId,
        ...(context.toolUseID ? { callId: context.toolUseID } : {}),
        tool: claudeToolName(name),
        input,
        summary:
          context.title ||
          context.description ||
          `${claudeToolName(name)} ${JSON.stringify(input).slice(0, 400)}`,
      });
    });
  }

  #refuse(failure: string): void {
    const turn = this.#turn;
    if (turn === undefined) return;
    turn.failure ??= failure;
    this.#current?.query.interrupt().catch(() => this.close());
  }

  #receive(message: Json): void {
    switch (message['type']) {
      case 'system': {
        if (message['subtype'] !== 'init') return;
        const keySource = text(message['apiKeySource']);
        if (keySource !== '' && keySource !== 'none') {
          this.#metered = `Claude Code is signed in with an API key (${keySource})`;
          this.#refuse(`${this.#metered}, which bills per use`);
        }
        const version = text(message['claude_code_version']);
        if (version !== '' && olderThan(version, CLAUDE_MIN_VERSION)) {
          this.#outdated = `Claude Code ${version} is too old for DeepSeekBot. Update it to ${CLAUDE_MIN_VERSION} or newer`;
          this.#refuse(this.#outdated);
        }
        return;
      }
      case 'assistant':
        this.#assistant(message);
        return;
      case 'user':
        this.#toolResults(message);
        return;
      case 'rate_limit_event':
        this.#emit(claudeRateLimit(message['rate_limit_info']));
        return;
      case 'result':
        this.#result(message);
        return;
      default:
        return;
    }
  }

  #assistant(message: Json): void {
    if (message['parent_tool_use_id'] != null || this.#turn === undefined) return;
    const error = text(message['error']);
    if (error !== '') this.#turn.failure ??= `Claude Code reported ${error}`;
    const content = record(message['message'])['content'];
    for (const raw of Array.isArray(content) ? content : []) {
      const block = record(raw);
      switch (block['type']) {
        case 'thinking': {
          const value = text(block['thinking']);
          if (value) this.#emit({ kind: 'reasoning', text: value });
          break;
        }
        case 'text': {
          const value = text(block['text']);
          if (value) this.#emit({ kind: 'text', text: value });
          break;
        }
        case 'tool_use':
          this.#emit({
            kind: 'tool-call',
            callId: text(block['id']),
            name: claudeToolName(text(block['name'])),
            arguments: JSON.stringify(block['input'] ?? {}),
          });
          break;
        default:
          break;
      }
    }
  }

  #toolResults(message: Json): void {
    if (message['parent_tool_use_id'] != null) return;
    const content = record(message['message'])['content'];
    for (const raw of Array.isArray(content) ? content : []) {
      const block = record(raw);
      if (block['type'] !== 'tool_result') continue;
      this.#emit({
        kind: 'tool-result',
        callId: text(block['tool_use_id']),
        text: resultText(block['content']),
        isError: block['is_error'] === true,
      });
    }
  }

  #result(message: Json): void {
    const turn = this.#turn;
    if (turn === undefined) return;
    this.#turn = undefined;
    if (turn.failure !== undefined) {
      turn.resolve({ status: 'failed', message: turn.failure });
      return;
    }
    if (turn.stopping === true) {
      turn.resolve({ status: 'interrupted' });
      return;
    }
    if (message['subtype'] === 'success' && message['is_error'] !== true) {
      turn.resolve({ status: 'completed' });
      return;
    }
    const errors = Array.isArray(message['errors'])
      ? message['errors'].filter((entry) => typeof entry === 'string')
      : [];
    turn.resolve({
      status: 'failed',
      message:
        text(message['result']) ||
        errors.join('\n') ||
        `Claude Code turn ended with ${text(message['subtype']) || 'an error'}`,
    });
  }
}
