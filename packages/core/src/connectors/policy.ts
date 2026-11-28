import { createHash } from 'node:crypto';

import { COMPOSIO_EXECUTE_TOOL, composioBatchSlugs } from '../kernel/composio-tool-effects.js';
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
  'This App connection was signed in before Tobs recorded the access its service granted, and this Bot has Read only; ask the Owner to sign it in again in Settings › App connections before using it.';

export const STALE_SIGN_IN_REFUSAL =
  'This App connection changed since its tools were loaded; try again in a moment.';

export function remoteMcpToolDenial(
  name: string,
  servers: ReadonlyMap<string, string | undefined>,
): string | undefined {
  if (!name.startsWith(REMOTE_MCP_TOOL_PREFIX)) return undefined;
  for (const [serverName, refusal] of servers)
    if (name.startsWith(`mcp__${serverName}__`)) return refusal;
  return 'No App connection with this tool is granted to this Bot any more; ask the Owner to grant one in the Bot settings.';
}

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

export function composioWriteInput(
  name: string,
  args: unknown,
  access: Readonly<Record<string, ConnectorAccess>>,
): unknown {
  const raw = name.slice(CONNECTOR_TOOL_PREFIX.length);
  const names =
    name === COMPOSIO_EXECUTE_TOOL
      ? composioBatchSlugs(args)
      : raw.startsWith('COMPOSIO_')
        ? []
        : [raw];
  const services = Object.keys(access);
  const writes = names?.some((slug) => {
    const service = serviceFor(slug, services);
    return service !== undefined && !readOnlyTool(slug, service);
  });
  if (!writes) return undefined;
  return name === COMPOSIO_EXECUTE_TOOL ? args : { tools: [{ tool_slug: raw, arguments: args }] };
}

export function composioCallServices(
  name: string,
  args: unknown,
  services: readonly string[],
): ReadonlySet<string> {
  const raw = name.slice(CONNECTOR_TOOL_PREFIX.length);
  if (DISCOVERY.has(raw)) return new Set();
  const slugs = name === COMPOSIO_EXECUTE_TOOL ? (composioBatchSlugs(args) ?? []) : [raw];
  return new Set(
    slugs.flatMap((slug) => {
      const service = serviceFor(slug, services);
      return service === undefined ? [] : [service];
    }),
  );
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
    name === COMPOSIO_EXECUTE_TOOL
      ? composioBatchSlugs(args)
      : raw.startsWith('COMPOSIO_')
        ? undefined
        : [raw];
  if (names === undefined)
    return name === COMPOSIO_EXECUTE_TOOL
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
