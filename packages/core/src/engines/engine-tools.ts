import type { Session } from '@deepseek-ai/dsh-session';

import type { EngineTool, EngineToolContext } from './engine-host.js';

export interface EngineBotTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
}

export interface EngineToolInfo {
  botSlug: string;
  sessionId: string;
}

export type EngineToolSource = (
  info: EngineToolInfo,
) => readonly EngineBotTool[] | Promise<readonly EngineBotTool[]>;

export interface EngineToolGateRequest {
  botSlug: string;
  sessionId: string;
  session: Session;
  toolName: string;
  args: Record<string, unknown>;
  signal: AbortSignal;
  ask: EngineToolContext['ask'];
}

export type EngineToolGate = (request: EngineToolGateRequest) => Promise<string | undefined>;

export const ENGINE_LISTED_TOOLS: ReadonlySet<string> = new Set([
  'bot_send_message',
  'channel_read',
  'inbox_resolve',
]);

export const ENGINE_UNSUPPORTED_TOOLS: ReadonlySet<string> = new Set([
  'channel_read_image',
  'call_frame',
]);

const SEARCH_LIMIT = 20;

export const TOOL_SEARCH: EngineTool = {
  name: 'tool_search',
  description:
    'Find more DeepSeekBot Bot tools: memory, Channel actions and history, Assignments, Groups, schedules, Todo, GenUI cards, the Bot Computer and Browser. Pass keywords, or "select:name1,name2" for exact names. Returns each match with its input_schema; run one with tool_call. An empty query lists every tool name.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Keywords, or select:<name>[,<name>...].' },
      limit: {
        type: 'integer',
        description: `Most matches to return, 1-${SEARCH_LIMIT}; default 5.`,
      },
    },
    required: ['query'],
  },
};

export const TOOL_CALL: EngineTool = {
  name: 'tool_call',
  description:
    'Run one DeepSeekBot Bot tool found with tool_search. Pass its exact name and an arguments object that matches its input_schema.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Exact tool name from tool_search.' },
      arguments: { type: 'object', description: 'Arguments for that tool.' },
    },
    required: ['name'],
  },
};

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((word) => word.length > 1);

const firstSentence = (text: string): string => {
  const end = text.search(/[.。](\s|$)/u);
  return end === -1 ? text.slice(0, 160) : text.slice(0, end + 1);
};

export function searchEngineTools(
  catalog: readonly EngineBotTool[],
  args: Record<string, unknown>,
): string {
  const query = typeof args['query'] === 'string' ? args['query'].trim() : '';
  const rawLimit = args['limit'];
  const limit =
    typeof rawLimit === 'number' && Number.isInteger(rawLimit)
      ? Math.min(Math.max(rawLimit, 1), SEARCH_LIMIT)
      : 5;
  const describe = (tool: EngineBotTool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  });
  if (query === '')
    return JSON.stringify({
      tools: catalog.map((tool) => ({
        name: tool.name,
        description: firstSentence(tool.description),
      })),
    });
  if (query.startsWith('select:')) {
    const names = query
      .slice('select:'.length)
      .split(',')
      .map((name) => name.trim());
    const found = catalog.filter((tool) => names.includes(tool.name));
    return JSON.stringify({
      tools: found.map(describe),
      missing: names.filter((name) => !found.some((tool) => tool.name === name)),
    });
  }
  const terms = words(query);
  const scored = catalog
    .map((tool) => {
      const name = tool.name.toLowerCase();
      const nameWords = words(tool.name);
      const descriptionWords = new Set(words(tool.description));
      let score = name === query.toLowerCase() ? 100 : 0;
      for (const term of terms) {
        if (nameWords.includes(term)) score += 6;
        else if (name.includes(term)) score += 3;
        if (descriptionWords.has(term)) score += 1;
      }
      return { tool, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name))
    .slice(0, limit);
  return JSON.stringify({ tools: scored.map((entry) => describe(entry.tool)) });
}
