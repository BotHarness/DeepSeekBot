import type { HumanContext } from './humans/context.js';
import type { FeatureContribution } from './kernel/feature-contribution.js';
import { createBrowserContribution } from './features/browser/contribution.js';
import { createComputerContribution } from './features/computer/contribution.js';
import type { PersonaBotDetailProjection } from './features/personabots/bot-details.js';
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

type RegisteredBridgeFactory = Extract<
  (typeof featureContributions)[number],
  { bridgeMethods: NonNullable<FeatureContribution['bridgeMethods']> }
>['bridgeMethods'];
export type ContributedBridgeDeps = Intersection<Parameters<RegisteredBridgeFactory>[0]['deps']> & {
  featureContributions?: RegisteredFeatures;
};

export function contributedBridgeMethods(
  human: HumanContext,
  deps: ContributedBridgeDeps,
  detailOf: PersonaBotDetailProjection,
) {
  return mergeFeatureMethods(
    (deps.featureContributions ?? featureContributions).flatMap((feature) =>
      'bridgeMethods' in feature ? [feature.bridgeMethods({ human, deps, detailOf })] : [],
    ),
  );
}
