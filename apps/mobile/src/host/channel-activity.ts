import type {
  BotCreateAction,
  BotDmAction,
  ChannelMemberDeparture,
  ChannelMemoryCommit,
  ChannelTurnStop,
} from '../../../../packages/core/src/channels/channel';
import type { ChannelWireMessage } from './wire';

export type ChannelActivity =
  | ({ kind: 'dm-action' } & BotDmAction)
  | { kind: 'channel-post'; channelId: string; messageId: string; preview: string | null }
  | { kind: 'memory'; commit: ChannelMemoryCommit; noticeOrigin?: { channelId: string } }
  | ({ kind: 'bot-create' } & BotCreateAction)
  | ({ kind: 'departure' } & ChannelMemberDeparture)
  | ({ kind: 'turn-stop' } & ChannelTurnStop);

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function count(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function memoryCommit(value: unknown): value is ChannelMemoryCommit {
  const commit = record(value);
  return (
    text(commit['botSlug']) &&
    typeof commit['sha'] === 'string' &&
    /^[0-9a-f]{40}$/u.test(commit['sha']) &&
    typeof commit['subject'] === 'string' &&
    typeof commit['authorName'] === 'string' &&
    typeof commit['authoredAt'] === 'string' &&
    count(commit['moreFiles']) &&
    Array.isArray(commit['files']) &&
    commit['files'].length <= 20 &&
    commit['files'].every((value: unknown) => {
      const file = record(value);
      return (
        typeof file['path'] === 'string' &&
        (file['added'] === null || count(file['added'])) &&
        (file['deleted'] === null || count(file['deleted']))
      );
    })
  );
}

export function activityOf(message: ChannelWireMessage): ChannelActivity | undefined {
  if (message.author.kind === 'bot') {
    const dm = record(message.botDmAction);
    if (text(dm['channelId']) && text(dm['messageId']) && text(dm['recipientBotSlug']))
      return {
        kind: 'dm-action',
        channelId: dm['channelId'],
        messageId: dm['messageId'],
        recipientBotSlug: dm['recipientBotSlug'],
      };
    const post = record(message.botChannelPost);
    if (text(post['channelId']) && text(post['messageId']))
      return {
        kind: 'channel-post',
        channelId: post['channelId'],
        messageId: post['messageId'],
        preview:
          typeof message.botChannelPostPreview === 'string' ? message.botChannelPostPreview : null,
      };
  }
  const created = record(message.botCreateAction);
  if (message.author.kind === 'bot' && text(created['botSlug']) && text(created['displayName']))
    return { kind: 'bot-create', botSlug: created['botSlug'], displayName: created['displayName'] };
  if (message.author.kind !== 'system') return undefined;
  if (memoryCommit(message.memoryCommit)) {
    const origin = record(message.noticeOrigin);
    if (message.noticeOrigin !== undefined && !text(origin['channelId'])) return undefined;
    return {
      kind: 'memory',
      commit: message.memoryCommit,
      ...(text(origin['channelId']) ? { noticeOrigin: { channelId: origin['channelId'] } } : {}),
    };
  }
  const departure = record(message.memberDeparture);
  if (
    (departure['memberKind'] === 'bot' || departure['memberKind'] === 'human') &&
    text(departure['memberId']) &&
    text(departure['displayName']) &&
    (departure['departureType'] === undefined ||
      departure['departureType'] === 'left' ||
      departure['departureType'] === 'removed')
  )
    return {
      kind: 'departure',
      memberKind: departure['memberKind'],
      memberId: departure['memberId'],
      displayName: departure['displayName'],
      ...(departure['departureType'] === undefined
        ? {}
        : { departureType: departure['departureType'] }),
    };
  const stop = record(message.turnStop);
  if (
    text(stop['botSlug']) &&
    text(stop['botName']) &&
    text(stop['humanName']) &&
    text(stop['sessionId'])
  )
    return {
      kind: 'turn-stop',
      botSlug: stop['botSlug'],
      botName: stop['botName'],
      humanName: stop['humanName'],
      sessionId: stop['sessionId'],
    };
  return undefined;
}
