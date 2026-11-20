import type { BotHarnessKey } from './locale.js';

export function approvalStateKey(state: string): BotHarnessKey {
  if (state === 'pending') return 'approval.state.pending';
  if (state === 'rejected' || state === 'cancelled') return 'approval.state.declined';
  if (state === 'expired' || state === 'stopped') return 'approval.state.closed';
  return 'approval.state.done';
}
