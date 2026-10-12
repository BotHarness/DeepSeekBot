import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { dmChannelId } from '../channels/channel.js';
import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';
import {
  IM_COMMANDS,
  IM_OPTIONS,
  prepareImAuthorization,
  runImAuthorization,
  type ImValues,
} from './cli-im-authorization.js';
export { CliLiveError } from './cli-live-error.js';

export const LIVE_OPTIONS = {
  ...IM_OPTIONS,
  host: { type: 'string' },
  'token-file': { type: 'string' },
  timeout: { type: 'string' },
  'message-id': { type: 'string' },
  outcome: { type: 'string' },
  'answer-stdin': { type: 'boolean' },
  'values-stdin': { type: 'boolean' },
  since: { type: 'string' },
  workspace: { type: 'string' },
} as const;

export const LIVE_COMMANDS = [
  ...IM_COMMANDS,
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
] as const;

interface LiveValues extends ImValues {
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
    const name = method === 'dsh-im/app-setup' ? method : `botharness/${method}`;
    const response = await request(new URL(`/api/${name}`, base), {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: randomUUID(),
        method: name,
        payload: method === 'dsh-im/app-setup' ? args : { args },
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
  return { rpc, importBotZip };
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
