import type { PersonaBotRegistry } from '../../bots/registry.js';
import type { HumanContext } from '../../humans/context.js';
import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import { createTeamBridge, createTeamBridgeMethods, type TeamBridgeDeps } from './methods.js';
import { apply, mountConfinement } from './plugin.js';
import { SPEAKER_POLICY_PROMPT } from './prompt.js';
import { teamServiceRpc } from './rpc.js';
import { registerSpeakerPolicyTool, type TeamAgentContext } from './tools.js';

export interface TeamBridgeContext {
  human: HumanContext;
  deps: TeamBridgeDeps;
  globalRegistry: PersonaBotRegistry;
}

export function createTeamContribution() {
  return {
    id: 'team',
    bridgeMethods: ({ human, deps, globalRegistry }) => ({
      ...createTeamBridge(human, deps.team),
      ...createTeamBridgeMethods(human, deps, globalRegistry),
    }),
    rpc: teamServiceRpc,
    host: { teamStartup: apply, teamConfinement: mountConfinement },
    promptSections: () => [
      { placement: 'slot', slot: 'speaker-policy', text: () => SPEAKER_POLICY_PROMPT },
    ],
    tools: (context, { register }) =>
      registerSpeakerPolicyTool(context, (tool) => register(tool, 'speaker-policy')),
  } satisfies FeatureContribution<
    TeamBridgeContext,
    TeamAgentContext,
    {
      teamStartup: typeof apply;
      teamConfinement: typeof mountConfinement;
    }
  >;
}
