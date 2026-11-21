import { fixture } from './group-send-review-fixtures.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { attachOperationalModule } from '../src/database/owner.js';

describe('Group send review through the same direct model tools', () => {
  it('validates peer attachment evidence through the same current-file projection as the read', async () => {
    await fixture(async ({ core, channelId, human, tool }) => {
      await human('question', 'What is the release date?');
      const read = await tool('channel_read', {});
      const ref = await core.attachments.upload({
        name: 'release.txt',
        data: (async function* () {
          yield Buffer.from('Original');
        })(),
      });
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, channelId, {
        id: 'peer-with-file',
        at: new Date().toISOString(),
        author: { kind: 'bot', slug: 'bob' },
        body: 'October 20',
        attachments: [ref],
      });
      writeFileSync(core.attachments.fileTarget(ref.fileId!).path, 'Current release notes');
      const held = await tool('bot_send_message', {
        body: 'October 20',
        observation_id: read.observationIds[channelId],
      });
      expect(held.status).toBe('held');
      const drop = await tool('bot_send_message', {
        body: '',
        action: 'drop',
        draft_id: held.draftId,
        observation_id: held.review!.observationId,
        yield_to_message_ids: ['peer-with-file'],
      });
      expect(drop.status).toBe('dropped');
    });
  });

  it('records a deliberate yield to an observed committed peer answer without a public acknowledgment or implicit Inbox completion', async () => {
    await fixture(async ({ core, channelId, human, tool }) => {
      await human('question', 'What is the release date?');
      const read = await tool('channel_read', {});
      const peerRead = await tool('channel_read', {}, 'bob');
      const peer = await tool(
        'bot_send_message',
        { body: 'October 20', observation_id: peerRead.observationIds[channelId] },
        'bob',
      );
      const held = await tool('bot_send_message', {
        body: 'October 20',
        observation_id: read.observationIds[channelId],
      });
      expect(held.review?.peerMessageIds).toEqual([peer.messageId]);
      expect(held.review?.content).toContain('October 20');
      const dropped = await tool('bot_send_message', {
        body: '',
        action: 'drop',
        draft_id: held.draftId,
        observation_id: held.review!.observationId,
        yield_to_message_ids: [peer.messageId],
      });
      expect(dropped).toMatchObject({
        status: 'dropped',
        reason: 'explicit-peer-yield',
        yieldedToMessageIds: [peer.messageId],
      });
      expect(
        core.channels.readMessages(channelId).filter((m) => m.author.kind === 'bot'),
      ).toHaveLength(1);
      const stored = attachOperationalModule(core.operationalDatabase, 'peer-test').read((db) =>
        db
          .prepare('SELECT record_json FROM group_send_review_drafts WHERE id = ?')
          .get(held.draftId!),
      );
      expect(JSON.parse(String(stored?.record_json)).yieldedToMessageIds).toEqual([peer.messageId]);
      const open = attachOperationalModule(core.operationalDatabase, 'peer-test').read((db) =>
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM inbox_admissions WHERE bot_slug = 'ada' AND resolution IS NULL",
          )
          .get(),
      );
      expect(Number(open?.count)).toBeGreaterThan(0);
    });
  });

  it('does not suppress independent evidence or a new direct question with repeated words', async () => {
    await fixture(async ({ core, channelId, human, tool }) => {
      await human('question', 'What is the release date?');
      const read = await tool('channel_read', {});
      const peerRead = await tool('channel_read', {}, 'bob');
      await tool(
        'bot_send_message',
        { body: 'October 20', observation_id: peerRead.observationIds[channelId] },
        'bob',
      );
      const held = await tool('bot_send_message', {
        body: 'The signed release record specifies 09:00 UTC',
        observation_id: read.observationIds[channelId],
      });
      const sent = await tool('bot_send_message', {
        body: 'The signed release record specifies 09:00 UTC',
        draft_id: held.draftId,
        observation_id: held.review!.observationId,
      });
      expect(sent.status).toBe('committed');
      await human('new-question', 'What is the release date in Tokyo? Ada, convert the time.');
      const fresh = await tool('channel_read', {});
      const answer = await tool('bot_send_message', {
        body: 'October 20, 18:00 JST',
        observation_id: fresh.observationIds[channelId],
      });
      expect(answer.status).toBe('committed');
      expect(core.channels.message(channelId, 'new-question')?.id).toBe('new-question');
    });
  });

  it('replays a committed quoting draft, and refuses it without a second copy once message cleanup removes its target', async () => {
    await fixture(async ({ core, channelId, human, tool }) => {
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, channelId, {
        id: 'plan',
        at: '2026-01-01T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'Ship the export fix on Friday.',
      });
      await human('question', 'Is the export fix still on?');
      const read = await tool('channel_read', {});
      const peerRead = await tool('channel_read', {}, 'bob');
      await tool(
        'bot_send_message',
        { body: 'Friday works', observation_id: peerRead.observationIds[channelId] },
        'bob',
      );
      const quotes = [{ message_id: 'plan', text: 'export fix', note: 'Confirmed' }];
      const held = await tool('bot_send_message', {
        body: 'The fix ships Friday.',
        quotes,
        observation_id: read.observationIds[channelId],
      });
      const args = {
        body: 'The fix ships Friday.',
        quotes,
        draft_id: held.draftId,
        observation_id: held.review!.observationId,
      };
      const sent = await tool('bot_send_message', args);
      expect(sent.status).toBe('committed');
      expect(await tool('bot_send_message', args)).toMatchObject({
        status: 'committed',
        messageId: sent.messageId,
      });
      expect(
        await tool('bot_send_message', { ...args, quotes: [{ ...quotes[0], note: 'Changed' }] }),
      ).toMatchObject({ reason: 'draft-commit-content-changed' });
      attachOperationalModule(core.operationalDatabase, 'test').transaction((db) => {
        db.prepare(
          "UPDATE inbox_admissions SET attempt_state = 'handled' WHERE source_event_id IN (SELECT source_event_id FROM channel_placements WHERE message_id = 'plan')",
        ).run();
      });
      const scope = { before: '2026-06-01T00:00:00.000Z', channelIds: [channelId] };
      const preview = core.contentPurge.textPreview(OWNER_HUMAN_CONTEXT, scope);
      expect(preview.messages).toBe(1);
      core.contentPurge.textConfirm(OWNER_HUMAN_CONTEXT, preview.scope, preview.token);
      expect(core.channels.message(channelId, 'plan')).toHaveProperty('contentPurge');
      await expect(tool('bot_send_message', args)).rejects.toThrow(
        'Quote text is not part of message plan',
      );
      const page = core.channels.readHumanTimeline(OWNER_HUMAN_CONTEXT, channelId, { limit: 20 })!;
      expect(
        page.entries.filter((entry) => 'body' in entry && entry.body === 'The fix ships Friday.'),
      ).toHaveLength(1);
    });
  });

  it('refuses Human, invented preview, own and unobserved peer IDs as yielding evidence without dropping the draft', async () => {
    await fixture(async ({ channelId, human, tool }) => {
      await human('question', 'Question');
      const ownRead = await tool('channel_read', {});
      const own = await tool('bot_send_message', {
        body: 'Earlier response',
        observation_id: ownRead.observationIds[channelId],
      });
      const read = await tool('channel_read', {});
      const peerRead = await tool('channel_read', {}, 'bob');
      const peer = await tool(
        'bot_send_message',
        { body: 'Answer', observation_id: peerRead.observationIds[channelId] },
        'bob',
      );
      const held = await tool('bot_send_message', {
        body: 'Answer',
        observation_id: read.observationIds[channelId],
      });
      for (const id of ['question', 'preview-not-committed', own.messageId, peer.messageId]) {
        const refused = await tool('bot_send_message', {
          body: '',
          action: 'drop',
          draft_id: held.draftId,
          observation_id: read.observationIds[channelId],
          yield_to_message_ids: [id],
        });
        expect(refused).toMatchObject({ status: 'refused', reason: 'peer-answer-not-observed' });
      }
      const drop = await tool('bot_send_message', {
        body: '',
        action: 'drop',
        draft_id: held.draftId,
        observation_id: held.review!.observationId,
        yield_to_message_ids: [peer.messageId],
      });
      expect(drop.status).toBe('dropped');
    });
  });

  it('compares migrated attachments with the observed projection and still holds later file changes', async () => {
    await fixture(async ({ core, channelId, tool }) => {
      const bytes = Buffer.from('Original agenda');
      const hash = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
      const objects = join(core.attachments.rootDir, 'objects', hash.slice(7, 9));
      mkdirSync(objects, { recursive: true });
      writeFileSync(join(objects, hash.slice(7)), bytes);
      const original = {
        id: 'attachment-request',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        attachments: [{ hash, name: 'agenda.txt', mime: 'text/plain', size: bytes.length }],
      };
      const database = attachOperationalModule(core.operationalDatabase, 'review-attachment-test');
      database.transaction((db) => {
        db.prepare(`INSERT INTO source_events
          (source_event_id, source_kind, channel_id, message_id, body, created_at, payload_json)
          VALUES (?, 'human-message', ?, ?, ?, ?, ?)`).run(
          'attachment-source',
          channelId,
          original.id,
          'Read this agenda',
          original.at,
          JSON.stringify(original),
        );
        db.prepare(`INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id)
          VALUES (?, 1, ?, ?)`).run(channelId, 'attachment-source', original.id);
      });
      await core.channels.migrateAttachments!();
      const ref = core.channels.message(channelId, original.id)!.attachments![0]!;
      expect(ref.fileId).toMatch(/^file:/);
      const read = await tool('channel_read', {});
      const sent = await tool('bot_send_message', {
        body: 'Agenda received',
        observation_id: read.observationIds[channelId],
      });
      expect(sent.status).toBe('committed');
      const beforeEdit = await tool('channel_read', {});
      writeFileSync(
        core.attachments.fileTarget(ref.fileId!).path,
        'Revised agenda with additional details',
      );
      const held = await tool('bot_send_message', {
        body: 'Old agenda summary',
        observation_id: beforeEdit.observationIds[channelId],
      });
      expect(held.status).toBe('held');
      expect(held.changedMessageIds).toEqual([original.id]);
      const recheck = await tool('bot_send_message', {
        body: 'Revised agenda received',
        draft_id: held.draftId,
        observation_id: held.review!.observationId,
      });
      expect(recheck.status).toBe('committed');
      expect(
        database.read(
          (db) =>
            db
              .prepare('SELECT payload_json FROM source_events WHERE source_event_id = ?')
              .get('attachment-source')?.payload_json,
        ),
      ).toBe(JSON.stringify(original));
    });
  });

  it('keeps an observed floor and refuses to silently skip a gap larger than the held delta', async () => {
    await fixture(async ({ channelId, human, tool }) => {
      await human('question', 'Meet at 10:00');
      const read = await tool('channel_read', {});
      for (let i = 0; i < 25; i++) await human(`new-${i}`, `New context ${i}`);
      await human('latest-correction', 'Actually 11:00');
      const held = await tool('bot_send_message', {
        body: '10:00',
        observation_id: read.observationIds[channelId],
      });
      expect(held.changedMessageIds).toContain('latest-correction');
      expect(held.review!.complete).toBe(false);
      const retry = await tool('bot_send_message', {
        body: '11:00',
        draft_id: held.draftId,
        observation_id: held.review!.observationId,
      });
      expect(retry.status).toBe('held');
      expect(retry.changedMessageIds).toContain('new-0');
    });
  });

  it('never observes content omitted from a bounded held delta', async () => {
    await fixture(async ({ channelId, human, tool }) => {
      await human('question', 'Original');
      const read = await tool('channel_read', {});
      await human('small', 'A small change');
      await human('large', 'x'.repeat(20_000));
      const held = await tool('bot_send_message', {
        body: 'Answer',
        observation_id: read.observationIds[channelId],
      });
      expect(held.review?.complete).toBe(false);
      expect(held.review!.content.length).toBeLessThan(12_000);
      expect(held.review!.content).not.toContain('x'.repeat(100));
      const recheck = await tool('bot_send_message', {
        body: 'Answer',
        draft_id: held.draftId,
        observation_id: held.review!.observationId,
      });
      expect(recheck.status).toBe('held');
      expect(recheck.changedMessageIds).toContain('large');
    });
  });

  it('cannot forge a read, transfer its owner, or pretend an omitted message was read', async () => {
    await fixture(async ({ channelId, human, tool }) => {
      await human('first', 'one');
      const read = await tool('channel_read', {});
      await human('gap', 'two');
      await human('last', 'three');
      const partial = await tool('channel_read', { limit: 1 });
      const held = await tool('bot_send_message', {
        body: 'one',
        observation_id: read.observationIds[channelId],
      });
      const skipped = await tool('bot_send_message', {
        body: 'three',
        draft_id: held.draftId,
        observation_id: partial.observationIds[channelId],
      });
      expect(skipped.status).toBe('held');
      expect(skipped.changedMessageIds).toContain('gap');
      expect(
        (await tool('bot_send_message', { body: 'forged', observation_id: 'invented' })).status,
      ).toBe('held');
      expect(
        (
          await tool(
            'bot_send_message',
            { body: 'other owner', observation_id: read.observationIds[channelId] },
            'bob',
          )
        ).status,
      ).toBe('held');
    });
  });
});
