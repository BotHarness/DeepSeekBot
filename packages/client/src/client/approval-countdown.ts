export const APPROVAL_URGENT_MS = 15 * 60 * 1000;

export interface ApprovalCountdown {
  key: 'approval.expiresInHours' | 'approval.expiresInMinutes' | 'approval.expiresSoon';
  count: number;
  urgent: boolean;
  nextTick: number;
}

export function approvalCountdown(expiresAt: string, now: number): ApprovalCountdown | undefined {
  const left = Date.parse(expiresAt) - now;
  if (!(left > 0)) return undefined;
  const urgent = left <= APPROVAL_URGENT_MS;
  const minute = 60 * 1000;
  if (left < minute) return { key: 'approval.expiresSoon', count: 0, urgent, nextTick: left };
  const hour = 60 * minute;
  if (left >= hour) {
    const count = Math.floor(left / hour);
    return { key: 'approval.expiresInHours', count, urgent, nextTick: left - count * hour + 1 };
  }
  const count = Math.floor(left / minute);
  return { key: 'approval.expiresInMinutes', count, urgent, nextTick: left - count * minute + 1 };
}
