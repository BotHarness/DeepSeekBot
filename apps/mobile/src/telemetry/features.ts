import type { EventProperties, FeatureEventName } from './schema';

type FeatureSink = <E extends FeatureEventName>(event: E, properties: EventProperties[E]) => void;

let sink: FeatureSink | undefined;

export function setFeatureSink(next: FeatureSink | undefined): void {
  sink = next;
}

export function recordFeature<E extends FeatureEventName>(
  event: E,
  properties: EventProperties[E],
): void {
  try {
    sink?.(event, properties);
  } catch {}
}
