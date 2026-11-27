import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import { createVoiceBridgeMethods, type VoiceBridgeDeps } from './methods.js';
import { mountFetch } from './plugin.js';
import { voiceProviderRpc, voiceSettingsRpc } from './rpc.js';

export interface VoiceBridgeContext {
  deps: VoiceBridgeDeps & { registry: Parameters<typeof createVoiceBridgeMethods>[0]['registry'] };
  isHostOwner: () => boolean;
}

export function createVoiceContribution() {
  return {
    id: 'voice',
    bridgeMethods: ({ deps, isHostOwner }) =>
      createVoiceBridgeMethods({
        providers: deps.voiceProviders,
        registry: deps.registry,
        isHostOwner,
        log: deps.voiceLog,
      }),
    rpc: { ...voiceProviderRpc, ...voiceSettingsRpc },
    host: { voiceRoutes: mountFetch },
  } satisfies FeatureContribution<VoiceBridgeContext, never, { voiceRoutes: typeof mountFetch }>;
}
