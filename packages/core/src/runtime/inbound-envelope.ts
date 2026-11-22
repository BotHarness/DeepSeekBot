import { defaultPromptText } from '../prompts/prompt-parts.js';

export const GROUP_MENTION_REMINDER = '[Host Group mention reminder]';

export interface InboundEnvelope {
  kind: 'human-dm' | 'group' | 'bot-dm' | 'inbox' | 'other';
  channelId?: string;
  messageId?: string;
  sourceEventId?: string;
  body: string;
}

function sourceLine(line: string): { id: string; speaker: boolean } | undefined {
  const match = /^Source Event ID: (\S+)(?: (\[[^\]\r\n]+\]))?\s*$/u.exec(line);
  return match === null ? undefined : { id: match[1]!, speaker: match[2] !== undefined };
}

function afterSpeakerPolicies(lines: readonly string[], offset: number): number {
  return lines[offset] === '[Speaker policies: latest revision wins; Deny wins]' &&
    lines[offset + 1]?.startsWith('[')
    ? offset + 2
    : offset;
}

function afterHostPreamble(lines: readonly string[]): number {
  let offset = 0;
  while (lines[offset]?.startsWith('[Host: ')) {
    const end = lines.indexOf('', offset + 1);
    if (end === -1 || !lines[end - 1]?.endsWith(']')) break;
    offset = end + 1;
  }
  if (lines[offset]?.startsWith('Current Channel Human: {')) offset += 1;
  return offset;
}

export function parseInboundEnvelope(text: string): InboundEnvelope | undefined {
  const lines = text.split(/\r?\n/u);
  let offset = afterHostPreamble(lines);
  const envelope: InboundEnvelope = { kind: 'other', body: '' };
  const source = sourceLine(lines[offset] ?? '');
  if (source !== undefined) {
    envelope.sourceEventId = source.id;
    offset += 1;
    if (source.speaker) offset = afterSpeakerPolicies(lines, offset);
  }
  const header =
    /^(\[Human DM\]|\[Group\]|\[Bot DM\]|\[Bot Inbox[^\]\r\n]*\])(?:[ \t]+(.*))?$/u.exec(
      lines[offset] ?? '',
    );
  if (header === null && source === undefined) return undefined;
  if (header?.[2] && header[1] !== '[Bot Inbox harvest]') return undefined;
  if (header !== null) {
    envelope.kind =
      header[1] === '[Human DM]'
        ? 'human-dm'
        : header[1] === '[Group]'
          ? 'group'
          : header[1] === '[Bot DM]' ||
              header[1]?.startsWith('[Bot Inbox: direct message from PersonaBot ')
            ? 'bot-dm'
            : 'inbox';
    offset += 1;
    if (header[2]) {
      envelope.body = [header[2], ...lines.slice(offset)].join('\n');
      return envelope;
    }
  }
  for (; offset < lines.length; offset += 1) {
    const line = lines[offset] ?? '';
    const metadata = /^(Source Event ID|Channel|Message ID):[ \t]*(\S.*)$/u.exec(line);
    if (metadata === null) break;
    if (
      (metadata[1] === 'Source Event ID' && envelope.sourceEventId !== undefined) ||
      (metadata[1] === 'Channel' && envelope.channelId !== undefined) ||
      (metadata[1] === 'Message ID' && envelope.messageId !== undefined)
    )
      break;
    const value = metadata[2]!.trim();
    if (metadata[1] === 'Source Event ID') {
      const source = sourceLine(line);
      if (source === undefined) break;
      envelope.sourceEventId = source.id;
      if (source.speaker) offset = afterSpeakerPolicies(lines, offset + 1) - 1;
    } else if (metadata[1] === 'Channel') envelope.channelId = value;
    else envelope.messageId = value;
  }
  envelope.body = lines.slice(offset).join('\n');
  if (envelope.kind === 'inbox' && envelope.body.startsWith('Message: '))
    envelope.body = envelope.body.slice('Message: '.length);
  return envelope;
}

const HUMAN_CONTEXT =
  /\n+(?:\[Host [^\]\n]{1,80}\]|\[Bot Inbox(?:\]|: (?:pending (?:DM|Group) context|Group digest)\])|\[Open Inbox\]|\[The Human invoked this Skill with \/\.\]|\[Quoted messages: the sender cites these earlier messages of this Channel\])(?=[ \t\n]|$)/u;

export function inboundEnvelopeBody(envelope: InboundEnvelope): string {
  if (envelope.messageId === undefined || envelope.channelId === undefined) return envelope.body;
  const body = envelope.body.split(HUMAN_CONTEXT, 1)[0] ?? '';
  if (envelope.kind !== 'inbox') return body;
  const legacyReminder = body.indexOf('\n' + defaultPromptText('group-mention-hint'));
  return legacyReminder === -1 ? body : body.slice(0, legacyReminder);
}

const INBOX_WAKE =
  /^\[(?:Bot Inbox\] External mentions,|Open Inbox\] \d+ items? you have seen|Bot Inbox harvest\] \d+ attention items are ready)/u;

export function inboxWakeBody(text: string): string | undefined {
  const lines = text.split(/\r?\n/u);
  let offset = afterHostPreamble(lines);
  const source = sourceLine(lines[offset] ?? '');
  if (source !== undefined) {
    offset += 1;
    if (source.speaker) offset = afterSpeakerPolicies(lines, offset);
  }
  return INBOX_WAKE.test(lines[offset] ?? '') ? lines.slice(offset).join('\n') : undefined;
}

export function inboundSessionTitle(text: string): string | undefined {
  if (inboxWakeBody(text) !== undefined) return undefined;
  const envelope = parseInboundEnvelope(text);
  return sessionTitleFromBody(envelope === undefined ? text : inboundEnvelopeBody(envelope));
}

export function sessionTitleFromBody(body: string): string | undefined {
  const line = body.split(/\r?\n/u).find((line) => line.trim());
  if (line === undefined) return undefined;
  const title = line.replace(/\s+/gu, ' ').trim();
  const characters = Array.from(title);
  if (characters.length <= 60) return title;
  const prefix = characters.slice(0, 59).join('');
  const boundary = characters[59] === ' ' ? prefix.length : prefix.lastIndexOf(' ');
  return `${(boundary > 0 ? prefix.slice(0, boundary) : prefix).trimEnd()}…`;
}
