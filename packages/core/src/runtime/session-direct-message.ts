export const SESSION_DIRECT_MESSAGE_PREFIX = 'session-direct-';

const HEADER = '[Human wrote this directly in your Session detail; no Channel shows it]';
const FOOTER = '\n[Source Event ID: ';

export function sessionDirectPrompt(body: string, sourceEventId: string): string {
  return `${HEADER}\n${body}${FOOTER}${sourceEventId}. Treat it as the Human steering you. Reply only if you need the Human; bot_send_message with this source_event_id reaches their DM.]`;
}

export function sessionDirectBody(prompt: string): string | undefined {
  const at = `\n${prompt}`.indexOf(`\n${HEADER}\n`);
  const end = prompt.lastIndexOf(FOOTER);
  if (at < 0 || end < at + HEADER.length) return undefined;
  return prompt.slice(at + HEADER.length + 1, end);
}
