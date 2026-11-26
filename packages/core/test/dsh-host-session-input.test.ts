import { expect, it } from 'vitest';
import { pendingCard } from '../src/features/sessions/dsh-host-session-input.js';

const approval = {
  id: 'allow',
  question: 'Run bash?',
  intent: { kind: 'approval', approve: 'Allow', reject: 'Reject' },
};
const request = (questions: unknown[]) => ({
  type: 'waterfall' as const,
  event: 'user-questions/request',
  eventId: 'event-1',
  agentId: 'session-1',
  request: { questions },
});

it('shows a lone approval intent as an approval card', () => {
  expect(pendingCard(request([approval]))).toMatchObject({
    card: { kind: 'approval', requestId: 'event-1', toolName: 'Run bash?' },
    approvalOptions: { id: 'allow', approve: 'Allow', reject: 'Reject' },
  });
});

it('keeps every question answerable when an approval intent shares a batch', () => {
  const pending = pendingCard(request([approval, { id: 'format', question: 'Which layout?' }]));
  expect(pending?.approvalOptions).toBeUndefined();
  expect(pending?.card).toMatchObject({
    kind: 'question',
    questions: [{ id: 'allow' }, { id: 'format' }],
  });
});
