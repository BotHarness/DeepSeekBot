import type { ToolApprovalRule } from '../workspaces/tool-approval-rules.js';
import type { PairingCapability } from './pairing.js';
import type { MessagingApprovalCard } from './provider.js';

export const approvalStatusLabels: Readonly<Record<MessagingApprovalCard['status'], string>> = {
  'web-required':
    'Native session authorization; review in Web / 此请求授予原生会话权限，请在 Web 审核',
  pending: 'Awaiting an authorized decision / 等待授权用户处理',
  'allowed-once': 'Decision accepted; execution not yet confirmed / 已批准一次，执行结果待确认',
  rejected: 'Rejected; approval does not permit execution / 已拒绝，不允许执行',
  expired: 'Expired or owner unavailable; use a new request / 已过期或执行者不可用，请使用新请求',
  executed: 'Native execution result recorded / 已记录原生执行结果',
  'execution-failed': 'Native execution failed / 原生执行失败',
  'execution-unknown': 'Execution not confirmed; inspect Web / 执行结果未确认，请查看 Web',
  test: 'Management route test; no operation or approval / 管理通知测试，不包含操作或授权',
};

export function approvalCardActions(
  capabilities: (() => readonly PairingCapability[]) | undefined,
): { actions?: ['allowed-once'] | ['rejected'] } {
  let granted: readonly PairingCapability[];
  try {
    if (!capabilities) return {};
    granted = capabilities();
  } catch {
    return {};
  }
  const approve = granted.includes('approve');
  if (approve === granted.includes('reject')) return {};
  return { actions: approve ? ['allowed-once'] : ['rejected'] };
}

export function savedShellPrefixDetails(
  ids: string[] | undefined,
  findRule: (id: string) => ToolApprovalRule | undefined,
): string[] {
  return (ids ?? []).flatMap((id) => {
    const rule = findRule(id);
    if (rule?.kind !== 'prefix') return [];
    const status = rule.revokedAt
      ? 'Revoked Shell prefix / 已撤销 Shell 前缀'
      : 'Allowed Shell prefix / 已允许 Shell 前缀';
    return [status + ' ' + rule.input];
  });
}
