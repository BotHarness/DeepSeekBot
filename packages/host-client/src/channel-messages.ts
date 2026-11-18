import type { PrivateInputStatus } from '../../core/src/credentials/contracts';
import type {
  ChannelWireMessage,
  TimelineMessage,
  WireReaction,
} from '@botharness/host-protocol/wire';
import { HostAnswerInvalid } from './bot-settings';

export interface ChannelHost {
  call(method: string, args: Record<string, unknown>): Promise<unknown>;
}

export type MessageParser<M> = (value: unknown) => M | undefined;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

const nullableCursor = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

const revisionOf = (value: unknown, least: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= least;

export function wireMessage(value: unknown): ChannelWireMessage | undefined {
  const message = record(value);
  return typeof message?.['id'] === 'string' && message['id'].length > 0
    ? (message as unknown as ChannelWireMessage)
    : undefined;
}

export function wireTimelineMessage(value: unknown): TimelineMessage | undefined {
  return wireMessage(value) as TimelineMessage | undefined;
}

function messages<M>(value: unknown, parse: MessageParser<M>, what: string): M[] {
  if (!Array.isArray(value)) throw new HostAnswerInvalid(`${what} returned no entries.`);
  return value.map((entry: unknown) => {
    const message = parse(entry);
    if (message === undefined)
      throw new HostAnswerInvalid(`${what} returned an unreadable message.`);
    return message;
  });
}

export interface TimelineRequest {
  direction?: 'older' | 'newer' | 'around';
  cursor?: string;
  around?: string;
  limit?: number;
  olderLimit?: number;
  newerLimit?: number;
}

export interface ChannelTimeline<M> {
  revision: number;
  page: {
    entries: M[];
    olderCursor: string | null;
    newerCursor: string | null;
    hasOlder: boolean;
    hasNewer: boolean;
  };
}

export async function readChannelTimeline<M>(
  host: ChannelHost,
  channelId: string,
  request: TimelineRequest,
  parse: MessageParser<M>,
): Promise<ChannelTimeline<M>> {
  const answer = record(await host.call('channelTimeline', { channelId, ...request }));
  const page = record(answer?.['page']);
  const revision = answer?.['revision'];
  if (
    !revisionOf(revision, 0) ||
    page === undefined ||
    !nullableCursor(page['olderCursor']) ||
    !nullableCursor(page['newerCursor']) ||
    typeof page['hasOlder'] !== 'boolean' ||
    typeof page['hasNewer'] !== 'boolean'
  )
    throw new HostAnswerInvalid('channelTimeline returned no revision or cursors.');
  return {
    revision,
    page: {
      entries: messages(page['entries'], parse, 'channelTimeline'),
      olderCursor: page['olderCursor'],
      newerCursor: page['newerCursor'],
      hasOlder: page['hasOlder'],
      hasNewer: page['hasNewer'],
    },
  };
}

export interface ChannelJournalEntry<M> {
  channelId: string;
  message: M;
  revision: number;
}

export interface ChannelJournalPage<M> {
  entries: ChannelJournalEntry<M>[];
  olderCursor: string | null;
  hasOlder: boolean;
}

export function parseJournalEntry<M>(
  value: unknown,
  parse: MessageParser<M>,
): ChannelJournalEntry<M> | undefined {
  const entry = record(value);
  const revision = entry?.['revision'];
  const message = parse(entry?.['message']);
  if (typeof entry?.['channelId'] !== 'string' || !revisionOf(revision, 1) || message === undefined)
    return undefined;
  return { channelId: entry['channelId'], message, revision };
}

export function parseJournalPage<M>(
  value: unknown,
  parse: MessageParser<M>,
): ChannelJournalPage<M> {
  const page = record(value);
  const entries = page?.['entries'];
  if (
    !Array.isArray(entries) ||
    !nullableCursor(page?.['olderCursor']) ||
    typeof page?.['hasOlder'] !== 'boolean'
  )
    throw new HostAnswerInvalid('channelJournalPage returned no entries or cursor.');
  return {
    entries: entries.map((value: unknown) => {
      const entry = parseJournalEntry(value, parse);
      if (entry === undefined)
        throw new HostAnswerInvalid('channelJournalPage returned an unreadable entry.');
      return entry;
    }),
    olderCursor: page['olderCursor'],
    hasOlder: page['hasOlder'],
  };
}

export async function readChannelJournal<M>(
  host: ChannelHost,
  channelId: string,
  request: { through: number; before?: number; limit?: number },
  parse: MessageParser<M>,
): Promise<ChannelJournalPage<M>> {
  return parseJournalPage(
    await host.call('channelJournalPage', {
      channelId,
      through: request.through,
      ...(request.before === undefined ? {} : { before: request.before }),
      ...(request.limit === undefined ? {} : { limit: request.limit }),
    }),
    parse,
  );
}

export async function sendToChannel<M>(
  host: ChannelHost,
  send: { channelId: string; body: string } & Record<string, unknown>,
  parse: MessageParser<M>,
): Promise<M> {
  const message = parse(record(await host.call('channelSend', send))?.['message']);
  if (message === undefined) throw new HostAnswerInvalid('channelSend returned no message.');
  return message;
}

export function parseReactions(value: unknown): WireReaction[] | undefined {
  if (!Array.isArray(value) || value.length > 200) return undefined;
  const reactions: WireReaction[] = [];
  for (const entry of value) {
    const item = record(entry);
    const emoji = item?.['emoji'];
    const actors = item?.['actors'];
    if (typeof emoji !== 'string' || emoji.length === 0 || emoji.length > 16) return undefined;
    if (!Array.isArray(actors) || actors.length === 0) return undefined;
    const parsed: WireReaction['actors'] = [];
    for (const actor of actors) {
      const row = record(actor);
      const kind = row?.['kind'];
      const id = row?.['id'];
      if ((kind !== 'human' && kind !== 'bot') || typeof id !== 'string' || id.length === 0)
        return undefined;
      parsed.push({ kind, id });
    }
    reactions.push({ emoji, actors: parsed });
  }
  return reactions;
}

export async function reactToMessage(
  host: ChannelHost,
  target: { channelId: string; messageId: string; emoji: string; active: boolean },
): Promise<WireReaction[]> {
  const reactions = parseReactions(
    record(await host.call('channelReact', { ...target }))?.['reactions'],
  );
  if (reactions === undefined) throw new HostAnswerInvalid('channelReact returned no reactions.');
  return reactions;
}

export async function retryChannelMessage(
  host: ChannelHost,
  target: {
    channelId: string;
    messageId: string;
    recovery?: { action: string; failureMessageId: string } | undefined;
  },
): Promise<void> {
  await host.call('channelRetry', {
    channelId: target.channelId,
    messageId: target.messageId,
    ...(target.recovery === undefined
      ? {}
      : { recovery: target.recovery.action, failureMessageId: target.recovery.failureMessageId }),
  });
}

export async function markChannelRead(
  host: ChannelHost,
  channelId: string,
  messageId: string,
): Promise<void> {
  await host.call('channelMarkRead', { channelId, messageId });
}

export async function markAllChannelsRead(
  host: ChannelHost,
  scope: { channelId?: string | undefined; botSlug?: string | undefined } = {},
): Promise<{ channels: number }> {
  const channels = record(
    await host.call('channelMarkAllRead', {
      ...(scope.channelId === undefined ? {} : { channelId: scope.channelId }),
      ...(scope.botSlug === undefined ? {} : { botSlug: scope.botSlug }),
    }),
  )?.['channels'];
  if (!revisionOf(channels, 0))
    throw new HostAnswerInvalid('channelMarkAllRead returned no channel count.');
  return { channels };
}

export interface ChannelUnread {
  channelId: string;
  unreadCount: number;
}

export async function loadUnreadCounts(host: ChannelHost): Promise<ChannelUnread[]> {
  const channels = record(await host.call('channelUnreadCounts', {}))?.['channels'];
  if (!Array.isArray(channels))
    throw new HostAnswerInvalid('channelUnreadCounts returned no list.');
  return channels.map((entry: unknown) => {
    const row = record(entry);
    const channelId = row?.['channelId'];
    const unreadCount = row?.['unreadCount'];
    if (typeof channelId !== 'string' || channelId.length === 0 || !revisionOf(unreadCount, 0))
      throw new HostAnswerInvalid('channelUnreadCounts returned an unreadable count.');
    return { channelId, unreadCount };
  });
}

export interface ChannelChangeCursor {
  epoch: string;
  seq: number;
}

export async function loadChannelChangeCursor(host: ChannelHost): Promise<ChannelChangeCursor> {
  const cursor = changeCursor(await host.call('channelChangeCursor', {}));
  if (cursor === undefined) throw new HostAnswerInvalid('channelChangeCursor returned no cursor.');
  return cursor;
}

export interface MessageSearchResult<M> {
  hits: { channelId: string; message: M; snippet: string }[];
  nextCursor?: string;
}

export async function searchMessages<M>(
  host: ChannelHost,
  query: { text: string; limit: number; cursor?: string | undefined },
  parse: MessageParser<M>,
): Promise<MessageSearchResult<M>> {
  const answer = record(
    await host.call('messageSearch', {
      text: query.text,
      limit: query.limit,
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    }),
  );
  const hits = answer?.['hits'];
  const nextCursor = answer?.['nextCursor'];
  if (!Array.isArray(hits) || (nextCursor !== undefined && typeof nextCursor !== 'string'))
    throw new HostAnswerInvalid('messageSearch returned no hits.');
  return {
    hits: hits.flatMap((entry: unknown) => {
      const hit = record(entry);
      const message = parse(hit?.['message']);
      const channelId = hit?.['channelId'];
      const snippet = hit?.['snippet'];
      return message === undefined || typeof channelId !== 'string' || typeof snippet !== 'string'
        ? []
        : [{ channelId, message, snippet }];
    }),
    ...(nextCursor === undefined ? {} : { nextCursor }),
  };
}

const PRIVATE_INPUT_STATUSES: readonly PrivateInputStatus[] = [
  'pending',
  'configured',
  'cancelled',
  'expired',
];

export async function loadPrivateInputStatus(
  host: ChannelHost,
  channelId: string,
  messageId: string,
): Promise<PrivateInputStatus> {
  const status = record(await host.call('privateInputStatus', { channelId, messageId }))?.[
    'status'
  ];
  if (!(PRIVATE_INPUT_STATUSES as readonly unknown[]).includes(status))
    throw new HostAnswerInvalid('Private input status is invalid');
  return status as PrivateInputStatus;
}

export interface PrivateView<S> {
  version: number;
  state: S;
}

function privateView<S>(value: unknown, parseState: (state: unknown) => S): PrivateView<S> {
  const view = record(value);
  const version = view?.['version'];
  if (!revisionOf(version, 0)) throw new HostAnswerInvalid('Invalid private view');
  return { version, state: parseState(view?.['state']) };
}

export async function loadPrivateView<S>(
  host: ChannelHost,
  channelId: string,
  messageId: string,
  parseState: (state: unknown) => S,
): Promise<PrivateView<S>> {
  return privateView(await host.call('channelGenuiView', { channelId, messageId }), parseState);
}

export async function savePrivateView<S>(
  host: ChannelHost,
  save: {
    channelId: string;
    messageId: string;
    snapshotId: string;
    expectedVersion: number;
    state: S;
  },
  parseState: (state: unknown) => S,
): Promise<PrivateView<S>> {
  return privateView(
    await host.call('channelGenuiViewSave', { ...save, state: parseState(save.state) }),
    parseState,
  );
}

export type ChannelChanges<M> =
  | { reset: true; cursor: ChannelChangeCursor }
  | {
      reset?: never;
      upserts: ChannelJournalEntry<M>[];
      tombstones: string[];
      removed: string[];
      cursor: ChannelChangeCursor;
      hasMore: boolean;
    };

const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

function changeCursor(value: unknown): ChannelChangeCursor | undefined {
  const cursor = record(value);
  const epoch = cursor?.['epoch'];
  const seq = cursor?.['seq'];
  return typeof epoch === 'string' && revisionOf(seq, 0) ? { epoch, seq } : undefined;
}

export async function readChannelChanges<M>(
  host: ChannelHost,
  channelId: string,
  since: ChannelChangeCursor,
  parse: MessageParser<M>,
): Promise<ChannelChanges<M>> {
  const answer = record(
    await host.call('channelChanges', { channelId, sinceSeq: since.seq, epoch: since.epoch }),
  );
  const cursor = changeCursor(answer?.['cursor']);
  if (answer === undefined || cursor === undefined)
    throw new HostAnswerInvalid('channelChanges returned no cursor.');
  if (answer['reset'] === true) return { reset: true, cursor };
  const upserts = answer['upserts'];
  if (
    !Array.isArray(upserts) ||
    !strings(answer['tombstones']) ||
    !strings(answer['removed']) ||
    typeof answer['hasMore'] !== 'boolean'
  )
    throw new HostAnswerInvalid('channelChanges returned an unreadable page.');
  return {
    upserts: upserts.map((value: unknown) => {
      const entry = parseJournalEntry(value, parse);
      if (entry === undefined)
        throw new HostAnswerInvalid('channelChanges returned an unreadable entry.');
      return entry;
    }),
    tombstones: answer['tombstones'],
    removed: answer['removed'],
    cursor,
    hasMore: answer['hasMore'],
  };
}
