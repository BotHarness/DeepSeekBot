import { describe, expect, it } from 'vitest';
import type { ToolApprovalRuleView } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import { approvalRuleLabel } from '../src/client/workspace-approval-rule-labels.js';

const rule = (kind: ToolApprovalRuleView['kind'], input: string): ToolApprovalRuleView => ({
  id: 'rule',
  botSlug: 'ada',
  role: 'orchestrator',
  scopeKey: '[]',
  kind,
  toolName: 'bash',
  input,
  createdAt: '2026-11-27T00:00:00.000Z',
});

describe('approvalRuleLabel', () => {
  it('reads a Shell prefix rule as its prefix instead of a legacy allowance', () => {
    expect(approvalRuleLabel(rule('prefix', 'git status *'), zhTranslate)).toBe(
      'bash · 以 git status 开头',
    );
    expect(approvalRuleLabel(rule('all-opaque', ''), zhTranslate)).toBe(
      zhTranslate('approval.allRule'),
    );
    expect(approvalRuleLabel(rule('exact', '{}'), zhTranslate)).toBe('相同调用：bash');
  });
});
