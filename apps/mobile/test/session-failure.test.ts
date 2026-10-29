import { expect, it, vi } from 'vitest';
import { sessionFailure, createFailureMaintenance } from '../src/host/session-failure';

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
