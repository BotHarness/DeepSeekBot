import type { HumanContext } from '../humans/context.js';
import { channelCallPictureRange, type ChannelCallWindowFilter } from './call-window.js';
import { createHash } from 'node:crypto';
import type { ChannelMessage } from './channel.js';
import { DEFAULT_MESSAGE_PAGE, MAX_MESSAGE_PAGE } from './timeline.js';

export interface ChannelMessageQueryOptions {
  searchHuman?: HumanContext;
  text?: string;
  authorBotId?: string;
  authorKind?: 'human' | 'bot' | 'bridged' | 'system';
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
  visibleFrom?: number;

  orderBy?: 'time';
  ascending?: boolean;
  callWindow?: ChannelCallWindowFilter;
}

export interface ChannelMessageQueryPage {
  messages: ChannelMessage[];
  nextCursor?: string;
}

export function encodeChannelMessageCursor(filter: string, beforeId: string): string {
  return Buffer.from(JSON.stringify({ beforeId, filter })).toString('base64url');
}

export interface PreparedChannelMessageQuery {
  text?: string;
  authorBotId?: string;
  authorKind?: 'human' | 'bot' | 'bridged' | 'system';
  from?: number;
  to?: number;
  beforeId?: string;
  visibleFrom?: number;
  orderBy?: 'time';
  ascending?: true;
  callWindow?: PreparedChannelCallWindow;
  filter: string;
  limit: number;
}

export interface PreparedChannelCallWindow {
  callId: string;
  fromMs: number;
  toMs?: number;
  from: number;
  to?: number;
}

function prepareCallWindow(
  window: ChannelCallWindowFilter | undefined,
): PreparedChannelCallWindow | undefined {
  if (window === undefined) return undefined;
  const from = Date.parse(window.from);
  const to = window.to === undefined ? undefined : Date.parse(window.to);
  const offset = (value: number | undefined) =>
    value === undefined || (Number.isSafeInteger(value) && value >= 0);
  if (
    !Number.isFinite(from) ||
    (to !== undefined && (!Number.isFinite(to) || from > to)) ||
    !offset(window.fromMs) ||
    !offset(window.toMs) ||
    (window.toMs !== undefined && window.fromMs > window.toMs)
  )
    throw new Error('channel_read: invalid call window');
  return {
    callId: window.callId,
    fromMs: window.fromMs,
    ...(window.toMs === undefined ? {} : { toMs: window.toMs }),
    from,
    ...(to === undefined ? {} : { to }),
  };
}

export function inChannelCallWindow(
  message: ChannelMessage,
  window: PreparedChannelCallWindow,
): boolean {
  const picture = channelCallPictureRange(message, window.callId);
  if (picture !== undefined)
    return (
      picture.toMs >= window.fromMs && (window.toMs === undefined || picture.fromMs <= window.toMs)
    );
  const at = Date.parse(message.at);
  return Number.isFinite(at) && at >= window.from && (window.to === undefined || at <= window.to);
}

export function prepareChannelMessageQuery(
  channelId: string,
  options: ChannelMessageQueryOptions = {},
): PreparedChannelMessageQuery {
  if (
    options.authorBotId !== undefined &&
    options.authorKind !== undefined &&
    options.authorKind !== 'bot'
  ) {
    throw new Error('channel_read: author_bot_id requires author_kind bot');
  }
  if (
    options.authorKind !== undefined &&
    !['human', 'bot', 'bridged', 'system'].includes(options.authorKind)
  ) {
    throw new Error('channel_read: invalid author_kind');
  }
  const from = options.from === undefined ? undefined : Date.parse(options.from);
  const to =
    options.to === undefined
      ? undefined
      : Date.parse(options.to) + (/^\d{4}-\d{2}-\d{2}$/u.test(options.to) ? 86_400_000 - 1 : 0);
  if (
    (from !== undefined && !Number.isFinite(from)) ||
    (to !== undefined && !Number.isFinite(to)) ||
    (from !== undefined && to !== undefined && from > to)
  )
    throw new Error('channel_read: invalid date range');
  if (
    options.visibleFrom !== undefined &&
    (!Number.isSafeInteger(options.visibleFrom) || options.visibleFrom < 0)
  )
    throw new Error('channel_read: invalid visible revision');
  if (options.ascending === true && options.orderBy !== 'time')
    throw new Error('channel_read: ascending order needs time order');
  const ascending = options.ascending === true ? true : undefined;
  const callWindow = prepareCallWindow(options.callWindow);
  const text = options.text?.trim().toLowerCase();
  const filter = createHash('sha256')
    .update(
      JSON.stringify({
        channelId,
        text,
        authorBotId: options.authorBotId,
        authorKind: options.authorKind,
        from,
        to,
        orderBy: options.orderBy,
        ascending,
        visibleFrom: options.visibleFrom,
        callWindow,
      }),
    )
    .digest('hex')
    .slice(0, 16);
  let beforeId: string | undefined;
  if (options.cursor !== undefined) {
    try {
      const decoded: unknown = JSON.parse(
        Buffer.from(options.cursor, 'base64url').toString('utf8'),
      );
      if (
        typeof decoded !== 'object' ||
        decoded === null ||
        !('beforeId' in decoded) ||
        typeof decoded.beforeId !== 'string' ||
        !('filter' in decoded) ||
        decoded.filter !== filter
      )
        throw new Error('invalid');
      beforeId = decoded.beforeId;
    } catch {
      throw new Error('channel_read: invalid cursor');
    }
  }
  return {
    ...(text === undefined ? {} : { text }),
    ...(options.authorBotId === undefined ? {} : { authorBotId: options.authorBotId }),
    ...(options.authorKind === undefined ? {} : { authorKind: options.authorKind }),
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
    ...(beforeId === undefined ? {} : { beforeId }),
    ...(options.visibleFrom === undefined ? {} : { visibleFrom: options.visibleFrom }),
    ...(options.orderBy === undefined ? {} : { orderBy: options.orderBy }),
    ...(ascending === undefined ? {} : { ascending }),
    ...(callWindow === undefined ? {} : { callWindow }),
    filter,
    limit: Math.max(
      1,
      Math.min(Math.floor(options.limit ?? DEFAULT_MESSAGE_PAGE), MAX_MESSAGE_PAGE),
    ),
  };
}

export function queryChannelMessages(
  channelId: string,
  messages: readonly ChannelMessage[],
  options: ChannelMessageQueryOptions = {},
): ChannelMessageQueryPage {
  const query = prepareChannelMessageQuery(channelId, options);
  const ordered =
    query.orderBy === 'time'
      ? messages
          .filter((message) => Number.isFinite(Date.parse(message.at)))
          .sort(
            (left, right) =>
              (Date.parse(right.at) - Date.parse(left.at) ||
                (right.id < left.id ? -1 : right.id > left.id ? 1 : 0)) *
              (query.ascending === true ? -1 : 1),
          )
      : [...messages].reverse();
  const beforeIndex =
    query.beforeId === undefined
      ? -1
      : ordered.findIndex((message) => message.id === query.beforeId);
  if (query.beforeId !== undefined && beforeIndex < 0)
    throw new Error('channel_read: invalid cursor');
  const matching = ordered.slice(beforeIndex + 1).filter((message) => {
    if (query.text !== undefined && !message.body.toLowerCase().includes(query.text)) return false;
    if (
      query.authorBotId !== undefined &&
      (message.author.kind !== 'bot' || message.author.slug !== query.authorBotId)
    )
      return false;
    if (query.authorKind !== undefined && message.author.kind !== query.authorKind) return false;
    if (query.visibleFrom !== undefined && (message.channelRevision ?? 0) < query.visibleFrom)
      return false;
    const at = Date.parse(message.at);
    if ((query.from !== undefined || query.to !== undefined) && !Number.isFinite(at)) return false;
    if (query.from !== undefined && at < query.from) return false;
    if (query.to !== undefined && at > query.to) return false;
    if (query.callWindow !== undefined && !inChannelCallWindow(message, query.callWindow))
      return false;
    return true;
  });
  const page = matching.slice(0, query.limit + 1);
  const selected = page.slice(0, query.limit);
  const last = selected.at(-1);
  return {
    messages: selected,
    ...(page.length <= query.limit || last === undefined
      ? {}
      : { nextCursor: encodeChannelMessageCursor(query.filter, last.id) }),
  };
}
