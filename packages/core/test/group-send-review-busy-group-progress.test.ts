import { fixture } from './group-send-review-fixtures.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { describe, expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot } from './helpers.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { SendReviewRequired } from '../src/channels/send-review.js';

async function exhaustReview(f: Parameters<Parameters<typeof fixture>[0]>[0]) {
  await f.human('busy-question', 'Meet at 11:00');
  const initial = await f.tool('channel_read', {});
  await f.human('busy-0', 'Coffee is ready');
  let outcome = await f.tool('bot_send_message', {
    body: 'Meet at 11:00',
    observation_id: initial.observationIds[f.channelId],
  });
  for (let i = 1; i <= 2; i++) {
    const read = await f.tool('channel_read', {});
    await f.human(`busy-${i}`, `Unrelated chatter ${i}`);
    outcome = await f.tool('bot_send_message', {
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
            await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, groupId, {
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
                'channel_action',
                {
                  action: 'drop',
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
      groupId = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Budget',
        members: ['ada', 'bob'],
      }).id;
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
        await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, groupId, {
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
      const replacement = await f.tool('bot_send_message', {
        body: 'New draft cannot reset the budget',
      });
      expect(replacement).toMatchObject({
        status: 'requires-review',
        draftId: exhausted.draftId,
        budget: { used: 2, limit: 2, exhausted: true },
      });
      const read = await f.tool('channel_read', {});
      const ordinary = await f.tool('bot_send_message', {
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
      const committed = await f.tool('bot_send_message', override);
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
      const repeated = await f.tool('bot_send_message', override);
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
      const refused = await f.tool('bot_send_message', args);
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
          await f.tool('bot_send_message', {
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
        (
          await f.tool('bot_send_message', {
            body: '',
            draft_id: exhausted.draftId,
            action: 'drop',
          })
        ).status,
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
      expect((await f.tool('bot_send_message', args)).reason).toBe('override-context-not-observed');
      const partial = await f.tool('channel_read', { limit: 1 });
      expect(
        (
          await f.tool('bot_send_message', {
            ...args,
            observation_id: partial.observationIds[f.channelId],
          })
        ).reason,
      ).toBe('override-context-not-observed');
      const full = await f.tool('channel_read', {});
      args.observation_id = full.observationIds[f.channelId]!;
      expect((await f.tool('bot_send_message', args, 'bob')).reason).toBe('draft-unavailable');
      expect(
        (
          await f.tool('bot_send_message', {
            ...args,
            freshness_override: { draftVersion: 1, reason: 'Stale version' },
          })
        ).reason,
      ).toBe('draft-version-changed');
      expect((await f.tool('bot_send_message', args)).status).toBe('committed');
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
          const preview = f.core.contentPurge.preview(OWNER_HUMAN_CONTEXT, f.channelId, [
            draft.sourceEventId,
          ]);
          f.core.contentPurge.confirm(
            OWNER_HUMAN_CONTEXT,
            f.channelId,
            preview.sourceEventIds,
            preview.token,
          );
        }
        const attempt = f.tool('bot_send_message', {
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
