import { createAssignmentDelivery } from './delivery.js';
import { createAssignmentReporting } from './reporting.js';
import { createAssignmentEvents } from './events.js';
import { createAssignmentExecution } from './runtime-execution.js';
import { createAssignmentIntake } from './runtime-intake.js';
import { createAssignmentRouting } from './runtime-routing.js';
import { createRuntimeAssignmentAccess } from './runtime-access.js';
import { createRuntimeAssignmentLifecycle } from './runtime-lifecycle.js';
import type { HumanContext } from '../../humans/context.js';
import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import { createAssignmentsBridgeMethods, type AssignmentsBridgeDeps } from './methods.js';
import { assignmentAccessRpc, assignmentRpc, assignmentsRpcMethods } from './rpc.js';
import {
  assignmentCoordinationPrompt,
  assignmentMessage,
  ASSIGNMENT_PROMPT,
  DANGER_ASSIGNMENT_PROMPT,
  ASSIGNMENT_REPORT_CONTRACT,
  UNREPORTED_FINAL_PREFIX,
} from './prompt.js';
import type { AssignmentAgentHooks } from '../../runtime/agent-feature-context.js';
import type { PromptText } from '../../prompts/prompt-parts.js';
import {
  createAssignmentTool,
  createAssignmentReportTool,
  ENGINE_REPORT_TOOL,
  isReportState,
  registerAssignmentTools,
  type CreateAssignmentToolOptions,
} from './tools.js';

export interface AssignmentsAgentContext {
  promptText(): PromptText;
  assignmentTool?: CreateAssignmentToolOptions;
}

export function createAssignmentsContribution() {
  return {
    id: 'assignments',
    runtimeServices: {
      createAssignmentDelivery,
      createAssignmentReporting,
      createAssignmentEvents,
      createAssignmentExecution,
      createAssignmentIntake,
      createAssignmentRouting,
      createRuntimeAssignmentAccess,
      createRuntimeAssignmentLifecycle,
    },
    bridgeMethods: ({ human, deps }) => ({ ...createAssignmentsBridgeMethods(human, deps) }),
    rpc: { ...assignmentsRpcMethods, ...assignmentRpc, ...assignmentAccessRpc },
    assignmentAgent: {
      message: assignmentMessage,
      rolePrompt: (fullAccess) => (fullAccess ? DANGER_ASSIGNMENT_PROMPT : ASSIGNMENT_PROMPT),
      reportContract: ASSIGNMENT_REPORT_CONTRACT,
      unreportedFinalPrefix: UNREPORTED_FINAL_PREFIX,
      createReportTool: createAssignmentReportTool,
      engineReportTool: ENGINE_REPORT_TOOL,
      isReportState,
    },
    promptSections: ({ promptText }) => [
      {
        placement: 'slot',
        slot: 'assignment-coordination',
        text: (slot) => assignmentCoordinationPrompt(promptText(), slot('memory-branch')),
      },
    ],
    tools: ({ assignmentTool }, { register }) => {
      if (assignmentTool === undefined) return;
      register(createAssignmentTool(assignmentTool), 'create-assignment');
      registerAssignmentTools(assignmentTool, (tool) => register(tool, 'assignment-tools'));
    },
  } satisfies FeatureContribution<
    { human: HumanContext; deps: AssignmentsBridgeDeps },
    AssignmentsAgentContext,
    never,
    AssignmentAgentHooks
  >;
}
