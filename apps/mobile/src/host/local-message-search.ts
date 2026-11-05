import type { LocalStore } from './local-store';
import type { JournalEntry } from './wire';

const SNIPPET_BEFORE = 24;
const SNIPPET_LENGTH = 120;

export type StoredMessageHit = { channelId: string; entry: JournalEntry; snippet: string };

export function searchSnippet(text: string, needle: string): string {
  const chars = Array.from(text.replace(/\s+/gu, ' ').trim());
  const lower = chars.map((char) => char.toLowerCase());
  const target = Array.from(needle).map((char) => char.toLowerCase());
  let match = 0;
  for (let index = 0; index + target.length <= lower.length; index += 1) {
    if (target.every((char, offset) => lower[index + offset] === char)) {
      match = index;
      break;
    }
  }
  const start = Math.max(0, Math.min(match - SNIPPET_BEFORE, chars.length - SNIPPET_LENGTH));
  const end = Math.min(chars.length, start + SNIPPET_LENGTH);
  return (
    (start > 0 ? '…' : '') + chars.slice(start, end).join('') + (end < chars.length ? '…' : '')
  );
}

export async function searchStoredMessages(
  db: LocalStore,
  text: string,
  limit: number,
): Promise<StoredMessageHit[]> {
  const needle = text.trim();
  if (needle === '') return [];
  const phrase = Array.from(needle).length >= 3;
  const rows = await db.all<{ channel_id: string; entry: string }>(
    `select messages.channel_id, messages.entry from message_text
       join search_rows on search_rows.n = message_text.rowid
       join messages on messages.channel_id = search_rows.channel_id
         and messages.id = search_rows.id
       where ${phrase ? 'message_text match ?' : "message_text.body like ? escape '\\'"}
       order by json_extract(messages.entry, '$.message.at') desc
       limit ?`,
    [
      phrase ? `"${needle.replaceAll('"', '""')}"` : `%${needle.replace(/[\\%_]/gu, '\\$&')}%`,
      limit,
    ],
  );
  return rows.map((row) => {
    const entry = JSON.parse(row.entry) as JournalEntry;
    return { channelId: row.channel_id, entry, snippet: searchSnippet(entry.message.body, needle) };
  });
}
