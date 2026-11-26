import type { Context } from '@deepseek-ai/cordis';
import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import type { DeveloperMode, NativeSkillsOptions } from './plugin.js';
import { createSkillsBridgeMethods } from './methods.js';
import { skillRpc } from './rpc.js';

export interface SkillsBridgeContext {
  deps: Parameters<typeof createSkillsBridgeMethods>[0];
  channelSkillBots: Parameters<typeof createSkillsBridgeMethods>[1];
  requireOwnedBot: Parameters<typeof createSkillsBridgeMethods>[2];
}

export interface SkillsHostHooks {
  beforeReleaseInstaller(ctx: Context, developerMode: DeveloperMode): void;
  beforeSessionChangeTracking(mountWatch: () => void): void;
  beforeConnections(
    mount: (options: NativeSkillsOptions) => void,
    options: NativeSkillsOptions,
  ): void;
}

export function createSkillsContribution() {
  return {
    id: 'skills',
    bridgeMethods: ({ deps, channelSkillBots, requireOwnedBot }) =>
      createSkillsBridgeMethods(deps, channelSkillBots, requireOwnedBot),
    rpc: skillRpc,
    host: {
      beforeReleaseInstaller(ctx, developerMode) {
        ctx.inject(['settings'], (settingsCtx) => {
          developerMode.mountSettings(settingsCtx, (listener) =>
            settingsCtx.on('settings/document-updated', listener),
          );
        });
      },
      beforeSessionChangeTracking: (mountWatch) => mountWatch(),
      beforeConnections: (mount, options) => mount(options),
    },
  } satisfies FeatureContribution<SkillsBridgeContext, never, SkillsHostHooks>;
}
