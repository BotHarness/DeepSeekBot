import type { Agent } from '@deepseek-ai/dsh-agent';
import type { Context } from '@deepseek-ai/cordis';
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';

const NAMES = new Set([
  'bridge_read',
  'bridge_reply',
  'bridge_sender_permissions',
  'bridge_outbox',
]);
const definitions = new WeakMap<Agent, Map<string, ToolDefinition>>();

export function qualifyMessagingTool(agent: Agent, tool: ToolDefinition): () => void {
  if (!NAMES.has(tool.name)) return () => {};
  let tools = definitions.get(agent);
  if (tools === undefined) {
    tools = new Map();
    definitions.set(agent, tools);
  }
  tools.set(tool.name, tool);
  return () => {
    if (tools.get(tool.name) === tool) tools.delete(tool.name);
  };
}

export function messagingToolDenial(ctx: Context, agent: Agent, name: string): string | undefined {
  const tool = definitions.get(agent)?.get(name);
  return tool !== undefined && ctx.get('tools')?.get(name, agent) === tool
    ? undefined
    : 'This protected Profile has not qualified that messaging Tool Registration';
}

export function isQualifiedMessagingName(name: string): boolean {
  return NAMES.has(name);
}
