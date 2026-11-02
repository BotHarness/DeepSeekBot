import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { attachOperationalModule } from '../src/database/owner.js';
import { createCore } from '../src/plugin.js';
import { createTempRoot } from './helpers.js';

describe('channel revisions', () => {
  it('appends, pages and replays past stored messages this version cannot read', async () => {
    const core = createCore({
      dshHome: createTempRoot('bh-channel-revision-'),
      agents: {
        async runOrchestrator() {},
        steerOrchestrator() {
          return true;
        },
        async runAssignment() {},
        requestAssignment() {
          throw new Error('No Assignment expected');
        },
        async close() {},
      },
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      const database = attachOperationalModule(core.operationalDatabase, 'channel-revision-test');
      const sourceEventId = randomUUID();
      const at = '2026-10-16T00:00:00.000Z';
      database.transaction((db) => {
        db.prepare(`INSERT INTO source_events
          (source_event_id, source_kind, bot_slug, channel_id, message_id, body, created_at, payload_json)
          VALUES (?, 'human-message', 'ada', ?, 'unreadable', '', ?, ?)`).run(
          sourceEventId,
          dm.id,
          at,
          JSON.stringify({
            id: 'unreadable',
            at,
            author: { kind: 'from-a-newer-version' },
            body: '',
          }),
        );
        db.prepare(`INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id)
          VALUES (?, 1, ?, 'unreadable')`).run(dm.id, sourceEventId);
      }, []);

      const appended = await core.channels.appendMessage(dm.id, {
        id: 'after-unreadable',
        at: '2026-10-16T00:00:01.000Z',
        author: { kind: 'human' },
        body: 'Still delivered',
      });

      expect(appended?.channelRevision).toBe(2);
      expect(core.channels.readMessages(dm.id)).toMatchObject([
        { id: 'after-unreadable', channelRevision: 2 },
        {
          id: 'unreadable',
          at,
          author: { kind: 'system' },
          body: 'This message was written by a newer version and cannot be shown.',
          channelRevision: 1,
        },
      ]);
      expect(core.channels.readHumanJournalPage(dm.id, { through: 2 })).toMatchObject({
        entries: [
          { revision: 1, message: { id: 'unreadable' } },
          { revision: 2, message: { id: 'after-unreadable' } },
        ],
        hasOlder: false,
      });
      expect(core.channels.messagesAfter(dm.id, 0)).toMatchObject([
        { revision: 1, message: { id: 'unreadable' } },
        { revision: 2, message: { id: 'after-unreadable' } },
      ]);
      expect(core.channels.messagesAfter(dm.id, 2)).toEqual([]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
