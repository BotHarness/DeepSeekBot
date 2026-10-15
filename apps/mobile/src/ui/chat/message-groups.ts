import type { ConversationMessage } from '../../host/conversation';

const GROUP_MS = 5 * 60 * 1000;
const SEPARATOR_MS = 30 * 60 * 1000;

export type ChatRow =
  | { kind: 'separator'; key: string; at: string }
  | { kind: 'message'; key: string; message: ConversationMessage; first: boolean; last: boolean };

function time(iso: string): number {
  const value = Date.parse(iso);
  return Number.isNaN(value) ? 0 : value;
}

export function chatRows(
  messages: readonly ConversationMessage[],
  standalone: (message: ConversationMessage) => boolean = () => false,
): ChatRow[] {
  const rows: ChatRow[] = [];
  let previous: ConversationMessage | undefined;
  for (const message of messages) {
    const gap = previous === undefined ? Infinity : time(message.at) - time(previous.at);
    const separated = gap >= SEPARATOR_MS;
    if (separated) rows.push({ kind: 'separator', key: `at:${message.id}`, at: message.at });
    const joins =
      previous !== undefined &&
      !separated &&
      !standalone(previous) &&
      !standalone(message) &&
      message.author !== 'system' &&
      previous.author === message.author &&
      previous.bot === message.bot &&
      gap < GROUP_MS;
    const before = rows.at(-1);
    if (joins && before?.kind === 'message') before.last = false;
    rows.push({ kind: 'message', key: message.id, message, first: !joins, last: true });
    previous = message;
  }
  return rows;
}

export function separatorLabel(iso: string, now: Date, yesterday: string, locale?: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const clock = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(at);
  if (at.toDateString() === now.toDateString()) return clock;
  const before = new Date(now);
  before.setDate(now.getDate() - 1);
  const day =
    at.toDateString() === before.toDateString()
      ? undefined
      : new Intl.DateTimeFormat(locale, {
          month: 'short',
          day: 'numeric',
          ...(at.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
        }).format(at);
  return `${day ?? yesterday} ${clock}`;
}
