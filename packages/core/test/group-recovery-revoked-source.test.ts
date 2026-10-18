import { describe, expect, it } from 'vitest';
import { attachOperationalModule } from '../src/database/owner.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

async function interruptedGroup(input: { revoked: boolean; sideEffect: boolean; opened: boolean }) {
  const home = createTempRoot('group-recovery-revoked-source-');
  const runs: string[] = [];
  const steered: string[] = [];
  const sendErrors: unknown[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const agents: BotAgentAdapter = {
    async runOrchestrator(run) {
      runs.push(run.message);
      await gate;
      try {
        await run.channels.send({ channelId: 'dm-aura', body: 'The original task has stopped.' });
        run.triage?.resolve({ ids: ['new-dm-status'], outcome: 'done' });
      } catch (error) {
        sendErrors.push(error);
      }
    },
    steerOrchestrator(_slug, text) {
      steered.push(text);
      return true;
    },
    async runAssignment() {},
    requestAssignment() {
      throw new Error('No Assignment expected');
    },
    async close() {},
  };
  let core = createCore({ dshHome: home, agents, triageContinuation: true });
  try {
    core.registry.create({ slug: 'aura', displayName: 'Aura' });
    const group = core.channels.createGroup({ name: 'Recovery', members: ['aura'] });
    core.channels.getOrCreateDm('aura', 'Aura');
    core.runtime.groupSendReview!.configure(group.id, true);
    await core.channels.appendMessage(group.id, {
      id: 'old-group-request',
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: '@Aura old group request',
      mentions: [{ botSlug: 'aura', label: 'Aura', start: 0, end: 5 }],
    });
    if (input.revoked) core.channels.removeGroupMember(group.id, 'aura');
    attachOperationalModule(core.operationalDatabase, 'interrupted-group-fixture').transaction(
      (db) => {
        db.prepare(`UPDATE inbox_admissions
        SET attempt_state = 'running', handled_at = NULL, last_error = NULL,
            observed_at = ?, opened_at = ?, side_effect_started_at = ?
        WHERE reason = 'group-mention' AND bot_slug = 'aura'`).run(
          '2026-10-18T00:00:00.000Z',
          input.opened ? '2026-10-18T00:00:00.000Z' : null,
          input.sideEffect ? '2026-10-18T00:00:00.000Z' : null,
        );
      },
    );
    await core.runtime.close();
    core.operationalDatabase.close();
    core = createCore({ dshHome: home, agents, triageContinuation: true });
    await new Promise((resolve) => setImmediate(resolve));
    const restoredBeforeDm = runs.length;
    await core.channels.appendMessage('dm-aura', {
      id: 'new-dm-status',
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: 'A new private question: confirm the old task stopped without repeating its facts.',
    });
    const admission = core.runtime.admitDmMessage({
      channelId: 'dm-aura',
      messageId: 'new-dm-status',
      body: 'Please confirm the old task stopped.',
    });
    release();
    if (!admission.admitted) throw new Error('New Human DM was not admitted');
    await admission.settled;
    await core.runtime.whenIdle();
    const old = attachOperationalModule(core.operationalDatabase, 'recovery-result').read((db) =>
      db
        .prepare(`SELECT attempt_state, ignored_at, ignored_by_session_id, observed_at,
        resolved_at, last_error FROM inbox_admissions WHERE reason = 'group-mention'
        AND bot_slug = 'aura'`)
        .get(),
    );
    return {
      restoredBeforeDm,
      runs,
      steered,
      sendErrors,
      old,
      delivered: core.channels
        .readMessages('dm-aura')
        .filter(
          (message) =>
            message.author.kind === 'bot' && message.body === 'The original task has stopped.',
        ).length,
    };
  } finally {
    release();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
}

describe('recovery after a running Group task loses membership', () => {
  it.each([false, true])(
    'keeps a new DM independent of revoked work (previously opened: %s)',
    async (opened) => {
      const result = await interruptedGroup({ revoked: true, sideEffect: false, opened });
      expect(result.restoredBeforeDm).toBe(0);
      expect(result.steered).toEqual([]);
      expect(result.sendErrors).toEqual([]);
      expect(result.delivered).toBe(1);
      expect(result.runs).toHaveLength(1);
      expect(result.old).toMatchObject({
        attempt_state: 'handled',
        ignored_at: expect.any(String),
        ignored_by_session_id: null,
        observed_at: null,
        resolved_at: null,
        last_error: 'Group membership revoked during recovery',
      });
    },
  );

  it('keeps uncertain side effects in repair instead of pretending the old task was ignored', async () => {
    const result = await interruptedGroup({ revoked: true, sideEffect: true, opened: true });
    expect(result.restoredBeforeDm).toBe(0);
    expect(result.delivered).toBe(1);
    expect(result.sendErrors).toEqual([]);
    expect(result.old).toMatchObject({
      attempt_state: 'needs-repair',
      ignored_at: null,
      resolved_at: null,
    });
  });

  it('still recovers the original pending task when membership remains valid', async () => {
    const result = await interruptedGroup({ revoked: false, sideEffect: false, opened: false });
    expect(result.restoredBeforeDm).toBe(1);
    expect(result.steered).toHaveLength(1);
    expect(result.sendErrors).toEqual([]);
    expect(result.old).toMatchObject({ ignored_at: null, last_error: null });
  });
});
