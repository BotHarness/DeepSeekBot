import type { HumanAttentionPage, HumanAttentionQuery } from './human-attention.js';

type Cursor = {
  section: number;
  page?: string;
  before?: { createdAt: string; sourceEventId: string };
};

export function notificationAttentionPage(
  attention: Pick<HumanAttentionQuery, 'list' | 'dmReplies'>,
  input: { limit?: number; cursor?: string },
): HumanAttentionPage {
  const limit = input.limit ?? 100;
  let cursor: Cursor = { section: 0 };
  if (input.cursor !== undefined) {
    const value: unknown = JSON.parse(Buffer.from(input.cursor, 'base64url').toString());
    if (typeof value !== 'object' || value === null) throw new Error('invalid notification cursor');
    const parsed = value as Cursor & { version?: number };
    if (
      parsed.version !== 1 ||
      ![0, 1, 2].includes(parsed.section) ||
      (parsed.page !== undefined && typeof parsed.page !== 'string') ||
      (parsed.before !== undefined &&
        (typeof parsed.before?.createdAt !== 'string' ||
          typeof parsed.before?.sourceEventId !== 'string'))
    )
      throw new Error('invalid notification cursor');
    cursor = parsed;
  }
  const encode = (next: Cursor) =>
    Buffer.from(JSON.stringify({ version: 1, ...next })).toString('base64url');
  if (cursor.section < 2) {
    const page = attention.list({
      category: cursor.section === 0 ? 'action' : 'replies',
      sort: 'newest',
      unreadOnly: true,
      limit,
      ...(cursor.page === undefined ? {} : { cursor: cursor.page }),
    });
    return {
      notificationVersion: 1,
      items: page.items,
      nextCursor: encode(
        page.nextCursor
          ? { section: cursor.section, page: page.nextCursor }
          : { section: cursor.section + 1 },
      ),
    };
  }
  const rows = attention.dmReplies(limit + 1, cursor.before);
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    notificationVersion: 1,
    items,
    ...(rows.length > limit && last?.sourceEventId !== undefined
      ? {
          nextCursor: encode({
            section: 2,
            before: { createdAt: last.createdAt, sourceEventId: last.sourceEventId },
          }),
        }
      : {}),
  };
}
