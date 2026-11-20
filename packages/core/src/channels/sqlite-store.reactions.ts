import type { HumanContext } from '../humans/context.js';
import { isChannelNotice } from './channel-notice.js';
import {
  isReactionEmoji,
  MAX_ACTOR_REACTIONS_PER_MESSAGE,
  type ChannelReaction,
} from './channel.js';
import { ChannelReactionLimitError, type ChannelStore } from './store.js';
import { parseMessage } from './sqlite-store.message-payload.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { SqliteChannelStoreOptions } from './sqlite-store.types.js';
import type { createChannelHumans } from './sqlite-store.humans.js';
import type { createChannelRecords } from './sqlite-store.records.js';

export function createChannelReactions({
  database,
  now,
  options,
  participates,
  readRecord,
}: {
  database: OperationalDatabaseModulePort;
  now: () => Date;
  options: SqliteChannelStoreOptions;
  participates: ReturnType<typeof createChannelHumans>['participates'];
  readRecord: ReturnType<typeof createChannelRecords>['readRecord'];
}) {
  let reactionTable = false;

  const channelReactions = (
    channelId: string,
    messageIds?: string | readonly string[],
  ): Map<string, ChannelReaction[]> => {
    const selected = typeof messageIds === 'string' ? [messageIds] : messageIds;
    if (selected?.length === 0) return new Map();
    reactionTable ||= database.read(
      (db) =>
        db
          .prepare(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'channel_reactions'",
          )
          .get() !== undefined,
    );
    if (!reactionTable) return new Map();
    const rows = database.read((db) =>
      db
        .prepare(
          `SELECT r.message_id, r.emoji, r.actor_kind, r.actor_id,
                  (SELECT MIN(f.reacted_at) FROM channel_reactions f
                    WHERE f.channel_id = r.channel_id AND f.message_id = r.message_id
                      AND f.emoji = r.emoji) AS first_at
             FROM channel_reactions r
            WHERE r.channel_id = ?${selected === undefined ? '' : ` AND r.message_id IN (${selected.map(() => '?').join(', ')})`}
            ORDER BY r.message_id, first_at, r.emoji, r.reacted_at, r.actor_kind, r.actor_id`,
        )
        .all(channelId, ...(selected ?? [])),
    ) as unknown as Array<{
      message_id: string;
      emoji: string;
      actor_kind: 'human' | 'bot';
      actor_id: string;
    }>;
    const result = new Map<string, ChannelReaction[]>();
    for (const row of rows) {
      let reactions = result.get(row.message_id);
      if (reactions === undefined) result.set(row.message_id, (reactions = []));
      let reaction = reactions.find((item) => item.emoji === row.emoji);
      if (reaction === undefined) reactions.push((reaction = { emoji: row.emoji, actors: [] }));
      reaction.actors.push({ kind: row.actor_kind, id: row.actor_id });
    }
    return result;
  };

  const setReaction = (
    id: string,
    actorKind: 'human' | 'bot',
    actorId: string,
    messageId: string,
    emoji: string,
    active: boolean,
  ): ChannelReaction[] | undefined => {
    if (!isReactionEmoji(emoji)) return undefined;
    const row = database.read((db) =>
      db
        .prepare(`
        SELECT e.payload_json, e.body FROM channel_placements p
        JOIN source_events e ON e.source_event_id = p.source_event_id
        WHERE p.channel_id = ? AND p.message_id = ?
      `)
        .get(id, messageId),
    ) as { payload_json: string; body: string } | undefined;
    const message =
      row === undefined ? undefined : parseMessage(row.payload_json, row.body, messageId, id);
    if (message === undefined || message.author.kind === 'system' || isChannelNotice(message))
      return undefined;
    if (active) {
      const held = database.read((db) =>
        db
          .prepare(
            `SELECT COUNT(*) AS count FROM channel_reactions
                WHERE channel_id = ? AND message_id = ? AND actor_kind = ? AND actor_id = ? AND emoji <> ?`,
          )
          .get(id, messageId, actorKind, actorId, emoji),
      ) as { count: number };
      if (held.count >= MAX_ACTOR_REACTIONS_PER_MESSAGE) throw new ChannelReactionLimitError();
    }
    database.transaction(
      (db) => {
        if (active)
          db.prepare(`
          INSERT INTO channel_reactions (channel_id, message_id, actor_kind, actor_id, emoji, reacted_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT DO NOTHING
        `).run(id, messageId, actorKind, actorId, emoji, now().toISOString());
        else
          db.prepare(`
          DELETE FROM channel_reactions
           WHERE channel_id = ? AND message_id = ? AND actor_kind = ? AND actor_id = ? AND emoji = ?
        `).run(id, messageId, actorKind, actorId, emoji);
      },
      ['channel'],
    );
    const reactions = channelReactions(id, messageId).get(messageId) ?? [];
    try {
      options.onReactionChanged?.(id, messageId, reactions);
    } catch (error) {
      options.warn?.('Reaction notification failed: ' + String(error));
    }
    return reactions;
  };

  const methods = {
    setHumanReaction(human: HumanContext, id, messageId, emoji, active) {
      if (!participates(human, id)) return undefined;
      return setReaction(id, 'human', human.humanId, messageId, emoji, active);
    },
    setBotReaction(id, botSlug, messageId, emoji, active) {
      const channel = readRecord(id);
      if (channel === undefined || channel.deletedAt !== undefined) return undefined;
      if (!channel.members.includes(botSlug)) return undefined;
      return setReaction(id, 'bot', botSlug, messageId, emoji, active);
    },
  } satisfies Pick<ChannelStore, 'setHumanReaction' | 'setBotReaction'>;

  return { channelReactions, methods };
}
