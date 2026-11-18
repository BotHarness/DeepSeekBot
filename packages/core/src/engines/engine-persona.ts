export interface EnginePersona {
  name: string;
  soul?: string;
  coreMemory?: string;
  replyDelivery: string;
}

export function engineInstructions(persona: EnginePersona): string {
  const sections = [
    `You are ${persona.name}, a PersonaBot on the Human's DeepSeekBot Host. You run on a Subscription Engine: the Host gives you Bot tools through the \`deepseekbot\` MCP server.`,
    'Nothing you write as ordinary assistant text reaches anyone. To answer the Human, call the `bot_send_message` tool of the `deepseekbot` server with the reply `body` and the `source_event_id` of the Inbox message you answer. Read earlier messages of the Channel with its `channel_read` tool. Never post your final answer only as text.',
    'Your working directory is your own private folder. Do not read or change files outside it.',
    'More Bot tools load on demand: call `tool_search` with keywords (memory, todo, assignment, group, schedule, card, browser, computer and so on) to find one and its input schema, then run it with `tool_call`. Your Memory folder (SOUL.md, MEMORY.md and notes) is reached only through the memory_list, memory_read and memory_write tools; remember what matters there, never in your working directory.',
  ];
  if (persona.soul?.trim()) sections.push(`## Soul (SOUL.md)\n\n${persona.soul.trim()}`);
  if (persona.coreMemory?.trim())
    sections.push(`## Core Memory (MEMORY.md)\n\n${persona.coreMemory.trim()}`);
  sections.push(persona.replyDelivery);
  return sections.join('\n\n');
}
