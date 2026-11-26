import type { Context } from '@deepseek-ai/cordis';
import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import type { HumanContext } from '../../humans/context.js';
import { createGenuiBridgeMethods } from './methods.js';
import { GENUI_AUTHORING_SECTION } from './prompt.js';
import { genuiServiceRpc } from './rpc.js';
import { registerGenuiTools } from './tools.js';

export interface GenuiBridgeContext {
  human: HumanContext;
  deps: Parameters<typeof createGenuiBridgeMethods>[1];
}

export interface GenuiAgentContext {
  agentContext: Pick<Context, 'get'>;
  botSlug: string;
}

export type GenuiContributionOptions = Omit<Parameters<typeof registerGenuiTools>[2], 'scope'>;

export function createGenuiContribution(options?: GenuiContributionOptions) {
  return {
    id: 'genui',
    bridgeMethods: ({ human, deps }) => createGenuiBridgeMethods(human, deps),
    rpc: genuiServiceRpc,
    promptSections: () => [{ placement: 'system', ...GENUI_AUTHORING_SECTION }],
    tools: ({ agentContext, botSlug }, { register }) =>
      registerGenuiTools(agentContext, register, {
        browserPath: options?.browserPath,
        onDiagnostic: options?.onDiagnostic,
        attachmentContext: options?.attachmentContext,
        scope: botSlug,
      }),
  } satisfies FeatureContribution<GenuiBridgeContext, GenuiAgentContext>;
}
