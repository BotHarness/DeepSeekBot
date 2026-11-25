import type { ConnectorAccess } from './store.js';

export const CONNECTOR_TOOLS: ReadonlySet<string> = new Set([
  'connector_catalog',
  'connector_request',
]);
export const CONNECTOR_MCP_SERVER = 'composio';
export const CONNECTOR_TOOL_PREFIX = `mcp__${CONNECTOR_MCP_SERVER}__`;

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
    return 'No connector is granted to this Bot any more; ask the Owner to grant one in the Bot settings.';
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
      return `${slug} belongs to a connector this Bot was not granted; ask the Owner to grant it in the Bot settings.`;
    if (access[service] === 'read' && !readOnlyTool(slug, service))
      return `${slug} would change ${service}, which is read-only for this Bot; ask the Owner for write access before trying again.`;
  }
  return undefined;
}
