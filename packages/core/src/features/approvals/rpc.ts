import { unwrap, unwrapAsync } from '../../bridge/rpc-result.js';
import type { ApprovalTemplateDeletionPreview } from '../../workspaces/approval-template-deletion-contract.js';
import type { ApprovalCard } from '../../team/approval-contract.js';
import type { ApprovalReviewerModelView } from '../../bridge/methods.js';
import type { ModelRoute } from '../../models/presets.js';
import type { PersonaBotDetail, ApprovalTemplateEntry } from '../../bridge/methods.js';
import type { ToolApprovalRule } from '../../workspaces/tool-approval-rules.js';
import type { ToolApprovalHistoryEntry } from '../../channels/approval-history.js';
import type { ApprovalsBridgeMethods } from './methods.js';

export function approvalRoute(
  methods: ApprovalsBridgeMethods,
  slug: string,
  pairingId: string | null,
  expectedRevision: number,
): Promise<{ updated: true }> {
  return unwrapAsync(methods.approvalRoute({ slug, pairingId, expectedRevision }));
}

export function approvalTest(
  methods: ApprovalsBridgeMethods,
  slug: string,
): Promise<{
  delivery: import('../../messaging/approval-messaging.js').ApprovalDelivery;
}> {
  return unwrapAsync(methods.approvalTest({ slug }));
}

export function questionRetry(
  methods: ApprovalsBridgeMethods,
  slug: string,
  id: string,
): Promise<{ updated: true }> {
  return unwrapAsync(methods.questionRetry({ slug, id }));
}

export function approvalRetry(
  methods: ApprovalsBridgeMethods,
  slug: string,
  id: string,
): Promise<{
  delivery: import('../../messaging/approval-messaging.js').ApprovalDelivery;
}> {
  return unwrapAsync(methods.approvalRetry({ slug, id }));
}

export function approvalTemplates(
  methods: ApprovalsBridgeMethods,
  slug?: string,
): {
  templates: ApprovalTemplateEntry[];
  selected?: string | null;
  globalDefault?: string | null;
  effective?: string | null;
  source?: 'global' | 'specific' | 'off';
} {
  return unwrap(methods.approvalTemplates(slug === undefined ? {} : { slug }));
}

export function approvalTemplateCreate(
  methods: ApprovalsBridgeMethods,
  name: string,
  text?: string,
  from?: string,
): { template: ApprovalTemplateEntry } {
  return unwrap(
    methods.approvalTemplateCreate({
      name,
      ...(text === undefined ? {} : { text }),
      ...(from === undefined ? {} : { from }),
    }),
  );
}

export function approvalTemplateUpdate(
  methods: ApprovalsBridgeMethods,
  name: string,
  text: string,
): { template: ApprovalTemplateEntry } {
  return unwrap(methods.approvalTemplateUpdate({ name, text }));
}

export function approvalTemplateDeletePreview(
  methods: ApprovalsBridgeMethods,
  name: string,
): { preview: ApprovalTemplateDeletionPreview } {
  return unwrap(methods.approvalTemplateDeletePreview({ name }));
}

export function approvalTemplateDelete(
  methods: ApprovalsBridgeMethods,
  name: string,
  confirmed: boolean,
  revision: string,
): {
  template: { name: string };
  clearedBots: string[];
  inheritedBots: string[];
  globalDefault: string | null;
} {
  return unwrap(methods.approvalTemplateDelete({ name, confirmed, revision }));
}

export function approvalTemplateGlobalSet(
  methods: ApprovalsBridgeMethods,
  template: string | null,
): { template: string | null } {
  return unwrap(methods.approvalTemplateGlobalSet({ template }));
}

export function botApprovalTemplateSet(
  methods: ApprovalsBridgeMethods,
  slug: string,
  template: string | null,
): { bot: PersonaBotDetail } {
  return unwrap(methods.botApprovalTemplateSet({ slug, template }));
}

export function approvalReviewerModel(
  methods: ApprovalsBridgeMethods,
): Promise<ApprovalReviewerModelView> {
  return unwrapAsync(methods.approvalReviewerModel({}));
}

export function approvalReviewerModelSet(
  methods: ApprovalsBridgeMethods,
  model: ModelRoute | null,
): Promise<ApprovalReviewerModelView> {
  return unwrapAsync(methods.approvalReviewerModelSet({ model }));
}

export function toolApprovalRules(
  methods: ApprovalsBridgeMethods,
  slug: string,
): { rules: ToolApprovalRule[] } {
  return unwrap(methods.toolApprovalRules({ slug }));
}

export function toolApprovalRuleRevoke(
  methods: ApprovalsBridgeMethods,
  slug: string,
  id: string,
): { rule: ToolApprovalRule } {
  return unwrap(methods.toolApprovalRuleRevoke({ slug, id }));
}

export function toolApprovalHistory(
  methods: ApprovalsBridgeMethods,
  slug: string,
  page?: { cursor?: string; limit?: number },
): { entries: ToolApprovalHistoryEntry[]; nextCursor?: string } {
  return unwrap(methods.toolApprovalHistory({ slug, ...page }));
}

export function toolApprovalStatus(
  methods: ApprovalsBridgeMethods,
  channelId: string,
  messageId: string,
): {
  approval?: ApprovalCard;
  status: 'pending' | 'expired' | 'stopped';
  execution?: 'waiting-human' | 'waiting-capacity' | 'running' | 'settled' | 'needs-repair';
} {
  return unwrap(methods.toolApprovalStatus({ channelId, messageId }));
}

export function toolApprovalDecide(
  methods: ApprovalsBridgeMethods,
  channelId: string,
  messageId: string,
  outcome:
    | 'allowed-once'
    | 'allowed-always-tool'
    | 'allowed-always-exact'
    | 'allowed-always-all'
    | 'rejected',
): Promise<{ accepted: boolean }> {
  return unwrapAsync(methods.toolApprovalDecide({ channelId, messageId, outcome }));
}

export function toolAutoRejectionOverride(
  methods: ApprovalsBridgeMethods,
  itemId: string,
): Promise<{ accepted: true; channelId: string; messageId: string }> {
  return unwrapAsync(methods.toolAutoRejectionOverride({ itemId }));
}

export function userQuestionStatus(
  methods: ApprovalsBridgeMethods,
  channelId: string,
  messageId: string,
): { status: 'pending' | 'submitted' | 'answered' | 'expired'; approval?: ApprovalCard } {
  return unwrap(methods.userQuestionStatus({ channelId, messageId }));
}

export function userQuestionAnswer(
  methods: ApprovalsBridgeMethods,
  channelId: string,
  messageId: string,
  answer: { answers: { id: string; selected: string[]; custom?: string }[] },
): Promise<{ accepted: boolean }> {
  return unwrapAsync(methods.userQuestionAnswer({ channelId, messageId, answer }));
}
