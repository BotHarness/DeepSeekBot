import type {
  QuestionAnswer,
  ToolApprovalOutcome,
  WireApprovalCard,
  WireApprovalRule,
  WireApprovalTemplate,
  WireApprovalTemplates,
  WireToolApprovalExecution,
  WireToolApprovalState,
  WireUserQuestionState,
} from '@botharness/host-protocol/wire';
import { parseToolApprovalActor } from '../../core/src/workspaces/tool-approval-actor';
import { readChangedBot, type ChangedBotAnswer } from './bots';
import {
  answer,
  count,
  HostAnswerInvalid,
  optional,
  record,
  strings,
  text,
  type HostCall,
} from './host-answer';

export const INHERIT_APPROVAL_TEMPLATE = '@global';

function isApprovalTemplate(value: unknown): value is WireApprovalTemplate {
  const row = record(value);
  return (
    text(row?.['name']) &&
    text(row['title']) &&
    text(row['description']) &&
    typeof row['builtIn'] === 'boolean' &&
    strings(row['usedBy']) &&
    text(row['text'])
  );
}

function nullableString(value: unknown): boolean {
  return value === null || text(value);
}

function isApprovalTemplates(value: unknown): value is WireApprovalTemplates {
  const row = record(value);
  return (
    Array.isArray(row?.['templates']) &&
    row['templates'].every(isApprovalTemplate) &&
    optional(row['selected'], nullableString) &&
    optional(row['globalDefault'], nullableString) &&
    optional(row['effective'], nullableString) &&
    optional(
      row['source'],
      (source) => source === 'global' || source === 'specific' || source === 'off',
    ) &&
    (row['selected'] !== INHERIT_APPROVAL_TEMPLATE || row['globalDefault'] !== undefined)
  );
}

export async function readApprovalTemplates(
  host: HostCall,
  slug?: string,
): Promise<WireApprovalTemplates> {
  const result = answer(
    await host.call('approvalTemplates', slug === undefined ? {} : { slug }),
    isApprovalTemplates,
    'approvalTemplates',
  );
  if (slug !== undefined && result.selected === undefined)
    throw new HostAnswerInvalid('approvalTemplates returned no Bot selection.');
  return result;
}

export async function setBotApprovalTemplate(
  host: HostCall,
  slug: string,
  template: string | null,
): Promise<ChangedBotAnswer> {
  return readChangedBot(
    await host.call('botApprovalTemplateSet', { slug, template }),
    'botApprovalTemplateSet',
    slug,
  );
}

const ruleKinds: ReadonlySet<unknown> = new Set<WireApprovalRule['kind']>([
  'exact',
  'tool',
  'all-opaque',
  'secret-cli',
]);

function isRule(value: unknown): value is WireApprovalRule {
  const row = record(value);
  return (
    row !== undefined &&
    ['id', 'botSlug', 'scopeKey', 'toolName', 'input', 'createdAt'].every((key) =>
      text(row[key]),
    ) &&
    (row['role'] === 'orchestrator' || row['role'] === 'assignment') &&
    ruleKinds.has(row['kind']) &&
    optional(row['autoApprovedCount'], count) &&
    optional(row['revokedAt'], text) &&
    optional(row['externalCreator'], (actor) => parseToolApprovalActor(actor) !== undefined)
  );
}

export async function readToolApprovalRules(
  host: HostCall,
  slug: string,
): Promise<{ rules: WireApprovalRule[] }> {
  const rows = record(await host.call('toolApprovalRules', { slug }))?.['rules'];
  if (
    !Array.isArray(rows) ||
    !rows.every((row: unknown): row is WireApprovalRule => isRule(row) && row.botSlug === slug)
  )
    throw new HostAnswerInvalid('toolApprovalRules returned invalid rules.');
  return { rules: rows };
}

export async function revokeToolApprovalRule(
  host: HostCall,
  slug: string,
  id: string,
): Promise<{ rule: WireApprovalRule }> {
  const rule = record(await host.call('toolApprovalRuleRevoke', { slug, id }))?.['rule'];
  if (!isRule(rule) || rule.id !== id || rule.botSlug !== slug)
    throw new HostAnswerInvalid('toolApprovalRuleRevoke did not return the requested rule.');
  return { rule };
}

export function isApprovalCard(value: unknown): value is WireApprovalCard {
  const row = record(value);
  const kind = row?.['kind'];
  if (
    !row ||
    (kind !== 'tool-approval' && kind !== 'user-question' && kind !== 'private-input') ||
    !text(row['botSlug']) ||
    !text(row['state']) ||
    !text(row['requestedAt']) ||
    !optional(row['decidedAt'], text)
  )
    return false;
  if (row['masked'] === true) return row['opaque'] === undefined && row['decidedBy'] === undefined;
  return (
    row['masked'] === false &&
    typeof row['opaque'] === 'boolean' &&
    optional(row['decidedBy'], (value) => {
      const decider = record(value);
      return text(decider?.['humanId']) && optional(decider['displayName'], text);
    })
  );
}

const executions: ReadonlySet<unknown> = new Set<WireToolApprovalExecution>([
  'waiting-human',
  'waiting-capacity',
  'running',
  'settled',
  'needs-repair',
]);

function isToolApprovalState(value: unknown): value is WireToolApprovalState {
  const row = record(value);
  const status = row?.['status'];
  return (
    row !== undefined &&
    (status === 'pending' || status === 'expired' || status === 'stopped') &&
    optional(row['expiresAt'], (at) => text(at) && Number.isFinite(Date.parse(at))) &&
    optional(row['execution'], (execution) => executions.has(execution)) &&
    optional(row['approval'], isApprovalCard)
  );
}

export async function readToolApprovalStatus(
  host: HostCall,
  channelId: string,
  messageId: string,
): Promise<WireToolApprovalState> {
  return answer(
    await host.call('toolApprovalStatus', { channelId, messageId }),
    isToolApprovalState,
    'toolApprovalStatus',
  );
}

function isUserQuestionState(value: unknown): value is WireUserQuestionState {
  const row = record(value);
  const status = row?.['status'];
  return (
    row !== undefined &&
    (status === 'pending' ||
      status === 'submitted' ||
      status === 'answered' ||
      status === 'expired') &&
    optional(row['approval'], isApprovalCard)
  );
}

export async function readUserQuestionStatus(
  host: HostCall,
  channelId: string,
  messageId: string,
): Promise<WireUserQuestionState> {
  return answer(
    await host.call('userQuestionStatus', { channelId, messageId }),
    isUserQuestionState,
    'userQuestionStatus',
  );
}

function accepted(value: unknown, method: string): { accepted: true } {
  if (record(value)?.['accepted'] !== true)
    throw new HostAnswerInvalid(`${method} was not accepted.`);
  return { accepted: true };
}

export async function decideToolApproval(
  host: HostCall,
  channelId: string,
  messageId: string,
  outcome: ToolApprovalOutcome | 'allowed-always-kind',
): Promise<{ accepted: true }> {
  return accepted(
    await host.call('toolApprovalDecide', { channelId, messageId, outcome }),
    'toolApprovalDecide',
  );
}

export async function answerUserQuestion(
  host: HostCall,
  channelId: string,
  messageId: string,
  answer: QuestionAnswer,
): Promise<{ accepted: true }> {
  return accepted(
    await host.call('userQuestionAnswer', { channelId, messageId, answer }),
    'userQuestionAnswer',
  );
}

export async function overrideAutoRejection(
  host: HostCall,
  itemId: string,
): Promise<{ accepted: true; channelId: string; messageId: string }> {
  const row = record(await host.call('toolAutoRejectionOverride', { itemId }));
  if (row?.['accepted'] !== true || !text(row['channelId']) || !text(row['messageId']))
    throw new HostAnswerInvalid('toolAutoRejectionOverride did not confirm the override.');
  return { accepted: true, channelId: row['channelId'], messageId: row['messageId'] };
}
