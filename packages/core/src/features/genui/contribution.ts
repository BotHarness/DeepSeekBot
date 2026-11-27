import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import type { HumanContext } from '../../humans/context.js';
import { createGenuiBridgeMethods } from './methods.js';
import { GENUI_AUTHORING_SECTION } from './prompt.js';
import { genuiServiceRpc } from './rpc.js';
import { registerGenuiTools, type GenuiAttachmentReader, type GenuiToolOptions } from './tools.js';

export interface GenuiBridgeContext {
  human: HumanContext;
  deps: Parameters<typeof createGenuiBridgeMethods>[1];
}

export interface GenuiAgentContext {
  getAttachments: GenuiAttachmentReader;
  botSlug: string;
}

export function createGenuiContribution(options?: GenuiToolOptions) {
  return {
    id: 'genui',
    bridgeMethods: ({ human, deps }) => createGenuiBridgeMethods(human, deps),
    rpc: genuiServiceRpc,
    promptSections: () => [{ placement: 'system', ...GENUI_AUTHORING_SECTION }],
    tools: ({ getAttachments, botSlug }, { register }) =>
      registerGenuiTools(getAttachments, register, { ...options, scope: botSlug }),
  } satisfies FeatureContribution<GenuiBridgeContext, GenuiAgentContext>;
}
