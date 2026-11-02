import type {
  ApprovalHistoryEntry,
  ApprovalOutcome,
  ApprovalRule,
} from '../../host/approval-records';
import { readableInput } from '../../host/requests';
import { t } from '../strings';

const SUMMARY = 120;

export type ToolGlyph = 'terminal' | 'browser' | 'computer' | 'file' | 'lock' | 'person' | 'tool';

export function toolGlyph(toolName: string): ToolGlyph {
  if (toolName === 'bash' || toolName === 'shell' || toolName === 'secret_cli') return 'terminal';
  if (toolName.startsWith('browser')) return 'browser';
  if (toolName.startsWith('computer')) return 'computer';
  if (toolName === 'secret_mcp_connect') return 'lock';
  if (toolName === 'bot_create') return 'person';
  if (/(^|_)(read|write|edit|patch|file|attachment)/u.test(toolName)) return 'file';
  return 'tool';
}

export function outcomeLabel(outcome: ApprovalOutcome): string {
  if (outcome === 'rejected') return t.approvals.denied;
  if (outcome === 'allowed-once') return t.approvals.allowedOnce;
  return t.approvals.allowedAlways;
}

export function inputSummary(input: string): string {
  const rows = readableInput(input).filter((row) => row.value.trim().length > 0);
  const preferred = rows.find((row) =>
    ['command', 'url', 'path', 'program', 'query', 'text'].includes(row.label),
  );
  const raw =
    preferred?.value ??
    rows
      .slice(0, 3)
      .map((row) => (row.label === '' ? row.value : `${row.label}: ${row.value}`))
      .join(', ');
  const line = raw.replace(/\s+/gu, ' ').trim();
  return line.length > SUMMARY ? `${line.slice(0, SUMMARY - 1)}…` : line;
}

function secretCliSummary(input: string): string {
  let kind: { program?: unknown; account?: unknown } | null;
  try {
    kind = JSON.parse(input) as typeof kind;
  } catch {
    kind = null;
  }
  return typeof kind?.program === 'string' && typeof kind.account === 'string'
    ? `${kind.program} · ${kind.account}`
    : inputSummary(input);
}

export function historyDetail(entry: ApprovalHistoryEntry, now: number): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(entry.decidedAt)) / 60_000));
  const summary =
    entry.toolName === 'secret_cli' ? secretCliSummary(entry.input) : inputSummary(entry.input);
  const status = [
    outcomeLabel(entry.outcome),
    ...(entry.external ? [t.approvals.viaIm] : []),
    Number.isFinite(minutes) ? t.ago(minutes) : undefined,
  ].filter((part) => part !== undefined);
  return [...(summary === '' ? [] : [summary]), status.join(' · ')].join('\n');
}

export function ruleTitle(rule: ApprovalRule): string {
  return rule.kind === 'all-opaque' ? t.approvals.allTools : rule.toolName;
}

export function ruleDetail(rule: ApprovalRule): string {
  const target =
    rule.kind === 'all-opaque'
      ? t.approvals.allToolsDetail
      : rule.kind === 'tool'
        ? t.approvals.anyInput
        : rule.kind === 'secret-cli'
          ? secretCliSummary(rule.input)
          : inputSummary(rule.input) || t.approvals.anyInput;
  const scope = rule.role === 'assignment' ? t.approvals.inAssignments : t.approvals.inChat;
  return [
    target,
    [
      scope,
      ...(rule.external ? [t.approvals.viaIm] : []),
      ...(rule.autoApprovedCount === undefined
        ? []
        : [t.approvals.autoApproved(rule.autoApprovedCount)]),
    ].join(' · '),
  ].join('\n');
}
