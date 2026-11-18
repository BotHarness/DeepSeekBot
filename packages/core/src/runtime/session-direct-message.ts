export const SESSION_DIRECT_MESSAGE_PREFIX = 'session-direct-';

const HEADER = '[Human wrote this directly in your Session detail; no Channel shows it]';
const FOOTER = '\n[Source Event ID: ';
const TAIL =
  '. Treat it as the Human steering you. Reply only if you need the Human; bot_send_message with this source_event_id reaches their DM.]';
const HOST_NOTES = /^(?:\[Host[^\n]*\]\n+)*$/u;
const SOURCE_EVENT_ID = /^[^\s\]]+$/u;

export function sessionDirectPrompt(body: string, sourceEventId: string): string {
  return `${HEADER}\n${body}${FOOTER}${sourceEventId}${TAIL}`;
}

export function sessionDirectBody(prompt: string): string | undefined {
  const at = prompt.indexOf(`${HEADER}\n`);
  if (at < 0 || !HOST_NOTES.test(prompt.slice(0, at)) || !prompt.endsWith(TAIL)) return undefined;
  const start = at + HEADER.length + 1;
  const end = prompt.lastIndexOf(FOOTER);
  if (end < start - 1) return undefined;
  const id = prompt.slice(end + FOOTER.length, prompt.length - TAIL.length);
  return SOURCE_EVENT_ID.test(id) ? prompt.slice(start, Math.max(start, end)) : undefined;
}
