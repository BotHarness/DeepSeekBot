import {
  loadToolApprovalRules,
  loadApprovalTemplates,
  setBotApprovalTemplate,
  loadApprovalReviewerModel,
  setApprovalReviewerModel,
  type ApprovalReviewerModelView,
  type ApprovalTemplateView,
  revokeToolApprovalRule,
  type ToolApprovalRuleView,
  loadToolApprovalStatus,
  loadToolApprovalExecutionState,
  loadToolApprovalState,
  type ToolApprovalExecutionState,
  decideToolApproval,
  loadUserQuestionStatus,
  settleTakeover,
  answerUserQuestion,
  type ModelRouteView,
  type BridgeCall,
} from './bridge.js';
import type { UserQuestionAnswerItem } from './store.js';
import type { BridgeActions } from './actions.js';
import type { createActivityActions } from './actions-activity.js';
import { recorded } from './actions-telemetry.js';

export interface ApprovalActions {
  listToolApprovalRules(slug: string): Promise<ToolApprovalRuleView[]>;
  approvalTemplates?(slug: string): Promise<{
    templates: ApprovalTemplateView[];
    selected: string | null;
    globalDefault?: string | null;
  }>;
  setBotApprovalTemplate?(slug: string, template: string | null): Promise<void>;
  approvalReviewerModel?(): Promise<ApprovalReviewerModelView>;
  setApprovalReviewerModel?(model: ModelRouteView | null): Promise<ApprovalReviewerModelView>;
  revokeToolApprovalRule(slug: string, id: string): Promise<void>;
  toolApprovalStatus(
    channelId: string,
    messageId: string,
  ): Promise<import('./bridge.js').ToolApprovalStatus>;
  settleTakeover?(
    channelId: string,
    messageId: string,
    outcome: 'done' | 'failed' | 'cancelled',
  ): Promise<'done' | 'failed' | 'cancelled' | 'expired' | undefined>;
  toolApprovalState?(
    channelId: string,
    messageId: string,
  ): Promise<{
    status: import('./bridge.js').ToolApprovalStatus;
    execution?: ToolApprovalExecutionState;
    expiresAt?: string;
  }>;
  toolApprovalExecutionState?(
    channelId: string,
    messageId: string,
  ): Promise<ToolApprovalExecutionState | undefined>;
  decideToolApproval(
    channelId: string,
    messageId: string,
    outcome:
      | 'allowed-once'
      | 'allowed-always-tool'
      | 'allowed-always-exact'
      | 'allowed-always-all'
      | 'rejected',
  ): Promise<void>;
  userQuestionStatus(
    channelId: string,
    messageId: string,
  ): Promise<'pending' | 'submitted' | 'answered' | 'expired'>;
  answerUserQuestion(
    channelId: string,
    messageId: string,
    answers: UserQuestionAnswerItem[],
  ): Promise<void>;
}

const APPROVAL_DECISIONS = {
  'allowed-once': 'allow_once',
  'allowed-always-tool': 'allow_always',
  'allowed-always-exact': 'allow_always',
  'allowed-always-all': 'allow_always',
  rejected: 'reject',
} as const;

export function createApprovalActions(
  call: BridgeCall,
  getActions: () => Pick<BridgeActions, 'telemetryEvent'>,
  settleNativeInboxAction: ReturnType<typeof createActivityActions>['settleNativeInboxAction'],
) {
  return {
    listToolApprovalRules: (slug) => loadToolApprovalRules(call, slug),
    approvalTemplates: (slug) => loadApprovalTemplates(call, slug),
    setBotApprovalTemplate: (slug, template) => setBotApprovalTemplate(call, slug, template),
    approvalReviewerModel: () => loadApprovalReviewerModel(call),
    setApprovalReviewerModel: (model) => setApprovalReviewerModel(call, model),
    revokeToolApprovalRule: (slug, id) => revokeToolApprovalRule(call, slug, id),
    toolApprovalStatus: (channelId, messageId) =>
      loadToolApprovalStatus(call, channelId, messageId),
    settleTakeover: (channelId, messageId, outcome) =>
      settleTakeover(call, channelId, messageId, outcome),
    toolApprovalState: (channelId, messageId) => loadToolApprovalState(call, channelId, messageId),
    toolApprovalExecutionState: (channelId, messageId) =>
      loadToolApprovalExecutionState(call, channelId, messageId),
    decideToolApproval: (channelId, messageId, outcome) =>
      recorded(
        settleNativeInboxAction(
          'tool-approval',
          channelId,
          messageId,
          () => decideToolApproval(call, channelId, messageId, outcome),
          () => loadToolApprovalStatus(call, channelId, messageId),
        ),
        () =>
          getActions().telemetryEvent('activity:approval_submit', {
            decision: APPROVAL_DECISIONS[outcome],
          }),
      ),
    userQuestionStatus: (channelId, messageId) =>
      loadUserQuestionStatus(call, channelId, messageId),
    answerUserQuestion: (channelId, messageId, answers) =>
      recorded(
        settleNativeInboxAction(
          'user-question',
          channelId,
          messageId,
          () => answerUserQuestion(call, channelId, messageId, answers),
          () => loadUserQuestionStatus(call, channelId, messageId),
        ),
        () => getActions().telemetryEvent('activity:question_submit'),
      ),
  } satisfies ApprovalActions;
}
