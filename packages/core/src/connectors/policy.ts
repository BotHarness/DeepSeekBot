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

export const LEGACY_READ_REFUSAL =
  'This App connection was signed in before Read-only sign-in existed, so its token can change data; ask the Owner to sign it in again as Read in Settings › App connections before using it.';

export function remoteMcpToolDenial(
  name: string,
  servers: ReadonlyMap<string, string | undefined>,
): string | undefined {
  if (!name.startsWith(REMOTE_MCP_TOOL_PREFIX)) return undefined;
  for (const [serverName, refusal] of servers)
    if (name.startsWith(`mcp__${serverName}__`)) return refusal;
  return 'No App connection with this tool is granted to this Bot any more; ask the Owner to grant one in the Bot settings.';
}

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
