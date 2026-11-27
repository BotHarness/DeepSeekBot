import type { Context } from '@deepseek-ai/cordis';
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment';
import type { FeatureContribution } from '../kernel/feature-contribution.js';
import type { PromptText } from '../prompts/prompt-parts.js';
import type { OrchestratorAgentRun } from './bot-runtime.js';
import type { CreateAssignmentToolOptions } from '../features/assignments/tools.js';
import type {
  createAssignmentReportTool,
  isReportState,
  ENGINE_REPORT_TOOL,
} from '../features/assignments/tools.js';
import type { assignmentMessage } from '../features/assignments/prompt.js';
import type { AssignmentModelToolOptions } from '../features/models/tools.js';

export interface AgentFeatureContext {
  getAttachments(): Pick<AttachmentStore, 'saveImage' | 'imageLimits'> | undefined;
  readonly botSlug: string;
  readonly currentRun: () => OrchestratorAgentRun | undefined;
  readonly promptText: () => PromptText;
  readonly engineChannel?: () => string | undefined;
  readonly assignmentTool?: CreateAssignmentToolOptions;
  readonly assignmentModelTool?: AssignmentModelToolOptions;
  readonly workspaceSessionsAvailable?: boolean;
  readonly speakerPolicyAvailable?: boolean;
}

export interface AssignmentAgentHooks {
  message: typeof assignmentMessage;
  rolePrompt(fullAccess: boolean): string;
  reportContract: string;
  unreportedFinalPrefix: string;
  createReportTool: typeof createAssignmentReportTool;
  engineReportTool: typeof ENGINE_REPORT_TOOL;
  isReportState: typeof isReportState;
}

export type AgentFeatureContribution = Pick<
  FeatureContribution<never, AgentFeatureContext, never, AssignmentAgentHooks>,
  'id' | 'promptSections' | 'tools' | 'assignmentAgent'
>;

export function requireAssignmentAgentHooks(
  features: readonly AgentFeatureContribution[],
): AssignmentAgentHooks {
  const hooks = features.find((feature) => feature.assignmentAgent !== undefined)?.assignmentAgent;
  if (hooks === undefined) throw new Error('Assignment Agent feature is unavailable');
  return hooks;
}

export function agentFeatureContext(
  adapter: {
    runs: Pick<
      ReadonlyMap<
        string,
        { role: 'orchestrator'; run: OrchestratorAgentRun } | { role: 'assignment' }
      >,
      'get'
    >;
    promptText(sessionId: string): PromptText;
  },
  run: OrchestratorAgentRun,
  agentContext?: Pick<Context, 'get'>,
): AgentFeatureContext {
  return {
    getAttachments: () => agentContext?.get('attachments'),
    botSlug: run.bot.slug,
    currentRun: () => {
      const current = adapter.runs.get(run.sessionId);
      return current?.role === 'orchestrator' ? current.run : undefined;
    },
    promptText: () => adapter.promptText(run.sessionId),
  };
}
