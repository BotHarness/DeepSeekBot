import { createHash } from 'node:crypto';

import type { ConnectorAccess } from './store.js';

export const CONNECTOR_TOOLS: ReadonlySet<string> = new Set([
  'connector_catalog',
  'connector_request',
]);
export const CONNECTOR_MCP_SERVER = 'composio';
export const CONNECTOR_TOOL_PREFIX = `mcp__${CONNECTOR_MCP_SERVER}__`;
export const REMOTE_MCP_SERVER_PREFIX = 'app_';
export const REMOTE_MCP_TOOL_PREFIX = `mcp__${REMOTE_MCP_SERVER_PREFIX}`;

const MAX_PUBLIC_NAME_LENGTH = 64;
const HASH_LENGTH = 12;

export function mcpPublicToolName(serverName: string, rawName: string): string {
  const joined = `mcp__${serverName}__${rawName}`;
  const normalized = joined.replace(/[^A-Za-z0-9_-]/g, '_');
  if (normalized === joined && normalized.length <= MAX_PUBLIC_NAME_LENGTH) return normalized;
  const hash = createHash('sha256')
    .update(`${serverName}\0${rawName}`)
    .digest('hex')
    .slice(0, HASH_LENGTH);
  return `${normalized.slice(0, MAX_PUBLIC_NAME_LENGTH - HASH_LENGTH - 1)}_${hash}`;
}

export function remoteMcpServerName(accountId: string, service: string): string {
  const suffix = createHash('sha256').update(accountId).digest('hex').slice(0, 6);
  const base = `${REMOTE_MCP_SERVER_PREFIX}${service.replace(/^mcp_/, '')}`.slice(0, 21);
  return `${base}_${suffix}`;
}

export function remoteMcpServerNames(
  connectors: ReadonlyArray<{ accountId: string; provider: string; service: string }>,
): Map<string, string> {
  const names = new Map<string, string>();
  for (const connector of connectors)
    if (connector.provider === 'mcp')
      names.set(connector.accountId, remoteMcpServerName(connector.accountId, connector.service));
  return names;
}

export function remoteMcpToolDenial(
  name: string,
  servers: ReadonlyMap<
    string,
    { access: ConnectorAccess; readOnly: ReadonlySet<string> | undefined; service?: string }
  >,
  args?: unknown,
): string | undefined {
  if (!name.startsWith(REMOTE_MCP_TOOL_PREFIX)) return undefined;
  for (const [serverName, server] of servers) {
    const prefix = `mcp__${serverName}__`;
    if (!name.startsWith(prefix)) continue;
    if (server.access === 'write') return undefined;
    if (server.readOnly === undefined)
      return 'This App connection is still loading its tool list; try again in a moment.';
    if (server.readOnly.has(name)) return undefined;
    const raw = name.slice(prefix.length);
    const reader = server.service === undefined ? undefined : COMMAND_READERS[server.service];
    if (reader !== undefined) {
      if (reader.reads(raw, args)) return undefined;
      return reader.refusal(raw);
    }
    return `${raw} is not marked read-only by its server, and this Bot has Read access only; ask the Owner for Read and write before trying again.`;
  }
  return 'No App connection with this tool is granted to this Bot any more; ask the Owner to grant one in the Bot settings.';
}

const POSTHOG_READ_COMMANDS = new Set(['help', 'learn', 'tools', 'search', 'info', 'schema']);
const POSTHOG_READ_TOOLS = new Set(['execute-sql']);

function posthogCommand(args: unknown): string | undefined {
  if (typeof args !== 'object' || args === null) return undefined;
  const command = (args as { command?: unknown }).command;
  return typeof command === 'string' ? command.trim() : undefined;
}

export function posthogReadOnlyCall(raw: string, args: unknown): boolean {
  if (raw !== 'exec') return false;
  const command = posthogCommand(args);
  if (command === undefined || command === '' || /[\r\n]/.test(command)) return false;
  const [verb, ...rest] = command.split(/\s+/);
  if (POSTHOG_READ_COMMANDS.has(verb!)) return true;
  if (verb !== 'call') return false;
  let tool: string | undefined;
  for (const part of rest) {
    if (part === '--confirm') return false;
    if (part.startsWith('--')) continue;
    tool = part;
    break;
  }
  if (tool === undefined || !/^[a-z0-9-]+$/.test(tool)) return false;
  if (POSTHOG_READ_TOOLS.has(tool)) return true;
  const words = tool.toUpperCase().split('-').filter(Boolean);
  return words.some((word) => READ_WORDS.has(word)) && !words.some((word) => WRITE_WORDS.has(word));
}

const COMMAND_READERS: Readonly<
  Record<
    string,
    { reads: (raw: string, args: unknown) => boolean; refusal: (raw: string) => string }
  >
> = {
  mcp_posthog: {
    reads: posthogReadOnlyCall,
    refusal: (raw) =>
      raw === 'exec'
        ? 'This PostHog command can change data, and this Bot has Read access only; use read commands (search, info, schema, learn, or call a tool that gets, lists, queries or searches), or ask the Owner for Read and write.'
        : `${raw} is not marked read-only by its server, and this Bot has Read access only; ask the Owner for Read and write before trying again.`,
  },
};

const MULTI_EXECUTE = 'COMPOSIO_MULTI_EXECUTE_TOOL';
const DISCOVERY = new Set(['COMPOSIO_SEARCH_TOOLS', 'COMPOSIO_GET_TOOL_SCHEMAS']);
const READ_WORDS = new Set([
  'GET',
  'LIST',
  'SEARCH',
  'FETCH',
  'FIND',
  'READ',
  'QUERY',
  'RETRIEVE',
  'DOWNLOAD',
  'VIEW',
  'DESCRIBE',
  'COUNT',
  'LOOKUP',
  'EXPORT',
]);
const WRITE_WORDS = new Set([
  'ACCEPT',
  'ADD',
  'APPEND',
  'ARCHIVE',
  'ASSIGN',
  'BATCH',
  'CANCEL',
  'CLEAR',
  'CLOSE',
  'COPY',
  'CREATE',
  'DECLINE',
  'DELETE',
  'DRAFT',
  'EDIT',
  'EMPTY',
  'EXECUTE',
  'FORWARD',
  'IMPORT',
  'INSERT',
  'INVITE',
  'LABEL',
  'MARK',
  'MERGE',
  'MODIFY',
  'MOVE',
  'PATCH',
  'POST',
  'PUBLISH',
  'PUT',
  'REMOVE',
  'RENAME',
  'REOPEN',
  'REPLY',
  'RESTORE',
  'RUN',
  'SEND',
  'SET',
  'SHARE',
  'STAR',
  'TRASH',
  'UNSTAR',
  'UPDATE',
  'UPLOAD',
  'UPSERT',
  'WRITE',
]);

export function readOnlyTool(slug: string, service: string): boolean {
  const words = slug
    .slice(service.length + 1)
    .split('_')
    .filter(Boolean);
  return words.some((word) => READ_WORDS.has(word)) && !words.some((word) => WRITE_WORDS.has(word));
}

function serviceFor(slug: string, services: readonly string[]): string | undefined {
  let match: string | undefined;
  for (const service of services)
    if (
      slug.startsWith(service.toUpperCase() + '_') &&
      (match === undefined || service.length > match.length)
    )
      match = service;
  return match;
}

function slugs(args: unknown): string[] | undefined {
  if (typeof args !== 'object' || args === null) return undefined;
  const tools = (args as { tools?: unknown }).tools;
  if (!Array.isArray(tools) || tools.length === 0) return undefined;
  const names: string[] = [];
  for (const item of tools) {
    const slug =
      typeof item === 'object' && item !== null
        ? (item as { tool_slug?: unknown }).tool_slug
        : undefined;
    if (typeof slug !== 'string' || slug === '') return undefined;
    names.push(slug);
  }
  return names;
}

export function connectorToolDenial(
  name: string,
  args: unknown,
  access: Readonly<Record<string, ConnectorAccess>>,
): string | undefined {
  if (!name.startsWith(CONNECTOR_TOOL_PREFIX)) return undefined;
  const raw = name.slice(CONNECTOR_TOOL_PREFIX.length);
  const services = Object.keys(access);
  if (services.length === 0)
    return 'No App connection is granted to this Bot any more; ask the Owner to grant one in the Bot settings.';
  if (DISCOVERY.has(raw)) return undefined;
  const names =
    raw === MULTI_EXECUTE ? slugs(args) : raw.startsWith('COMPOSIO_') ? undefined : [raw];
  if (names === undefined)
    return raw === MULTI_EXECUTE
      ? 'COMPOSIO_MULTI_EXECUTE_TOOL needs a tools list in which every entry names a tool_slug.'
      : `${raw} is not available to Bots; use COMPOSIO_SEARCH_TOOLS and COMPOSIO_MULTI_EXECUTE_TOOL.`;
  for (const slug of names) {
    const service = serviceFor(slug, services);
    if (service === undefined)
      return `${slug} belongs to an App connection this Bot was not granted; ask the Owner to grant it in the Bot settings.`;
    if (access[service] === 'read' && !readOnlyTool(slug, service))
      return `${slug} would change ${service}, which is read-only for this Bot; ask the Owner for write access before trying again.`;
  }
  return undefined;
}
