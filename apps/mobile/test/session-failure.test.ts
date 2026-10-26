import { expect, it } from 'vitest';
import { sessionFailure } from '../src/host/session-failure';

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
