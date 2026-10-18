import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';
import { parseAgentManagement } from './cli-agent-management.js';
import { parseReviewedSettings } from './cli-live.js';

export function hasAgentCliContext(env: NodeJS.ProcessEnv): boolean {
  return (
    env['DEEPSEEKBOT_AGENT_ENDPOINT'] !== undefined || env['DEEPSEEKBOT_AGENT_TOKEN'] !== undefined
  );
}

export async function runAgentCli(
  command: string | undefined,
  rest: string[],
  values: Record<string, unknown>,
  io: BotCreateCliIo,
): Promise<unknown> {
  const endpoint = io.env['DEEPSEEKBOT_AGENT_ENDPOINT'];
  const token = io.env['DEEPSEEKBOT_AGENT_TOKEN'];
  const refuse = (code: string, message: string): never => {
    throw new CliLiveError(code, message);
  };
  if (!endpoint || !token?.trim())
    refuse(
      'agent-context-invalid',
      'The scoped CLI context is incomplete; ask the Host for a new Shell invocation.',
    );
  let base: URL;
  try {
    base = new URL(endpoint!);
  } catch {
    return refuse('agent-context-invalid', 'The scoped CLI endpoint is invalid.');
  }
  if (
    base.protocol !== 'http:' ||
    base.hostname !== '127.0.0.1' ||
    !base.port ||
    base.pathname !== '/' ||
    base.search ||
    base.hash ||
    base.username ||
    base.password
  )
    refuse('agent-context-invalid', 'The scoped CLI endpoint is invalid.');
  let operation = command;
  if (values['help'] === true || command === undefined || command === 'help')
    operation = 'capabilities';
  const managed = await parseAgentManagement(operation!, rest, values, io);
  const args: Record<string, unknown> = managed?.args ?? {};
  if (!managed) {
    const allowed = new Set(['compact', 'help', 'timeout']);
    if (operation === 'settings-set')
      for (const key of ['patch-stdin', 'expected-revision', 'previous-value']) allowed.add(key);
    if (Object.entries(values).some(([key, value]) => value !== undefined && !allowed.has(key)))
      refuse('agent-scope-denied', 'This option is not available in the scoped CLI context.');
    if (!['capabilities', 'settings', 'settings-set'].includes(operation!))
      refuse('agent-scope-denied', 'Use capabilities to discover supported scoped CLI commands.');
    if (operation === 'capabilities') {
      if (rest.length) refuse('usage', 'capabilities takes no positional arguments.');
    } else {
      if (rest.length > 1 || (operation === 'settings-set' && rest.length !== 1))
        refuse('usage', 'settings takes an optional namespace; settings-set requires a namespace.');
      if (rest.length) {
        if (!['botharness-client', 'agent-default-model'].includes(rest[0]!))
          refuse(
            'agent-scope-denied',
            'This namespace is not available in the scoped CLI context.',
          );
        args['ns'] = rest[0];
      }
    }
    if (operation === 'settings-set') {
      if (values['patch-stdin'] !== true) refuse('usage', 'settings-set requires --patch-stdin.');
      let patch: unknown;
      try {
        patch = JSON.parse(await (io.readStdin?.() ?? Promise.resolve('')));
      } catch {
        return refuse('usage', '--patch-stdin must be a JSON object of settings fields.');
      }
      if (typeof patch !== 'object' || patch === null || Array.isArray(patch))
        return refuse('usage', '--patch-stdin must be a JSON object of settings fields.');
      const allowedFields =
        args['ns'] === 'botharness-client'
          ? [
              'assignmentConcurrencyLimit',
              'developerMode',
              'showBotSessions',
              'showApprovalReviewSessions',
            ]
          : ['provider', 'model', 'reasoningEffort'];
      if (
        !Object.keys(patch).length ||
        Object.keys(patch).some((key) => !allowedFields.includes(key))
      )
        refuse(
          'agent-scope-denied',
          'Only supported live settings can be changed in this scoped context.',
        );
      const typedPatch = patch as Record<string, unknown>;
      const reviewed = parseReviewedSettings(
        {
          ...(typeof values['expected-revision'] === 'string'
            ? { 'expected-revision': values['expected-revision'] }
            : {}),
          ...(typeof values['previous-value'] === 'string'
            ? { 'previous-value': values['previous-value'] }
            : {}),
        },
        typedPatch,
      );
      if (!reviewed)
        refuse(
          'usage',
          'Scoped settings-set requires --expected-revision and --previous-value from the reviewed read.',
        );
      Object.assign(args, { patch: typedPatch, ...reviewed });
    }
  }
  const seconds = values['timeout'] === undefined ? 120 : Number(values['timeout']);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 600)
    refuse('usage', '--timeout must be between 0 and 600 seconds.');
  const write = managed?.write ?? operation === 'settings-set';
  let response: Response;
  let body: unknown;
  try {
    response = await fetch(new URL('/invoke', base), {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(Math.ceil(seconds * 1000)),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ command: operation, args }),
    });
    body = await response.json();
  } catch {
    return refuse(
      write ? 'agent-write-uncertain' : 'agent-unreachable',
      write
        ? 'The scoped write result could not be confirmed; inspect the current state before retrying; never automatically retry installation or restart.'
        : 'The scoped CLI request could not complete; ask the Host for a new Shell invocation.',
    );
  }
  const envelope =
    typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  if (response.ok && envelope['ok'] === true) return envelope['value'];
  const error = envelope['error'];
  if (envelope['ok'] === false && typeof error === 'object' && error !== null) {
    const coded = error as Record<string, unknown>;
    const scrub = (text: string) =>
      text
        .replaceAll(token!, '[redacted]')
        .replaceAll(endpoint!, '[redacted]')
        .replaceAll(encodeURIComponent(token!), '[redacted]');
    return refuse(
      typeof coded['code'] === 'string' ? scrub(coded['code']) : 'agent-protocol-error',
      typeof coded['message'] === 'string'
        ? scrub(coded['message'])
        : 'The scoped CLI request was refused.',
    );
  }
  return refuse(
    write ? 'agent-write-uncertain' : 'agent-protocol-error',
    'The scoped CLI result could not be confirmed.',
  );
}
