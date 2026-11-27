import { randomUUID } from 'node:crypto';
import type { BotCreateCliIo } from './bot-create-cli.js';
import type { AgentManagementInvocation } from './cli-agent-management.js';
import { CliLiveError } from './cli-live-error.js';

const OPTIONS: Readonly<Record<string, readonly string[]>> = {
  'memory-save': ['path', 'body', 'body-stdin', 'expected-head', 'edit-id'],
  'memory-restore-commit': ['sha', 'expected-head', 'restore-id', 'name'],
};

const SHA = /^[0-9a-f]{40}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}
function textValue(value: unknown, field: string, limit = 512): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > limit ||
    [...value].some((char) => char.charCodeAt(0) < 32)
  )
    usage(`${field} needs a nonempty value of at most ${limit} characters.`);
  return value.trim();
}
function commit(value: unknown, field: string): string {
  if (typeof value !== 'string' || !SHA.test(value.trim()))
    usage(`${field} is required and must be a 40-character lowercase commit sha.`);
  return value.trim();
}

export async function parseAgentMemory(
  command: string,
  rest: string[],
  values: Record<string, unknown>,
  io: BotCreateCliIo,
): Promise<AgentManagementInvocation | undefined> {
  if (!Object.hasOwn(OPTIONS, command)) return undefined;
  const allowed = new Set(['compact', 'help', 'timeout', ...OPTIONS[command]!]);
  if (Object.entries(values).some(([key, value]) => value !== undefined && !allowed.has(key)))
    throw new CliLiveError(
      'agent-scope-denied',
      'This option is not available for the scoped CLI operation.',
    );
  if (rest.length !== 1) usage(`${command} needs exactly one Bot ID.`);
  const slug = textValue(rest[0], 'Bot ID', 128);
  const expectedHead = commit(values['expected-head'], '--expected-head');
  if (command === 'memory-save') {
    const path = textValue(values['path'], '--path');
    const stdin = values['body-stdin'] === true;
    if ((values['body'] !== undefined) === stdin)
      usage('memory-save needs exactly one of --body or --body-stdin.');
    const body = stdin ? ((await io.readStdin?.()) ?? '') : values['body'];
    if (typeof body !== 'string') usage('memory-save needs --body or --body-stdin.');
    const editId =
      values['edit-id'] === undefined
        ? randomUUID()
        : textValue(values['edit-id'], '--edit-id', 100);
    return { command, args: { slug, path, body, expectedHead, editId }, write: true };
  }
  const restoreId =
    values['restore-id'] === undefined
      ? randomUUID()
      : textValue(values['restore-id'], '--restore-id', 36);
  if (!UUID.test(restoreId)) usage('--restore-id must be a lowercase UUID.');
  const name = values['name'];
  if (name !== undefined && (typeof name !== 'string' || name.length > 60 || /[\r\n]/u.test(name)))
    usage('--name must be one line of at most 60 characters.');
  return {
    command,
    args: {
      slug,
      sha: commit(values['sha'], '--sha'),
      expectedHead,
      restoreId,
      ...(name === undefined ? {} : { name }),
    },
    write: true,
  };
}
