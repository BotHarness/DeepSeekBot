import type { ChannelMessage } from './channel.js';

const CHANNEL_NOTICE_FIELDS = [
  'botDmAction',
  'botChannelPost',
  'memoryCommit',
  'toolAutoApproval',
  'toolAutoApprovalPause',
] as const;

export function isChannelNotice(
  message: Pick<ChannelMessage, (typeof CHANNEL_NOTICE_FIELDS)[number]>,
): boolean {
  return CHANNEL_NOTICE_FIELDS.some((field) => message[field] !== undefined);
}

export function notChannelNoticeSql(payloadColumn: string): string {
  return CHANNEL_NOTICE_FIELDS.map(
    (field) => `json_type(${payloadColumn}, '$.${field}') IS NULL`,
  ).join(' AND ');
}
