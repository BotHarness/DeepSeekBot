export { CONNECTOR_OPTIONS } from '../kernel/cli-option-spec.js';
import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';

type Rpc = (method: string, payload: Record<string, unknown>) => Promise<unknown>;

export interface ConnectorValues {
  'key-stdin'?: boolean;
  label?: string;
  access?: string;
  confirm?: boolean;
  cursor?: string;
  name?: string;
  bot?: string;
  search?: string;
  explain?: boolean;
  choice?: string;
}

export const CONNECTOR_COMMANDS = [
  { command: 'connector', description: 'inspect Connector Accounts and decide access requests' },
  {
    command: 'connector-catalog',
    description: 'show a Bot’s Connector Account catalog (--bot <slug>, optional --search)',
  },
  {
    command: 'connector-request-decide',
    description: 'decide a Connector Account request from its card (--choice once|persistent|deny)',
  },
  {
    command: 'connectors',
    description:
      'list App connection accounts on this Host, their Bot grants and the services you can connect',
  },
  {
    command: 'connector-key-set',
    description: 'save and check the Composio API key App connections use (--key-stdin)',
  },
  {
    command: 'connector-key-clear',
    description: 'forget the Composio API key; connected accounts stop working (--confirm)',
  },
  {
    command: 'connector-connect',
    description:
      'start connecting an account for a service such as gmail and print the sign-in link (--label)',
  },
  {
    command: 'connector-reconnect',
    description:
      'sign an expired or failed App connection in again and print the new sign-in link; its Bot grants stay',
  },
  {
    command: 'connector-refresh',
    description: 'check every App connection account with Composio and update its status',
  },
  {
    command: 'connector-search',
    description:
      'search every app Composio can connect, featured apps first; Chinese words match the featured apps only (--cursor for the next page)',
  },
  {
    command: 'connector-mcp-search',
    description:
      'search remote MCP servers that connect by signing in (featured first, then the MCP Registry); no Composio key needed (--cursor for the next page)',
  },
  {
    command: 'connector-mcp-add',
    description:
      'connect a remote MCP server by its https address and print the sign-in link when it needs one (--name, --label)',
  },
  {
    command: 'connector-mcp-finish',
    description:
      'finish a remote MCP sign-in by pasting the address the sign-in page opened, when that page could not reach this Host',
  },
  {
    command: 'connector-grant',
    description:
      'let a Bot use an App connection account (--access read|write) or take it away (--access none). Add --explain to show effective permissions and their sources.',
  },
  {
    command: 'connector-remove',
    description:
      'disconnect an App connection account at Composio and remove it from every Bot (--confirm)',
  },
  {
    command: 'bot-connectors',
    description: 'list the App connection accounts a Bot may use and its access to each',
  },
] as const;

type Command = (typeof CONNECTOR_COMMANDS)[number]['command'];

export function isConnectorCommand(command: string): command is Command {
  return CONNECTOR_COMMANDS.some((entry) => entry.command === command);
}

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}

function positionals(command: Command, rest: string[], count: number, what: string): string[] {
  if (rest.length !== count || rest.some((value) => !value.trim()))
    usage(count === 0 ? `${command} takes no positional arguments.` : `${command} needs ${what}.`);
  return rest.map((value) => value.trim());
}

export async function runConnectorCommand(
  command: Command,
  rest: string[],
  values: ConnectorValues,
  io: Pick<BotCreateCliIo, 'readStdin'>,
  connect: () => Promise<Rpc>,
): Promise<unknown> {
  if (command === 'connectors' || command === 'connector-refresh') {
    positionals(command, rest, 0, '');
    return (await connect())(command === 'connectors' ? 'connectors' : 'connectorRefresh', {});
  }
  if (command === 'connector-key-set') {
    positionals(command, rest, 0, '');
    if (values['key-stdin'] !== true)
      usage('connector-key-set reads the key from stdin; pass --key-stdin and pipe the key in.');
    const apiKey = ((await io.readStdin?.()) ?? '').trim();
    if (apiKey === '') usage('connector-key-set got an empty key on stdin.');
    return (await connect())('connectorKeySet', { apiKey });
  }
  if (command === 'connector-key-clear') {
    positionals(command, rest, 0, '');
    if (values.confirm !== true)
      usage(
        'connector-key-clear needs --confirm; every App connection stops working until a key is added again.',
      );
    return (await connect())('connectorKeyClear', {});
  }
  if (command === 'connector-connect') {
    const [service] = positionals(command, rest, 1, 'one service, for example gmail');
    return (await connect())('connectorConnect', {
      service,
      ...(values.label === undefined ? {} : { label: values.label }),
    });
  }
  if (command === 'connector-reconnect') {
    const [accountId] = positionals(command, rest, 1, 'exactly one account id');
    return (await connect())('connectorReconnect', { accountId });
  }
  if (command === 'connector-search') {
    if (rest.length > 1) usage('connector-search takes at most one query; quote several words.');
    const query = (rest[0] ?? '').trim();
    return (await connect())('connectorSearch', {
      query,
      ...(values.cursor === undefined ? {} : { cursor: values.cursor }),
    });
  }
  if (command === 'connector-mcp-search') {
    if (rest.length > 1)
      usage('connector-mcp-search takes at most one query; quote several words.');
    return (await connect())('connectorMcpSearch', {
      query: (rest[0] ?? '').trim(),
      ...(values.cursor === undefined ? {} : { cursor: values.cursor }),
    });
  }
  if (command === 'connector-mcp-add') {
    const [url] = positionals(
      command,
      rest,
      1,
      'one https address, for example https://mcp.posthog.com/mcp',
    );
    return (await connect())('connectorMcpAdd', {
      url,
      ...(values.name === undefined ? {} : { name: values.name }),
      ...(values.label === undefined ? {} : { label: values.label }),
    });
  }
  if (command === 'connector-mcp-finish') {
    const [url] = positionals(command, rest, 1, 'the whole address the sign-in page opened');
    return (await connect())('connectorMcpFinish', { url });
  }
  if (command === 'connector') usage('connector needs catalog, grant or request-decide.');
  if (command === 'connector-catalog') {
    positionals(command, rest, 0, '');
    const slug = values.bot?.trim();
    if (!slug) usage('connector catalog needs --bot <slug>.');
    return (await connect())('connectorCatalog', { slug, query: values.search ?? '' });
  }
  if (command === 'connector-request-decide') {
    const [channelId, messageId] = positionals(
      command,
      rest,
      2,
      'a Channel ID and card message ID',
    );
    const choice = values.choice;
    if (choice !== 'once' && choice !== 'persistent' && choice !== 'deny')
      usage('connector request-decide needs --choice once, persistent or deny.');
    return (await connect())('connectorRequestDecide', { channelId, messageId, choice });
  }
  if (command === 'connector-grant') {
    const [slug, accountId] = positionals(command, rest, 2, 'a bot id and an account id');
    const access = values.access;
    if (access === undefined && values.explain === true)
      return (await connect())('connectorGrantExplain', { slug, accountId });
    if (access !== 'read' && access !== 'write' && access !== 'none')
      usage('connector grant needs --access read, write or none, or --explain.');
    const rpc = await connect();
    const result = await rpc('connectorGrantSet', {
      slug,
      accountId,
      access: access === 'none' ? null : access,
    });
    return values.explain === true
      ? { result, explanation: await rpc('connectorGrantExplain', { slug, accountId }) }
      : result;
  }
  if (command === 'connector-remove') {
    const [accountId] = positionals(command, rest, 1, 'exactly one account id');
    if (values.confirm !== true)
      usage(
        'connector-remove needs --confirm; the account is disconnected at Composio and every Bot loses it.',
      );
    return (await connect())('connectorAccountRemove', { accountId });
  }
  const [slug] = positionals(command, rest, 1, 'exactly one bot id');
  return (await connect())('botConnectors', { slug });
}
