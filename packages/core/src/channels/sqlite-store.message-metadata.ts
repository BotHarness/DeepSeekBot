import { attachmentIdentity, type ChannelAttachmentRef } from '../attachments/ref.js';
import { isChannelMessageVoice, type ChannelMessage, type ChannelSessionLink } from './channel.js';
import type { ChannelStore } from './store.js';
import type { PlacementRow } from './sqlite-store.placements.js';
import { parseMessage } from './sqlite-store.message-payload.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { SqliteChannelStoreOptions } from './sqlite-store.types.js';

export function createChannelMessageMetadata({
  assertAttachmentRefs,
  database,
  options,
  sql,
}: {
  assertAttachmentRefs: ChannelStore['assertAttachmentRefs'];
  database: OperationalDatabaseModulePort;
  options: SqliteChannelStoreOptions;
  sql: {
    updateVoicePayload: string;
    updateSessionLinksPayload: string;
  };
}) {
  return {
    setMessageVoice(channelId, messageId, voice, attachment) {
      if (!isChannelMessageVoice(voice)) throw new Error('Invalid voice state');
      if (attachment !== undefined) assertAttachmentRefs([attachment]);
      const changed = database.transaction(
        (db) => {
          const row = db
            .prepare(`
            SELECT e.source_event_id, e.payload_json, e.body FROM channel_placements p
            JOIN source_events e ON e.source_event_id = p.source_event_id
            WHERE p.channel_id = ? AND p.message_id = ?
          `)
            .get(channelId, messageId) as
            | Pick<PlacementRow, 'source_event_id' | 'payload_json' | 'body'>
            | undefined;
          if (row === undefined) return false;
          const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
          const author = payload['author'] as ChannelMessage['author'] | undefined;
          if (author?.kind !== 'bot') return false;
          const refs = Array.isArray(payload['attachments'])
            ? (payload['attachments'] as ChannelAttachmentRef[])
            : [];
          const next: Record<string, unknown> = { ...payload, voice };
          if (
            attachment !== undefined &&
            !refs.some((ref) => attachmentIdentity(ref) === attachmentIdentity(attachment))
          ) {
            if (refs.length >= 10) throw new Error('A message holds at most ten attachments');
            next['attachments'] = [...refs, attachment];
          }
          const candidate = parseMessage(JSON.stringify(next), row.body, messageId, channelId);
          if (candidate === undefined) throw new Error('Invalid voice message');
          db.prepare(sql.updateVoicePayload).run(JSON.stringify(next), row.source_event_id);
          return true;
        },
        ['channel'],
      );
      if (!changed) return undefined;
      const message = this.message(channelId, messageId);
      if (message !== undefined)
        try {
          options.onVoiceChanged?.(channelId, messageId, message);
        } catch (error) {
          options.warn?.('Voice notification failed: ' + String(error));
        }
      return message;
    },
    addMessageSessionLinks(channelId, messageId, links) {
      if (links.length === 0) return this.message(channelId, messageId);
      const changed = database.transaction(
        (db) => {
          const row = db
            .prepare(`
            SELECT e.source_event_id, e.payload_json, e.body FROM channel_placements p
            JOIN source_events e ON e.source_event_id = p.source_event_id
            WHERE p.channel_id = ? AND p.message_id = ?
          `)
            .get(channelId, messageId) as
            | Pick<PlacementRow, 'source_event_id' | 'payload_json' | 'body'>
            | undefined;
          if (row === undefined) return false;
          const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
          const author = payload['author'] as ChannelMessage['author'] | undefined;
          if (author?.kind !== 'bot' || payload['contentPurge'] !== undefined) return false;
          const current = Array.isArray(payload['sessionLinks'])
            ? (payload['sessionLinks'] as ChannelSessionLink[])
            : [];
          const known = new Set(current.map((link) => link.sessionId));
          const added = links.filter((link) => {
            if (known.has(link.sessionId)) return false;
            known.add(link.sessionId);
            return true;
          });
          if (added.length === 0) return false;
          const next: Record<string, unknown> = {
            ...payload,
            sessionLinks: [
              ...current,
              ...added.map(({ sessionId, kind, title }) => ({ sessionId, kind, title })),
            ],
          };
          const candidate = parseMessage(JSON.stringify(next), row.body, messageId, channelId);
          if (candidate === undefined) throw new Error('Invalid Session links');
          db.prepare(sql.updateSessionLinksPayload).run(JSON.stringify(next), row.source_event_id);
          return true;
        },
        ['channel', 'channel-changes'],
      );
      const message = this.message(channelId, messageId);
      if (changed && message !== undefined)
        try {
          options.onSessionLinksChanged?.(channelId, messageId, message);
        } catch (error) {
          options.warn?.('Session link notification failed: ' + String(error));
        }
      return message;
    },
    privateInputRequests() {
      return (
        database.read((db) =>
          db
            .prepare(`
          SELECT p.channel_id, p.message_id
            FROM source_events e
            JOIN channel_placements p ON p.source_event_id = e.source_event_id
           WHERE e.source_kind = 'bot-message'
             AND json_extract(e.payload_json, '$.privateInputRequest') IS NOT NULL
        `)
            .all(),
        ) as Array<{ channel_id: string; message_id: string }>
      ).map((row) => ({ channelId: row.channel_id, messageId: row.message_id }));
    },
  } satisfies Pick<
    ChannelStore,
    'setMessageVoice' | 'addMessageSessionLinks' | 'privateInputRequests'
  > &
    ThisType<ChannelStore>;
}
