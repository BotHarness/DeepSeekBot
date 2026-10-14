import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { dmChannelId } from '../channels/channel.js';
import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';
import { BOT_TOOL_COMMANDS, runBotToolCommand } from './cli-bot-tool.js';
import {
  CHANNEL_COMMANDS,
  CHANNEL_OPTIONS,
  isChannelCommand,
  runChannelCommand,
} from './cli-channels.js';
import {
  BROWSER_COMPUTER_COMMANDS,
  BROWSER_COMPUTER_OPTIONS,
  isBrowserComputerCommand,
  runBrowserComputerCommand,
  type BrowserComputerValues,
} from './cli-browser-computer.js';
import {
  IM_COMMANDS,
  IM_OPTIONS,
  prepareImAuthorization,
  runImAuthorization,
  type ImValues,
} from './cli-im-authorization.js';
import {
  MESSAGING_COMMANDS,
  MESSAGING_OPTIONS,
  prepareMessaging,
  runMessaging,
  type MessagingCommand,
  type MessagingValues,
} from './cli-messaging.js';
import {
  isModelsUsageCommand,
  MODELS_USAGE_COMMANDS,
  MODELS_USAGE_OPTIONS,
  runModelsUsage,
  type ModelsUsageValues,
} from './cli-models-usage.js';
import {
  HOST_ADMIN_COMMANDS,
  HOST_ADMIN_OPTIONS,
  isHostAdminCommand,
  runHostAdminCommand,
  type HostAdminValues,
} from './cli-host-admin.js';
import {
  INBOX_COMMANDS,
  INBOX_OPTIONS,
  isInboxCommand,
  runInboxCommand,
  type InboxValues,
} from './cli-inbox.js';
import {
  SCHEDULE_OPTIONS,
  isScheduleCommand,
  prepareScheduleCommand,
  runScheduleCommand,
  type ScheduleValues,
} from './cli-schedules.js';
import {
  PROFILE_COMMANDS,
  PROFILE_OPTIONS,
  isProfileCommand,
  runProfileCommand,
  type ProfileValues,
} from './cli-profile.js';
export { CliLiveError } from './cli-live-error.js';

export const LIVE_OPTIONS = {
  ...IM_OPTIONS,
  ...MESSAGING_OPTIONS,
  ...MODELS_USAGE_OPTIONS,
  ...CHANNEL_OPTIONS,
  ...HOST_ADMIN_OPTIONS,
  ...INBOX_OPTIONS,
  ...SCHEDULE_OPTIONS,
  ...BROWSER_COMPUTER_OPTIONS,
  ...PROFILE_OPTIONS,
  host: { type: 'string' },
  'token-file': { type: 'string' },
  timeout: { type: 'string' },
  'message-id': { type: 'string' },
  outcome: { type: 'string' },
  'answer-stdin': { type: 'boolean' },
  'values-stdin': { type: 'boolean' },
  since: { type: 'string' },
  workspace: { type: 'string' },
  mode: { type: 'string' },
  scope: { type: 'string' },
  'acknowledge-risk': { type: 'boolean' },
  'patch-stdin': { type: 'boolean' },
  member: { type: 'string', multiple: true },
  app: { type: 'string' },
  bot: { type: 'string' },
  conversation: { type: 'string' },
  out: { type: 'string' },
  'args-stdin': { type: 'boolean' },
  session: { type: 'string' },
  turns: { type: 'string' },
  offset: { type: 'string' },
  kind: { type: 'string' },
  checkpoint: { type: 'string' },
  'expected-current': { type: 'string' },
  'restore-id': { type: 'string' },
  'repair-id': { type: 'string' },
  tag: { type: 'string' },
  target: { type: 'string' },
} as const;

const DEVICE_COMMANDS = [
  'browser-open',
  'browser-frame',
  'browser-takeover',
  'browser-input',
  'browser-stop',
  'computer-start',
  'computer-status',
  'computer-stop',
  'browser-tools',
  'browser-tool',
  'computer-tools',
  'computer-tool',
] as const;

const IM_CONTROL_COMMANDS = [
  'im-app-add',
  'im-app-status',
  'im-app-remove',
  'im-bind',
  'im-unbind',
  'im-status',
  'channel-connect',
  'channel-ingests',
] as const;

const TOKEN_IM_PLATFORMS = new Set(['discord', 'slack', 'qq', 'dingtalk', 'wecom', 'matrix']);

const CONTROL_COMMANDS = [
  'browser-access-set',
  'computer-access-set',
  'access',
  'access-set',
  'settings',
  'settings-set',
  'workspace-create',
  'group-create',
] as const;

export const LIVE_COMMANDS = [
  ...IM_COMMANDS,
  ...MESSAGING_COMMANDS,
  ...MODELS_USAGE_COMMANDS,
  ...CHANNEL_COMMANDS,
  ...HOST_ADMIN_COMMANDS,
  ...INBOX_COMMANDS,
  ...BROWSER_COMPUTER_COMMANDS,
  ...PROFILE_COMMANDS,
  ...BOT_TOOL_COMMANDS,
  {
    command: 'send',
    description: 'send a Human DM and collect its committed Bot reply from a live Host',
  },
  {
    command: 'send-status',
    description: 'inspect a Human DM receipt and its exact Bot replies without resending',
  },
  {
    command: 'tool-approval-status',
    description: 'inspect a pending tool approval on a live Host',
  },
  { command: 'tool-approval-decide', description: 'allow once or reject an owned tool approval' },
  { command: 'user-question-status', description: 'inspect a formal Human question' },
  { command: 'ask-secret-status', description: 'inspect a private input request without values' },
  {
    command: 'ask-secret-submit',
    description: 'submit confidential field JSON from stdin through the authenticated Owner',
  },
  { command: 'ask-secret-cancel', description: 'cancel a private input request as Owner' },
  { command: 'ask-secret-account-status', description: 'inspect current private account access' },
  { command: 'ask-secret-replace', description: 'open a blank replacement private input card' },
  { command: 'ask-secret-revoke', description: 'revoke local private account access as Owner' },
  {
    command: 'ask-secret-accounts',
    description: "list a Bot's private accounts as Owner, without values",
  },
  {
    command: 'user-question-answer',
    description: 'answer a formal Human question with JSON from stdin',
  },
  { command: 'release-info', description: 'read the running Host release lifecycle' },
  { command: 'workspace-options', description: 'list live Host workspaces for grants' },
  { command: 'grant-create', description: 'authorize a Bot workspace through the live Host' },
  {
    command: 'browser-access-set',
    description: "turn a Bot's Browser Access on or off through the live Host",
  },
  {
    command: 'computer-access-set',
    description: "turn a Bot's Computer Access on or off through the live Host",
  },
  { command: 'access', description: "read a Bot's access preset (workspace write or full access)" },
  {
    command: 'access-set',
    description: "set a Bot's access preset; full access needs --acknowledge-risk",
  },
  { command: 'settings', description: 'read one live Host settings namespace' },
  {
    command: 'settings-set',
    description: 'patch one live Host settings namespace with JSON from stdin',
  },
  { command: 'workspace-create', description: 'register an absolute folder as a Host workspace' },
  { command: 'group-create', description: 'create a group Channel with one or more Bots' },
  {
    command: 'im-app-add',
    description: 'add a token-based IM app (Discord, Slack, …) with credentials JSON from stdin',
  },
  { command: 'im-app-status', description: "read a token IM platform's apps and connection state" },
  { command: 'im-app-remove', description: 'remove a token IM app from the Provider' },
  { command: 'im-bind', description: 'bind a connected IM app to a Bot' },
  { command: 'im-unbind', description: 'unbind an IM app from a Bot' },
  { command: 'im-status', description: "read a Bot's IM apps and bindings with reception state" },
  {
    command: 'channel-connect',
    description: "connect an external group conversation to a Channel through a Bot's binding",
  },
  { command: 'channel-ingests', description: "list a Channel's connected external conversations" },
  { command: 'browser-open', description: "start a Bot's Browser and open its tab for viewing" },
  {
    command: 'browser-frame',
    description: "save the current picture of a Bot's Browser to a file",
  },
  {
    command: 'browser-takeover',
    description: "pause a Bot's Browser for Human input (--enabled) or hand it back (--disabled)",
  },
  {
    command: 'browser-input',
    description:
      "click, scroll, type or press a key in a paused Bot's Browser (input JSON from stdin)",
  },
  { command: 'browser-stop', description: "stop a Bot's Browser" },
  {
    command: 'computer-start',
    description: 'start the profile Computer with explicit authorization',
  },
  { command: 'computer-status', description: 'read the profile Computer target and state' },
  { command: 'computer-stop', description: 'stop the profile Computer' },
  {
    command: 'browser-tools',
    description: 'list the Browser tools a Bot can call, with input schemas',
  },
  {
    command: 'browser-tool',
    description:
      'run one Browser tool directly for a Bot, without the model (args JSON from stdin)',
  },
  { command: 'memory-file-target', description: 'resolve a memory file path for a Bot' },
  { command: 'memory-graph', description: "read a Bot's memory commit graph" },
  { command: 'memory-commit-diff', description: 'read the full diff of one memory commit' },
  { command: 'memory-changes', description: 'list uncommitted memory changes' },
  { command: 'memory-working-diff', description: 'read the diff of one uncommitted memory file' },
  { command: 'memory-checkpoints', description: 'list memory recovery checkpoints' },
  { command: 'memory-restore', description: 'restore memory to a recovery checkpoint' },
  { command: 'memory-restore-commit', description: 'restore memory to an earlier commit' },
  { command: 'memory-versions', description: 'list named memory versions' },
  { command: 'memory-version-name', description: 'name a memory commit as a version' },
  { command: 'memory-version-unname', description: 'remove a memory version name' },
  { command: 'memory-repair', description: 'repair a memory repository against its expected head' },
  {
    command: 'bot-trace',
    description: 'show which tools a Bot called in its recent turns, with outcomes',
  },
  {
    command: 'computer-tools',
    description: 'list the Computer tools a Bot can call, with input schemas',
  },
  {
    command: 'computer-tool',
    description:
      'run one Computer tool directly for a Bot, without the model (args JSON from stdin)',
  },
] as const;

interface LiveValues
  extends
    ImValues,
    MessagingValues,
    ModelsUsageValues,
    HostAdminValues,
    InboxValues,
    ScheduleValues,
    BrowserComputerValues,
    ProfileValues {
  host?: string;
  'token-file'?: string;
  timeout?: string;
  'message-id'?: string;
  body?: string;
  'body-stdin'?: boolean;
  'answer-stdin'?: boolean;
  'values-stdin'?: boolean;
  outcome?: string;
  since?: string;
  workspace?: string;
  limit?: string;
  before?: string;
  enabled?: boolean;
  disabled?: boolean;
  mode?: string;
  scope?: string;
  'acknowledge-risk'?: boolean;
  'patch-stdin'?: boolean;
  member?: string[];
  app?: string;
  bot?: string;
  conversation?: string;
  out?: string;
  'args-stdin'?: boolean;
  session?: string;
  turns?: string;
  offset?: string;
  kind?: string;
  checkpoint?: string;
  'expected-current'?: string;
  'restore-id'?: string;
  'repair-id'?: string;
  tag?: string;
  path?: string;
  sha?: string;
  name?: string;
  'expected-head'?: string;
  'edit-id'?: string;
  target?: string;
}

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}

function hostUrl(value: string | undefined): URL {
  if (!value) usage('Live commands require --host or DEEPSEEKBOT_HOST.');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    usage('--host must be an HTTP(S) origin.');
  }
  const name = url.hostname;
  const loopback = name === 'localhost' || name === '[::1]' || /^127\.\d+\.\d+\.\d+$/u.test(name);
  const tailnet =
    name.endsWith('.ts.net') || /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/u.test(name);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    !(
      (loopback && (url.protocol === 'http:' || url.protocol === 'https:')) ||
      (tailnet && url.protocol === 'https:')
    )
  ) {
    usage(
      '--host must be a loopback origin or a tailnet HTTPS origin, without credentials, query or path.',
    );
  }
  return url;
}

function timeoutMs(value: string | undefined): number {
  const seconds = value === undefined ? 120 : Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 600)
    usage('--timeout must be between 0 and 600 seconds.');
  return Math.ceil(seconds * 1000);
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export async function connectLiveHost(values: LiveValues, io: BotCreateCliIo, signal: AbortSignal) {
  const base = hostUrl(values.host ?? io.env['DEEPSEEKBOT_HOST']);
  let token = io.env['DEEPSEEKBOT_HOST_TOKEN'];
  if (values['token-file'] !== undefined) {
    try {
      token = readFileSync(values['token-file'], 'utf8').trim();
    } catch {
      throw new CliLiveError('host-unauthorized', 'Cannot read the Host token file.');
    }
  }
  if (!token?.trim())
    throw new CliLiveError(
      'host-unauthorized',
      'Set DEEPSEEKBOT_HOST_TOKEN or provide --token-file.',
    );
  const secret = token.trim();
  const login = new URL(base);
  login.searchParams.set('token', secret);
  let cookie = '';
  const request = async (url: URL, init: RequestInit = {}): Promise<Response> => {
    try {
      return await fetch(url, { ...init, signal, redirect: 'manual' });
    } catch {
      throw new CliLiveError(
        'host-unreachable',
        'The Host could not be reached before the command deadline.',
      );
    }
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await request(login, { headers: cookie ? { cookie } : {} });
    const cookies = response.headers.getSetCookie();
    if (cookies.length > 0) cookie = cookies.map((entry) => entry.split(';')[0]).join('; ');
    await response.body?.cancel();
    if (response.status === 401 || response.status === 403)
      throw new CliLiveError(
        'host-unauthorized',
        'Host login was refused; refresh its launch token.',
      );
    if (cookie) break;
  }
  if (!cookie)
    throw new CliLiveError('host-unauthorized', 'Host login did not issue an authority cookie.');
  const readResponse = async (response: Response): Promise<Record<string, unknown>> => {
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel();
      throw new CliLiveError(
        'host-unauthorized',
        'The Host refused this authority cookie; refresh its launch token.',
      );
    }
    try {
      const body = await response.text();
      try {
        return record(JSON.parse(body));
      } catch {
        throw new CliLiveError('host-protocol-error', 'The Host did not return a JSON response.');
      }
    } catch (error) {
      if (error instanceof CliLiveError) throw error;
      throw new CliLiveError(
        'host-unreachable',
        'The Host response was interrupted before the command deadline.',
      );
    }
  };
  const scrub = (value: string) =>
    value.replaceAll(secret, '[redacted]').replaceAll(encodeURIComponent(secret), '[redacted]');
  const rpc = async <T>(method: string, args: Record<string, unknown>): Promise<T> => {
    const name = method.includes('/') ? method : `botharness/${method}`;
    const response = await request(new URL(`/api/${name}`, base), {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: randomUUID(),
        method: name,
        payload: method.startsWith('dsh-im/') ? args : { args },
      }),
    });
    const payload = await readResponse(response);
    if (!response.ok || payload['type'] !== 'server-response')
      throw new CliLiveError('host-protocol-error', 'The Host did not return a DSH RPC response.');
    const result = record(payload['result']);
    if (result['ok'] !== true) {
      const error = record(result['error']);
      const code = typeof error['code'] === 'string' ? error['code'] : 'host-protocol-error';
      const message =
        typeof error['message'] === 'string' ? error['message'] : 'The Host refused the command.';
      throw new CliLiveError(code, scrub(message));
    }
    return result['value'] as T;
  };
  const importBotZip = async <T>(
    archive: Uint8Array,
    metadata: { name?: string; displayName?: string; roles?: string[]; description?: string },
  ): Promise<T> => {
    const url = new URL('/api/botharness/bot-zip/import', base);
    for (const key of ['name', 'displayName', 'description'] as const) {
      if (metadata[key] !== undefined) url.searchParams.set(key, metadata[key]);
    }
    if (metadata.roles !== undefined) url.searchParams.set('roles', JSON.stringify(metadata.roles));
    const response = await request(url, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/zip' },
      body: new Uint8Array(archive),
    });
    const payload = await readResponse(response);
    if (!response.ok) {
      const error = record(payload['error']);
      const bot = record(payload['bot']);
      throw new CliLiveError(
        typeof error['code'] === 'string' ? scrub(error['code']) : 'host-protocol-error',
        scrub(
          typeof error['message'] === 'string'
            ? error['message']
            : 'The Host refused this Bot Zip import.',
        ),
        undefined,
        undefined,
        typeof bot['id'] === 'string' && typeof bot['name'] === 'string'
          ? {
              bot: { id: bot['id'], name: bot['name'] },
              steps: [{ name: 'create-bot', status: 'ok' }],
              outcome: 'created',
            }
          : undefined,
      );
    }
    return payload as T;
  };
  const refuse = (path: string, status: number, bytes: Uint8Array): never => {
    let detail: Record<string, unknown> = {};
    try {
      detail = record(JSON.parse(new TextDecoder().decode(bytes)));
    } catch {
      detail = { error: new TextDecoder().decode(bytes).slice(0, 200) };
    }
    if ((status === 401 || status === 403) && typeof detail['code'] !== 'string')
      throw new CliLiveError(
        'host-unauthorized',
        'Host login was refused; refresh its launch token.',
      );
    const packages = Array.isArray(detail['packages'])
      ? detail['packages'].filter((name): name is string => typeof name === 'string')
      : [];
    throw new CliLiveError(
      typeof detail['code'] === 'string' ? scrub(detail['code']) : 'host-refused',
      scrub(
        (typeof detail['error'] === 'string' && detail['error'] !== ''
          ? detail['error']
          : `The Host refused ${path} with HTTP ${String(status)}.`) +
          (packages.length === 0 ? '' : ` Packages: ${packages.join(' ')}.`),
      ),
    );
  };
  const http = async (
    path: string,
    body?: Record<string, unknown>,
  ): Promise<{ response: Response; bytes: Uint8Array }> => {
    const response = await request(new URL(path, base), {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        cookie,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch {
      throw new CliLiveError(
        'host-unreachable',
        'The Host response was interrupted before the command deadline.',
      );
    }
    if (!response.ok) refuse(path, response.status, bytes);
    return { response, bytes };
  };
  const stream = async (path: string, init: RequestInit = {}): Promise<Response> => {
    const response = await request(new URL(path, base), {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), cookie },
    });
    if (!response.ok) refuse(path, response.status, new Uint8Array(await response.arrayBuffer()));
    return response;
  };
  const socket = (path: string): WebSocket => {
    const url = new URL(path, base);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const Socket = WebSocket as unknown as new (
      url: string,
      init: { headers: Record<string, string> },
    ) => WebSocket;
    return new Socket(url.href, { headers: { cookie } });
  };
  return { rpc, importBotZip, http, stream, socket };
}

export async function runLiveCli(
  command: string,
  rest: string[],
  values: LiveValues,
  io: BotCreateCliIo,
): Promise<unknown> {
  if (IM_COMMANDS.some((entry) => entry.command === command)) {
    const operation = await prepareImAuthorization(command, rest, values, io);
    const signal = AbortSignal.timeout(timeoutMs(values.timeout));
    try {
      return await runImAuthorization(
        operation,
        (await connectLiveHost(values, io, signal)).rpc,
        signal,
      );
    } catch (error) {
      if (
        error instanceof CliLiveError &&
        !error.authorization &&
        command !== 'im-apps' &&
        command !== 'im-authorize'
      )
        throw new CliLiveError(error.code, error.message, undefined, {
          attemptId: operation.target,
        });
      throw error;
    }
  }
  if (MEMORY_COMMANDS.has(command)) return runMemoryCommand(command, rest, values, io);
  if (isModelsUsageCommand(command))
    return runModelsUsage(command, rest, values, io, async () => {
      const signal = AbortSignal.timeout(timeoutMs(values.timeout));
      return (await connectLiveHost(values, io, signal)).rpc;
    });
  if (MESSAGING_COMMANDS.some((entry) => entry.command === command)) {
    const operation = await prepareMessaging(command as MessagingCommand, rest, values, io);
    const signal = AbortSignal.timeout(timeoutMs(values.timeout));
    return runMessaging(operation, (await connectLiveHost(values, io, signal)).rpc);
  }
  if (isInboxCommand(command))
    return runInboxCommand(command, rest, values, () =>
      connectLiveHost(values, io, AbortSignal.timeout(timeoutMs(values.timeout))),
    );
  if (isScheduleCommand(command)) {
    const prepared = prepareScheduleCommand(command, rest, values);
    const signal = AbortSignal.timeout(timeoutMs(values.timeout));
    return runScheduleCommand(prepared, (await connectLiveHost(values, io, signal)).rpc);
  }
  if (isBrowserComputerCommand(command))
    return runBrowserComputerCommand(command, rest, values, io, () =>
      connectLiveHost(values, io, AbortSignal.timeout(timeoutMs(values.timeout))),
    );
  if (isProfileCommand(command))
    return runProfileCommand(command, rest, values, io, async () => {
      const signal = AbortSignal.timeout(timeoutMs(values.timeout));
      return (await connectLiveHost(values, io, signal)).rpc;
    });
  if (BOT_TOOL_COMMANDS.some((entry) => entry.command === command))
    return runBotToolCommand(
      command as (typeof BOT_TOOL_COMMANDS)[number]['command'],
      rest,
      values,
      io,
      () => connectLiveHost(values, io, AbortSignal.timeout(timeoutMs(values.timeout))),
    );
  if (command === 'bot-trace') {
    if (rest.length !== 1 || !rest[0]?.trim()) usage('bot-trace needs exactly one bot id.');
    const turns = values.turns === undefined ? undefined : Number(values.turns);
    if (turns !== undefined && (!Number.isInteger(turns) || turns < 1 || turns > 20))
      usage('--turns must be an integer from 1 to 20.');
    const signal = AbortSignal.timeout(timeoutMs(values.timeout));
    return (await connectLiveHost(values, io, signal)).rpc('botToolTrace', {
      slug: rest[0].trim(),
      ...(values.session === undefined ? {} : { sessionId: values.session }),
      ...(turns === undefined ? {} : { turns }),
    });
  }
  if (isChannelCommand(command))
    return runChannelCommand(command, rest, values, io, connectLiveHost);
  if (isHostAdminCommand(command)) {
    const signal = AbortSignal.timeout(timeoutMs(values.timeout));
    return runHostAdminCommand(command, rest, values, io, {
      connect: async () => (await connectLiveHost(values, io, signal)).rpc,
      signal,
    });
  }
  if (DEVICE_COMMANDS.some((entry) => entry === command))
    return runDeviceCommand(command as (typeof DEVICE_COMMANDS)[number], rest, values, io);
  if (command === 'grants') {
    if (rest.length !== 1 || !rest[0]?.trim()) usage('grants needs exactly one bot id.');
    const signal = AbortSignal.timeout(timeoutMs(values.timeout));
    return (await connectLiveHost(values, io, signal)).rpc('grants', { slug: rest[0].trim() });
  }
  if (IM_CONTROL_COMMANDS.some((entry) => entry === command))
    return runImControlCommand(command as (typeof IM_CONTROL_COMMANDS)[number], rest, values, io);
  if (CONTROL_COMMANDS.some((entry) => entry === command))
    return runControlCommand(command as (typeof CONTROL_COMMANDS)[number], rest, values, io);
  const noTarget = command === 'release-info' || command === 'workspace-options';
  if (rest.length !== (noTarget ? 0 : 1))
    usage(
      `${command} ${noTarget ? 'takes no positional arguments' : 'needs exactly one target id'}.`,
    );
  const target = rest[0]?.trim() ?? '';
  if (!noTarget && !target) usage(`${command} requires a nonempty target id.`);
  const messageId = values['message-id'];
  if (
    [
      'send-status',
      'tool-approval-status',
      'tool-approval-decide',
      'user-question-status',
      'user-question-answer',
      'ask-secret-status',
      'ask-secret-submit',
      'ask-secret-cancel',
      'ask-secret-account-status',
      'ask-secret-replace',
      'ask-secret-revoke',
    ].includes(command) &&
    !messageId?.trim()
  )
    usage('--message-id is required.');
  let body: string | undefined;
  let answer: unknown;
  let confidential: Record<string, string> | undefined;
  if (command === 'ask-secret-submit') {
    if (!values['values-stdin']) usage('ask-secret-submit requires --values-stdin.');
    try {
      const input = await (io.readStdin?.() ?? Promise.resolve(''));
      if (input.length > 140_000) throw new Error('Private input exceeds the limit');
      const parsed: unknown = JSON.parse(input);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        throw new Error('Invalid private input');
      const entries = Object.entries(parsed);
      if (
        entries.length < 1 ||
        entries.length > 8 ||
        entries.some(
          ([key, value]) =>
            !/^[a-z][a-z0-9_]{0,47}$/.test(key) ||
            typeof value !== 'string' ||
            value.length > 16_384,
        )
      )
        throw new Error('Invalid private fields');
      confidential = Object.fromEntries(entries);
    } catch {
      usage('Private input stdin must be a JSON object with 1–8 declared string fields.');
    }
  }
  if (command === 'send') {
    if ((values.body !== undefined) === (values['body-stdin'] === true))
      usage('send requires exactly one of --body or --body-stdin.');
    body = values['body-stdin'] ? await (io.readStdin?.() ?? Promise.resolve('')) : values.body;
    if (!body?.trim()) usage('send requires a nonempty message.');
    if (
      messageId !== undefined &&
      !/^human-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(messageId)
    )
      usage('--message-id must be human- followed by a UUID.');
  }
  if (
    command === 'tool-approval-decide' &&
    values.outcome !== 'allowed-once' &&
    values.outcome !== 'rejected'
  )
    usage('--outcome must be allowed-once or rejected.');
  if (command === 'user-question-answer') {
    if (!values['answer-stdin']) usage('user-question-answer requires --answer-stdin.');
    try {
      answer = JSON.parse(await (io.readStdin?.() ?? Promise.resolve('')));
    } catch {
      usage('Question answers must be valid JSON on stdin.');
    }
    const answers = record(answer)['answers'];
    if (
      !Array.isArray(answers) ||
      !answers.every((entry) => {
        const item = record(entry);
        return (
          typeof item['id'] === 'string' &&
          Array.isArray(item['selected']) &&
          item['selected'].every((choice) => typeof choice === 'string') &&
          (item['custom'] === undefined || typeof item['custom'] === 'string')
        );
      })
    )
      usage(
        'Answer JSON requires answers with id, selected string array and optional custom text.',
      );
  }
  if (command === 'grant-create' && !values.workspace?.trim()) usage('--workspace is required.');
  const duration = timeoutMs(values.timeout);
  const deadline = Date.now() + duration;
  const signal = AbortSignal.timeout(duration);
  const { rpc } = await connectLiveHost(values, io, signal);
  if (command.startsWith('ask-secret-')) {
    try {
      if (command === 'ask-secret-accounts') {
        const result = await rpc<{
          status?: unknown;
          accounts?: unknown;
          replaceable?: unknown;
        }>('privateAccounts', {
          slug: target,
        });
        if (
          (result.status !== 'ready' && result.status !== 'unavailable') ||
          !Array.isArray(result.accounts)
        )
          throw new Error('Invalid private accounts');
        const optional = (value: unknown) => (typeof value === 'string' ? value : undefined);
        const accounts = result.accounts.map((entry: unknown) => {
          const row = record(entry);
          const status = row['status'];
          if (
            typeof row['account'] !== 'string' ||
            (status !== 'configured' && status !== 'replacing' && status !== 'unavailable') ||
            !Array.isArray(row['fields'])
          )
            throw new Error('Invalid private account');
          return {
            account: row['account'],
            purpose: optional(row['purpose']),
            fields: row['fields'].map((value: unknown) => {
              const field = record(value);
              if (
                typeof field['id'] !== 'string' ||
                typeof field['label'] !== 'string' ||
                typeof field['required'] !== 'boolean'
              )
                throw new Error('Invalid private field');
              return { id: field['id'], label: field['label'], required: field['required'] };
            }),
            status,
            configuredAt: optional(row['configuredAt']),
            channelId: optional(row['channelId']),
            messageId: optional(row['messageId']),
            replacementMessageId: optional(row['replacementMessageId']),
          };
        });
        return {
          status: result.status,
          accounts,
          ...(typeof result.replaceable === 'boolean' ? { replaceable: result.replaceable } : {}),
        };
      }
      if (command === 'ask-secret-status' || command === 'ask-secret-account-status') {
        const result = await rpc<{ status?: unknown }>(
          command === 'ask-secret-status' ? 'privateInputStatus' : 'privateAccountStatus',
          {
            channelId: target,
            messageId,
          },
        );
        const statuses =
          command === 'ask-secret-status'
            ? ['pending', 'configured', 'cancelled', 'expired']
            : ['configured', 'revoked', 'superseded', 'unavailable'];
        if (typeof result.status !== 'string' || !statuses.includes(result.status))
          throw new Error('Invalid private status');
        return { status: result.status };
      }
      if (command === 'ask-secret-replace') {
        const result = await rpc<{ messageId?: unknown }>('privateInputReplace', {
          channelId: target,
          messageId,
        });
        if (
          typeof result.messageId !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(result.messageId)
        )
          throw new Error('Invalid replacement card');
        return { messageId: result.messageId };
      }
      if (command === 'ask-secret-revoke') {
        const result = await rpc<{
          accepted?: unknown;
          stopped?: unknown;
          completed?: unknown;
          uncertain?: unknown;
        }>('privateAccountRevoke', { channelId: target, messageId });
        if (
          result.accepted !== true ||
          [result.stopped, result.completed, result.uncertain].some(
            (count) => typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0,
          )
        )
          throw new Error('Invalid revocation result');
        return {
          accepted: true,
          stopped: result.stopped,
          completed: result.completed,
          uncertain: result.uncertain,
        };
      }
      const method = command === 'ask-secret-submit' ? 'privateInputSubmit' : 'privateInputCancel';
      const result = await rpc<{ accepted?: unknown }>(method, {
        channelId: target,
        messageId,
        ...(confidential === undefined ? {} : { values: confidential }),
      });
      if (result.accepted !== true) throw new Error('Private request was not accepted');
      return { accepted: true };
    } catch {
      throw new CliLiveError(
        'private-input-not-accepted',
        'Private input operation was not accepted. Check Owner authentication and request status before retrying.',
      );
    } finally {
      if (confidential !== undefined)
        for (const key of Object.keys(confidential)) delete confidential[key];
    }
  }
  if (command === 'send') {
    const channelId = dmChannelId(target);
    const receipt = { channelId, messageId: messageId ?? `human-${randomUUID()}` };
    let sent: unknown;
    try {
      const bot = await rpc<{ bot: { displayName?: string } }>('get', { slug: target });
      await rpc('channelDm', { slug: target, displayName: bot.bot.displayName });
      sent = await rpc('channelSend', { channelId, body, messageId: receipt.messageId });
      while (Date.now() < deadline) {
        const status = await rpc<{ state: string; replies: unknown[] }>(
          'channelSendStatus',
          receipt,
        );
        if (!status || !Array.isArray(status.replies) || typeof status.state !== 'string')
          throw new CliLiveError(
            'host-protocol-error',
            'The Host returned an invalid send status.',
          );
        if (status.state === 'handled' && status.replies.length > 0)
          return { receipt, ...record(sent), ...status };
        if (status.state === 'handled' || status.state === 'needs-repair')
          throw new CliLiveError(
            status.state === 'handled' ? 'reply-not-produced' : 'send-needs-repair',
            'The Host has no committed Bot reply for this request.',
            receipt,
          );
        await delay(Math.min(250, Math.max(1, deadline - Date.now())), undefined, { signal });
      }
    } catch (error) {
      if (error instanceof CliLiveError) throw new CliLiveError(error.code, error.message, receipt);
      throw new CliLiveError(
        'reply-timeout',
        'The command deadline elapsed; inspect send-status with this receipt before retrying.',
        receipt,
      );
    }
    throw new CliLiveError(
      'reply-timeout',
      'No reply before the deadline; inspect send-status with this receipt before retrying.',
      receipt,
    );
  }
  if (command === 'send-status')
    return rpc('channelSendStatus', { channelId: dmChannelId(target), messageId });
  if (command === 'channel-messages') {
    const limit = values.limit === undefined ? undefined : Number(values.limit);
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1 || limit > 200))
      usage('--limit must be 1–200.');
    return rpc('channelMessages', {
      channelId: target,
      ...(limit === undefined ? {} : { limit }),
      ...(values.before === undefined ? {} : { before: values.before }),
    });
  }
  if (command === 'tool-approval-status')
    return rpc('toolApprovalStatus', { channelId: target, messageId });
  if (command === 'tool-approval-decide')
    return rpc('toolApprovalDecide', { channelId: target, messageId, outcome: values.outcome });
  if (command === 'user-question-status')
    return rpc('userQuestionStatus', { channelId: target, messageId });
  if (command === 'user-question-answer')
    return rpc('userQuestionAnswer', { channelId: target, messageId, answer });
  if (command === 'workspace-options') return rpc('workspaceOptions', {});
  if (command === 'grant-create')
    return rpc('grantCreate', { slug: target, workspaceId: values.workspace });
  return rpc('releaseInfo', values.since === undefined ? {} : { since: values.since });
}

async function runControlCommand(
  command: (typeof CONTROL_COMMANDS)[number],
  rest: string[],
  values: LiveValues,
  io: BotCreateCliIo,
): Promise<unknown> {
  if (rest.length !== 1 || !rest[0]?.trim()) usage(`${command} needs exactly one target.`);
  const target = rest[0].trim();
  let patch: Record<string, unknown> | undefined;
  if (command === 'browser-access-set' || command === 'computer-access-set') {
    if (values.enabled === values.disabled)
      usage(`${command} needs exactly one of --enabled or --disabled.`);
  }
  if (command === 'access-set') {
    if (values.mode !== 'workspace-write' && values.mode !== 'danger-full-access')
      usage('--mode must be workspace-write or danger-full-access.');
    if (values.scope !== undefined && values.scope !== 'chat' && values.scope !== 'assignments')
      usage('--scope must be chat or assignments.');
    if (values.mode === 'danger-full-access' && values['acknowledge-risk'] !== true)
      usage(
        'Full access lets the Bot run any command and use the Browser and Computer without asking. Pass --acknowledge-risk to confirm.',
      );
  }
  if (command === 'settings-set') {
    if (values['patch-stdin'] !== true) usage('settings-set requires --patch-stdin.');
    try {
      const parsed: unknown = JSON.parse(await (io.readStdin?.() ?? Promise.resolve('')));
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        throw new Error('not an object');
      patch = parsed as Record<string, unknown>;
    } catch {
      usage('--patch-stdin must be a JSON object of settings fields.');
    }
  }
  if (command === 'workspace-create' && !target.startsWith('/') && !/^[A-Za-z]:[\\/]/u.test(target))
    usage('workspace-create needs an absolute folder path.');
  const members = (values.member ?? []).map((member) => member.trim()).filter(Boolean);
  if (command === 'group-create' && members.length === 0)
    usage('group-create needs at least one --member <bot-id>.');
  const signal = AbortSignal.timeout(timeoutMs(values.timeout));
  const { rpc } = await connectLiveHost(values, io, signal);
  if (command === 'browser-access-set' || command === 'computer-access-set')
    return rpc(command === 'browser-access-set' ? 'browserAccessSet' : 'computerAccessSet', {
      slug: target,
      enabled: values.enabled === true,
    });
  if (command === 'access') return rpc('assignmentAccessGet', { slug: target });
  if (command === 'access-set')
    return rpc('assignmentAccessSet', {
      slug: target,
      mode: values.mode,
      ...(values.scope === undefined ? {} : { scope: values.scope }),
      ...(values.mode === 'danger-full-access' ? { acknowledgeRisk: true } : {}),
    });
  if (command === 'workspace-create') return rpc('workspace/create', { request: { path: target } });
  if (command === 'group-create') return rpc('channelCreate', { name: target, members });
  const described = record(await rpc('settings/describe', {}));
  const namespaces = Array.isArray(described['namespaces']) ? described['namespaces'] : [];
  const found = namespaces.map(record).find((entry) => entry['ns'] === target);
  if (found === undefined)
    throw new CliLiveError('unknown-settings', `The Host has no settings namespace ${target}.`);
  if (command === 'settings')
    return { ns: target, revision: found['revision'], value: found['value'] };
  const updated = record(
    await rpc('settings/update', { ns: target, patch, expectedRevision: found['revision'] }),
  );
  return { ns: target, revision: updated['revision'], value: updated['value'] };
}

function appSummary(value: unknown) {
  const app = record(value);
  const bot = record(app['bot']);
  const error = app['error'] === null || app['error'] === undefined ? null : record(app['error']);
  return {
    id: app['botId'],
    name: bot['name'] ?? app['name'],
    state: app['state'],
    connected: app['connected'] === true,
    error: error === null ? null : { code: error['code'], message: error['message'] },
    ...(app['stats'] === undefined ? {} : { stats: app['stats'] }),
  };
}

function connectionSummary(platform: string, value: unknown) {
  const status = record(value);
  return {
    platform,
    state: status['state'],
    apps: (Array.isArray(status['bots']) ? status['bots'] : []).map(appSummary),
  };
}

async function runImControlCommand(
  command: (typeof IM_CONTROL_COMMANDS)[number],
  rest: string[],
  values: LiveValues,
  io: BotCreateCliIo,
): Promise<unknown> {
  if (rest.length !== 1 || !rest[0]?.trim()) usage(`${command} needs exactly one target.`);
  const target = rest[0].trim();
  const app = values.app?.trim() ?? '';
  const platformCommand =
    command === 'im-app-add' || command === 'im-app-status' || command === 'im-app-remove';
  if (platformCommand && !TOKEN_IM_PLATFORMS.has(target))
    usage(
      `${command} supports ${[...TOKEN_IM_PLATFORMS].join(', ')}; use im-authorize for feishu or weixin.`,
    );
  let credentials: Record<string, unknown> | undefined;
  if (command === 'im-app-add') {
    if (values['credentials-stdin'] !== true) usage('im-app-add requires --credentials-stdin.');
    try {
      const parsed: unknown = JSON.parse(await (io.readStdin?.() ?? Promise.resolve('')));
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        throw new Error('not an object');
      credentials = parsed as Record<string, unknown>;
    } catch {
      usage('--credentials-stdin must be a JSON object, for example {"token":"…"}.');
    }
  }
  if ((command === 'im-app-remove' || command === 'im-bind' || command === 'im-unbind') && !app)
    usage(`${command} requires --app <app-id>.`);
  if (command === 'channel-connect' && (!values.bot?.trim() || !values.conversation?.trim()))
    usage('channel-connect requires --bot <bot-id> and --conversation <external-id>.');
  const signal = AbortSignal.timeout(timeoutMs(values.timeout));
  const { rpc } = await connectLiveHost(values, io, signal);
  const provider = (method: string, payload: Record<string, unknown>) =>
    rpc(`dsh-im/${target}`, { method, payload });
  if (command === 'im-app-add')
    return connectionSummary(target, await provider('bot.bind-credentials', credentials!));
  if (command === 'im-app-status')
    return connectionSummary(target, await provider('connection.status', {}));
  if (command === 'im-app-remove')
    return connectionSummary(target, await provider('bot.delete', { botId: app, confirm: true }));
  if (command === 'channel-ingests') return rpc('channelIngests', { channelId: target });
  if (command === 'im-bind') {
    const apps = record(await rpc('messagingApps', {}));
    const found = (Array.isArray(apps['apps']) ? apps['apps'] : [])
      .map(record)
      .find((entry) => entry['ref'] === app);
    if (found === undefined)
      throw new CliLiveError('unknown-app', `The Host has no connected IM app ${app}.`);
    return rpc('messagingIdentity', {
      slug: target,
      input: {
        kind: 'bind',
        providerId: found['providerId'],
        accountRef: found['ref'],
        fingerprint: found['fingerprint'],
      },
    });
  }
  const slug = command === 'channel-connect' ? values.bot!.trim() : target;
  const snapshot = record(await rpc('messagingSnapshot', { slug }));
  const identities = (Array.isArray(snapshot['identities']) ? snapshot['identities'] : []).map(
    record,
  );
  if (command === 'im-status')
    return {
      apps: (Array.isArray(snapshot['accounts']) ? snapshot['accounts'] : [])
        .map(record)
        .map((entry) => ({
          ref: entry['ref'],
          platform: entry['platform'],
          name: entry['name'],
          connected: entry['connected'] === true,
        })),
      bindings: identities.map((entry) => ({
        id: entry['id'],
        app: entry['accountRef'],
        platform: entry['platform'],
        name: entry['name'],
        enabled: entry['enabled'],
        availability: entry['availability'],
        reception: entry['reception'],
        conversations: entry['grantCount'],
      })),
    };
  const binding = identities.find((entry) =>
    command === 'channel-connect'
      ? app === '' || entry['accountRef'] === app
      : entry['accountRef'] === app,
  );
  if (binding === undefined)
    throw new CliLiveError(
      'unknown-binding',
      command === 'channel-connect'
        ? `Bot ${slug} has no IM app binding to connect through.`
        : `Bot ${slug} is not bound to IM app ${app}.`,
    );
  if (command === 'im-unbind')
    return rpc('messagingIdentity', {
      slug,
      input: { kind: 'unbind', id: binding['id'], expectedRevision: binding['revision'] },
    });
  return rpc('channelIngest', {
    channelId: target,
    input: {
      kind: 'add',
      bindingId: binding['id'],
      conversation: { kind: 'group', id: values.conversation!.trim() },
    },
  });
}

async function runDeviceCommand(
  command: (typeof DEVICE_COMMANDS)[number],
  rest: string[],
  values: LiveValues,
  io: BotCreateCliIo,
): Promise<unknown> {
  const direct = command === 'browser-tool' || command === 'computer-tool';
  const computer = (command.startsWith('computer-') && !direct) || command === 'browser-tools';
  const positionals = direct ? 2 : computer ? 0 : 1;
  if (rest.length !== positionals || rest.some((value) => !value.trim()))
    usage(
      direct
        ? `${command} needs a bot id and a tool name.`
        : computer
          ? `${command} takes no positional arguments.`
          : `${command} needs exactly one bot id.`,
    );
  let toolArgs: Record<string, unknown> = {};
  if (command === 'browser-input' && values['args-stdin'] !== true)
    usage(
      'browser-input needs --args-stdin with a JSON input such as {"kind":"click","x":10,"y":20}.',
    );
  if ((direct || command === 'browser-input') && values['args-stdin'] === true) {
    try {
      const parsed: unknown = JSON.parse(await (io.readStdin?.() ?? Promise.resolve('')));
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        throw new Error('not an object');
      toolArgs = parsed as Record<string, unknown>;
    } catch {
      usage('--args-stdin must be a JSON object of tool arguments.');
    }
  }
  if (
    direct &&
    values.out !== undefined &&
    !values.out.startsWith('/') &&
    !/^[A-Za-z]:[\\/]/u.test(values.out)
  )
    usage('--out must be an absolute file path.');
  const slug = rest[0]?.trim() ?? '';
  if (command === 'browser-frame') {
    const out = values.out ?? '';
    if (!out.startsWith('/') && !/^[A-Za-z]:[\\/]/u.test(out))
      usage('browser-frame requires --out <absolute-file>.');
  }
  if (command === 'browser-takeover' && values.enabled === values.disabled)
    usage('browser-takeover needs exactly one of --enabled or --disabled.');
  if (
    command === 'computer-start' &&
    values.target !== undefined &&
    values.target !== 'local' &&
    values.target !== 'container'
  )
    usage('--target must be local or container.');
  const signal = AbortSignal.timeout(timeoutMs(values.timeout));
  const { http } = await connectLiveHost(values, io, signal);
  const json = async (path: string, body?: Record<string, unknown>) => {
    const { bytes } = await http(path, body);
    try {
      return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch {
      throw new CliLiveError('host-protocol-error', `The Host returned no JSON for ${path}.`);
    }
  };
  let saved = false;
  const savedImages = (items: unknown[]) =>
    items.map((value) => {
      const item = record(value);
      if (item['type'] !== 'image' || typeof item['data'] !== 'string') return item;
      const bytes = Buffer.from(item['data'], 'base64');
      if (values.out !== undefined && !saved) {
        writeFileSync(values.out, bytes, { mode: 0o600 });
        saved = true;
        return {
          type: 'image',
          mimeType: item['mimeType'],
          path: values.out,
          bytes: bytes.byteLength,
        };
      }
      return { type: 'image', mimeType: item['mimeType'], bytes: bytes.byteLength };
    });
  if (command === 'browser-tools') return json('/api/browser/tools');
  if (command === 'computer-tools') return json('/api/computer/tools');
  if (command === 'computer-tool') {
    const result = record(
      await json('/api/computer/tool', { slug, tool: rest[1]!.trim(), args: toolArgs }),
    );
    const inner = record(result['result']);
    return Array.isArray(inner['content'])
      ? { ...result, result: { ...inner, content: savedImages(inner['content']) } }
      : result;
  }
  if (command === 'browser-tool') {
    const result = record(
      await json('/api/browser/tool', { slug, tool: rest[1]!.trim(), args: toolArgs }),
    );
    return {
      ...result,
      content: savedImages(Array.isArray(result['content']) ? result['content'] : []),
    };
  }
  if (command === 'browser-open') return json('/api/browser/open', { slug });
  if (command === 'browser-takeover')
    return json('/api/browser/takeover', { slug, active: values.enabled === true });
  if (command === 'browser-input') return json('/api/browser/input', { ...toolArgs, slug });
  if (command === 'browser-stop') return json('/api/browser/stop', { slug });
  if (command === 'computer-start')
    return json('/api/computer/start', {
      authorize: true,
      ...(values.target === undefined ? {} : { target: values.target }),
    });
  if (command === 'computer-status') return json('/api/computer/status');
  if (command === 'computer-stop') return json('/api/computer/stop', { authorize: true });
  const frame = record(await json(`/api/browser/frame?slug=${encodeURIComponent(slug)}`));
  if (typeof frame['data'] !== 'string')
    throw new CliLiveError('host-protocol-error', 'The Host returned no Browser frame.');
  const bytes = Buffer.from(frame['data'], 'base64');
  writeFileSync(values.out!, bytes, { mode: 0o600 });
  return {
    path: values.out,
    bytes: bytes.byteLength,
    mimeType: frame['mimeType'],
    ...(frame['viewport'] === undefined ? {} : { viewport: frame['viewport'] }),
  };
}

const MEMORY_COMMANDS = new Set([
  'memory-snapshot',
  'memory-file',
  'memory-history',
  'memory-diff',
  'memory-save',
  'memory-file-target',
  'memory-graph',
  'memory-commit-diff',
  'memory-changes',
  'memory-working-diff',
  'memory-checkpoints',
  'memory-restore',
  'memory-restore-commit',
  'memory-versions',
  'memory-version-name',
  'memory-version-unname',
  'memory-repair',
]);

const SHA = /^[0-9a-f]{40}$/u;

async function runMemoryCommand(
  command: string,
  rest: string[],
  values: LiveValues,
  io: BotCreateCliIo,
): Promise<unknown> {
  if (rest.length !== 1 || !rest[0]?.trim()) usage(`${command} needs exactly one bot id.`);
  const slug = rest[0].trim();
  const channelId = dmChannelId(slug);
  const required = (name: keyof LiveValues, flag: string): string => {
    const value = values[name];
    if (typeof value !== 'string' || !value.trim()) usage(`${command} requires --${flag}.`);
    return value.trim();
  };
  const sha = (): string => {
    const value = required('sha', 'sha <commit>');
    if (!SHA.test(value)) usage('--sha must be a 40-character lowercase commit sha.');
    return value;
  };
  const expectedHead = (): string => {
    const value = required('expected-head', 'expected-head <commit>');
    if (!SHA.test(value)) usage('--expected-head must be a 40-character lowercase commit sha.');
    return value;
  };
  let method: string;
  let args: Record<string, unknown>;
  switch (command) {
    case 'memory-snapshot':
      [method, args] = ['memorySnapshot', { channelId }];
      break;
    case 'memory-file':
      [method, args] = ['memoryFile', { channelId, path: required('path', 'path <file>') }];
      break;
    case 'memory-history':
      [method, args] = ['memoryHistory', { channelId }];
      break;
    case 'memory-diff':
      [method, args] = ['memoryDiff', { channelId, sha: sha() }];
      break;
    case 'memory-file-target':
      [method, args] = ['memoryFileTarget', { slug, path: required('path', 'path <file>') }];
      break;
    case 'memory-graph': {
      const offset = values.offset === undefined ? 0 : Number(values.offset);
      if (!Number.isInteger(offset) || offset < 0 || offset > 10_000)
        usage('--offset must be an integer from 0 to 10000.');
      [method, args] = ['memoryGitGraph', { channelId, offset }];
      break;
    }
    case 'memory-commit-diff':
      [method, args] = ['memoryGitCommitDiff', { channelId, sha: sha() }];
      break;
    case 'memory-changes':
      [method, args] = ['memoryWorkingChanges', { channelId }];
      break;
    case 'memory-working-diff': {
      const kind = required('kind', 'kind staged|unstaged|untracked|current');
      if (!['staged', 'unstaged', 'untracked', 'current'].includes(kind))
        usage('--kind must be staged, unstaged, untracked or current.');
      [method, args] = [
        'memoryWorkingDiff',
        { channelId, path: required('path', 'path <file>'), kind },
      ];
      break;
    }
    case 'memory-checkpoints':
      [method, args] = ['memoryRecoveryHistory', { channelId }];
      break;
    case 'memory-restore':
      [method, args] = [
        'memoryRestore',
        {
          channelId,
          checkpointId: required('checkpoint', 'checkpoint <id>'),
          expectedCurrentId: required('expected-current', 'expected-current <id>'),
        },
      ];
      break;
    case 'memory-restore-commit':
      [method, args] = [
        'memoryRestoreCommit',
        {
          channelId,
          sha: sha(),
          expectedHead: expectedHead(),
          restoreId: values['restore-id']?.trim() || randomUUID(),
          ...(values.name === undefined ? {} : { name: values.name }),
        },
      ];
      break;
    case 'memory-versions':
      [method, args] = ['memoryVersions', { channelId }];
      break;
    case 'memory-version-name':
      [method, args] = [
        'memoryNameVersion',
        { channelId, sha: sha(), name: required('name', 'name <version>') },
      ];
      break;
    case 'memory-version-unname':
      [method, args] = [
        'memoryRemoveVersionName',
        { channelId, tag: required('tag', 'tag <version>') },
      ];
      break;
    case 'memory-repair':
      [method, args] = [
        'memoryRepair',
        {
          channelId,
          expectedHead: expectedHead(),
          repairId: values['repair-id']?.trim() || randomUUID(),
        },
      ];
      break;
    default: {
      const path = required('path', 'path <file>');
      const head = expectedHead();
      let body = values.body;
      if (values['body-stdin'] === true) body = await (io.readStdin?.() ?? Promise.resolve(''));
      if (body === undefined) usage('memory-save needs --body or --body-stdin.');
      [method, args] = [
        'memorySave',
        {
          channelId,
          path,
          body,
          expectedHead: head,
          editId: values['edit-id']?.trim() || randomUUID(),
        },
      ];
    }
  }
  const signal = AbortSignal.timeout(timeoutMs(values.timeout));
  return (await connectLiveHost(values, io, signal)).rpc(method, args);
}
