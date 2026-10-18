import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { createCore } from '../src/plugin.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot } from './helpers.js';

function open(dshHome: string) {
  return createCore({
    dshHome,
    agents: createDshBotAgentAdapter({
      agents: new FakeAgentHost({ kind: 'completed' }),
      orchestratorCwd: (bot) => `/memory/${bot.slug}`,
      ensureWorkspace: () => undefined,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    }),
  });
}

async function fixture(
  check: (f: {
    current(): ReturnType<typeof createCore>;
    channelId: string;
    restart(): Promise<void>;
    human(id: string, body: string): Promise<void>;
    tool(
      args: Record<string, unknown>,
      bot?: string,
    ): Promise<{
      status?: string;
      reason?: string;
      draftVersion: number;
      budget?: { used: number; limit: number; exhausted: boolean };
      draftId: string;
      messageId: string;
      review: { observationId: string };
      drafts: { state: string; draftId: string; messageId: string }[];
    }>;
    read(args?: Record<string, unknown>): Promise<string>;
  }) => Promise<void>,
) {
  const home = createTempRoot('group-send-recovery-');
  let core = open(home);
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  core.registry.create({ slug: 'bob', displayName: 'Bob' });
  const group = core.channels.createGroup({ name: 'Recovery', members: ['ada', 'bob'] });
  for (const bot of group.members)
    core.channels.setGroupWakePolicy(group.id, bot, {
      mode: 'silent',
      count: 5,
      intervalSeconds: 30,
    });
  core.runtime.groupSendReview!.configure(group.id, true);
  const call = async (name: string, args: Record<string, unknown>, bot = 'ada') =>
    (
      await core.runtime.runDirectBotTool!(
        bot,
        name,
        { channel_id: group.id, ...args },
        new AbortController().signal,
      )
    ).result;
  try {
    await check({
      current: () => core,
      channelId: group.id,
      restart: async () => {
        await core.runtime.close();
        core.operationalDatabase.close();
        core = open(home);
      },
      human: async (id, body) => {
        await core.channels.appendMessage(group.id, {
          id,
          body,
          author: { kind: 'human' },
          at: new Date().toISOString(),
        });
      },
      tool: async (args, bot) => JSON.parse(JSON.stringify(await call('channel_send', args, bot))),
      read: async (args = {}) =>
        JSON.parse(JSON.stringify(await call('channel_read', args))).observationIds[group.id],
    });
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
}

describe('explicit Group draft recovery and commit receipts', () => {
  it('recovers an exhausted draft with a fresh post-restart read without resetting its budget', async () => {
    await fixture(async (f) => {
      await f.human('request', 'Meet at 10:00');
      for (let i = 0; i < 12; i++) await f.read();
      let held = await f.tool({ body: 'Meet at 10:00' });
      for (let i = 0; i < 2; i++) {
        const observation = await f.read();
        await f.human(`chatter-${i}`, `Unrelated context ${i}`);
        held = await f.tool({
          body: 'Meet at 10:00',
          draft_id: held.draftId,
          observation_id: observation,
        });
      }
      expect(held).toMatchObject({
        status: 'requires-review',
        budget: { used: 2, limit: 2, exhausted: true },
      });
      const before = f
        .current()
        .runtime.groupSendReview!.inspect('direct:ada', f.channelId, held.draftId)!;
      expect(before.requiredObservationSerial).toBeGreaterThan(10);
      await f.restart();
      const db = attachOperationalModule(
        f.current().operationalDatabase,
        'recovery-correction-test',
      );
      db.transaction((database) =>
        database
          .prepare(`UPDATE source_events SET body = 'Meet at 11:00'
        WHERE source_event_id = (SELECT source_event_id FROM channel_placements WHERE channel_id = ? AND message_id = 'request')`)
          .run(f.channelId),
      );
      const args = {
        body: 'Meet at 11:00',
        review_action: 'recover',
        draft_id: held.draftId,
        observation_id: await f.read(),
      };
      expect(await f.tool(args)).toMatchObject({
        reason: 'retry-budget-exhausted',
        draftVersion: held.draftVersion,
      });
      const inspection = await f.tool({
        body: '',
        review_action: 'inspect',
        draft_id: held.draftId,
      });
      expect(inspection).toMatchObject({
        drafts: [{ state: 'requires-review', requiresRecovery: true }],
      });
      const override = {
        ...args,
        freshness_override: {
          draftVersion: held.draftVersion,
          reason: 'The corrected notice is still requested.',
        },
      };
      const committed = await f.tool(override);
      expect(committed.status).toBe('committed');
      const record = f
        .current()
        .runtime.groupSendReview!.inspect('direct:ada', f.channelId, held.draftId)!;
      expect(record).toMatchObject({
        expires: before.expires,
        attempts: 2,
        version: held.draftVersion + 1,
        committed: { messageId: committed.messageId },
        override: { count: 1, messageId: committed.messageId },
        original: { body: '' },
        current: { body: '' },
        basis: [],
        initialBasis: [],
      });
      expect(record.boot).not.toBe(before.boot);
      expect(record.recoveredAt).toBeDefined();
      const counts = () =>
        attachOperationalModule(f.current().operationalDatabase, 'recovery-count-test').read(
          (database) =>
            ['source_events', 'channel_placements', 'inbox_admissions'].map(
              (table) => database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n,
            ),
        );
      const canonicalCounts = counts();
      await f.restart();
      expect(await f.tool(override)).toMatchObject({
        status: 'committed',
        messageId: committed.messageId,
      });
      expect(counts()).toEqual(canonicalCounts);
      expect(await f.tool({ ...override, body: 'Different intent' })).toMatchObject({
        reason: 'draft-commit-content-changed',
      });
      expect(counts()).toEqual(canonicalCounts);
      expect(
        f.current().runtime.groupSendReview!.inspect('direct:ada', f.channelId, held.draftId)!
          .override,
      ).toEqual(record.override);
    });
  });

  it('does not replenish a spent override after another restart', async () => {
    await fixture(async (f) => {
      await f.human('request', 'Meet at 10:00');
      let held = await f.tool({ body: 'Meet at 10:00' });
      for (let i = 0; i < 2; i++) {
        const observation = await f.read();
        await f.human(`chatter-${i}`, `Context ${i}`);
        held = await f.tool({
          body: 'Meet at 10:00',
          draft_id: held.draftId,
          observation_id: observation,
        });
      }
      await f.restart();
      const observation = await f.read();
      await f.human('correction', 'Meet at 11:00 instead');
      const refused = await f.tool({
        body: 'Meet at 10:00',
        review_action: 'recover',
        draft_id: held.draftId,
        observation_id: observation,
        freshness_override: {
          draftVersion: held.draftVersion,
          reason: 'Notice remains necessary.',
        },
      });
      expect(refused).toMatchObject({
        reason: 'override-context-changed-defer',
        budget: { used: 2, limit: 2, exhausted: true },
      });
      const spent = f
        .current()
        .runtime.groupSendReview!.inspect('direct:ada', f.channelId, held.draftId)!;
      await f.restart();
      expect(
        await f.tool({
          body: 'Meet at 11:00',
          review_action: 'recover',
          draft_id: held.draftId,
          observation_id: await f.read(),
          freshness_override: { draftVersion: refused.draftVersion, reason: 'Corrected notice.' },
        }),
      ).toMatchObject({ reason: 'override-already-attempted-defer' });
      expect(
        f.current().runtime.groupSendReview!.inspect('direct:ada', f.channelId, held.draftId),
      ).toMatchObject({
        expires: spent.expires,
        attempts: 2,
        version: spent.version,
        overrideAttemptedAt: spent.overrideAttemptedAt,
      });
      expect(
        f
          .current()
          .channels.readMessages(f.channelId)
          .filter((m) => m.author.kind === 'bot'),
      ).toHaveLength(0);
    });
  });

  it('refuses an incomplete recovery override observation and inspection with mutation arguments', async () => {
    await fixture(async (f) => {
      await f.human('request', 'Meet at 10:00');
      let held = await f.tool({ body: 'Meet at 10:00' });
      for (let i = 0; i < 2; i++) {
        const observation = await f.read();
        await f.human(`chatter-${i}`, `Context ${i}`);
        held = await f.tool({
          body: 'Meet at 10:00',
          draft_id: held.draftId,
          observation_id: observation,
        });
      }
      await f.restart();
      const freshness_override = { draftVersion: held.draftVersion, reason: 'Still requested.' };
      await expect(
        f.tool({ body: '', review_action: 'inspect', draft_id: held.draftId, freshness_override }),
      ).rejects.toThrow('draft inspection cannot');
      expect(
        await f.tool({
          body: 'Meet at 10:00',
          review_action: 'recover',
          draft_id: held.draftId,
          observation_id: await f.read({ limit: 1 }),
          freshness_override,
        }),
      ).toMatchObject({ reason: 'override-context-not-observed' });
      const still = f
        .current()
        .runtime.groupSendReview!.inspect('direct:ada', f.channelId, held.draftId)!;
      expect(still.overrideAttemptedAt).toBeUndefined();
      expect(still.attempts).toBe(2);
    });
  });

  it.each(['stop', 'expiry', 'revoke'] as const)(
    'cannot use recovery plus override to bypass %s',
    async (fault) => {
      await fixture(async (f) => {
        await f.human('request', 'Meet at 10:00');
        let held = await f.tool({ body: 'Meet at 10:00' });
        for (let i = 0; i < 2; i++) {
          const observation = await f.read();
          await f.human(`chatter-${i}`, `Context ${i}`);
          held = await f.tool({
            body: 'Meet at 10:00',
            draft_id: held.draftId,
            observation_id: observation,
          });
        }
        if (fault === 'stop') await f.current().runtime.stopBot!('ada');
        if (fault === 'expiry')
          attachOperationalModule(
            f.current().operationalDatabase,
            'exhausted-expiry-test',
          ).transaction((database) =>
            database
              .prepare(
                "UPDATE group_send_review_drafts SET record_json = json_set(record_json, '$.expires', 0) WHERE id = ?",
              )
              .run(held.draftId),
          );
        if (fault === 'revoke') f.current().channels.removeGroupMember(f.channelId, 'ada');
        await f.restart();
        const args = {
          body: 'Meet at 10:00',
          review_action: 'recover',
          draft_id: held.draftId,
          observation_id: fault === 'revoke' ? 'unavailable' : await f.read(),
          freshness_override: { draftVersion: held.draftVersion, reason: 'Still requested.' },
        };
        if (fault === 'revoke') await expect(f.tool(args)).rejects.toThrow(/not a member/);
        else
          expect(await f.tool(args)).toMatchObject({
            reason: fault === 'expiry' ? 'draft-expired' : 'draft-terminal',
          });
        expect(
          f
            .current()
            .channels.readMessages(f.channelId)
            .filter((m) => m.author.kind === 'bot'),
        ).toHaveLength(0);
      });
    },
  );

  it('can use its remaining recheck after an incomplete recovery read without replacing the draft', async () => {
    await fixture(async (f) => {
      await f.human('request', 'Meet at 10:00');
      const held = await f.tool({ body: 'Meet at 10:00' });
      await f.restart();
      await f.human('correction', 'Meet at 11:00');
      const partial = await f.read({ text: 'Meet at 10:00' });
      expect(
        await f.tool({
          body: 'Meet at 10:00',
          review_action: 'recover',
          draft_id: held.draftId,
          observation_id: partial,
        }),
      ).toMatchObject({
        status: 'held',
        draftId: held.draftId,
        budget: { used: 1, limit: 2, exhausted: false },
      });
      const complete = await f.read();
      const sent = await f.tool({
        body: 'Meet at 11:00',
        draft_id: held.draftId,
        observation_id: complete,
      });
      expect(sent.status).toBe('committed');
      expect(
        f.current().runtime.groupSendReview!.inspect('direct:ada', f.channelId, held.draftId),
      ).toMatchObject({ attempts: 2, committed: { messageId: sent.messageId } });
      expect(
        f
          .current()
          .channels.readMessages(f.channelId)
          .filter((m) => m.author.kind === 'bot'),
      ).toEqual([expect.objectContaining({ id: sent.messageId, body: 'Meet at 11:00' })]);
    });
  });

  it('holds recovery when an attachment changes after the fresh observation', async () => {
    await fixture(async (f) => {
      const ref = await f.current().attachments.upload({
        name: 'agenda.txt',
        data: (async function* () {
          yield Buffer.from('Meet at 10:00');
        })(),
      });
      await f.current().channels.appendMessage(f.channelId, {
        id: 'attachment-request',
        body: 'Summarize this agenda',
        author: { kind: 'human' },
        at: new Date().toISOString(),
        attachments: [ref],
      });
      const held = await f.tool({ body: 'Meet at 10:00' });
      await f.restart();
      const observation = await f.read();
      writeFileSync(f.current().attachments.fileTarget(ref.fileId!).path, 'Meet at 11:00');
      expect(
        await f.tool({
          body: 'Meet at 10:00',
          review_action: 'recover',
          draft_id: held.draftId,
          observation_id: observation,
        }),
      ).toMatchObject({
        status: 'held',
        budget: { used: 1, limit: 2, exhausted: false },
        changedMessageIds: ['attachment-request'],
      });
      expect(
        f
          .current()
          .channels.readMessages(f.channelId)
          .filter((m) => m.author.kind === 'bot'),
      ).toHaveLength(0);
      const sent = await f.tool({
        body: 'Meet at 11:00',
        draft_id: held.draftId,
        observation_id: await f.read(),
      });
      expect(sent.status).toBe('committed');
      expect(
        f.current().runtime.groupSendReview!.inspect('direct:ada', f.channelId, held.draftId),
      ).toMatchObject({ attempts: 2, committed: { messageId: sent.messageId } });
    });
  });

  it.each(['drop', 'stop'] as const)(
    'does not revive a draft after %s and restart',
    async (action) => {
      await fixture(async (f) => {
        await f.human('request', 'Do not send after cancellation');
        const held = await f.tool({ body: 'Cancelled notice' });
        if (action === 'stop') await f.current().runtime.stopBot!('ada');
        else await f.tool({ body: '', drop: true, draft_id: held.draftId });
        await f.restart();
        expect(
          await f.tool({
            body: 'Cancelled notice',
            review_action: 'recover',
            draft_id: held.draftId,
            observation_id: await f.read(),
          }),
        ).toMatchObject({ status: 'refused', reason: 'draft-terminal' });
        expect(
          f
            .current()
            .channels.readMessages(f.channelId)
            .filter((m) => m.author.kind === 'bot'),
        ).toHaveLength(0);
      });
    },
  );

  it('still holds a correction that arrives after the recovery observation', async () => {
    await fixture(async (f) => {
      await f.human('request', 'Meet at 10:00');
      const held = await f.tool({ body: 'Meet at 10:00' });
      await f.restart();
      const observation = await f.read();
      await f.human('correction', 'Actually 11:00');
      expect(
        await f.tool({
          body: 'Meet at 10:00',
          review_action: 'recover',
          draft_id: held.draftId,
          observation_id: observation,
        }),
      ).toMatchObject({ status: 'held', budget: { used: 1, limit: 2, exhausted: false } });
      expect(
        f
          .current()
          .channels.readMessages(f.channelId)
          .filter((m) => m.author.kind === 'bot'),
      ).toHaveLength(0);
    });
  });

  it('removes receipt metadata with canonical purge and cannot inspect it across Groups', async () => {
    await fixture(async (f) => {
      await f.human('request', 'Private request');
      const held = await f.tool({ body: 'Private draft' });
      const other = f.current().channels.createGroup({ name: 'Other', members: ['ada'] });
      expect(
        await f.tool({
          body: '',
          review_action: 'inspect',
          channel_id: other.id,
          draft_id: held.draftId,
        }),
      ).toMatchObject({ status: 'refused', reason: 'draft-unavailable' });
      const draft = f
        .current()
        .runtime.groupSendReview!.inspect('direct:ada', f.channelId, held.draftId)!;
      f.current().channels.deleteGroup(f.channelId);
      const preview = f.current().contentPurge.preview(f.channelId, [draft.sourceEventId]);
      f.current().contentPurge.confirm(f.channelId, preview.sourceEventIds, preview.token);
      expect(
        f
          .current()
          .runtime.groupSendReview!.inspectRecords('direct:ada', f.channelId, held.draftId),
      ).toMatchObject({ status: 'refused', reason: 'draft-unavailable' });
    });
  });

  it('requires a fresh observation after a real Core restart and commits only the corrected draft', async () => {
    await fixture(async (f) => {
      await f.human('request', 'Meet at 10:00');
      const held = await f.tool({ body: 'Meet at 10:00' });
      const oldObservation = held.review.observationId;
      await f.restart();
      await f.human('correction', 'Actually 11:00');
      const inspection = await f.tool({
        body: '',
        review_action: 'inspect',
        draft_id: held.draftId,
      });
      expect(inspection).toMatchObject({
        status: 'inspected',
        drafts: [{ draftId: held.draftId, state: 'held', requiresRecovery: true }],
      });
      expect(JSON.stringify(inspection)).not.toContain('Meet at');
      expect(
        await f.tool({
          body: 'Meet at 10:00',
          draft_id: held.draftId,
          observation_id: oldObservation,
        }),
      ).toMatchObject({ status: 'requires-review', reason: 'host-restarted' });
      expect(
        await f.tool({
          body: 'Meet at 11:00',
          draft_id: held.draftId,
          observation_id: oldObservation,
          review_action: 'recover',
        }),
      ).toMatchObject({
        status: 'refused',
        reason: 'recovery-requires-draft-and-fresh-observation',
      });
      const result = await f.tool({
        body: 'Meet at 11:00',
        draft_id: held.draftId,
        observation_id: await f.read(),
        review_action: 'recover',
      });
      expect(result.status).toBe('committed');
      const replies = f
        .current()
        .channels.readMessages(f.channelId)
        .filter((m) => m.author.kind === 'bot');
      expect(replies).toHaveLength(1);
      expect(replies[0]).toMatchObject({ id: result.messageId, body: 'Meet at 11:00' });
    });
  });

  it('confirms the same canonical commit after its response is discarded, including after restart', async () => {
    await fixture(async (f) => {
      await f.human('request', 'Meet at 11:00');
      const held = await f.tool({ body: 'Meet at 11:00' });
      await f.tool({
        body: 'Meet at 11:00',
        draft_id: held.draftId,
        observation_id: held.review.observationId,
      });
      const before = f.current().channels.readMessages(f.channelId);
      const db = attachOperationalModule(f.current().operationalDatabase, 'receipt-test');
      const admissions = db.read(
        (database) => database.prepare('SELECT COUNT(*) AS n FROM inbox_admissions').get()!.n,
      );
      await f.restart();
      const receipt = await f.tool({ body: '', review_action: 'inspect', draft_id: held.draftId });
      expect(receipt).toMatchObject({
        status: 'inspected',
        drafts: [{ state: 'committed', requiresRecovery: false }],
      });
      const replay = await f.tool({ body: 'Meet at 11:00', draft_id: held.draftId });
      expect(replay.messageId).toBe(receipt.drafts[0]!.messageId);
      expect(
        f
          .current()
          .channels.readMessages(f.channelId)
          .map((m) => m.id),
      ).toEqual(before.map((m) => m.id));
      const after = attachOperationalModule(f.current().operationalDatabase, 'receipt-test');
      expect(
        after.read(
          (database) => database.prepare('SELECT COUNT(*) AS n FROM inbox_admissions').get()!.n,
        ),
      ).toBe(admissions);
      expect(await f.tool({ body: 'Different notice', draft_id: held.draftId })).toMatchObject({
        status: 'refused',
        reason: 'draft-commit-content-changed',
      });
      expect(await f.tool({ body: 'Meet at 11:00', draft_id: held.draftId }, 'bob')).toMatchObject({
        status: 'refused',
        reason: 'draft-unavailable',
      });
    });
  });

  it('retains a receipt for an uninterrupted send without an additional model round', async () => {
    await fixture(async (f) => {
      await f.human('request', 'A single notice');
      const result = await f.tool({ body: 'A single notice', observation_id: await f.read() });
      expect(result.status).toBe('committed');
      const inspected = await f.tool({ body: '', review_action: 'inspect' });
      expect(inspected.drafts).toHaveLength(1);
      expect(inspected.drafts[0]!.messageId).toBe(result.messageId);
      expect(
        await f.tool({ body: 'A single notice', draft_id: inspected.drafts[0]!.draftId }),
      ).toMatchObject({ messageId: result.messageId });
      expect(
        f
          .current()
          .channels.readMessages(f.channelId)
          .filter((m) => m.author.kind === 'bot'),
      ).toHaveLength(1);
    });
  });

  it('removes committed receipt authority when the canonical Channel content is purged', async () => {
    await fixture(async (f) => {
      await f.human('request', 'Private notice');
      const committed = await f.tool({ body: 'Private notice', observation_id: await f.read() });
      const receipt = await f.tool({ body: '', review_action: 'inspect' });
      const draftId = receipt.drafts[0]!.draftId;
      const db = attachOperationalModule(f.current().operationalDatabase, 'receipt-purge-test');
      const source = db.read(
        (database) =>
          database
            .prepare(
              'SELECT source_event_id FROM channel_placements WHERE channel_id = ? AND message_id = ?',
            )
            .get(f.channelId, committed.messageId)!.source_event_id,
      );
      f.current().channels.deleteGroup(f.channelId);
      const preview = f.current().contentPurge.preview(f.channelId, [String(source)]);
      f.current().contentPurge.confirm(f.channelId, preview.sourceEventIds, preview.token);
      await f.restart();
      expect(
        f.current().runtime.groupSendReview!.inspectRecords('direct:ada', f.channelId, draftId),
      ).toMatchObject({ status: 'refused', reason: 'draft-unavailable' });
      expect(f.current().channels.message(f.channelId, committed.messageId)).toMatchObject({
        body: '',
        contentPurge: { reason: 'human-request' },
      });
    });
  });

  it('does not inspect or recover another owner, an expired draft, or a revoked Group', async () => {
    await fixture(async (f) => {
      await f.human('request', 'Private request');
      const held = await f.tool({ body: 'Private draft' });
      expect(
        await f.tool({ body: '', review_action: 'inspect', draft_id: held.draftId }, 'bob'),
      ).toMatchObject({ status: 'refused', reason: 'draft-unavailable' });
      const db = attachOperationalModule(f.current().operationalDatabase, 'expiry-test');
      db.transaction((database) =>
        database
          .prepare(
            "UPDATE group_send_review_drafts SET record_json = json_set(record_json, '$.expires', 0) WHERE id = ?",
          )
          .run(held.draftId),
      );
      expect(
        await f.tool({ body: '', review_action: 'inspect', draft_id: held.draftId }),
      ).toMatchObject({ drafts: [{ state: 'expired' }] });
      expect(
        await f.tool({
          body: 'Private draft',
          draft_id: held.draftId,
          review_action: 'recover',
          observation_id: await f.read(),
        }),
      ).toMatchObject({ status: 'expired' });
      f.current().channels.removeGroupMember(f.channelId, 'ada');
      await expect(
        f.tool({ body: '', review_action: 'inspect', draft_id: held.draftId }),
      ).rejects.toThrow(/not a member/);
      expect(
        f
          .current()
          .channels.readMessages(f.channelId)
          .filter((m) => m.author.kind === 'bot'),
      ).toHaveLength(0);
    });
  });
});
