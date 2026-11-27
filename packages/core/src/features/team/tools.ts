import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { OrchestratorAgentRun } from '../sessions/agent-run-types.js';

export interface TeamAgentContext {
  currentRun(): OrchestratorAgentRun | undefined;
  speakerPolicyAvailable?: boolean;
}

export function registerSpeakerPolicyTool(
  { currentRun, speakerPolicyAvailable }: TeamAgentContext,
  registerTool: (tool: ToolDefinition) => void,
): void {
  if (speakerPolicyAvailable)
    registerTool(
      defineTool({
        name: 'speaker_policy',
        description:
          'Read the current Host Human roles and resolved advisory topic policy. Latest revision wins and Deny wins conflicts. Omit humanId for the current speaker. This grants no resource access.',
        parameters: { humanId: { type: 'string' }, topic: { type: 'string' } },
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }],
        },
        execute: async (args) => {
          const policy = currentRun()?.speakerPolicy;
          if (!policy) throw new Error('speaker-policy-unavailable');
          return JSON.stringify(policy(args.humanId, args.topic));
        },
      }),
    );
}
