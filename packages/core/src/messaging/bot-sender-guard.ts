import type { DatabaseSync } from 'node:sqlite';
import { MAX_BOT_HOPS } from '../channels/channel.js';
import type { MessagingInboundEvent } from './provider.js';

export const EXTERNAL_BOT_TURNS = MAX_BOT_HOPS / 2;
const EXTERNAL_BOT_WINDOW_MS = 60 * 60 * 1000;

export function externalBotTurnsExhausted(
  db: DatabaseSync,
  botSlug: string,
  event: Omit<MessagingInboundEvent, 'text'>,
): boolean {
  if (event.actor.kind !== 'bot') return false;
  const at = Date.parse(event.at);
  const rows = db
    .prepare(
      `SELECT json_extract(payload_json, '$.external.event.actor.kind') AS kind
      FROM source_events
      WHERE bot_slug = ? AND source_kind = 'bridge-message' AND created_at >= ? AND created_at <= ?
        AND json_extract(payload_json, '$.external.platform') = ?
        AND json_extract(payload_json, '$.external.event.conversation.id') = ?
        AND json_extract(payload_json, '$.external.event.messageId') <> ?
      ORDER BY created_at DESC, source_event_id DESC
      LIMIT ?`,
    )
    .all(
      botSlug,
      new Date(at - EXTERNAL_BOT_WINDOW_MS).toISOString(),
      event.at,
      event.channel,
      event.conversation.id,
      event.messageId,
      EXTERNAL_BOT_TURNS,
    ) as { kind: string | null }[];
  const turns = rows.findIndex((row) => row.kind !== 'bot');
  return (turns === -1 ? rows.length : turns) >= EXTERNAL_BOT_TURNS;
}
