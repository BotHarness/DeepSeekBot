import { expect, it, vi } from 'vitest';
import { sessionFailure, maintainSessionFailure } from '../src/host/session-failure';

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
  expect(await maintainSessionFailure({ call }, 'dm-ada', failure, 'compact')).toBe('nothing');
  expect(call).toHaveBeenLastCalledWith('botCompact', { slug: 'ada' });
  expect(await maintainSessionFailure({ call }, 'dm-ada', failure, 'new-session')).toBe('new');
  expect(call).toHaveBeenLastCalledWith('botNewSession', { slug: 'ada' });
  expect(call).toHaveBeenCalledTimes(2);
  await expect(maintainSessionFailure({ call }, 'group', failure, 'compact')).rejects.toThrow(
    'Bot DM',
  );
  expect(call).toHaveBeenCalledTimes(2);
});
