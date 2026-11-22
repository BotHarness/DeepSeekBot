import type { SubscriptionModel } from '@botharness/host-client/model-plans';
import type { SubChoices } from '@botharness/host-client/preset-sub';
import {
  presetSubFromLegacy,
  presetSubWithEngine,
  type LegacySubSource,
} from '@botharness/host-protocol/preset-sub';

export function subOf(
  source: LegacySubSource | undefined,
  engine?: SubscriptionModel | null,
): SubChoices {
  if (source?.sub !== undefined) return source.sub;
  return presetSubWithEngine(presetSubFromLegacy(source ?? {}), engine ?? undefined);
}
