import type { DatabaseSync } from 'node:sqlite';
import {
  dmChannelId,
  isChannelRecord,
  type ChannelMessage,
  type ChannelRecord,
} from '../channels/channel.js';
import type { ExternalSource } from './inbound.js';
import { MessagingError, type MessagingAttachment } from './provider.js';

export function humanBridgeChannel(db: DatabaseSync, channelId: string): ChannelRecord {
  const row = db
    .prepare('SELECT record_json FROM channel_records WHERE channel_id = ?')
    .get(channelId) as { record_json: string } | undefined;
  const record: unknown = row && JSON.parse(row.record_json);
  if (
    !isChannelRecord(record, channelId) ||
    (record.type === 'dm' &&
      (!record.botSlug ||
        record.members.length !== 1 ||
        record.id !== dmChannelId(record.botSlug))) ||
    record.deletedAt ||
    (record.type !== 'dm' &&
      !db
        .prepare(
          'SELECT 1 FROM channel_human_members WHERE channel_id = ? AND human_id = ? AND left_at IS NULL',
        )
        .get(channelId, 'local-human'))
  )
    throw new MessagingError('channel-unavailable');
  return record;
}

export function bridgeChannel(
  db: DatabaseSync,
  channelId: string,
  botSlug: string,
  human = false,
): ChannelRecord {
  const row = db
    .prepare('SELECT record_json FROM channel_records WHERE channel_id = ?')
    .get(channelId) as { record_json: string } | undefined;
  const record: unknown = row && JSON.parse(row.record_json);
  if (
    !isChannelRecord(record, channelId) ||
    (record.type === 'dm' &&
      (!record.botSlug ||
        record.members.length !== 1 ||
        record.id !== dmChannelId(record.botSlug))) ||
    record.deletedAt ||
    !record.members.includes(botSlug) ||
    (human &&
      record.type !== 'dm' &&
      !db
        .prepare(
          'SELECT 1 FROM channel_human_members WHERE channel_id = ? AND human_id = ? AND left_at IS NULL',
        )
        .get(channelId, 'local-human'))
  )
    throw new MessagingError('channel-unavailable');
  return record;
}

export function bridgeAttachmentKind(
  source: ExternalSource,
  attachment: MessagingAttachment,
): 'image' | 'audio' | 'file' | undefined {
  if (attachment.mediaType?.startsWith('image/')) return 'image';
  if (source.platform === 'qq') {
    if (source.event.voice && attachment.mediaType === 'audio/unknown') return 'audio';
    if (attachment.mediaType === 'application/octet-stream') return 'file';
  }
  if (
    source.platform === 'feishu' &&
    attachment.mediaType === undefined &&
    source.event.reply.parentId === attachment.messageId
  )
    return 'file';
  return undefined;
}

export function projectBridgeMessage(source: ExternalSource, body: string): ChannelMessage {
  const senderName = source.event.actor.name?.trim() || undefined;
  const weixinDm = source.platform === 'weixin' && source.event.conversation.kind === 'dm';
  return {
    id: source.id,
    at: source.at,
    body:
      weixinDm && !body.trim()
        ? source.event.attachments?.map((item) => item.name).join('\n') || body
        : body,
    format: 'text',
    ...((source.platform === 'qq' && source.event.voice) ||
    source.event.attachments?.some((item) => bridgeAttachmentKind(source, item) !== undefined)
      ? {
          bridgeMedia: {
            items: (source.event.attachments ?? []).flatMap((item) => {
              const kind = bridgeAttachmentKind(source, item);
              return kind === undefined
                ? []
                : [
                    {
                      id: item.id,
                      kind,
                      name: item.name,
                      ...(item.sizeBytes === undefined ? {} : { sizeBytes: item.sizeBytes }),
                    },
                  ];
            }),
            ...(source.event.contentParts ? { parts: source.event.contentParts } : {}),
            ...(source.platform === 'qq' && source.event.voice
              ? {
                  voice: {
                    transcript: source.event.voice.transcript,
                    ...(source.event.voice.durationMs === undefined
                      ? {}
                      : { durationMs: source.event.voice.durationMs }),
                  },
                }
              : {}),
          },
        }
      : {}),
    author: {
      kind: 'bridged',
      source: senderName ?? (weixinDm ? 'WeChat' : source.event.actor.id),
    },
    bridgeOrigin: {
      sourceEventId: source.id,
      platform: source.platform,
      ...(source.platform === 'qq'
        ? { accountRef: source.event.botId, accountName: source.accountName }
        : {}),
      conversationId: source.event.conversation.id,
      conversationName: source.conversationName,
      messageId: source.event.messageId,
      senderId: source.event.actor.id,
      ...(senderName ? { senderName } : {}),
      ...(source.event.mentions.length
        ? { mentions: source.event.mentions.map((mention) => ({ ...mention })) }
        : {}),
      ...(source.event.reply.threadId ? { threadId: source.event.reply.threadId } : {}),
    },
  };
}

export function placeBridgeSource(
  db: DatabaseSync,
  source: ExternalSource,
  botSlug: string | undefined,
): { channelId: string; message: ChannelMessage; revision: number } | undefined {
  if (!source.localChannelId) return;
  if (botSlug === undefined) humanBridgeChannel(db, source.localChannelId);
  else bridgeChannel(db, source.localChannelId, botSlug);
  const prior = db
    .prepare(
      'SELECT channel_id FROM channel_placements WHERE source_event_id = ? AND channel_id = ?',
    )
    .get(source.id, source.localChannelId) as { channel_id: string } | undefined;
  if (prior) {
    if (prior.channel_id !== source.localChannelId) throw new MessagingError('source-conflict');
    return;
  }
  const next = db
    .prepare(
      'SELECT COALESCE(MAX(revision), 0) + 1 AS revision FROM channel_placements WHERE channel_id = ?',
    )
    .get(source.localChannelId) as { revision: number };
  db.prepare(
    'INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id) VALUES (?, ?, ?, ?)',
  ).run(source.localChannelId, next.revision, source.id, source.id);
  db.prepare(
    'UPDATE source_events SET channel_id = ?, message_id = ? WHERE source_event_id = ? AND channel_id IS NULL',
  ).run(source.localChannelId, source.id, source.id);
  return {
    channelId: source.localChannelId,
    message: { ...projectBridgeMessage(source, source.body), channelRevision: next.revision },
    revision: next.revision,
  };
}
