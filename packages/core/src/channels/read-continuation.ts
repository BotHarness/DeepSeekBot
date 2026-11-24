import type { ChannelMessage, ChannelRecord } from './channel.js';
import type { ChannelStore } from './store-types.js';
import {
  boundedByBytes,
  pageItemBudget,
  decodeReadCursor,
  encodeReadCursor,
  ReadContinuationError,
} from './read-cursor.js';

export interface ChannelReadProvenance {
  source: 'channel';
  channelId: string;
  type: ChannelRecord['type'];
  incarnation: string;
  members: string[];
  revision: number;
  contentIsData: true;
}

export interface ChannelMessagePage {
  messages: ChannelMessage[];
  revision: number;
  provenance: ChannelReadProvenance;
  complete: boolean;
  nextCursor?: string;
}

export interface ChannelMessagePageRequest {
  before?: string;
  limit?: number;
  cursor?: unknown;
  maxBytes?: number;
}

export type ChannelPageReader = Pick<
  ChannelStore,
  'get' | 'readMessages' | 'revision' | 'messagePosition' | 'historyEpoch'
>;

const CURSOR_KIND = 'channel-messages';

function continuation(
  channels: ChannelPageReader,
  channel: ChannelRecord,
  cursor: unknown,
  revision: number,
  epoch: number,
): { before: string; boundRevision: number } {
  const fields = decodeReadCursor(CURSOR_KIND, cursor);
  const { c, i, r, p, m, e } = fields;
  if (
    typeof c !== 'string' ||
    typeof i !== 'string' ||
    typeof m !== 'string' ||
    typeof r !== 'number' ||
    typeof p !== 'number' ||
    typeof e !== 'number' ||
    p < 1 ||
    p > r
  )
    throw new ReadContinuationError('invalid-read-cursor', 'The read cursor is malformed.');
  if (c !== channel.id)
    throw new ReadContinuationError(
      'changed-read-target',
      'The read cursor belongs to a different Channel.',
    );
  if (i !== channel.createdAt)
    throw new ReadContinuationError(
      'changed-read-target',
      'The Channel was deleted and recreated since the first page.',
    );
  if (revision < r || epoch !== e || channels.messagePosition(channel.id, m) !== p)
    throw new ReadContinuationError(
      'stale-read-revision',
      'The Channel history was rewritten since the first page; read the first page again.',
    );
  return { before: m, boundRevision: r };
}

export function readChannelMessagePage(
  channels: ChannelPageReader,
  channelId: string,
  request: ChannelMessagePageRequest = {},
): ChannelMessagePage | undefined {
  const channel = channels.get(channelId);
  if (channel === undefined) return undefined;
  const revision = channels.revision(channelId);
  const epoch = channels.historyEpoch(channelId);
  const bound =
    request.cursor === undefined
      ? { before: request.before, boundRevision: revision }
      : continuation(channels, channel, request.cursor, revision, epoch);
  const raw = channels.readMessages(channelId, {
    ...(bound.before === undefined ? {} : { before: bound.before }),
    ...(request.limit === undefined ? {} : { limit: request.limit }),
  });
  const provenance = {
    source: 'channel' as const,
    channelId,
    type: channel.type,
    incarnation: channel.createdAt,
    members: [...channel.members],
    revision: bound.boundRevision,
    contentIsData: true as const,
  };
  const messages = boundedByBytes(
    raw,
    pageItemBudget({ messages: [], revision, provenance, complete: false }, request.maxBytes),
  );
  const oldest = messages.at(-1);
  const complete =
    oldest === undefined ||
    (messages.length === raw.length &&
      channels.readMessages(channelId, { before: oldest.id, limit: 1 }).length === 0);
  const position = complete ? undefined : channels.messagePosition(channelId, oldest!.id);
  if (!complete && (position === undefined || position > bound.boundRevision))
    throw new ReadContinuationError(
      'stale-read-revision',
      'The Channel history changed while the page was read; read the first page again.',
    );
  return {
    messages,
    revision,
    provenance,
    complete,
    ...(position === undefined
      ? {}
      : {
          nextCursor: encodeReadCursor(CURSOR_KIND, {
            c: channelId,
            i: channel.createdAt,
            r: bound.boundRevision,
            p: position,
            m: oldest!.id,
            e: epoch,
          }),
        }),
  };
}
