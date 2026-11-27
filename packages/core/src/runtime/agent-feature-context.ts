import type { Context } from '@deepseek-ai/cordis';
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment';
import type { FeatureContribution } from '../kernel/feature-contribution.js';
import type { PromptText } from '../prompts/prompt-parts.js';
import type { OrchestratorAgentRun } from './bot-runtime.js';
import type { AssignmentModelToolOptions } from '../features/models/tools.js';

export interface AgentFeatureContext {
  getAttachments(): Pick<AttachmentStore, 'saveImage' | 'imageLimits'> | undefined;
  readonly botSlug: string;
  readonly currentRun: () => OrchestratorAgentRun | undefined;
  readonly promptText: () => PromptText;
  readonly assignmentModelTool?: AssignmentModelToolOptions;
  readonly workspaceSessionsAvailable?: boolean;
}

export type AgentFeatureContribution = Pick<
  FeatureContribution<never, AgentFeatureContext>,
  'id' | 'promptSections' | 'tools'
>;

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
