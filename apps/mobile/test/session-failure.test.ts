import { expect, it, vi } from 'vitest';
import {
  sessionFailure,
  createFailureContinuation,
  createFailureMaintenance,
} from '../src/host/session-failure';

it('preserves failure identity for recovery without interpreting max-tokens as overflow', () => {
  const failure = sessionFailure({
    role: 'orchestrator',
    sessionId: 's',
    requestMessageId: 'm',
    detail: 'Agent turn ended without completion: max-tokens',
  });
  expect(failure).toEqual({
    role: 'orchestrator',
    sessionId: 's',
    requestMessageId: 'm',
    detail: 'Agent turn ended without completion: max-tokens',
  });
  expect(sessionFailure({ role: 'human', sessionId: 's', detail: 'bad' })).toBeUndefined();
  expect(sessionFailure(null)).toBeUndefined();
});

it('runs DM maintenance without submitting the failed message again', async () => {
  const call = vi.fn(async () => ({ outcome: 'nothing' }));
  const failure = {
    role: 'orchestrator' as const,
    sessionId: 's',
    requestMessageId: 'm',
    detail: 'Full',
  };
  const maintenance = createFailureMaintenance({ call }, 'dm-ada', failure);
  await maintenance.run('compact');
  expect(maintenance.getSnapshot().notice).toBe('nothing');
  expect(call).toHaveBeenLastCalledWith('botCompact', { slug: 'ada' });
  await maintenance.run('new-session');
  expect(maintenance.getSnapshot().notice).toBe('new');
  expect(call).toHaveBeenLastCalledWith('botNewSession', { slug: 'ada' });
  const group = createFailureMaintenance({ call }, 'group', failure);
  await group.run('compact');
  expect(group.getSnapshot().notice).toBe('unavailable');
  expect(call).toHaveBeenCalledTimes(2);
});

it('parses where the turn stopped and continues it through channelRetry', async () => {
  const failure = sessionFailure({
    role: 'orchestrator',
    sessionId: 's',
    requestMessageId: 'm',
    code: 'TRANSPORT',
    detail: 'socket hang up',
    progress: { completedSteps: 2, lastTool: 'bash' },
    autoContinue: {
      attempt: 1,
      maxAttempts: 2,
      at: '2026-11-02T00:01:00.000Z',
    },
  })!;
  expect(failure.progress).toEqual({ completedSteps: 2, lastTool: 'bash' });
  expect(failure.autoContinue).toEqual({
    attempt: 1,
    maxAttempts: 2,
    at: '2026-11-02T00:01:00.000Z',
  });
  const call = vi.fn(async () => ({ accepted: true }));
  const card = createFailureContinuation({ call }, 'dm-ada', 'failure-1', failure);
  await card.continueTurn();
  expect(call).toHaveBeenLastCalledWith('channelRetry', {
    channelId: 'dm-ada',
    messageId: 'm',
    recovery: 'continue',
    failureMessageId: 'failure-1',
  });
  const waiting = createFailureContinuation({ call }, 'dm-ada', 'failure-2', failure);
  await waiting.cancelAuto();
  expect(call).toHaveBeenLastCalledWith('channelBotStop', {
    channelId: 'dm-ada',
    botSlug: 'ada',
    autoContinueFor: 'm',
  });
});
