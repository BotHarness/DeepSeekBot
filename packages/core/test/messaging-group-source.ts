import { attachOperationalModule } from '../src/database/owner.js';
import type { BotHarnessCore } from '../src/plugin.js';

export function placeGroupSource(
  core: BotHarnessCore,
  input: { channelId: string; fingerprint: string; conversationId: string; messageId: string },
) {
  attachOperationalModule(core.operationalDatabase, 'messaging').transaction((db) => {
    const id = `src-${input.messageId}`;
    db.prepare(
      "INSERT INTO source_events (source_event_id, source_kind, bot_slug, body, created_at, payload_json) VALUES (?, 'bridge-message', 'ada', 'help', ?, ?)",
    ).run(
      id,
      new Date().toISOString(),
      JSON.stringify({
        external: {
          event: {
            channel: 'feishu',
            botId: 'lark-qa',
            fingerprint: input.fingerprint,
            conversation: { kind: 'group', id: input.conversationId },
            reply: {
              messageId: input.messageId,
              conversationId: input.conversationId,
              actorId: 'ou_bob',
            },
          },
        },
      }),
    );
    const revision =
      (
        db
          .prepare('SELECT max(revision) AS revision FROM channel_placements WHERE channel_id = ?')
          .get(input.channelId) as { revision: number | null }
      ).revision ?? 0;
    db.prepare(
      'INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id) VALUES (?, ?, ?, ?)',
    ).run(input.channelId, revision + 1, id, `placed-${input.messageId}`);
  });
}
