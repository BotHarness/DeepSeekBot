import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import { createBotModeBridgeMethods, type BotModesDeps } from './methods.js';
import { mountCompanionRoute, mountDesktopRoutes } from './plugin.js';
import { appearanceStreams, botModeRpc } from './rpc.js';

export interface AppearanceBridgeContext {
  deps: {
    botModes?: BotModesDeps;
    registry: Parameters<typeof createBotModeBridgeMethods>[0]['registry'];
  };
  globalRegistry: NonNullable<Parameters<typeof createBotModeBridgeMethods>[0]['everyone']>;
}

export interface AppearanceHostHooks {
  beforeVoiceRoutes(...args: Parameters<typeof mountDesktopRoutes>): void;
  afterLiveRoute(...args: Parameters<typeof mountCompanionRoute>): void;
}

export function createAppearanceContribution() {
  return {
    id: 'appearance',
    bridgeMethods: ({ deps, globalRegistry }) =>
      createBotModeBridgeMethods({
        modes: deps.botModes,
        registry: deps.registry,
        everyone: globalRegistry,
      }),
    rpc: botModeRpc,
    streams: appearanceStreams,
    host: { beforeVoiceRoutes: mountDesktopRoutes, afterLiveRoute: mountCompanionRoute },
  } satisfies FeatureContribution<AppearanceBridgeContext, never, AppearanceHostHooks>;
}
