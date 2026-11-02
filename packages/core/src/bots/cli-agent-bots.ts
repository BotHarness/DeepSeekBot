import type { BotCreateCliIo, CreateValues } from './bot-create-cli.js';
import { validatedCreate } from './bot-create-cli.js';
import type { AgentManagementInvocation } from './cli-agent-management.js';
import { CliLiveError } from './cli-live-error.js';
import { profileCall } from './cli-profile.js';
import {
  MAX_DESCRIPTOR_BIO_LENGTH,
  MAX_DESCRIPTOR_TAG_LENGTH,
  MAX_DESCRIPTOR_TAGS,
} from '../marketplace/descriptor.js';

export const TOB_AGENT_BOT_COMMAND_USAGE: Readonly<Record<string, string>> = {
  create:
    'deepseekbot create --name <name> --operation-key <stable-key> [--description <bio>] [--role <tag>] [--avatar-file <image>] [--persona <text> | --persona-stdin] [--core-memory <text> | --core-memory-stdin]',
  show: 'deepseekbot show <bot-slug>; returns profileFingerprint for subsequent writes',
  update:
    'deepseekbot update <bot-slug> --expected-profile <observed-fingerprint> [--name <name>] [--description <bio>] [--role <tag>]',
  pause: 'deepseekbot pause <bot-slug> --expected-profile <observed-fingerprint>',
  resume: 'deepseekbot resume <bot-slug> --expected-profile <observed-fingerprint>',
  'bot-avatar-set':
    'deepseekbot bot-avatar-set <bot-slug> --expected-profile <observed-fingerprint> (--file <image> | --clear)',
  'bot-banner-set':
    'deepseekbot bot-banner-set <bot-slug> --expected-profile <observed-fingerprint> (--file <image> | --recipe-stdin | --clear)',
  'bot-appearance-set':
    'deepseekbot bot-appearance-set <bot-slug> --expected-profile <observed-fingerprint> --recipe-stdin',
  'bot-primary-color-set':
    'deepseekbot bot-primary-color-set <bot-slug> --expected-profile <observed-fingerprint> (--color <#rrggbb> | --automatic)',
  'bot-delete-preview': 'deepseekbot bot-delete-preview <bot-slug>',
  'bot-delete-memory-folder': 'deepseekbot bot-delete-memory-folder <bot-slug>',
  'bot-delete-confirm':
    'deepseekbot bot-delete-confirm <bot-slug> --confirmation-stdin --confirm [--erase-memory]; stdin JSON: {token}; memory is retained unless --erase-memory is explicit',
  'bot-delete-retry': 'deepseekbot bot-delete-retry <bot-slug> --confirm',
};

const OPTIONS: Readonly<Record<string, readonly string[]>> = {
  create: [
    'name',
    'operation-key',
    'description',
    'role',
    'avatar-file',
    'persona',
    'persona-stdin',
    'core-memory',
    'core-memory-stdin',
  ],
  show: [],
  update: ['name', 'description', 'role', 'expected-profile'],
  pause: ['expected-profile'],
  resume: ['expected-profile'],
  'bot-avatar-set': ['file', 'clear', 'expected-profile'],
  'bot-banner-set': ['file', 'clear', 'recipe-stdin', 'expected-profile'],
  'bot-appearance-set': ['recipe-stdin', 'expected-profile'],
  'bot-primary-color-set': ['color', 'automatic', 'expected-profile'],
  'bot-delete-preview': [],
  'bot-delete-memory-folder': [],
  'bot-delete-confirm': ['confirmation-stdin', 'confirm', 'erase-memory'],
  'bot-delete-retry': ['confirm'],
};
const READS = new Set(['show', 'bot-delete-preview', 'bot-delete-memory-folder']);
const PROFILE_WRITES = new Set([
  'update',
  'pause',
  'resume',
  'bot-avatar-set',
  'bot-banner-set',
  'bot-appearance-set',
  'bot-primary-color-set',
]);
const BOOLEANS = new Set([
  'persona-stdin',
  'core-memory-stdin',
  'clear',
  'recipe-stdin',
  'automatic',
  'confirmation-stdin',
  'confirm',
  'erase-memory',
]);

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}
function text(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') usage(`${label} must be text.`);
  return value;
}
function required(value: unknown, label: string): string {
  const result = text(value, label)?.trim();
  if (!result || result.length > 512 || /[\u0000-\u001f\u007f]/u.test(result))
    usage(`${label} requires nonempty text of at most 512 characters without control characters.`);
  return result;
}
function roles(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string'))
    usage('--role must contain text values.');
  const result = value.map((entry) => entry.trim()).filter(Boolean);
  if (
    result.length > MAX_DESCRIPTOR_TAGS ||
    result.some((entry) => [...entry].length > MAX_DESCRIPTOR_TAG_LENGTH)
  )
    usage('Roles exceed the profile limits.');
  return result;
}

export async function parseAgentBots(
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
      'This option is not available for the scoped Bot operation.',
    );
  for (const key of OPTIONS[command]!) {
    const value = values[key];
    if (value === undefined) continue;
    if (BOOLEANS.has(key)) {
      if (typeof value !== 'boolean') usage(`--${key} must be a flag.`);
    } else if (key !== 'role') text(value, `--${key}`);
  }
  if (rest.length !== (command === 'create' ? 0 : 1))
    usage(
      command === 'create'
        ? 'create takes no positional arguments.'
        : 'This operation needs exactly one Bot slug.',
    );
  if (command === 'create') {
    const operationKey = required(values['operation-key'], '--operation-key');
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(operationKey))
      usage(
        '--operation-key must contain 8–128 letters, digits, dots, underscores, colons or hyphens and start with a letter or digit.',
      );
    const createValues: CreateValues = {
      'persona-stdin': values['persona-stdin'] === true,
      'core-memory-stdin': values['core-memory-stdin'] === true,
    };
    for (const key of ['name', 'description', 'avatar-file', 'persona', 'core-memory'] as const) {
      const value = text(values[key], `--${key}`);
      if (value !== undefined) createValues[key] = value;
    }
    const selectedRoles = roles(values.role);
    if (selectedRoles !== undefined) createValues.role = selectedRoles;
    const created = await validatedCreate(
      createValues,
      () => io.readStdin?.() ?? Promise.resolve(''),
    );
    if (created.source.kind !== 'blank') usage('Only blank Bot creation is available here.');
    return {
      command,
      args: {
        displayName: created.displayName,
        ...(created.description === undefined ? {} : { description: created.description }),
        ...(created.roles === undefined ? {} : { roles: created.roles }),
        ...(created.avatar === undefined ? {} : { avatar: created.avatar }),
        ...(created.persona === undefined ? {} : { persona: created.persona }),
        ...(created.coreMemory === undefined ? {} : { coreMemory: created.coreMemory }),
        operationKey,
      },
      write: true,
    };
  }
  const slug = required(rest[0], 'Bot slug');
  const args: Record<string, unknown> = { slug };
  if (PROFILE_WRITES.has(command))
    args.expectedProfile = required(values['expected-profile'], '--expected-profile');
  if (command === 'update') {
    const displayName = text(values.name, '--name')?.trim();
    const description = text(values.description, '--description')?.trim();
    const selectedRoles = roles(values.role);
    if (!displayName && description === undefined && selectedRoles === undefined)
      usage('update needs at least one of --name, --description, or --role.');
    if (description !== undefined && [...description].length > MAX_DESCRIPTOR_BIO_LENGTH)
      usage('Description exceeds the profile limits.');
    args.patch = {
      ...(displayName ? { displayName } : {}),
      ...(description === undefined ? {} : { description }),
      ...(selectedRoles === undefined ? {} : { roles: selectedRoles }),
    };
  } else if (command === 'bot-delete-confirm' || command === 'bot-delete-retry') {
    if (values.confirm !== true) usage('Deletion requires --confirm.');
    args.confirm = true;
    if (command === 'bot-delete-confirm') {
      if (values['confirmation-stdin'] !== true) usage('Deletion requires --confirmation-stdin.');
      const raw = await (io.readStdin?.() ?? Promise.resolve(''));
      if (Buffer.byteLength(raw, 'utf8') > 4096) usage('Deletion confirmation exceeds 4 KiB.');
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        usage('Deletion confirmation must be JSON.');
      }
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed) ||
        Object.keys(parsed).length !== 1 ||
        !('token' in parsed)
      )
        usage('Deletion confirmation must contain only token.');
      args.token = required(parsed.token, 'Confirmation token');
      args.eraseMemory = values['erase-memory'] === true;
    }
  } else if (command.startsWith('bot-') && PROFILE_WRITES.has(command)) {
    const [, parsed] = await profileCall(
      command,
      [slug],
      {
        ...(typeof values.file === 'string' ? { file: values.file } : {}),
        ...(typeof values.color === 'string' ? { color: values.color } : {}),
        clear: values.clear === true,
        automatic: values.automatic === true,
        'recipe-stdin': values['recipe-stdin'] === true,
      },
      io,
    );
    for (const [key, value] of Object.entries(parsed)) if (key !== 'channelId') args[key] = value;
  }
  return { command, args, write: !READS.has(command) };
}
