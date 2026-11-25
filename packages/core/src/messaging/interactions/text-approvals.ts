import { createHash } from 'node:crypto';
import type { MessagingApprovalCard } from '../provider.js';

export type ApprovalReply = 'allowed-once' | 'rejected';

export const ALLOW_WORDS = ['允许', '同意', '批准', 'allow', 'approve'] as const;
export const REJECT_WORDS = ['拒绝', '不允许', '不同意', 'reject', 'deny'] as const;
const ALLOW = new Set<string>(ALLOW_WORDS);
const REJECT = new Set<string>(REJECT_WORDS);

export const approvalReference = (id: string) =>
  createHash('sha256').update(id).digest('hex').slice(0, 12).toUpperCase();

export function parseApprovalReply(text: string): ApprovalReply | undefined {
  const word = text
    .trim()
    .replace(/[。.!！]+$/u, '')
    .toLowerCase();
  if (ALLOW.has(word)) return 'allowed-once';
  if (REJECT.has(word)) return 'rejected';
  return undefined;
}

export function renderApprovalText(card: MessagingApprovalCard, reference: string): string {
  const actions = card.actions ?? ['allowed-once', 'rejected'];
  const hint =
    card.status !== 'pending'
      ? []
      : actions.length === 2
        ? ['Reply to this message with allow or reject. / 回复本消息「允许」或「拒绝」。']
        : actions[0] === 'allowed-once'
          ? ['Reply to this message with allow. / 回复本消息「允许」。']
          : ['Reply to this message with reject. / 回复本消息「拒绝」。'];
  return [card.title, card.detail, ...hint, `#${reference}`].join('\n\n');
}
