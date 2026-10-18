import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createCore } from '../src/plugin.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot } from './helpers.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { GroupSendReview, SendReviewRequired } from '../src/channels/send-review.js';

it('adds review tables after the canonical Channel management migration while preserving existing identities', () => {
  const dshHome = createTempRoot('review-tob-upgrade-');
  const prior = mountOperationalDatabase({
    dshHome,
    schemaPlan: defineSchemaPlan(
      BOT_HARNESS_SCHEMA_PLAN.migrations.filter((migration) => migration.generation <= 98),
    ),
  });
  try {
    attachOperationalModule(prior, 'tob-upgrade-test').transaction((db) => {
      db.exec(
        "INSERT INTO channel_management_operations VALUES ('group-a', 'create', 'hash-a', 'channel-a', NULL, '[]', 'completed')",
      );
      db.exec(
        "INSERT INTO bot_creation_operations VALUES ('create-a', 'hash-a', 'created-bot', 'created')",
      );
      db.prepare('INSERT INTO tob_identity (singleton, bot_slug) VALUES (1, ?)').run(
        'protected-tob',
      );
    });
  } finally {
    prior.close();
  }
  const upgraded = mountOperationalDatabase({ dshHome, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  try {
    const port = attachOperationalModule(upgraded, 'review-upgrade-test');
    expect(
      port.read(
        (db) => db.prepare('SELECT bot_slug FROM tob_identity WHERE singleton = 1').get()?.bot_slug,
      ),
    ).toBe('protected-tob');
    expect(
      port.read(
        (db) =>
          db
            .prepare('SELECT bot_slug FROM bot_creation_operations WHERE operation_key = ?')
            .get('create-a')?.bot_slug,
      ),
    ).toBe('created-bot');
    expect(
      port.read(
        (db) =>
          db
            .prepare('SELECT channel_id FROM channel_management_operations WHERE operation_key = ?')
            .get('group-a')?.channel_id,
      ),
    ).toBe('channel-a');
    const review = new GroupSendReview(port);
    expect(review.enabled('group-a')).toBe(false);
    review.configure('group-a', true);
    expect(review.enabled('group-a')).toBe(true);
    expect(
      port.read(
        (db) => db.prepare('SELECT COUNT(*) AS count FROM group_send_review_drafts').get()?.count,
      ),
    ).toBe(0);
  } finally {
    upgraded.close();
  }
});

it('revoking the initiating Group stops cross-Channel continuation but not a later independent DM', async () => {
  const outcomes: unknown[] = [];
  let groupId = '';
  const core = createCore({
    dshHome: createTempRoot('review-revocation-'),
    agents: {
      async runOrchestrator(run: OrchestratorAgentRun) {
        if (run.inboundChannelId === groupId) {
          core.channels.removeGroupMember(groupId, 'ada');
          for (const channelId of [groupId, 'dm-ada']) {
            try {
              await run.channels.send({ channelId, body: 'Unsolicited fallback' });
            } catch (error) {
              outcomes.push(error);
            }
          }
        } else await run.channels.send({ body: 'Independent DM answered' });
      },
      async runAssignment() {},
      requestAssignment() {
        throw new Error('unexpected assignment');
      },
      async close() {},
    },
  });
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    core.registry.create({ slug: 'bob', displayName: 'Bob' });
    const group = core.channels.createGroup({ name: 'Review', members: ['ada', 'bob'] });
    groupId = group.id;
    core.runtime.groupSendReview!.configure(groupId, true);
    core.channels.getOrCreateDm('ada', 'Ada');
    await core.channels.appendMessage(groupId, {
      id: 'request',
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: '@Ada Send here',
      mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
    });
    core.runtime.admitGroupMessage(groupId, 'request');
    await core.runtime.whenIdle();
    expect(outcomes).toHaveLength(2);
    for (const error of outcomes)
      expect(error).toMatchObject({ code: 'group-reply-source-revoked' });
    expect(core.channels.readMessages('dm-ada')).toHaveLength(0);
    await core.channels.appendMessage('dm-ada', {
      id: 'new-dm',
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: 'New independent request',
    });
    const admission = core.runtime.admitDmMessage({
      channelId: 'dm-ada',
      messageId: 'new-dm',
      body: 'New independent request',
    });
    if (admission.admitted) await admission.settled;
    expect(
      core.channels.readMessages('dm-ada').some((m) => m.body === 'Independent DM answered'),
    ).toBe(true);
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

async function fixture(
  check: (f: {
    core: ReturnType<typeof createCore>;
    channelId: string;
    human(id: string, body: string): Promise<void>;
    tool(
      name: string,
      args: Record<string, unknown>,
      bot?: string,
    ): Promise<{
      status?: string;
      reason?: string;
      draftId?: string;
      draftVersion?: number;
      budget?: { used: number; limit: number; exhausted: boolean };
      suggestedSnoozeUntil?: string;
      messageId: string;
      observationIds: Record<string, string>;
      changedMessageIds?: string[];
      review?: {
        observationId: string;
        content: string;
        complete: boolean;
        observedMessageIds: string[];
        peerMessageIds?: string[];
      };
    }>;
  }) => Promise<void>,
) {
  const core = createCore({
    dshHome: createTempRoot('group-send-review-'),
    agents: createDshBotAgentAdapter({
      agents: new FakeAgentHost({ kind: 'completed' }),
      orchestratorCwd: (bot) => `/memory/${bot.slug}`,
      ensureWorkspace: () => undefined,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    }),
  });
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    core.registry.create({ slug: 'bob', displayName: 'Bob' });
    const group = core.channels.createGroup({ name: 'Review', members: ['ada', 'bob'] });
    for (const bot of group.members)
      core.channels.setGroupWakePolicy(group.id, bot, {
        mode: 'silent',
        count: 5,
        intervalSeconds: 30,
      });
    core.runtime.groupSendReview!.configure(group.id, true);
    await check({
      core,
      channelId: group.id,
      human: async (id, body) => {
        await core.channels.appendMessage(group.id, {
          id,
          body,
          author: { kind: 'human' },
          at: new Date().toISOString(),
        });
      },
      tool: async (name, args, bot = 'ada') =>
        JSON.parse(
          JSON.stringify(
            (
              await core.runtime.runDirectBotTool!(
                bot,
                name,
                { channel_id: group.id, ...args },
                new AbortController().signal,
              )
            ).result,
          ),
        ),
    });
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
}

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
      await core.channels.appendMessage(channelId, {
        id: 'peer-with-file',
        at: new Date().toISOString(),
        author: { kind: 'bot', slug: 'bob' },
        body: 'October 20',
        attachments: [ref],
      });
      writeFileSync(core.attachments.fileTarget(ref.fileId!).path, 'Current release notes');
      const held = await tool('channel_send', {
        body: 'October 20',
        observation_id: read.observationIds[channelId],
      });
      expect(held.status).toBe('held');
      const drop = await tool('channel_send', {
        body: '',
        drop: true,
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
        'channel_send',
        { body: 'October 20', observation_id: peerRead.observationIds[channelId] },
        'bob',
      );
      const held = await tool('channel_send', {
        body: 'October 20',
        observation_id: read.observationIds[channelId],
      });
      expect(held.review?.peerMessageIds).toEqual([peer.messageId]);
      expect(held.review?.content).toContain('October 20');
      const dropped = await tool('channel_send', {
        body: '',
        drop: true,
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
        'channel_send',
        { body: 'October 20', observation_id: peerRead.observationIds[channelId] },
        'bob',
      );
      const held = await tool('channel_send', {
        body: 'The signed release record specifies 09:00 UTC',
        observation_id: read.observationIds[channelId],
      });
      const sent = await tool('channel_send', {
        body: 'The signed release record specifies 09:00 UTC',
        draft_id: held.draftId,
        observation_id: held.review!.observationId,
      });
      expect(sent.status).toBe('committed');
      await human('new-question', 'What is the release date in Tokyo? Ada, convert the time.');
      const fresh = await tool('channel_read', {});
      const answer = await tool('channel_send', {
        body: 'October 20, 18:00 JST',
        observation_id: fresh.observationIds[channelId],
      });
      expect(answer.status).toBe('committed');
      expect(core.channels.message(channelId, 'new-question')?.id).toBe('new-question');
    });
  });

  it('refuses Human, invented preview, own and unobserved peer IDs as yielding evidence without dropping the draft', async () => {
    await fixture(async ({ channelId, human, tool }) => {
      await human('question', 'Question');
      const ownRead = await tool('channel_read', {});
      const own = await tool('channel_send', {
        body: 'Earlier response',
        observation_id: ownRead.observationIds[channelId],
      });
      const read = await tool('channel_read', {});
      const peerRead = await tool('channel_read', {}, 'bob');
      const peer = await tool(
        'channel_send',
        { body: 'Answer', observation_id: peerRead.observationIds[channelId] },
        'bob',
      );
      const held = await tool('channel_send', {
        body: 'Answer',
        observation_id: read.observationIds[channelId],
      });
      for (const id of ['question', 'preview-not-committed', own.messageId, peer.messageId]) {
        const refused = await tool('channel_send', {
          body: '',
          drop: true,
          draft_id: held.draftId,
          observation_id: read.observationIds[channelId],
          yield_to_message_ids: [id],
        });
        expect(refused).toMatchObject({ status: 'refused', reason: 'peer-answer-not-observed' });
      }
      const drop = await tool('channel_send', {
        body: '',
        drop: true,
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
      const sent = await tool('channel_send', {
        body: 'Agenda received',
        observation_id: read.observationIds[channelId],
      });
      expect(sent.status).toBe('committed');
      const beforeEdit = await tool('channel_read', {});
      writeFileSync(
        core.attachments.fileTarget(ref.fileId!).path,
        'Revised agenda with additional details',
      );
      const held = await tool('channel_send', {
        body: 'Old agenda summary',
        observation_id: beforeEdit.observationIds[channelId],
      });
      expect(held.status).toBe('held');
      expect(held.changedMessageIds).toEqual([original.id]);
      const recheck = await tool('channel_send', {
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

  it('offers the latest context without a prior observation and permits a corrected recheck in a long Group', async () => {
    await fixture(async ({ core, channelId, human, tool }) => {
      for (let i = 0; i < 40; i++) await human(`history-${i}`, `Earlier message ${i}`);
      await human('latest-correction', 'Correction: meet at 11:00, not 10:00');
      const held = await tool('channel_send', { body: 'Confirmed 10:00' });
      expect(held.status).toBe('held');
      expect(held.changedMessageIds).toHaveLength(20);
      expect(held.changedMessageIds).toContain('latest-correction');
      expect(held.changedMessageIds).not.toContain('history-0');
      expect(held.review!.content).toContain('Correction: meet at 11:00');
      const sent = await tool('channel_send', {
        body: 'Confirmed 11:00',
        draft_id: held.draftId,
        observation_id: held.review!.observationId,
      });
      expect(sent.status).toBe('committed');
      expect(core.channels.message(channelId, sent.messageId)?.body).toBe('Confirmed 11:00');
      expect(
        core.runtime.groupSendReview!.inspect('direct:ada', channelId, held.draftId!),
      ).toMatchObject({
        state: 'committed',
        committed: { messageId: sent.messageId },
        original: { body: '' },
        current: { body: '' },
      });
      const retry = await tool('channel_send', {
        body: 'Duplicate 11:00',
        draft_id: held.draftId,
        observation_id: held.review!.observationId,
      });
      expect(retry.status).toBe('refused');
      expect(
        core.channels.readMessages(channelId).filter((m) => m.author.kind === 'bot'),
      ).toHaveLength(1);
    });
  });

  it('keeps an observed floor and refuses to silently skip a gap larger than the held delta', async () => {
    await fixture(async ({ channelId, human, tool }) => {
      await human('question', 'Meet at 10:00');
      const read = await tool('channel_read', {});
      for (let i = 0; i < 25; i++) await human(`new-${i}`, `New context ${i}`);
      await human('latest-correction', 'Actually 11:00');
      const held = await tool('channel_send', {
        body: '10:00',
        observation_id: read.observationIds[channelId],
      });
      expect(held.changedMessageIds).toContain('latest-correction');
      expect(held.review!.complete).toBe(false);
      const retry = await tool('channel_send', {
        body: '11:00',
        draft_id: held.draftId,
        observation_id: held.review!.observationId,
      });
      expect(retry.status).toBe('held');
      expect(retry.changedMessageIds).toContain('new-0');
    });
  });

  it('holds an obsolete answer without a public message, then commits a revision from actual new content', async () => {
    await fixture(async ({ core, channelId, human, tool }) => {
      await human('old', 'Meet at 10:00');
      const read = await tool('channel_read', {});
      await human('correction', 'Correction: meet at 11:00');
      const held = await tool('channel_send', {
        body: 'Confirmed 10:00',
        observation_id: read.observationIds[channelId],
      });
      expect(held.status).toBe('held');
      expect(held.changedMessageIds).toContain('correction');
      expect(core.channels.readMessages(channelId).map((m) => m.id)).toEqual(['correction', 'old']);
      expect(held.review?.complete).toBe(true);
      expect(held.review?.observedMessageIds).toEqual(['correction']);
      expect(
        JSON.parse(held.review!.content).messages.map(
          (view: { message: { body: string } }) => view.message.body,
        ),
      ).toEqual(['Correction: meet at 11:00']);
      const sent = await tool('channel_send', {
        body: 'Confirmed 11:00',
        draft_id: held.draftId,
        observation_id: held.review!.observationId,
      });
      expect(sent.status).toBe('committed');
      expect(core.channels.message(channelId, sent.messageId)?.body).toBe('Confirmed 11:00');
      expect(
        core.channels.readMessages(channelId).filter((m) => m.author.kind === 'bot'),
      ).toHaveLength(1);
    });
  });

  it('rechecks an unchanged body from the held delta without a separate read or a silent basis upgrade', async () => {
    await fixture(async ({ core, channelId, human, tool }) => {
      await human('question', 'Please answer');
      const read = await tool('channel_read', {});
      await human('aside', 'Coffee is ready');
      const held = await tool('channel_send', {
        body: 'Answer',
        observation_id: read.observationIds[channelId],
      });
      expect(held.review?.complete).toBe(true);
      const sent = await tool('channel_send', {
        body: 'Answer',
        draft_id: held.draftId,
        observation_id: held.review!.observationId,
      });
      expect(sent.status).toBe('committed');
      expect(core.channels.message(channelId, sent.messageId)?.body).toBe('Answer');
      const stale = await tool('channel_send', {
        body: 'Another answer',
        observation_id: read.observationIds[channelId],
      });
      expect(stale.status).toBe('held');
    });
  });

  it('does not let a held delta cover a later correction or another owner', async () => {
    await fixture(async ({ channelId, human, tool }) => {
      await human('question', 'Meet at 10');
      const read = await tool('channel_read', {});
      await human('aside', 'Coffee');
      const held = await tool('channel_send', {
        body: 'Meet at 10',
        observation_id: read.observationIds[channelId],
      });
      await human('correction', 'Instead meet at 11');
      const recheck = await tool('channel_send', {
        body: 'Meet at 10',
        draft_id: held.draftId,
        observation_id: held.review!.observationId,
      });
      expect(recheck.status).toBe('held');
      expect(recheck.changedMessageIds).toContain('correction');
      const other = await tool(
        'channel_send',
        { body: 'Meet at 10', observation_id: held.review!.observationId },
        'bob',
      );
      expect(other.status).toBe('held');
    });
  });

  it('never observes content omitted from a bounded held delta', async () => {
    await fixture(async ({ channelId, human, tool }) => {
      await human('question', 'Original');
      const read = await tool('channel_read', {});
      await human('small', 'A small change');
      await human('large', 'x'.repeat(20_000));
      const held = await tool('channel_send', {
        body: 'Answer',
        observation_id: read.observationIds[channelId],
      });
      expect(held.review?.complete).toBe(false);
      expect(held.review!.content.length).toBeLessThan(12_000);
      expect(held.review!.content).not.toContain('x'.repeat(100));
      const recheck = await tool('channel_send', {
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
      const held = await tool('channel_send', {
        body: 'one',
        observation_id: read.observationIds[channelId],
      });
      const skipped = await tool('channel_send', {
        body: 'three',
        draft_id: held.draftId,
        observation_id: partial.observationIds[channelId],
      });
      expect(skipped.status).toBe('held');
      expect(skipped.changedMessageIds).toContain('gap');
      expect(
        (await tool('channel_send', { body: 'forged', observation_id: 'invented' })).status,
      ).toBe('held');
      expect(
        (
          await tool(
            'channel_send',
            { body: 'other owner', observation_id: read.observationIds[channelId] },
            'bob',
          )
        ).status,
      ).toBe('held');
    });
  });

  it('allows an unchanged recheck for unrelated chatter, but bounds repeated changes and preserves Inbox responsibility on drop', async () => {
    await fixture(async ({ core, channelId, human, tool }) => {
      await human('old', 'Please answer');
      const read = await tool('channel_read', {});
      await human('aside', 'Unrelated: coffee');
      const held = await tool('channel_send', {
        body: 'Answer',
        observation_id: read.observationIds[channelId],
      });
      const fresh = await tool('channel_read', {});
      await human('again', 'Another change');
      const stopped = await tool('channel_send', {
        body: 'Answer',
        draft_id: held.draftId,
        observation_id: fresh.observationIds[channelId],
      });
      expect(stopped.status).toBe('held');
      const newest = await tool('channel_read', {});
      await human('third-change', 'One more unrelated change');
      expect(
        (
          await tool('channel_send', {
            body: 'Answer',
            draft_id: held.draftId,
            observation_id: newest.observationIds[channelId],
          })
        ).status,
      ).toBe('requires-review');
      expect(
        (await tool('channel_send', { body: '', drop: true, draft_id: held.draftId })).status,
      ).toBe('dropped');
      const unresolved = attachOperationalModule(core.operationalDatabase, 'test').read((db) =>
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM inbox_admissions WHERE bot_slug = 'ada' AND resolution IS NULL",
          )
          .get(),
      );
      expect(Number(unresolved?.count)).toBeGreaterThan(0);
      expect(core.channels.readMessages(channelId).every((m) => m.author.kind !== 'bot')).toBe(
        true,
      );
    });
  });

  it('retains membership checks after a draft has been held', async () => {
    await fixture(async ({ core, channelId, human, tool }) => {
      await human('old', 'Question');
      const held = await tool('channel_send', { body: 'Draft' });
      core.channels.removeGroupMember(channelId, 'ada');
      await expect(
        tool('channel_send', { body: 'Draft', draft_id: held.draftId }),
      ).rejects.toThrow();
      expect(
        core.channels.readMessages(channelId).filter((m) => m.author.kind === 'bot'),
      ).toHaveLength(0);
    });
  });
});

it('refuses automatic recovery after restart or expiry and removes draft content on purge', async () => {
  await fixture(async ({ core, channelId, human, tool }) => {
    await human('original', 'Private original');
    const held = await tool('channel_send', { body: 'Private draft' });
    const owner = 'direct:ada';
    const draft = core.runtime.groupSendReview!.inspect(owner, channelId, held.draftId!)!;
    const database = attachOperationalModule(core.operationalDatabase, 'test');
    const input = {
      owner,
      channelId,
      sourceEventId: draft.sourceEventId,
      message: draft.current,
      draftId: draft.id,
    };
    const restarted = new GroupSendReview(database);
    expect(database.transaction((db) => restarted.check(db, input))?.reason).toBe('host-restarted');
    const expired = new GroupSendReview(database, () => new Date(draft.expires + 1));
    expect(database.transaction((db) => expired.check(db, input))?.status).toBe('expired');
    core.channels.deleteGroup(channelId);
    const preview = core.contentPurge.preview(channelId, [draft.sourceEventId]);
    core.contentPurge.confirm(channelId, preview.sourceEventIds, preview.token);
    expect(core.runtime.groupSendReview!.inspect(owner, channelId, draft.id)).toBeUndefined();
    await expect(
      tool('channel_send', { body: 'Private draft', draft_id: draft.id }),
    ).rejects.toThrow();
  });
});

it('serializes two sends with the same observation and treats only the first as fresh', async () => {
  await fixture(async ({ core, channelId, human, tool }) => {
    await human('question', 'One answer');
    const read = await tool('channel_read', {});
    const outcomes = await Promise.all([
      tool('channel_send', { body: 'First', observation_id: read.observationIds[channelId] }),
      tool('channel_send', { body: 'Second', observation_id: read.observationIds[channelId] }),
    ]);
    expect(outcomes.map((result) => result.status).sort()).toEqual(['committed', 'held']);
    expect(
      core.channels.readMessages(channelId).filter((m) => m.author.kind === 'bot'),
    ).toHaveLength(1);
  });
});

async function exhaustReview(f: Parameters<Parameters<typeof fixture>[0]>[0]) {
  await f.human('busy-question', 'Meet at 11:00');
  const initial = await f.tool('channel_read', {});
  await f.human('busy-0', 'Coffee is ready');
  let outcome = await f.tool('channel_send', {
    body: 'Meet at 11:00',
    observation_id: initial.observationIds[f.channelId],
  });
  for (let i = 1; i <= 2; i++) {
    const read = await f.tool('channel_read', {});
    await f.human(`busy-${i}`, `Unrelated chatter ${i}`);
    outcome = await f.tool('channel_send', {
      body: 'Meet at 11:00',
      draft_id: outcome.draftId,
      observation_id: read.observationIds[f.channelId],
    });
    expect(outcome.budget).toEqual({ used: i, limit: 2, exhausted: i === 2 });
  }
  expect(outcome.status).toBe('requires-review');
  return outcome;
}

describe('busy Group progress through the direct tool', () => {
  it('cannot drop an exhausted draft and restart its budget inside the same Orchestrator turn', async () => {
    let groupId = '';
    let turns = 0;
    let keptOpen: string[] | undefined;
    const adapter = createDshBotAgentAdapter({
      agents: new FakeAgentHost(),
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
    });
    const outcomes: string[] = [];
    const core = createCore({
      dshHome: createTempRoot('review-turn-budget-'),
      agents: {
        async runOrchestrator(run) {
          if (run.bot.slug !== 'ada') return;
          turns += 1;
          if (turns > 1) {
            const read = JSON.parse(run.channels.readModel({ channelId: groupId }));
            await run.channels.send({
              body: 'New request answered',
              observationId: read.observationIds[groupId],
            });
            return;
          }
          let draftId: string | undefined;
          for (let n = 0; n < 3; n++) {
            const read = JSON.parse(run.channels.readModel({ channelId: groupId }));
            await core.channels.appendMessage(groupId, {
              id: `busy-turn-${n}`,
              at: new Date().toISOString(),
              author: { kind: 'human' },
              body: `Side message ${n}`,
            });
            try {
              await run.channels.send({
                body: 'Draft',
                observationId: read.observationIds[groupId],
                ...(draftId ? { draftId } : {}),
              });
              throw Error('Expected a held draft');
            } catch (error) {
              if (!(error instanceof SendReviewRequired)) throw error;
              draftId = error.outcome.draftId;
              outcomes.push(error.outcome.status);
            }
          }
          const dropped = JSON.parse(
            JSON.stringify(
              await adapter.runDirectTool!(
                run,
                'channel_send',
                {
                  body: '',
                  drop: true,
                  draft_id: draftId,
                  channel_id: groupId,
                  resolve_inbox_ids: ['initial-request', 'busy-turn-0'],
                },
                new AbortController().signal,
              ),
            ),
          );
          expect(dropped.budget?.exhausted).toBe(true);
          expect(Date.parse(dropped.suggestedSnoozeUntil!)).toBeGreaterThan(Date.now());
          expect(Date.parse(dropped.suggestedSnoozeUntil!)).toBeLessThanOrEqual(
            Date.now() + 30_000,
          );
          expect(dropped.choices).toBeUndefined();
          keptOpen = dropped.keepOpenInboxIds;
          const fresh = JSON.parse(run.channels.readModel({ channelId: groupId }));
          await expect(
            run.channels.send({
              body: 'Replacement',
              observationId: fresh.observationIds[groupId],
            }),
          ).rejects.toMatchObject({ outcome: { reason: 'dropped-exhausted-draft-defer-turn' } });
          outcomes.push('replacement-refused');
        },
        async runAssignment() {},
        requestAssignment() {
          throw Error('unexpected assignment');
        },
        async close() {},
      },
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bob', displayName: 'Bob' });
      groupId = core.channels.createGroup({ name: 'Budget', members: ['ada', 'bob'] }).id;
      core.channels.setGroupWakePolicy(groupId, 'ada', {
        mode: 'silent',
        count: 5,
        intervalSeconds: 30,
      });
      core.channels.setGroupWakePolicy(groupId, 'bob', {
        mode: 'silent',
        count: 5,
        intervalSeconds: 30,
      });
      core.runtime.groupSendReview!.configure(groupId, true);
      for (const id of ['initial-request', 'new-request']) {
        await core.channels.appendMessage(groupId, {
          id,
          at: new Date().toISOString(),
          author: { kind: 'human' },
          body: '@Ada Reply here',
          mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
        });
        core.runtime.admitGroupMessage(groupId, id);
        await core.runtime.whenIdle();
      }
      expect(outcomes).toEqual(['held', 'held', 'requires-review', 'replacement-refused']);
      expect(keptOpen).toContain('initial-request');
      const source = attachOperationalModule(core.operationalDatabase, 'drop-source-test').read(
        (db) =>
          db
            .prepare(
              'SELECT source_event_id FROM channel_placements WHERE channel_id = ? AND message_id = ?',
            )
            .get(groupId, 'initial-request')!.source_event_id,
      );
      expect(keptOpen).toContain(source);
      const admissions = attachOperationalModule(
        core.operationalDatabase,
        'drop-admission-test',
      ).read((db) =>
        db
          .prepare(`SELECT e.message_id, a.resolution FROM inbox_admissions a
          JOIN source_events e ON e.source_event_id = a.source_event_id
          WHERE a.bot_slug = 'ada' AND e.channel_id = ?`)
          .all(groupId),
      );
      expect(admissions.find((row) => row.message_id === 'initial-request')?.resolution).toBeNull();
      expect(admissions.find((row) => row.message_id === 'busy-turn-0')?.resolution).toBe('done');
      expect(
        core.channels
          .readMessages(groupId)
          .filter((m) => m.author.kind === 'bot')
          .map((m) => m.body),
      ).toEqual(['New request answered']);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
      await adapter.close();
    }
  });

  it('holds two rechecks, keeps its budget across new source messages, and audits one explicit override', async () => {
    await fixture(async (f) => {
      const exhausted = await exhaustReview(f);
      await f.human('later-chatter', 'Tea is ready');
      const replacement = await f.tool('channel_send', {
        body: 'New draft cannot reset the budget',
      });
      expect(replacement).toMatchObject({
        status: 'requires-review',
        draftId: exhausted.draftId,
        budget: { used: 2, limit: 2, exhausted: true },
      });
      const read = await f.tool('channel_read', {});
      const ordinary = await f.tool('channel_send', {
        body: 'Meet at 11:00',
        draft_id: exhausted.draftId,
        observation_id: read.observationIds[f.channelId],
      });
      expect(ordinary.reason).toBe('retry-budget-exhausted');
      expect(ordinary.draftVersion).toBe(exhausted.draftVersion);
      expect(Date.parse(ordinary.suggestedSnoozeUntil!)).toBeGreaterThan(Date.now());
      expect(Date.parse(ordinary.suggestedSnoozeUntil!)).toBeLessThanOrEqual(Date.now() + 30_000);
      const override = {
        body: 'Meet at 11:00',
        draft_id: exhausted.draftId,
        observation_id: read.observationIds[f.channelId],
        freshness_override: {
          draftVersion: exhausted.draftVersion,
          reason: 'Only unrelated chatter changed; the requested time remains 11:00.',
        },
      };
      const committed = await f.tool('channel_send', override);
      expect(committed.status).toBe('committed');
      expect(
        f.core.runtime.groupSendReview!.inspect('direct:ada', f.channelId, exhausted.draftId!),
      ).toMatchObject({
        state: 'committed',
        attempts: 2,
        override: {
          count: 1,
          actor: 'direct:ada',
          messageId: committed.messageId,
          reason: override.freshness_override.reason,
          draftVersion: exhausted.draftVersion,
        },
      });
      const repeated = await f.tool('channel_send', override);
      expect(repeated).toMatchObject({ status: 'committed', messageId: committed.messageId });
      expect(
        f.core.channels.readMessages(f.channelId).filter((m) => m.author.kind === 'bot'),
      ).toHaveLength(1);
    });
  });

  it('refuses a correction arriving after the final review and consumes the single explicit attempt', async () => {
    await fixture(async (f) => {
      const exhausted = await exhaustReview(f);
      const read = await f.tool('channel_read', {});
      await f.human('last-correction', 'Correction: meet at 12:00, not 11:00');
      const args = {
        body: 'Meet at 11:00',
        draft_id: exhausted.draftId,
        observation_id: read.observationIds[f.channelId],
        freshness_override: { draftVersion: exhausted.draftVersion, reason: 'Still necessary' },
      };
      const refused = await f.tool('channel_send', args);
      expect(refused).toMatchObject({
        status: 'requires-review',
        reason: 'override-context-changed-defer',
        budget: { used: 2, limit: 2, exhausted: true },
        choices: ['drop', 'snooze-inbox'],
        changedMessageIds: ['last-correction'],
      });
      expect(refused.review?.content).toContain('Correction: meet at 12:00');
      const fresh = await f.tool('channel_read', {});
      expect(
        (
          await f.tool('channel_send', {
            ...args,
            body: 'Meet at 12:00',
            observation_id: fresh.observationIds[f.channelId],
            freshness_override: { draftVersion: refused.draftVersion, reason: 'Corrected' },
          })
        ).reason,
      ).toBe('override-already-attempted-defer');
      expect(
        f.core.channels.readMessages(f.channelId).filter((m) => m.author.kind === 'bot'),
      ).toHaveLength(0);
      expect(
        (await f.tool('channel_send', { body: '', draft_id: exhausted.draftId, drop: true }))
          .status,
      ).toBe('dropped');
    });
  });

  it('requires the current version and actual complete observation before overriding', async () => {
    await fixture(async (f) => {
      const exhausted = await exhaustReview(f);
      const args = {
        body: 'Meet at 11:00',
        draft_id: exhausted.draftId,
        observation_id: 'invented',
        freshness_override: { draftVersion: exhausted.draftVersion, reason: 'Still necessary' },
      };
      expect((await f.tool('channel_send', args)).reason).toBe('override-context-not-observed');
      const partial = await f.tool('channel_read', { limit: 1 });
      expect(
        (
          await f.tool('channel_send', {
            ...args,
            observation_id: partial.observationIds[f.channelId],
          })
        ).reason,
      ).toBe('override-context-not-observed');
      const full = await f.tool('channel_read', {});
      args.observation_id = full.observationIds[f.channelId]!;
      expect((await f.tool('channel_send', args, 'bob')).reason).toBe('draft-unavailable');
      expect(
        (
          await f.tool('channel_send', {
            ...args,
            freshness_override: { draftVersion: 1, reason: 'Stale version' },
          })
        ).reason,
      ).toBe('draft-version-changed');
      expect((await f.tool('channel_send', args)).status).toBe('committed');
    });
  });

  it.each(['membership', 'archive', 'expiry', 'purge', 'stop'] as const)(
    'override cannot bypass %s',
    async (fault) => {
      await fixture(async (f) => {
        const exhausted = await exhaustReview(f);
        const read = await f.tool('channel_read', {});
        const draft = f.core.runtime.groupSendReview!.inspect(
          'direct:ada',
          f.channelId,
          exhausted.draftId!,
        )!;
        if (fault === 'membership') f.core.channels.removeGroupMember(f.channelId, 'ada');
        if (fault === 'archive') f.core.registry.setPaused('ada', true);
        if (fault === 'stop') {
          await f.core.runtime.stopBot!('ada');
          expect(
            f.core.runtime.groupSendReview!.inspect('direct:ada', f.channelId, draft.id),
          ).toMatchObject({ state: 'dropped', terminationReason: 'stopped' });
        }
        if (fault === 'expiry') {
          attachOperationalModule(f.core.operationalDatabase, 'test').transaction((db) => {
            db.prepare('UPDATE group_send_review_drafts SET record_json = ? WHERE id = ?').run(
              JSON.stringify({ ...draft, expires: 0 }),
              draft.id,
            );
          });
        }
        if (fault === 'purge') {
          f.core.channels.deleteGroup(f.channelId);
          const preview = f.core.contentPurge.preview(f.channelId, [draft.sourceEventId]);
          f.core.contentPurge.confirm(f.channelId, preview.sourceEventIds, preview.token);
        }
        const attempt = f.tool('channel_send', {
          body: 'Meet at 11:00',
          draft_id: exhausted.draftId,
          observation_id: read.observationIds[f.channelId],
          freshness_override: { draftVersion: exhausted.draftVersion, reason: 'Necessary' },
        });
        if (fault === 'membership' || fault === 'archive' || fault === 'purge' || fault === 'stop')
          await expect(attempt).rejects.toThrow();
        else expect((await attempt).status).toBe(fault === 'expiry' ? 'expired' : 'refused');
        expect(
          f.core.channels.readMessages(f.channelId).filter((m) => m.author.kind === 'bot'),
        ).toHaveLength(0);
      });
    },
  );
});
