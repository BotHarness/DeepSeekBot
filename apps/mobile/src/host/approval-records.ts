import type { HostClient } from './client';
import { HostAnswerInvalid } from './bot-settings';

export type ApprovalOutcome =
  | 'allowed-once'
  | 'allowed-always-tool'
  | 'allowed-always-exact'
  | 'allowed-always-all'
  | 'rejected';

export interface ApprovalHistoryEntry {
  decisionMessageId: string;
  requestMessageId: string;
  channelId: string;
  decidedAt: string;
  toolName: string;
  role: 'orchestrator' | 'assignment';
  input: string;
  outcome: ApprovalOutcome;
  external: boolean;
}

export interface ApprovalHistoryPage {
  entries: ApprovalHistoryEntry[];
  nextCursor?: string;
}

export type ApprovalRuleKind = 'exact' | 'tool' | 'all-opaque' | 'secret-cli';

export interface ApprovalRule {
  id: string;
  role: 'orchestrator' | 'assignment';
  kind: ApprovalRuleKind;
  toolName: string;
  input: string;
  createdAt: string;
  autoApprovedCount?: number;
  external: boolean;
}

const OUTCOMES: readonly string[] = [
  'allowed-once',
  'allowed-always-tool',
  'allowed-always-exact',
  'allowed-always-all',
  'rejected',
];
const KINDS: readonly string[] = ['exact', 'tool', 'all-opaque', 'secret-cli'];

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): value is string {
  return typeof value === 'string';
}

function role(value: unknown): value is 'orchestrator' | 'assignment' {
  return value === 'orchestrator' || value === 'assignment';
}

function entry(value: unknown): ApprovalHistoryEntry | undefined {
  const row = record(value);
  if (
    row === undefined ||
    !text(row['decisionMessageId']) ||
    !text(row['requestMessageId']) ||
    !text(row['channelId']) ||
    !text(row['decidedAt']) ||
    !text(row['toolName']) ||
    !role(row['role']) ||
    !text(row['input']) ||
    !OUTCOMES.includes(row['outcome'] as string)
  )
    return undefined;
  return {
    decisionMessageId: row['decisionMessageId'],
    requestMessageId: row['requestMessageId'],
    channelId: row['channelId'],
    decidedAt: row['decidedAt'],
    toolName: row['toolName'],
    role: row['role'],
    input: row['input'],
    outcome: row['outcome'] as ApprovalOutcome,
    external: row['actor'] !== undefined,
  };
}

function rule(value: unknown): ApprovalRule | undefined {
  const row = record(value);
  if (
    row === undefined ||
    !text(row['id']) ||
    !role(row['role']) ||
    !KINDS.includes(row['kind'] as string) ||
    !text(row['toolName']) ||
    !text(row['input']) ||
    !text(row['createdAt']) ||
    row['revokedAt'] !== undefined
  )
    return undefined;
  const count = row['autoApprovedCount'];
  return {
    id: row['id'],
    role: row['role'],
    kind: row['kind'] as ApprovalRuleKind,
    toolName: row['toolName'],
    input: row['input'],
    createdAt: row['createdAt'],
    ...(typeof count === 'number' && Number.isSafeInteger(count) && count >= 0
      ? { autoApprovedCount: count }
      : {}),
    external: row['externalCreator'] !== undefined,
  };
}

function list<T>(rows: unknown, parse: (value: unknown) => T | undefined): T[] {
  return Array.isArray(rows)
    ? rows.flatMap((row) => {
        const parsed = parse(row);
        return parsed === undefined ? [] : [parsed];
      })
    : [];
}

export async function loadApprovalHistory(
  client: HostClient,
  slug: string,
  cursor?: string,
): Promise<ApprovalHistoryPage> {
  const answer = record(
    await client.call<unknown>('toolApprovalHistory', {
      slug,
      ...(cursor === undefined ? {} : { cursor }),
    }),
  );
  if (!Array.isArray(answer?.['entries']))
    throw new HostAnswerInvalid('toolApprovalHistory returned no list.');
  const next = answer['nextCursor'];
  return {
    entries: list(answer['entries'], entry),
    ...(text(next) && next.length > 0 ? { nextCursor: next } : {}),
  };
}

export async function loadApprovalRules(client: HostClient, slug: string): Promise<ApprovalRule[]> {
  const rows = record(await client.call<unknown>('toolApprovalRules', { slug }))?.['rules'];
  if (!Array.isArray(rows)) throw new HostAnswerInvalid('toolApprovalRules returned no list.');
  return list(rows, rule);
}

export async function revokeApprovalRule(
  client: HostClient,
  slug: string,
  id: string,
): Promise<void> {
  const answer = record(await client.call<unknown>('toolApprovalRuleRevoke', { slug, id }));
  if (record(answer?.['rule']) === undefined)
    throw new HostAnswerInvalid('toolApprovalRuleRevoke returned no rule.');
}
