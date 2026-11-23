import { describe, expect, it, vi } from 'vitest';
import { attachOperationalModule } from '../src/database/owner.js';
import { FIXED_NOW } from './helpers.js';
import { TEST_GRANT_ID } from './workspace-grant-fixture.js';
import { createSessionOwnership } from '../src/sessions/ownership.js';
import { setup } from './assignment-collaboration-fixtures.js';

async function idleNativeAssignment(options: { assignmentConcurrencyLimit?: number } = {}) {
  const fixture = await setup(options);
  await fixture.admit('Start', 'native-assignment');
  const created = fixture.agents.access!.create({
    title: 'Assignment',
    grantId: TEST_GRANT_ID,
    description: 'Background child',
  });
  if (created.outcome !== 'created') throw new Error('Assignment missing');
  const sessionId = created.assignment.sessionId;
  fixture.agents.finish(sessionId);
  await fixture.runtime.whenIdle();
  const ownership = createSessionOwnership(attachOperationalModule(fixture.owner, 'wake-test'));
  ownership.claim({
    sessionId: 'native-child',
    botSlug: 'ada',
    rootRole: 'assignment',
    parentSessionId: sessionId,
    provenance: 'subagent',
    at: FIXED_NOW().toISOString(),
  });
  return { ...fixture, sessionId, ownership };
}

describe('Assignment collaboration', () => {
  it.each([
    'no-sender',
    'unknown-sender',
    'foreign-sender',
    'not-subagent',
    'aborted',
    'requested',
    'stopped',
    'archived',
    'error',
    'grant-revoked',
    'grant-mismatch',
    'bot-paused',
    'source-purged',
    'channel-ended',
  ])('refuses idle native Assignment admission at the %s boundary', async (boundary) => {
    const fixture = await idleNativeAssignment();
    const { runtime, agents, owner, registry, grants, sessionId, ownership, close } = fixture;
    const controller = new AbortController();
    let senders = ['native-child'];
    try {
      if (boundary === 'no-sender') senders = [];
      if (boundary === 'unknown-sender') senders = ['unknown'];
      if (boundary === 'foreign-sender' || boundary === 'not-subagent') {
        ownership.claim({
          sessionId: 'untrusted',
          botSlug: boundary === 'foreign-sender' ? 'other' : 'ada',
          rootRole: 'assignment',
          parentSessionId: sessionId,
          provenance: boundary === 'not-subagent' ? 'fork' : 'subagent',
          at: FIXED_NOW().toISOString(),
        });
        senders = ['untrusted'];
      }
      if (boundary === 'aborted') controller.abort();
      if (boundary === 'grant-revoked') grants.revoke('ada', TEST_GRANT_ID);
      if (boundary === 'bot-paused') registry.setPaused('ada', true);
      attachOperationalModule(owner, 'wake-boundary-test').transaction((database) => {
        if (boundary === 'requested' || boundary === 'stopped')
          database
            .prepare('UPDATE assignments SET stop_state = ? WHERE session_id = ?')
            .run(boundary, sessionId);
        if (boundary === 'archived')
          database
            .prepare('UPDATE assignments SET archived_at = ? WHERE session_id = ?')
            .run(FIXED_NOW().toISOString(), sessionId);
        if (boundary === 'error')
          database
            .prepare("UPDATE assignments SET activity = 'error' WHERE session_id = ?")
            .run(sessionId);
        if (boundary === 'grant-mismatch')
          database
            .prepare("UPDATE assignments SET primary_cwd = '/wrong' WHERE session_id = ?")
            .run(sessionId);
        if (boundary === 'source-purged')
          database
            .prepare(
              "INSERT INTO messaging_purge_facts SELECT source_event_id, channel_id, message_id, created_at, '{}' FROM source_events WHERE source_event_id = (SELECT source_event_id FROM assignments WHERE session_id = ?)",
            )
            .run(sessionId);
        if (boundary === 'channel-ended')
          database
            .prepare(
              "UPDATE inbox_admissions SET last_error = 'channel-ended' WHERE source_event_id = (SELECT source_event_id FROM assignments WHERE session_id = ?)",
            )
            .run(sessionId);
      });
      expect(
        await runtime.prepareNativeOrchestratorStep!(sessionId, senders, controller.signal),
      ).toBe(false);
      expect(agents.started).toHaveLength(1);
      expect(runtime.getAssignment('ada', sessionId)?.activity).not.toBe('working');
    } finally {
      await close();
    }
  });

  it.each(['stop', 'grant', 'purge', 'archive'])(
    'rechecks %s after native wake readiness before executing a report',
    async (boundary) => {
      const { runtime, agents, owner, grants, sessionId, close } = await idleNativeAssignment();
      const signal = new AbortController().signal;
      try {
        expect(
          await runtime.prepareNativeOrchestratorStep!(sessionId, ['native-child'], signal),
        ).toBe(true);
        if (boundary === 'stop') await agents.access!.stop(sessionId);
        if (boundary === 'grant') grants.revoke('ada', TEST_GRANT_ID);
        if (boundary === 'purge')
          attachOperationalModule(owner, 'wake-purge-test').transaction((database) => {
            database
              .prepare(
                "INSERT INTO messaging_purge_facts SELECT source_event_id, channel_id, message_id, created_at, '{}' FROM source_events WHERE source_event_id = (SELECT source_event_id FROM assignments WHERE session_id = ?)",
              )
              .run(sessionId);
          });
        if (boundary === 'archive')
          attachOperationalModule(owner, 'wake-archive-test').transaction((database) => {
            database
              .prepare('UPDATE assignments SET archived_at = ? WHERE session_id = ?')
              .run(FIXED_NOW().toISOString(), sessionId);
          });
        const report = vi.fn(async () => undefined);
        await expect(
          runtime.runAssignmentTool!(sessionId, 'report', Symbol(), signal, report),
        ).rejects.toThrow('execution authority is unavailable');
        expect(report).not.toHaveBeenCalled();
        expect(
          await runtime.prepareNativeOrchestratorStep!(sessionId, ['native-child'], signal),
        ).toBe(false);
        agents.finish(sessionId);
      } finally {
        await close();
      }
    },
  );

  it('keeps active native steps constant-work with no polling, subscriptions or duplicate runs', async () => {
    const { runtime, agents, owner, sessionId, close } = await idleNativeAssignment();
    const subscribe = vi.spyOn(owner, 'subscribe');
    const timer = vi.spyOn(globalThis, 'setTimeout');
    try {
      expect(
        await runtime.prepareNativeOrchestratorStep!(
          sessionId,
          ['native-child'],
          new AbortController().signal,
        ),
      ).toBe(true);
      const before = agents.started.length;
      for (let index = 0; index < 100; index += 1)
        expect(
          await runtime.prepareNativeOrchestratorStep!(sessionId, [], new AbortController().signal),
        ).toBe(true);
      expect(agents.started).toHaveLength(before);
      expect(subscribe).not.toHaveBeenCalled();
      expect(timer).not.toHaveBeenCalled();
      agents.finish(sessionId);
    } finally {
      timer.mockRestore();
      await close();
    }
  });

  it('cancels preparation waiting on an existing run and preserves that run', async () => {
    const { runtime, agents, sessionId, close } = await idleNativeAssignment();
    const controller = new AbortController();
    try {
      expect(
        agents.access!.request({ sessionId, mode: 'next-turn', text: 'Continue' }).delivery,
      ).toBe('followup');
      const waiting = runtime.prepareNativeOrchestratorStep!(
        sessionId,
        ['native-child'],
        controller.signal,
      );
      let result: boolean | undefined;
      void waiting.then((accepted) => {
        result = accepted;
      });
      controller.abort();
      await vi.waitFor(() => expect(result).toBe(false));
      expect(runtime.getAssignment('ada', sessionId)?.activity).toBe('working');
      expect(agents.started).toHaveLength(2);

      const next = runtime.prepareNativeOrchestratorStep!(
        sessionId,
        ['native-child'],
        new AbortController().signal,
      );
      agents.finish(sessionId);
      await expect(next).resolves.toBe(true);
      expect(agents.started).toHaveLength(3);
    } finally {
      controller.abort();
      await close();
    }
  });

  it('settles native preparation when the stored group route cannot be read', async () => {
    const { runtime, agents, owner, sessionId, close } = await idleNativeAssignment();
    const controller = new AbortController();
    try {
      attachOperationalModule(owner, 'wake-test').transaction(
        (db) =>
          db
            .prepare(
              'UPDATE assignments SET model_group_id = ?, model_route_json = ? WHERE session_id = ?',
            )
            .run('g', '{"provider":"test","model":"legacy","reasoningEffort":" "}', sessionId),
        ['assignments'],
      );
      const preparing = runtime.prepareNativeOrchestratorStep!(
        sessionId,
        ['native-child'],
        controller.signal,
      );
      let result: boolean | undefined;
      void preparing.then((accepted) => {
        result = accepted;
      });
      await vi.waitFor(() => expect(result).toBe(false));
      expect(agents.started).toHaveLength(1);
    } finally {
      controller.abort();
      await close();
    }
  });

  it('queues one native wake behind capacity, without polling or creating a second child input', async () => {
    const { runtime, agents, owner, sessionId, close } = await idleNativeAssignment({
      assignmentConcurrencyLimit: 1,
    });
    const subscribe = vi.spyOn(owner, 'subscribe');
    const controller = new AbortController();
    try {
      const other = agents.access!.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: 'Other',
      });
      if (other.outcome !== 'created') throw new Error('Other missing');
      const first = runtime.prepareNativeOrchestratorStep!(
        sessionId,
        ['native-child'],
        controller.signal,
      );
      const second = runtime.prepareNativeOrchestratorStep!(
        sessionId,
        ['native-child'],
        controller.signal,
      );
      await vi.waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1));
      expect(agents.started).toHaveLength(2);
      expect(runtime.getAssignment('ada', sessionId)?.activity).toBe('idle');
      agents.finish(other.assignment.sessionId);
      expect(await first).toBe(true);
      expect(await second).toBe(true);
      expect(agents.started).toHaveLength(3);
      expect(agents.started[2]!.run.text).toBe('');
      agents.finish(sessionId);
    } finally {
      controller.abort();
      await close();
    }
  });

  it.each(['first', 'second'])(
    'honors the %s native wake caller cancellation independently',
    async (cancelledCaller) => {
      const { runtime, agents, owner, sessionId, close } = await idleNativeAssignment({
        assignmentConcurrencyLimit: 1,
      });
      const subscribe = vi.spyOn(owner, 'subscribe');
      const firstController = new AbortController();
      const secondController = new AbortController();
      try {
        const other = agents.access!.create({
          title: 'Assignment',
          grantId: TEST_GRANT_ID,
          description: 'Other',
        });
        if (other.outcome !== 'created') throw new Error('Other missing');
        const first = runtime.prepareNativeOrchestratorStep!(
          sessionId,
          ['native-child'],
          firstController.signal,
        );
        const second = runtime.prepareNativeOrchestratorStep!(
          sessionId,
          ['native-child'],
          secondController.signal,
        );
        await vi.waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1));
        const cancelled = cancelledCaller === 'first' ? first : second;
        const remaining = cancelledCaller === 'first' ? second : first;
        let remainingResult: boolean | undefined;
        void remaining.then((accepted) => {
          remainingResult = accepted;
        });
        (cancelledCaller === 'first' ? firstController : secondController).abort();
        await expect(cancelled).resolves.toBe(false);
        await vi.waitFor(() =>
          expect(subscribe).toHaveBeenCalledTimes(cancelledCaller === 'first' ? 2 : 1),
        );
        expect(remainingResult).toBeUndefined();
        expect(agents.started).toHaveLength(2);
        agents.finish(other.assignment.sessionId);
        await expect(remaining).resolves.toBe(true);
        expect(agents.started).toHaveLength(3);
        agents.finish(sessionId);
      } finally {
        firstController.abort();
        secondController.abort();
        await close();
      }
    },
  );

  it.each(['abort', 'stop', 'revoke', 'close'])(
    'cancels a capacity-queued native wake on %s',
    async (boundary) => {
      const { runtime, agents, owner, grants, sessionId, close } = await idleNativeAssignment({
        assignmentConcurrencyLimit: 1,
      });
      const subscribe = vi.spyOn(owner, 'subscribe');
      const controller = new AbortController();
      try {
        const other = agents.access!.create({
          title: 'Assignment',
          grantId: TEST_GRANT_ID,
          description: 'Other',
        });
        if (other.outcome !== 'created') throw new Error('Other missing');
        const pending = runtime.prepareNativeOrchestratorStep!(
          sessionId,
          ['native-child'],
          controller.signal,
        );
        await vi.waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1));
        if (boundary === 'abort') controller.abort();
        if (boundary === 'stop') await agents.access!.stop(sessionId);
        if (boundary === 'revoke') grants.revoke('ada', TEST_GRANT_ID);
        if (boundary === 'close') {
          agents.finishAll();
          await runtime.close();
        }
        expect(await pending).toBe(false);
        expect(agents.started).toHaveLength(2);
      } finally {
        controller.abort();
        await close();
      }
    },
  );

  it('restores a real Assignment run before an idle native child wake can report', async () => {
    const { runtime, agents, owner, admit, close } = await setup();
    try {
      await admit('Start', 'native-child-wake');
      const created = agents.access!.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: 'Background child',
      });
      if (created.outcome !== 'created') throw new Error('Assignment missing');
      const sessionId = created.assignment.sessionId;
      const first = agents.started[0]!.run;
      await first.report({ state: 'progress', summary: 'Parent yielding' }, { turn: 1 });
      agents.finish(sessionId);
      await runtime.whenIdle();
      const signal = new AbortController().signal;
      const tool = () =>
        runtime.runAssignmentTool!(sessionId, 'report', Symbol(), signal, async () => undefined);
      await expect(tool()).rejects.toThrow('execution authority is unavailable');
      const ownership = createSessionOwnership(attachOperationalModule(owner, 'wake-test'));
      ownership.claim({
        sessionId: 'native-child',
        botSlug: 'ada',
        rootRole: 'assignment',
        parentSessionId: sessionId,
        provenance: 'subagent',
        at: FIXED_NOW().toISOString(),
      });
      const accepted = runtime.prepareNativeOrchestratorStep!(sessionId, ['native-child'], signal);
      await vi.waitFor(() => expect(agents.started).toHaveLength(2));
      expect(runtime.getAssignment('ada', sessionId)?.activity).toBe('working');
      await expect(tool()).resolves.toBeUndefined();
      const resumed = agents.started[1]!.run;
      await resumed.report({ state: 'completed', summary: 'Child finished' }, { turn: 2 });
      agents.finish(sessionId);
      expect(await accepted).toBe(true);
      await runtime.whenIdle();
      expect(runtime.getAssignment('ada', sessionId)).toMatchObject({
        activity: 'idle',
        latestReport: { state: 'completed', summary: 'Child finished' },
      });
      await expect(tool()).rejects.toThrow('execution authority is unavailable');
    } finally {
      await close();
    }
  });

  it('preserves the next run’s approval wait when the previous run finishes cleanup', async () => {
    const { runtime, agents, owner, admit, close } = await setup();
    const controller = new AbortController();
    try {
      await admit('Start', 'superseded-approval');
      const created = agents.access!.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: 'Work awaiting a follow-up',
      });
      if (created.outcome !== 'created') throw new Error('Assignment missing');
      const { sessionId } = created.assignment;
      const followUp = vi.fn(() => {
        const request = agents.access!.request({ sessionId, mode: 'next-turn', text: 'Continue' });
        runtime.beginAssignmentApprovalWait!(sessionId, 'next-approval', controller.signal);
        return request.delivery;
      });
      const unsubscribe = owner.subscribe(() => {
        if (runtime.getAssignment('ada', sessionId)?.activity !== 'idle') return;
        unsubscribe();
        followUp();
      });
      try {
        agents.finish(sessionId);
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(followUp).toHaveReturnedWith('followup');
        expect(runtime.getAssignment('ada', sessionId)?.executionWait).toBe('waiting-human');
        agents.finish(sessionId);
        await runtime.whenIdle();
        expect(runtime.getAssignment('ada', sessionId)?.executionWait).toBeUndefined();
      } finally {
        unsubscribe();
      }
    } finally {
      controller.abort();
      await close();
    }
  });

  it('admits real runtime work during a native approval wait and gates the original resumption', async () => {
    const { runtime, agents, admit, close } = await setup({ assignmentConcurrencyLimit: 1 });
    try {
      await admit('Start', 'capacity-start');
      const original = agents.access!.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: 'Original',
      });
      if (original.outcome !== 'created') throw new Error('Original missing');
      const signal = new AbortController().signal;
      const wait = runtime.beginAssignmentApprovalWait!(
        original.assignment.sessionId,
        'call',
        signal,
      )!;
      expect(runtime.getAssignment('ada', original.assignment.sessionId)?.executionWait).toBe(
        'waiting-human',
      );
      await admit('Unrelated conversation', 'capacity-unrelated');
      const other = agents.access!.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: 'Other work',
      });
      if (other.outcome !== 'created') throw new Error('Other missing');
      expect(agents.started).toHaveLength(2);
      expect(
        agents.access!.create({
          title: 'Assignment',
          grantId: TEST_GRANT_ID,
          description: 'Overflow',
        }).outcome,
      ).toBe('capacity');
      const resumed = vi.fn();
      const resume = wait.resume().then(resumed);
      await Promise.resolve();
      expect(resumed).not.toHaveBeenCalled();
      expect(runtime.getAssignment('ada', original.assignment.sessionId)?.executionWait).toBe(
        'waiting-capacity',
      );
      agents.finish(other.assignment.sessionId);
      await resume;
      wait.release();
      const effect = vi.fn(async () => 'original result');
      await expect(
        runtime.runAssignmentTool!(original.assignment.sessionId, 'call', Symbol(), signal, effect),
      ).resolves.toBe('original result');
      expect(effect).toHaveBeenCalledTimes(1);
      expect(
        runtime.getAssignment('ada', original.assignment.sessionId)?.executionWait,
      ).toBeUndefined();
      expect(agents.started).toHaveLength(2);
    } finally {
      await close();
    }
  });

  it('refuses an approved original call after its Grant is revoked while capacity is occupied', async () => {
    const { runtime, agents, grants, admit, close } = await setup({
      assignmentConcurrencyLimit: 1,
    });
    try {
      await admit('Start', 'capacity-revoke');
      const original = agents.access!.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: 'Original',
      });
      if (original.outcome !== 'created') throw new Error('Original missing');
      const signal = new AbortController().signal;
      const wait = runtime.beginAssignmentApprovalWait!(
        original.assignment.sessionId,
        'call',
        signal,
      )!;
      agents.access!.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: 'Competitor',
      });
      const refused = expect(wait.resume()).rejects.toThrow('authority');
      grants.revoke('ada', TEST_GRANT_ID);
      await refused;
      wait.release();
      const effect = vi.fn(async () => undefined);
      await expect(
        runtime.runAssignmentTool!(original.assignment.sessionId, 'call', Symbol(), signal, effect),
      ).rejects.toThrow('authority');
      expect(effect).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it('releases a wake reservation when the adapter rejects synchronously', async () => {
    const { runtime, agents, admit, close } = await setup({ assignmentConcurrencyLimit: 1 });
    try {
      await admit('Start wake rejection test', 'human-wake-rejection');
      const access = agents.access!;
      const idle = access.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: 'Idle work',
      });
      if (idle.outcome !== 'created') throw new Error('Idle Assignment missing');
      agents.finish(idle.assignment.sessionId);
      await runtime.whenIdle();
      vi.spyOn(agents, 'requestAssignment').mockImplementationOnce(() => {
        throw new Error('DSH delivery unavailable');
      });
      expect(() =>
        access.request({
          sessionId: idle.assignment.sessionId,
          mode: 'next-turn',
          text: 'Continue',
        }),
      ).toThrow('DSH delivery unavailable');
      expect(runtime.getAssignment('ada', idle.assignment.sessionId)?.activity).toBe('idle');
      expect(
        access.create({ title: 'Assignment', grantId: TEST_GRANT_ID, description: 'Next work' })
          .outcome,
      ).toBe('created');
      expect(agents.resumed).toHaveLength(0);
    } finally {
      await close();
    }
  });

  it('reserves the final wake slot before entering the adapter and allows updates to running work', async () => {
    const { runtime, agents, admit, close } = await setup({ assignmentConcurrencyLimit: 1 });
    try {
      await admit('Start reservation test', 'human-reservation');
      const access = agents.access!;
      const idle = access.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: 'Idle work',
      });
      if (idle.outcome !== 'created') throw new Error('Idle Assignment missing');
      agents.finish(idle.assignment.sessionId);
      await runtime.whenIdle();
      let competitor: string | undefined;
      vi.spyOn(agents, 'requestAssignment').mockImplementationOnce(() => {
        competitor = access.create({
          title: 'Assignment',
          grantId: TEST_GRANT_ID,
          description: 'Competing work',
        }).outcome;
        return { delivery: 'steer' };
      });
      expect(
        access.request({
          sessionId: idle.assignment.sessionId,
          mode: 'next-turn',
          text: 'Continue',
        }).delivery,
      ).toBe('steer');
      expect(competitor).toBe('capacity');
      vi.spyOn(agents, 'requestAssignment').mockImplementationOnce(() => ({ delivery: 'steer' }));
      expect(
        access.request({
          sessionId: idle.assignment.sessionId,
          mode: 'next-step',
          text: 'More context',
        }).delivery,
      ).toBe('steer');
      expect(runtime.listAssignments('ada')).toHaveLength(1);
    } finally {
      await close();
    }
  });
});
