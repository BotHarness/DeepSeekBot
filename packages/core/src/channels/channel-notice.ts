import type { ChannelMessage } from './channel.js';

export const CHANNEL_NOTICE_FIELDS = [
  'botDmAction',
  'botCreateAction',
  'botChannelPost',
  'memoryCommit',
  'toolAutoApproval',
  'toolAutoApprovalPause',
] as const;

type ChannelNoticeShape = Partial<
  Record<keyof Pick<ChannelMessage, (typeof CHANNEL_NOTICE_FIELDS)[number]>, unknown>
>;

export function isChannelNotice(message: ChannelNoticeShape): boolean {
  return CHANNEL_NOTICE_FIELDS.some((field) => message[field] !== undefined);
}

export function latestTurnMessageId(
  messages: readonly (ChannelNoticeShape & { id: string })[],
): string | undefined {
  return messages.findLast((message) => !isChannelNotice(message))?.id;
}

export function notChannelNoticeSql(payloadColumn: string): string {
  return CHANNEL_NOTICE_FIELDS.map(
    (field) => `json_type(${payloadColumn}, '$.${field}') IS NULL`,
  ).join(' AND ');
}

export function channelPreviewMessage<
  T extends { deliveries?: unknown; humanReceipts?: unknown; reactions?: unknown },
>(message: T): Omit<T, 'deliveries' | 'humanReceipts' | 'reactions'> {
  const {
    deliveries: _deliveries,
    humanReceipts: _receipts,
    reactions: _reactions,
    ...preview
  } = message;
  return preview;
}
