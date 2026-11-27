import type { FeatureContribution } from './kernel/feature-contribution.js';
import { createBrowserContribution } from './features/browser/contribution.js';
import { createComputerContribution } from './features/computer/contribution.js';
import { createConnectorsContribution } from './features/connectors/contribution.js';
import { createHumansContribution } from './features/humans/contribution.js';
import { createPromptsContribution } from './features/prompts/contribution.js';
import {
  createGenuiContribution,
  type GenuiContributionOptions,
} from './features/genui/contribution.js';
import { createSchedulesContribution } from './features/schedules/contribution.js';
import type { InboxWakeSource } from './kernel/runtime-host.js';

export function createFeatureContributions(options?: {
  genui?: GenuiContributionOptions;
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
  ] as const;
}

export const featureContributions = createFeatureContributions();
export type RegisteredFeatures = typeof featureContributions;

type Intersection<T> = (T extends unknown ? (value: T) => void : never) extends (
  value: infer Result,
) => void
  ? Result
  : never;

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
