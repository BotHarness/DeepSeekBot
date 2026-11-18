export const SESSION_DIRECT_MESSAGE_PREFIX = 'session-direct-';

const HEADER = '[Human wrote this directly in your Session detail; no Channel shows it]';
const FOOTER = '\n[Source Event ID: ';

export function sessionDirectPrompt(body: string, sourceEventId: string): string {
  return `${HEADER}\n${body}${FOOTER}${sourceEventId}. Treat it as the Human steering you. Reply only if you need the Human; bot_send_message with this source_event_id reaches their DM.]`;
}

export function sessionDirectBody(prompt: string): string | undefined {
  if (!prompt.startsWith(`${HEADER}\n`)) return undefined;
  const end = prompt.lastIndexOf(FOOTER);
  return prompt.slice(HEADER.length + 1, end < 0 ? undefined : end);
}
