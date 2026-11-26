import { expect, it } from 'vitest';
import { approvalCardActions } from '../src/messaging/approval-card.js';

it('an approval card offers only the decision the paired person may make', () => {
  expect(approvalCardActions(() => ['approve', 'answer'])).toEqual({ actions: ['allowed-once'] });
  expect(approvalCardActions(() => ['reject'])).toEqual({ actions: ['rejected'] });
  expect(approvalCardActions(() => ['approve', 'reject'])).toEqual({});
  expect(approvalCardActions(undefined)).toEqual({});
  expect(
    approvalCardActions(() => {
      throw new Error('route gone');
    }),
  ).toEqual({});
});
