export const SESSION_DIRECT_MESSAGE_PREFIX = 'session-direct-';

const HEADER = '[Human wrote this directly in your Session detail; no Channel shows it]';
const FOOTER = '\n[Source Event ID: ';
const TAIL =
  '. Treat it as the Human steering you. Reply only if you need the Human; bot_send_message with this source_event_id reaches their DM.]';
const HOST_NOTES = String.raw`(?:\[Host[^\n]*(?:\n- [^\n]*)*\]\n+)*`;
const SPEAKER = String.raw`(?:Current Channel Human: \{[^\n]*\}\n|\[[^[\]\n]*\]\n(?:\[Speaker policies: latest revision wins; Deny wins\]\n[^\n]*\n)?)?`;
const NOTES = new RegExp(`^${HOST_NOTES}$`, 'u');
const PREFIX = new RegExp(`^${HOST_NOTES}${SPEAKER}${HOST_NOTES}$`, 'u');
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const END = new RegExp(`${literal(FOOTER)}([^\\s\\]]+)${literal(TAIL)}(?=$|\\n\\n)`, 'u');

export function sessionDirectPrompt(body: string, sourceEventId: string): string {
  return `${HEADER}\n${body}${FOOTER}${sourceEventId}${TAIL}`;
}

function parse(prompt: string): { at: number; body: string; sourceEventId: string } | undefined {
  const at = prompt.indexOf(`${HEADER}\n`);
  if (at < 0 || !PREFIX.test(prompt.slice(0, at))) return undefined;
  const start = at + HEADER.length + 1;
  const end = END.exec(prompt.slice(start - 1));
  if (end === null) return undefined;
  return {
    at,
    body: prompt.slice(start, Math.max(start, start - 1 + end.index)),
    sourceEventId: end[1]!,
  };
}

export function sessionDirectBody(prompt: string): string | undefined {
  return parse(prompt)?.body;
}

export function sessionDirectSpeaker(
  prompt: string,
  sourceEventId: string,
  speaker: string,
): string | undefined {
  const direct = parse(prompt);
  if (direct?.sourceEventId !== sourceEventId || !NOTES.test(prompt.slice(0, direct.at)))
    return undefined;
  return `${prompt.slice(0, direct.at)}${speaker.trimEnd()}\n${prompt.slice(direct.at)}`;
}
