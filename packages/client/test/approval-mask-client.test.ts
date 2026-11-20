import { describe, expect, it } from 'vitest';

import { approvalStateKey } from '../src/client/approval-mask-text.js';
import { parseApprovalCard, parseChannelMessage } from '../src/client/bridge.js';

const masked = {
  masked: true,
  kind: 'tool-approval',
  botSlug: 'tob',
  state: 'pending',
  requestedAt: '2026-11-14T00:00:00.000Z',
};

describe('approval masking client', () => {
  it('keeps a masked approval message instead of dropping it', () => {
    const message = parseChannelMessage({
      id: 'm1',
      at: '2026-11-14T00:00:00.000Z',
      author: { kind: 'bot', slug: 'tob' },
      body: '',
      toolApprovalRequest: masked,
      approval: masked,
    });
    expect(message?.toolApprovalRequest).toBeUndefined();
    expect(message?.approval).toEqual(masked);
  });

  it('reads the decider and opaque flag for approvers', () => {
    expect(
      parseApprovalCard({
        ...masked,
        masked: false,
        opaque: true,
        state: 'allowed-once',
        decidedBy: { humanId: 'h1', displayName: 'Alice' },
      }),
    ).toMatchObject({
      masked: false,
      opaque: true,
      decidedBy: { humanId: 'h1', displayName: 'Alice' },
    });
    expect(parseApprovalCard({ kind: 'nope' })).toBeUndefined();
  });

  it('maps decision states to plain copy', () => {
    expect(approvalStateKey('pending')).toBe('approval.state.pending');
    expect(approvalStateKey('rejected')).toBe('approval.state.declined');
    expect(approvalStateKey('allowed-once')).toBe('approval.state.done');
    expect(approvalStateKey('expired')).toBe('approval.state.closed');
  });
});
