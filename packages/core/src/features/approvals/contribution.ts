import type { HumanContext } from '../../humans/context.js';
import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import { createApprovalsBridgeMethods } from './methods.js';
import { mount } from './plugin.js';
import { createRuntimeInputs } from './runtime-inputs.js';
import {
  approvalReviewerRpc,
  approvalTemplateReadRpc,
  approvalTemplateWriteRpc,
  externalApprovalRpc,
  privateInputRpc,
  toolApprovalRpc,
} from './rpc.js';

export interface ApprovalsBridgeContext {
  human: HumanContext;
  deps: Parameters<typeof createApprovalsBridgeMethods>[1];
  globalRegistry: Parameters<typeof createApprovalsBridgeMethods>[2];
  detailOf: Parameters<typeof createApprovalsBridgeMethods>[3];
  messagingCall: Parameters<typeof createApprovalsBridgeMethods>[4];
}

export function createApprovalsContribution() {
  return {
    id: 'approvals',
    bridgeMethods: ({ human, deps, globalRegistry, detailOf, messagingCall }) => ({
      ...createApprovalsBridgeMethods(human, deps, globalRegistry, detailOf, messagingCall),
    }),
    rpc: {
      ...privateInputRpc,
      ...externalApprovalRpc,
      ...approvalTemplateReadRpc,
      ...approvalTemplateWriteRpc,
      ...approvalReviewerRpc,
      ...toolApprovalRpc,
    },
    runtimeServices: { createRuntimeInputs },
    host: { approvalHandlers: mount },
  } satisfies FeatureContribution<
    ApprovalsBridgeContext,
    never,
    { approvalHandlers: typeof mount }
  >;
}
