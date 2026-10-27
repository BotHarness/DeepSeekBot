import { CliLiveError } from './cli-live-error.js';

export const SHARE_DRAFT_COMMANDS = [
  {
    command: 'share-draft-start',
    description:
      "copy a Bot's shareable Memory files into a new Share Draft; the Memory is unchanged",
  },
  {
    command: 'share-draft-show',
    description: 'read a Share Draft: each file with its status and privacy flags',
  },
  { command: 'share-draft-file', description: "read one Share Draft file's text (--path)" },
  {
    command: 'share-draft-decide',
    description:
      'keep, drop or rewrite one Share Draft file (--path, --keep|--drop|--rewrite-stdin)',
  },
  {
    command: 'share-draft-finish',
    description: 'mark a Share Draft ready once every file has a decision',
  },
  { command: 'share-draft-discard', description: 'delete a Share Draft' },
  {
    command: 'share-draft-export',
    description: "copy a ready Share Draft into Tob's workspace for a GitHub push, without history",
  },
] as const;

export const SHARE_DRAFT_OPTIONS = {
  keep: { type: 'boolean' },
  drop: { type: 'boolean' },
  'rewrite-stdin': { type: 'boolean' },
} as const;

export const TOB_SHARE_DRAFT_COMMAND_USAGE: Readonly<Record<string, string>> = {
  'share-draft-show': 'deepseekbot share-draft-show <bot-slug>',
  'share-draft-file': 'deepseekbot share-draft-file <bot-slug> --path <file path>',
  'share-draft-decide':
    'deepseekbot share-draft-decide <bot-slug> --path <file path> (--keep | --drop | --rewrite-stdin)',
  'share-draft-finish': 'deepseekbot share-draft-finish <bot-slug>',
};

const TOB_COMMANDS = new Set(Object.keys(TOB_SHARE_DRAFT_COMMAND_USAGE));
const MAX_REWRITE_BYTES = 5 * 1024 * 1024;

type ShareDraftCommand = (typeof SHARE_DRAFT_COMMANDS)[number]['command'];
type Rpc = <T>(method: string, args: Record<string, unknown>) => Promise<T>;

interface ShareDraftValues {
  path?: string;
  keep?: boolean;
  drop?: boolean;
  'rewrite-stdin'?: boolean;
}

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}

export function isShareDraftCommand(command: string): command is ShareDraftCommand {
  return SHARE_DRAFT_COMMANDS.some((entry) => entry.command === command);
}

async function parse(
  command: ShareDraftCommand,
  rest: string[],
  values: ShareDraftValues,
  readStdin: (() => Promise<string>) | undefined,
): Promise<{ method: string; args: Record<string, unknown> }> {
  if (rest.length !== 1 || !rest[0]?.trim()) usage(`${command} needs exactly one bot id.`);
  const slug = rest[0].trim();
  const needsPath = command === 'share-draft-file' || command === 'share-draft-decide';
  const path = values.path?.trim();
  if (needsPath && !path) usage(`${command} needs --path <file path>.`);
  if (!needsPath && values.path !== undefined) usage('--path only applies to a single file.');
  const decisions = [values.keep, values.drop, values['rewrite-stdin']].filter(Boolean).length;
  if (command !== 'share-draft-decide' && decisions > 0)
    usage('--keep, --drop and --rewrite-stdin only apply to share-draft-decide.');
  switch (command) {
    case 'share-draft-start':
      return { method: 'shareDraftStart', args: { slug } };
    case 'share-draft-show':
      return { method: 'shareDraftGet', args: { slug } };
    case 'share-draft-file':
      return { method: 'shareDraftFile', args: { slug, path } };
    case 'share-draft-decide': {
      if (decisions !== 1) usage('Choose exactly one of --keep, --drop or --rewrite-stdin.');
      if (values.keep)
        return { method: 'shareDraftDecide', args: { slug, path, decision: 'keep' } };
      if (values.drop)
        return { method: 'shareDraftDecide', args: { slug, path, decision: 'drop' } };
      const text = (await readStdin?.()) ?? '';
      if (Buffer.byteLength(text, 'utf8') > MAX_REWRITE_BYTES)
        usage('The rewritten file must be at most 5 MB.');
      return {
        method: 'shareDraftDecide',
        args: { slug, path, decision: 'rewrite', text },
      };
    }
    case 'share-draft-finish':
      return { method: 'shareDraftFinish', args: { slug } };
    case 'share-draft-discard':
      return { method: 'shareDraftDiscard', args: { slug } };
    case 'share-draft-export':
      return { method: 'shareDraftExport', args: { slug } };
  }
}

export async function runShareDraftCommand(
  command: ShareDraftCommand,
  rest: string[],
  values: ShareDraftValues,
  io: { readStdin?: () => Promise<string> },
  connect: () => Promise<Rpc>,
): Promise<unknown> {
  const { method, args } = await parse(command, rest, values, io.readStdin);
  const rpc = await connect();
  return rpc(method, args);
}

export async function parseAgentShareDraft(
  command: string,
  rest: string[],
  values: Record<string, unknown>,
  io: { readStdin?: () => Promise<string> },
): Promise<{ command: string; args: Record<string, unknown>; write: boolean } | undefined> {
  if (!TOB_COMMANDS.has(command)) return undefined;
  const allowed = new Set([
    'compact',
    'help',
    'timeout',
    'path',
    ...Object.keys(SHARE_DRAFT_OPTIONS),
  ]);
  if (Object.entries(values).some(([key, value]) => value !== undefined && !allowed.has(key)))
    throw new CliLiveError(
      'agent-scope-denied',
      'This option is not available for the scoped CLI operation.',
    );
  const { args } = await parse(command as ShareDraftCommand, rest, values, io.readStdin);
  return {
    command,
    args,
    write: command === 'share-draft-decide' || command === 'share-draft-finish',
  };
}
