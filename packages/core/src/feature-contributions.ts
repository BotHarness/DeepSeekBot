import type { FeatureContribution } from './kernel/feature-contribution.js';
import { createBrowserContribution } from './features/browser/contribution.js';
import { createComputerContribution } from './features/computer/contribution.js';
import { createConnectorsContribution } from './features/connectors/contribution.js';
import { createHumansContribution } from './features/humans/contribution.js';
import { createPromptsContribution } from './features/prompts/contribution.js';
import { createCloudContribution } from './features/cloud/contribution.js';
import { createDiagnosticsContribution } from './features/diagnostics/contribution.js';
import { createUsageContribution } from './features/usage/contribution.js';
import { createProfileStorageContribution } from './features/profile-storage/contribution.js';
import { createReleaseContribution } from './features/release/contribution.js';
import { createMarketplaceContribution } from './features/marketplace/contribution.js';
import { createAppearanceContribution } from './features/appearance/contribution.js';
import { createAvatarsContribution } from './features/avatars/contribution.js';
import { createSkillsContribution } from './features/skills/contribution.js';
import { createGenuiContribution } from './features/genui/contribution.js';
import type { GenuiToolOptions } from './features/genui/tools.js';
import { createSchedulesContribution } from './features/schedules/contribution.js';
import { createVoiceContribution } from './features/voice/contribution.js';
import { createTakeoverContribution } from './features/takeover/contribution.js';
import { createEnvironmentsContribution } from './features/environments/contribution.js';
import { createMessagingContribution } from './features/messaging/contribution.js';
import { createChannelFilesContribution } from './features/channel-files/contribution.js';
import { createChannelsContribution } from './features/channels/contribution.js';
import type { InboxWakeSource } from './kernel/runtime-host.js';

export function createFeatureContributions(options?: {
  genui?: GenuiToolOptions;
  scheduleWakeSource?: InboxWakeSource;
}) {
  return [
    createSchedulesContribution(options?.scheduleWakeSource),
    createGenuiContribution(options?.genui),
    createBrowserContribution(),
    createComputerContribution(),
    createConnectorsContribution(),
    createHumansContribution(),
    createPromptsContribution(),
    createCloudContribution(),
    createProfileStorageContribution(),
    createDiagnosticsContribution(),
    createUsageContribution(),
    createChannelsContribution(),
    createAppearanceContribution(),
    createAvatarsContribution(),
    createSkillsContribution(),
    createReleaseContribution(),
    createMarketplaceContribution(),
    createVoiceContribution(),
    createTakeoverContribution(),
    createEnvironmentsContribution(),
    createMessagingContribution(),
    createChannelFilesContribution(),
  ] as const;
}

export const featureContributions = createFeatureContributions();
export type RegisteredFeatures = typeof featureContributions;

type Intersection<T> = (T extends unknown ? (value: T) => void : never) extends (
  value: infer Result,
) => void
  ? Result
  : never;

type HostHooks = Partial<
  Intersection<Extract<RegisteredFeatures[number], { host: object }>['host']>
>;

export function forEachHostFeature(
  features: RegisteredFeatures,
  visit: (hooks: HostHooks) => void,
) {
  for (const feature of features) {
    if ('host' in feature) visit(feature.host);
  }
}

export function mergeFeatureMethods<T extends object>(tables: readonly T[]): Intersection<T> {
  const methods = {};
  for (const table of tables) {
    for (const name of Object.keys(table)) {
      if (Object.hasOwn(methods, name)) throw new Error(`Duplicate feature method: ${name}`);
    }
    Object.assign(methods, table);
  }
  return methods as Intersection<T>;
}

type RegisteredBridgeContext = Parameters<
  Extract<
    (typeof featureContributions)[number],
    { bridgeMethods: NonNullable<FeatureContribution['bridgeMethods']> }
  >['bridgeMethods']
>[0];
type InvocationContext<T> = T extends unknown ? Omit<T, 'deps'> : never;
export type ContributedBridgeDeps = Intersection<RegisteredBridgeContext['deps']> & {
  featureContributions?: RegisteredFeatures;
};

export function contributedBridgeMethods(
  deps: ContributedBridgeDeps,
  invocation: Intersection<InvocationContext<RegisteredBridgeContext>>,
) {
  return mergeFeatureMethods(
    (deps.featureContributions ?? featureContributions).flatMap((feature) =>
      'bridgeMethods' in feature ? [feature.bridgeMethods({ ...invocation, deps })] : [],
    ),
  );
}
