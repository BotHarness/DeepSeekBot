import { CliLiveError } from './cli-live-error.js';

export const INBOX_OPTIONS = {
  category: { type: 'string' },
  channel: { type: 'string' },
  sort: { type: 'string' },
  'source-key': { type: 'string' },
  source: { type: 'string' },
  section: { type: 'string' },
  unsectioned: { type: 'boolean' },
  index: { type: 'string' },
  archived: { type: 'boolean' },
  unarchived: { type: 'boolean' },
  rule: { type: 'string' },
  server: { type: 'string' },
  confirm: { type: 'boolean' },
  until: { type: 'string' },
  snoozed: { type: 'boolean' },
} as const;

export const INBOX_COMMANDS = [
  { command: 'inbox', description: 'list Human Inbox items by category, Bot or Channel' },
  { command: 'inbox-status', description: 'read the Human Inbox unread count and action flag' },
  { command: 'inbox-dismiss', description: 'dismiss one Human Inbox item' },
  { command: 'inbox-ignore', description: 'ignore an informational assignment report' },
  {
    command: 'inbox-snooze',
    description: 'hide one Human Inbox item until a later time, or bring it back',
  },
  {
    command: 'assignment-context',
    description: "read an assignment report's context from the Human Inbox",
  },
  { command: 'channel-assignments', description: "list a group Channel's assignment work" },
  { command: 'channel-assign', description: 'move a Channel into a sidebar section or out of it' },
  { command: 'session-ids', description: 'list the root Session IDs owned by Bots' },
  { command: 'session-owner', description: 'read which Bot owns a Session, and in which role' },
  {
    command: 'session-archive-set',
    description: "archive or unarchive a Bot's assignment Session",
  },
  { command: 'tool-approval-rules', description: "list a Bot's always-allow tool approval rules" },
  {
    command: 'tool-approval-rule-revoke',
    description: 'revoke an always-allow tool approval rule (needs --confirm)',
  },
  {
    command: 'private-mcp-set',
    description: "turn a Bot's private MCP server on or off",
  },
  {
    command: 'private-mcp-remove',
    description: "remove a Bot's private MCP server (needs --confirm)",
  },
] as const;

export const INBOX_HOST_COMMANDS = ['grant-revoke', 'grant-write-set'] as const;

export interface InboxValues {
  category?: string;
  channel?: string;
  bot?: string;
  sort?: string;
  limit?: string;
  cursor?: string;
  session?: string;
  'source-key'?: string;
  source?: string;
  section?: string;
  unsectioned?: boolean;
  index?: string;
  archived?: boolean;
  unarchived?: boolean;
  rule?: string;
  grant?: string;
  server?: string;
  enabled?: boolean;
  disabled?: boolean;
  confirm?: boolean;
  until?: string;
  clear?: boolean;
  snoozed?: boolean;
}

type Rpc = <T>(method: string, args: Record<string, unknown>) => Promise<T>;

const CATEGORIES = ['action', 'info', 'unread', 'replies', 'handled'];

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}

export function isInboxCommand(command: string): boolean {
  return (
    INBOX_COMMANDS.some((entry) => entry.command === command) ||
    INBOX_HOST_COMMANDS.some((entry) => entry === command)
  );
}

function positionals(command: string, rest: string[], count: number, name: string): string[] {
  if (rest.length !== count || rest.some((value) => !value.trim()))
    usage(count === 0 ? `${command} takes no positional arguments.` : `${command} needs ${name}.`);
  return rest.map((value) => value.trim());
}

function required(value: string | undefined, flag: string, command: string): string {
  const next = value?.trim();
  if (!next) usage(`${command} requires --${flag}.`);
  return next;
}

function toggle(
  command: string,
  on: boolean | undefined,
  off: boolean | undefined,
  flags: [string, string],
): boolean {
  if ((on === true) === (off === true))
    usage(`${command} needs --${flags[0]} or --${flags[1]}, not both or neither.`);
  return on === true;
}

function confirmed(command: string, values: InboxValues): void {
  if (values.confirm !== true)
    usage(`${command} is destructive; repeat it with --confirm, as the Web UI asks you to.`);
}

export async function runInboxCommand(
  command: string,
  rest: string[],
  values: InboxValues,
  connect: () => Promise<{ rpc: Rpc }>,
): Promise<unknown> {
  const call = prepare(command, rest, values);
  const { rpc } = await connect();
  const result = await rpc<Record<string, unknown>>(call.method, call.args);
  if (call.method === 'privateMcpServerEnable' && result['accepted'] !== true)
    throw new CliLiveError(
      'private-mcp-server-unavailable',
      'The Host did not change this private MCP server; check its name with ask-secret-accounts.',
    );
  if (call.method === 'privateMcpServerRemove' && result['removed'] !== true)
    throw new CliLiveError(
      'private-mcp-server-unavailable',
      'The Host has no such private MCP server for this Bot; check ask-secret-accounts.',
    );
  if (call.method === 'channelAssign')
    return { channelId: call.args['channelId'], sectionId: call.args['sectionId'] };
  return result;
}

function prepare(
  command: string,
  rest: string[],
  values: InboxValues,
): { method: string; args: Record<string, unknown> } {
  switch (command) {
    case 'inbox': {
      positionals(command, rest, 0, '');
      if (values.category !== undefined && !CATEGORIES.includes(values.category))
        usage(`--category must be one of ${CATEGORIES.join(', ')}.`);
      if (values.sort !== undefined && values.sort !== 'newest' && values.sort !== 'oldest')
        usage('--sort must be newest or oldest.');
      const limit = values.limit === undefined ? undefined : Number(values.limit);
      if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1 || limit > 100))
        usage('--limit must be 1–100.');
      return {
        method: 'humanAttention',
        args: {
          ...(values.category === undefined ? {} : { category: values.category }),
          ...(values.bot === undefined ? {} : { botSlug: required(values.bot, 'bot', command) }),
          ...(values.channel === undefined
            ? {}
            : { channelId: required(values.channel, 'channel', command) }),
          ...(limit === undefined ? {} : { limit }),
          ...(values.cursor === undefined ? {} : { cursor: values.cursor }),
          ...(values.sort === undefined ? {} : { sort: values.sort }),
          ...(values.snoozed === true ? { snoozed: true } : {}),
        },
      };
    }
    case 'inbox-status':
      positionals(command, rest, 0, '');
      return { method: 'humanAttentionStatus', args: {} };
    case 'inbox-dismiss': {
      const [itemId] = positionals(command, rest, 1, 'exactly one inbox item id');
      return {
        method: 'humanAttentionDismiss',
        args: { itemId, sourceKey: values['source-key']?.trim() ?? '' },
      };
    }
    case 'inbox-snooze': {
      const [itemId] = positionals(command, rest, 1, 'exactly one inbox item id');
      if ((values.until !== undefined) === (values.clear === true))
        usage('inbox-snooze needs --until <ISO time> or --clear, not both or neither.');
      let until: string | null = null;
      if (values.until !== undefined) {
        const at = Date.parse(values.until.trim());
        if (Number.isNaN(at)) usage('--until must be an ISO time such as 2026-10-15T09:00:00Z.');
        until = new Date(at).toISOString();
      }
      return {
        method: 'humanAttentionSnooze',
        args: { itemId, sourceKey: values['source-key']?.trim() ?? '', until },
      };
    }
    case 'inbox-ignore': {
      const [sourceEventId] = positionals(command, rest, 1, 'exactly one report Source Event id');
      return { method: 'humanAttentionIgnore', args: { sourceEventId } };
    }
    case 'assignment-context': {
      const [slug] = positionals(command, rest, 1, 'exactly one bot id');
      return {
        method: 'humanAssignmentContext',
        args: {
          slug,
          sessionId: required(values.session, 'session', command),
          sourceEventId: required(values.source, 'source', command),
        },
      };
    }
    case 'channel-assignments': {
      const [channelId] = positionals(command, rest, 1, 'exactly one group channel id');
      return { method: 'channelAssignments', args: { channelId } };
    }
    case 'channel-assign': {
      const [channelId] = positionals(command, rest, 1, 'exactly one channel id');
      if ((values.section !== undefined) === (values.unsectioned === true))
        usage('channel-assign needs --section <id> or --unsectioned, not both or neither.');
      const index = values.index === undefined ? undefined : Number(values.index);
      if (index !== undefined && (!Number.isSafeInteger(index) || index < 0))
        usage('--index must be a nonnegative integer.');
      return {
        method: 'channelAssign',
        args: {
          channelId,
          sectionId:
            values.section === undefined ? null : required(values.section, 'section', command),
          ...(index === undefined ? {} : { index }),
        },
      };
    }
    case 'session-ids':
      positionals(command, rest, 0, '');
      return { method: 'botSessionIds', args: {} };
    case 'session-owner': {
      const [sessionId] = positionals(command, rest, 1, 'exactly one session id');
      return { method: 'sessionOwner', args: { sessionId } };
    }
    case 'session-archive-set': {
      const [slug] = positionals(command, rest, 1, 'exactly one bot id');
      return {
        method: 'sessionArchiveSet',
        args: {
          slug,
          sessionId: required(values.session, 'session', command),
          archived: toggle(command, values.archived, values.unarchived, ['archived', 'unarchived']),
        },
      };
    }
    case 'tool-approval-rules': {
      const [slug] = positionals(command, rest, 1, 'exactly one bot id');
      return { method: 'toolApprovalRules', args: { slug } };
    }
    case 'tool-approval-rule-revoke': {
      const [slug] = positionals(command, rest, 1, 'exactly one bot id');
      const id = required(values.rule, 'rule', command);
      confirmed(command, values);
      return { method: 'toolApprovalRuleRevoke', args: { slug, id } };
    }
    case 'grant-revoke': {
      const [slug] = positionals(command, rest, 1, 'exactly one bot id');
      const grantId = required(values.grant, 'grant', command);
      confirmed(command, values);
      return { method: 'grantRevoke', args: { slug, grantId } };
    }
    case 'grant-write-set': {
      const [slug] = positionals(command, rest, 1, 'exactly one bot id');
      return {
        method: 'grantWriteSet',
        args: {
          slug,
          grantId: required(values.grant, 'grant', command),
          enabled: toggle(command, values.enabled, values.disabled, ['enabled', 'disabled']),
        },
      };
    }
    case 'private-mcp-set': {
      const [slug] = positionals(command, rest, 1, 'exactly one bot id');
      return {
        method: 'privateMcpServerEnable',
        args: {
          slug,
          serverName: required(values.server, 'server', command),
          enabled: toggle(command, values.enabled, values.disabled, ['enabled', 'disabled']),
        },
      };
    }
    case 'private-mcp-remove': {
      const [slug] = positionals(command, rest, 1, 'exactly one bot id');
      const serverName = required(values.server, 'server', command);
      confirmed(command, values);
      return { method: 'privateMcpServerRemove', args: { slug, serverName } };
    }
    default:
      usage(`Unsupported inbox command ${command}.`);
  }
}
