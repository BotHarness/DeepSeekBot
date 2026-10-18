import { createHash } from 'node:crypto';

import { withMentionNames } from '../messaging/mention-text.js';
import type { ChannelMessageView } from './bot-runtime.js';

export const CHANNEL_READ_OUTPUT_LIMIT = 12_000;

export function projectModelMessage(view: ChannelMessageView) {
  const {
    channelRevision: _revision,
    deliveries: _deliveries,
    humanReceipts: _receipts,
    ...message
  } = view.message;
  return {
    channelId: view.channelId,
    channelName: view.channelName,
    ...(view.actorNames === undefined ? {} : { actorNames: view.actorNames }),
    message:
      message.bridgeOrigin?.mentions === undefined
        ? message
        : { ...message, body: withMentionNames(message.body, message.bridgeOrigin.mentions) },
  };
}

export function boundModelPage(
  page: { messages: ChannelMessageView[]; nextCursor?: string },
  cursorAfter: (count: number) => string | undefined,
  reserve: (included: ChannelMessageView[]) => number = () => 0,
): { output: string; included: ChannelMessageView[] } {
  const projected = page.messages.map(projectModelMessage);
  for (let count = projected.length; count >= 0; count -= 1) {
    const first = page.messages[count];
    const truncated = count < projected.length;
    const nextCursor = truncated ? cursorAfter(Math.max(count, 1)) : page.nextCursor;
    const output = JSON.stringify({
      outputLimit: CHANNEL_READ_OUTPUT_LIMIT,
      messages: projected.slice(0, count),
      ...(nextCursor === undefined ? {} : { nextCursor }),
      ...(first === undefined
        ? {}
        : {
            omitted: {
              count: projected.length - count,
              reason: 'output-budget',
              readContent: { channel_id: first.channelId, message_id: first.message.id },
              continuation:
                count === 0
                  ? 'Read this oversized message by message_id and follow contentCursor, then use nextCursor for older results.'
                  : 'Use nextCursor with unchanged filters; omitted messages remain pending.',
            },
          }),
    });
    if (output.length + reserve(page.messages.slice(0, count)) <= CHANNEL_READ_OUTPUT_LIMIT)
      return { output, included: page.messages.slice(0, count) };
  }
  throw new Error('channel_read: continuation metadata exceeds output budget');
}

export function readModelContent(
  view: ChannelMessageView,
  cursor?: string,
  reserve = 0,
): { output: string; hash: string; start: number; end: number; total: number } {
  const content = JSON.stringify(projectModelMessage(view));
  const hash = createHash('sha256').update(content).digest('hex');
  let start = 0;
  if (cursor !== undefined) {
    try {
      const decoded: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (
        typeof decoded !== 'object' ||
        decoded === null ||
        !('hash' in decoded) ||
        decoded.hash !== hash ||
        !('offset' in decoded) ||
        typeof decoded.offset !== 'number' ||
        !Number.isSafeInteger(decoded.offset) ||
        decoded.offset < 0 ||
        decoded.offset >= content.length
      )
        throw new Error('invalid');
      start = decoded.offset;
    } catch {
      throw new Error('channel_read: invalid content_cursor');
    }
  }
  const frame = (end: number) =>
    JSON.stringify({
      outputLimit: CHANNEL_READ_OUTPUT_LIMIT,
      channelId: view.channelId,
      messageId: view.message.id,
      encoding: 'json-fragment',
      offset: start,
      totalCharacters: content.length,
      content: content.slice(start, end),
      ...(end === content.length
        ? {}
        : {
            contentCursor: Buffer.from(JSON.stringify({ hash, offset: end })).toString('base64url'),
          }),
      complete: end === content.length,
      consumption: 'Only the complete ordered content read in this turn joins its consumption set.',
    });
  if (frame(content.length).length + reserve <= CHANNEL_READ_OUTPUT_LIMIT)
    return {
      output: frame(content.length),
      hash,
      start,
      end: content.length,
      total: content.length,
    };
  let low = start + 1;
  let high = content.length;
  let end = start;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (frame(middle).length + reserve <= CHANNEL_READ_OUTPUT_LIMIT) {
      end = middle;
      low = middle + 1;
    } else high = middle - 1;
  }
  if (end === start) throw new Error('channel_read: content metadata exceeds output budget');
  if (end < content.length && /[\uD800-\uDBFF]/u.test(content[end - 1]!)) end -= 1;
  if (end === start) throw new Error('channel_read: content cannot advance within output budget');
  return { output: frame(end), hash, start, end, total: content.length };
}
