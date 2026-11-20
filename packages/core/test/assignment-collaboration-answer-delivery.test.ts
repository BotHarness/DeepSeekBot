import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { AssignmentInboxAcceptanceUncertainError } from '../src/runtime/assignment-delivery.js';
import { describe, expect, it, vi } from 'vitest';
import { attachOperationalModule } from '../src/database/owner.js';
import { createHumanAttentionQuery } from '../src/runtime/human-attention.js';
import { TEST_GRANT_ID } from './workspace-grant-fixture.js';
import { setup } from './assignment-collaboration-fixtures.js';

describe('Assignment collaboration', () => {
  it('keeps the original question after synchronous answer delivery refuses', async () => {
    const { runtime, agents, admit, close } = await setup();
    try {
      await admit('Start', 'human-answer-refusal');
      const access = agents.access!;
      const created = access.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: 'Choose a direction',
      });
      if (created.outcome !== 'created') throw new Error('Missing Assignment');
      await agents.started[0]!.run.report({
        state: 'waiting-human',
        summary: 'Choose A or B',
        expectsReply: true,
      });
      agents.finish(created.assignment.sessionId);
      await runtime.whenIdle();
      const before = runtime.getAssignment('ada', created.assignment.sessionId)!;
      vi.spyOn(agents, 'requestAssignment').mockImplementationOnce(() => {
        throw new Error('Inbox unavailable');
      });
      expect(() =>
        access.request({
          sessionId: before.sessionId,
          mode: 'next-turn',
          text: 'Choose A',
          answerTo: before.openAsk!.sourceEventId,
        }),
      ).toThrow('Inbox unavailable');
      expect(runtime.getAssignment('ada', before.sessionId)).toEqual(before);
    } finally {
      await close();
    }
  });

  it.each([false, true])(
    'preserves delayed delivery refusal and distinguishes uncertainty=%s',
    async (uncertain) => {
      const { runtime, agents, owner, admit, close } = await setup();
      try {
        await admit('Start', 'human-delayed-refusal');
        const access = agents.access!;
        const created = access.create({
          title: 'Assignment',
          grantId: TEST_GRANT_ID,
          description: 'Answer delivery',
        });
        if (created.outcome !== 'created') throw new Error('Missing Assignment');
        await agents.started[0]!.run.report({
          state: 'waiting-human',
          summary: 'Choose A or B',
          expectsReply: true,
        });
        agents.finish(created.assignment.sessionId);
        await runtime.whenIdle();
        const before = runtime.getAssignment('ada', created.assignment.sessionId)!;
        let reject!: (error: unknown) => void;
        const accepted = new Promise<void>((_resolve, refuse) => {
          reject = refuse;
        });
        vi.spyOn(agents, 'requestAssignment').mockReturnValueOnce({
          delivery: 'followup',
          accepted,
          done: accepted,
        });
        access.request({
          sessionId: before.sessionId,
          mode: 'next-turn',
          text: 'Choose A',
          answerTo: before.openAsk!.sourceEventId,
        });
        expect(runtime.getAssignment('ada', before.sessionId)?.openAsk).toEqual(before.openAsk);
        reject(
          uncertain
            ? new AssignmentInboxAcceptanceUncertainError(new Error('native send threw'))
            : new Error('Resume failed before native send'),
        );
        await runtime.whenIdle();
        const failed = runtime.getAssignment('ada', before.sessionId)!;
        expect(failed).toMatchObject({ ...before, activity: uncertain ? 'error' : 'idle' });
        const query = createHumanAttentionQuery(
          attachOperationalModule(owner, 'answer-refusal-test'),
        );
        expect(query.list(OWNER_HUMAN_CONTEXT, { category: 'action' }).items).toContainEqual(
          expect.objectContaining({ sourceEventId: before.openAsk!.sourceEventId }),
        );
        if (uncertain) {
          expect(() =>
            access.request({
              sessionId: before.sessionId,
              mode: 'next-turn',
              text: 'Choose A',
              answerTo: before.openAsk!.sourceEventId,
            }),
          ).toThrow('failed');
        } else {
          access.request({
            sessionId: before.sessionId,
            mode: 'next-turn',
            text: 'Choose A',
            answerTo: before.openAsk!.sourceEventId,
          });
          await Promise.resolve();
          expect(runtime.getAssignment('ada', before.sessionId)?.openAsk).toBeUndefined();
          expect(runtime.getAssignment('ada', before.sessionId)?.permission).toEqual(
            before.permission,
          );
          expect(() =>
            access.request({
              sessionId: before.sessionId,
              mode: 'next-turn',
              text: 'Choose A',
              answerTo: before.openAsk!.sourceEventId,
            }),
          ).toThrow('no open ask');
          agents.finish(before.sessionId);
          await runtime.whenIdle();
          expect(runtime.getAssignment('ada', before.sessionId)?.activity).toBe('idle');
        }
      } finally {
        await close();
      }
    },
  );

  it('does not erase a newer question when the older answer is accepted', async () => {
    const { runtime, agents, admit, close } = await setup();
    try {
      await admit('Start', 'human-newer-ask');
      const access = agents.access!;
      const created = access.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: 'Question race',
      });
      if (created.outcome !== 'created') throw new Error('Missing Assignment');
      const run = agents.started[0]!.run;
      await run.report({ state: 'waiting-human', summary: 'First question', expectsReply: true });
      agents.finish(run.sessionId);
      await runtime.whenIdle();
      const first = runtime.getAssignment('ada', run.sessionId)!.openAsk!;
      let accept!: () => void;
      const accepted = new Promise<void>((resolve) => {
        accept = resolve;
      });
      vi.spyOn(agents, 'requestAssignment').mockReturnValueOnce({
        delivery: 'followup',
        accepted,
        done: accepted,
      });
      access.request({
        sessionId: run.sessionId,
        mode: 'next-turn',
        text: 'First answer',
        answerTo: first.sourceEventId,
      });
      await run.report({ state: 'waiting-human', summary: 'Newer question', expectsReply: true });
      const newer = runtime.getAssignment('ada', run.sessionId)!.openAsk!;
      expect(newer.sourceEventId).not.toBe(first.sourceEventId);
      accept();
      await runtime.whenIdle();
      expect(runtime.getAssignment('ada', run.sessionId)?.openAsk).toEqual(newer);
    } finally {
      await close();
    }
  });

  it('retains active steering uncertainty after the original turn finishes', async () => {
    const { runtime, agents, owner, admit, close } = await setup();
    try {
      await admit('Start', 'human-steer-uncertain');
      const access = agents.access!;
      const created = access.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: 'Active steering',
      });
      if (created.outcome !== 'created') throw new Error('Missing Assignment');
      const run = agents.started[0]!.run;
      await run.report({ state: 'waiting-human', summary: 'Question', expectsReply: true });
      const ask = runtime.getAssignment('ada', run.sessionId)!.openAsk!;
      vi.spyOn(agents, 'requestAssignment').mockImplementationOnce(() => {
        throw new AssignmentInboxAcceptanceUncertainError(new Error('native steer threw'));
      });
      expect(() =>
        access.request({
          sessionId: run.sessionId,
          mode: 'next-step',
          text: 'Answer',
          answerTo: ask.sourceEventId,
        }),
      ).toThrow('acceptance is uncertain');
      agents.finish(run.sessionId);
      await runtime.whenIdle();
      expect(runtime.getAssignment('ada', run.sessionId)).toMatchObject({
        activity: 'error',
        openAsk: ask,
      });
      expect(
        createHumanAttentionQuery(
          attachOperationalModule(owner, 'steer-uncertainty'),
        ).assignmentContext('ada', run.sessionId, ask.sourceEventId)?.canReply,
      ).toBe(false);
      expect(() =>
        access.request({
          sessionId: run.sessionId,
          mode: 'next-turn',
          text: 'Replay',
          answerTo: ask.sourceEventId,
        }),
      ).toThrow('failed');
    } finally {
      await close();
    }
  });

  it('settles an accepted answer even when its subsequent execution fails', async () => {
    const { runtime, agents, admit, close } = await setup();
    try {
      await admit('Start', 'human-after-accept');
      const access = agents.access!;
      const created = access.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: 'Accepted failure',
      });
      if (created.outcome !== 'created') throw new Error('Missing Assignment');
      const run = agents.started[0]!.run;
      await run.report({ state: 'waiting-human', summary: 'Question', expectsReply: true });
      agents.finish(run.sessionId);
      await runtime.whenIdle();
      const before = runtime.getAssignment('ada', run.sessionId)!;
      vi.spyOn(agents, 'requestAssignment').mockReturnValueOnce({
        delivery: 'followup',
        accepted: Promise.resolve(),
        done: Promise.reject(new Error('Native turn failed after acceptance')),
      });
      access.request({
        sessionId: run.sessionId,
        mode: 'next-turn',
        text: 'Answer',
        answerTo: before.openAsk!.sourceEventId,
      });
      await runtime.whenIdle();
      expect(runtime.getAssignment('ada', run.sessionId)).toMatchObject({ activity: 'error' });
      expect(runtime.getAssignment('ada', run.sessionId)?.openAsk).toBeUndefined();
    } finally {
      await close();
    }
  });
});
