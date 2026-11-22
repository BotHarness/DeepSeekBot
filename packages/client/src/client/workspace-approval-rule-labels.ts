import type { ToolApprovalRuleView } from './bridge.js';

export function secretCliRuleLabel(input: string): {
  program: string;
  account: string;
} {
  try {
    const kind = JSON.parse(input) as { program?: unknown; account?: unknown };
    return {
      program: typeof kind.program === 'string' ? kind.program : '?',
      account: typeof kind.account === 'string' ? kind.account : '?',
    };
  } catch {
    return { program: '?', account: '?' };
  }
}

export function approvalRulePath(rule: ToolApprovalRuleView): string {
  try {
    let scope: unknown = JSON.parse(rule.scopeKey);
    if (
      Array.isArray(scope) &&
      typeof scope[0] === 'string' &&
      ((scope.length === 2 && scope[1] === 'explicit-approval') ||
        (scope.length === 3 &&
          (scope[1] === 'browser' || scope[1] === 'computer' || scope[1] === null) &&
          typeof scope[2] === 'string'))
    )
      scope = JSON.parse(scope[0]);
    if (Array.isArray(scope) && typeof scope[1] === 'string') return scope[1];
  } catch {}
  return rule.scopeKey;
}
