import type { ConversationMessage } from '../../host/conversation';

const GROUP_MS = 5 * 60 * 1000;
const SEPARATOR_MS = 30 * 60 * 1000;

export type ChatRow =
  | { kind: 'separator'; key: string; at: string }
  | {
      kind: 'message';
      key: string;
      message: ConversationMessage;
      first: boolean;
      last: boolean;
      activityCount?: number;
    };

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
    const before = rows.at(-1);
    if (
      !standalone(message) &&
      previous !== undefined &&
      !standalone(previous) &&
      message.activity?.kind === 'channel-post' &&
      previous?.activity?.kind === 'channel-post' &&
      previous.bot === message.bot &&
      previous.activity.channelId === message.activity.channelId &&
      Number.isFinite(Date.parse(previous.at)) &&
      Number.isFinite(Date.parse(message.at)) &&
      new Date(previous.at).toDateString() === new Date(message.at).toDateString() &&
      before?.kind === 'message'
    ) {
      rows[rows.length - 1] = {
        ...before,
        key: message.id,
        message,
        activityCount: (before.activityCount ?? 1) + 1,
      };
      previous = message;
      continue;
    }
    const gap = previous === undefined ? Infinity : time(message.at) - time(previous.at);
    const separated = gap >= SEPARATOR_MS;
    if (separated) rows.push({ kind: 'separator', key: `at:${message.id}`, at: message.at });
    const joins =
      previous !== undefined &&
      !separated &&
      !standalone(previous) &&
      !standalone(message) &&
      previous.activity === undefined &&
      message.activity === undefined &&
      message.author !== 'system' &&
      previous.author === message.author &&
      previous.bot === message.bot &&
      gap < GROUP_MS;
    if (joins && before?.kind === 'message') before.last = false;
    rows.push({ kind: 'message', key: message.id, message, first: !joins, last: true });
    previous = message;
  }
  return rows;
}

export function messageGroups(rows: readonly ChatRow[]): Array<{ key: string; group: string }> {
  const groups: Array<{ key: string; group: string }> = [];
  let group = '';
  for (const row of rows) {
    if (row.kind !== 'message') continue;
    if (row.first) group = row.key;
    groups.push({ key: row.key, group });
  }
  return groups;
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
