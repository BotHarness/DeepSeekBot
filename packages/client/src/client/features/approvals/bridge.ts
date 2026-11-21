import type { ModelRouteView } from '../models/bridge.js';
import {
  asRecord,
  bridgeHost,
  stringArray,
  unwrap,
  type BridgeCall,
} from '../../bridge-transport.js';
import * as approvalReaders from '@botharness/host-client/approval-readers';
import type { WireApprovalRule, WireToolApprovalExecution } from '@botharness/host-protocol/wire';
import type { UserQuestionAnswerItem, ApprovalCardView } from '../../store.js';

export function parseApprovalCard(value: unknown): ApprovalCardView | undefined {
  const row = asRecord(value);
  const kind = row?.['kind'];
  if (
    row === undefined ||
    (kind !== 'tool-approval' && kind !== 'user-question' && kind !== 'private-input') ||
    typeof row['state'] !== 'string' ||
    typeof row['botSlug'] !== 'string' ||
    typeof row['requestedAt'] !== 'string'
  )
    return undefined;
  const base = {
    kind,
    state: row['state'],
    botSlug: row['botSlug'],
    requestedAt: row['requestedAt'],
    ...(typeof row['decidedAt'] === 'string' ? { decidedAt: row['decidedAt'] } : {}),
  } as const;
  if (row['masked'] === true) return { masked: true, ...base };
  const decider = asRecord(row['decidedBy']);
  return {
    masked: false,
    ...base,
    opaque: row['opaque'] === true,
    ...(typeof decider?.['humanId'] === 'string'
      ? {
          decidedBy: {
            humanId: decider['humanId'],
            ...(typeof decider['displayName'] === 'string'
              ? { displayName: decider['displayName'] }
              : {}),
          },
        }
      : {}),
  };
}

export type ToolApprovalRuleView = WireApprovalRule;

export async function loadToolApprovalRules(
  call: BridgeCall,
  slug: string,
): Promise<ToolApprovalRuleView[]> {
  return (await approvalReaders.readToolApprovalRules(bridgeHost(call), slug)).rules;
}

export interface ApprovalTemplateView {
  name: string;
  title: string;
  description: string;
  builtIn: boolean;
  usedBy: string[];
  text?: string;
}

function parseApprovalTemplate(item: unknown): ApprovalTemplateView | undefined {
  const template = asRecord(item);
  if (
    typeof template?.['name'] !== 'string' ||
    typeof template['title'] !== 'string' ||
    typeof template['description'] !== 'string'
  )
    return undefined;
  const text = template['text'];
  return {
    name: template['name'],
    title: template['title'],
    description: template['description'],
    builtIn: template['builtIn'] !== false,
    usedBy: stringArray(template['usedBy']),
    ...(typeof text === 'string' ? { text } : {}),
  };
}

export async function loadApprovalTemplates(
  call: BridgeCall,
  slug?: string,
): Promise<{
  templates: ApprovalTemplateView[];
  selected: string | null;
  globalDefault?: string | null;
}> {
  const { templates, selected, globalDefault } = await approvalReaders.readApprovalTemplates(
    bridgeHost(call),
    slug,
  );
  return {
    templates,
    selected: selected ?? null,
    ...(globalDefault === undefined ? {} : { globalDefault }),
  };
}

export async function setGlobalApprovalTemplate(
  call: BridgeCall,
  template: string | null,
): Promise<void> {
  await unwrap(call, 'approvalTemplateGlobalSet', { template });
}

async function writtenApprovalTemplate(
  call: BridgeCall,
  endpoint: 'approvalTemplateCreate' | 'approvalTemplateUpdate',
  payload: Record<string, unknown>,
): Promise<ApprovalTemplateView> {
  const template = parseApprovalTemplate(
    asRecord(await unwrap(call, endpoint, payload))?.['template'],
  );
  if (template === undefined) throw new Error('invalid ' + endpoint + ' response');
  return template;
}

export function createApprovalTemplate(
  call: BridgeCall,
  name: string,
  source: { text: string } | { from: string },
): Promise<ApprovalTemplateView> {
  return writtenApprovalTemplate(call, 'approvalTemplateCreate', {
    name,
    ...source,
  });
}

export function updateApprovalTemplate(
  call: BridgeCall,
  name: string,
  text: string,
): Promise<ApprovalTemplateView> {
  return writtenApprovalTemplate(call, 'approvalTemplateUpdate', {
    name,
    text,
  });
}

export function createApprovalTemplateDeletionBridge<
  ApprovalTemplateDeletionPreview extends { name: string; revision: string },
>(approvalTemplateDeletionPreviewSchema: {
  parse(value: unknown): ApprovalTemplateDeletionPreview;
}) {
  async function previewApprovalTemplateDeletion(
    call: BridgeCall,
    name: string,
  ): Promise<ApprovalTemplateDeletionPreview> {
    const response = asRecord(await unwrap(call, 'approvalTemplateDeletePreview', { name }));
    const preview = approvalTemplateDeletionPreviewSchema.parse(response?.['preview']);
    if (preview.name !== name) throw new Error('invalid approval template deletion target');
    return preview;
  }

  async function deleteApprovalTemplate(
    call: BridgeCall,
    preview: ApprovalTemplateDeletionPreview,
  ): Promise<{ inheritedBots: string[] }> {
    const response = asRecord(
      await unwrap(call, 'approvalTemplateDelete', {
        name: preview.name,
        confirmed: true,
        revision: preview.revision,
      }),
    );
    if (!Array.isArray(response?.['inheritedBots']))
      throw new Error('invalid approvalTemplateDelete response');
    return { inheritedBots: stringArray(response['inheritedBots']) };
  }

  return { previewApprovalTemplateDeletion, deleteApprovalTemplate };
}

export async function setBotApprovalTemplate(
  call: BridgeCall,
  slug: string,
  template: string | null,
): Promise<void> {
  await approvalReaders.setBotApprovalTemplate(bridgeHost(call), slug, template);
}

export interface ApprovalReviewerModelView {
  follows: 'bot' | 'model' | 'invalid';
  model: ModelRouteView | null;
  available?: boolean;
  unavailableReason?: string;
}

function approvalReviewerModelView(response: unknown, method: string): ApprovalReviewerModelView {
  const view = asRecord(response);
  const follows = view?.['follows'];
  const model = asRecord(view?.['model']);
  if (
    (follows !== 'bot' && follows !== 'model' && follows !== 'invalid') ||
    (view?.['model'] !== null &&
      (typeof model?.['provider'] !== 'string' || typeof model['model'] !== 'string'))
  )
    throw new Error(`invalid ${method} response`);
  return {
    follows,
    model:
      model === undefined
        ? null
        : {
            provider: model['provider'] as string,
            model: model['model'] as string,
            ...(typeof model['reasoningEffort'] === 'string'
              ? { reasoningEffort: model['reasoningEffort'] }
              : {}),
          },
    ...(typeof view?.['available'] === 'boolean' ? { available: view['available'] } : {}),
    ...(typeof view?.['unavailableReason'] === 'string'
      ? { unavailableReason: view['unavailableReason'] }
      : {}),
  };
}

export async function loadApprovalReviewerModel(
  call: BridgeCall,
): Promise<ApprovalReviewerModelView> {
  return approvalReviewerModelView(
    await unwrap(call, 'approvalReviewerModel', {}),
    'approvalReviewerModel',
  );
}

export async function setApprovalReviewerModel(
  call: BridgeCall,
  model: ModelRouteView | null,
): Promise<ApprovalReviewerModelView> {
  return approvalReviewerModelView(
    await unwrap(call, 'approvalReviewerModelSet', { model }),
    'approvalReviewerModelSet',
  );
}

export async function revokeToolApprovalRule(
  call: BridgeCall,
  slug: string,
  id: string,
): Promise<void> {
  await approvalReaders.revokeToolApprovalRule(bridgeHost(call), slug, id);
}

export type ToolApprovalExecutionState = WireToolApprovalExecution;

export async function loadToolApprovalStatus(
  call: BridgeCall,
  channelId: string,
  messageId: string,
) {
  return (await approvalReaders.readToolApprovalStatus(bridgeHost(call), channelId, messageId))
    .status;
}

export async function loadToolApprovalState(
  call: BridgeCall,
  channelId: string,
  messageId: string,
) {
  const { status, expiresAt, execution } = await approvalReaders.readToolApprovalStatus(
    bridgeHost(call),
    channelId,
    messageId,
  );
  return {
    status,
    ...(status !== 'pending' || expiresAt === undefined ? {} : { expiresAt }),
    ...(execution === undefined ? {} : { execution }),
  };
}

export async function loadToolApprovalExecutionState(
  call: BridgeCall,
  channelId: string,
  messageId: string,
) {
  return (await approvalReaders.readToolApprovalStatus(bridgeHost(call), channelId, messageId))
    .execution;
}

export async function decideToolApproval(
  call: BridgeCall,
  channelId: string,
  messageId: string,
  outcome: Parameters<typeof approvalReaders.decideToolApproval>[3],
): Promise<void> {
  await approvalReaders.decideToolApproval(bridgeHost(call), channelId, messageId, outcome);
}

export async function loadUserQuestionStatus(
  call: BridgeCall,
  channelId: string,
  messageId: string,
): Promise<'pending' | 'submitted' | 'answered' | 'expired'> {
  return (await approvalReaders.readUserQuestionStatus(bridgeHost(call), channelId, messageId))
    .status;
}

export async function answerUserQuestion(
  call: BridgeCall,
  channelId: string,
  messageId: string,
  answers: UserQuestionAnswerItem[],
): Promise<void> {
  await approvalReaders.answerUserQuestion(bridgeHost(call), channelId, messageId, { answers });
}

export async function overrideAutoRejection(call: BridgeCall, itemId: string): Promise<void> {
  await approvalReaders.overrideAutoRejection(bridgeHost(call), itemId);
}

export async function setApprovalRoute(
  call: BridgeCall,
  slug: string,
  pairingId: string | null,
  expectedRevision: number,
): Promise<void> {
  await unwrap(call, 'approvalRoute', { slug, pairingId, expectedRevision });
}

export async function testApprovalRoute(call: BridgeCall, slug: string): Promise<void> {
  await unwrap(call, 'approvalTest', { slug });
}

export async function retryApprovalNotification(
  call: BridgeCall,
  slug: string,
  id: string,
): Promise<void> {
  await unwrap(call, 'approvalRetry', { slug, id });
}

export async function retryQuestionNotification(
  call: BridgeCall,
  slug: string,
  id: string,
): Promise<void> {
  await unwrap(call, 'questionRetry', { slug, id });
}
