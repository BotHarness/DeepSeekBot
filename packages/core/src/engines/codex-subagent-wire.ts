import type { EngineEvent, EngineTurnEnd } from './engine-session.js';

type Json = Record<string, unknown>;

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

const COLLAB_TOOL_NAMES: Record<string, string> = {
  spawnAgent: 'spawn_agent',
  sendInput: 'send_input',
  resumeAgent: 'resume_agent',
  wait: 'wait_agent',
  closeAgent: 'close_agent',
};

export function codexCollabToolName(tool: string): string {
  return COLLAB_TOOL_NAMES[tool] ?? (tool || 'agent');
}

export function threadIds(value: unknown): string[] {
  return (Array.isArray(value) ? value : []).filter(
    (entry): entry is string => typeof entry === 'string' && entry !== '',
  );
}

export function codexSubagentTitle(prompt: string): string {
  const line = prompt.trim().split('\n')[0]?.trim() ?? '';
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

export function codexSubagentEnd(status: string, message: string): EngineTurnEnd | undefined {
  switch (status) {
    case 'completed':
      return { status: 'completed' };
    case 'errored':
      return { status: 'failed', message: message || 'Codex Subagent failed' };
    case 'shutdown':
    case 'interrupted':
    case 'notFound':
      return { status: 'interrupted' };
    default:
      return undefined;
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object' && value !== null)
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Json)[key])}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

export function gatewayCallKey(name: string, args: Record<string, unknown>): string {
  return `${name}\u0000${stableJson(args)}`;
}

export function codexSubagentActivity(
  item: Json,
): { thread: string; title: string; events: EngineEvent[] } | undefined {
  const thread = text(item['agentThreadId']);
  if (item['kind'] !== 'started' || thread === '') return undefined;
  const path = text(item['agentPath']);
  const name = path.split('/').filter(Boolean).at(-1) ?? '';
  const title = codexSubagentTitle(name.replaceAll('_', ' ')) || 'Subagent';
  const callId = text(item['id']) || `spawn-${thread}`;
  const model = text(item['model']);
  const effort = text(item['reasoningEffort']);
  return {
    thread,
    title,
    events: [
      {
        kind: 'tool-call',
        callId,
        name: 'spawn_agent',
        arguments: JSON.stringify({
          ...(path === '' ? {} : { agent: path }),
          ...(model === '' ? {} : { model }),
          ...(effort === '' ? {} : { reasoningEffort: effort }),
        }),
      },
      { kind: 'tool-result', callId, text: `Started ${title}`, isError: false },
      { kind: 'subagent-start', subagentId: thread, title },
    ],
  };
}
