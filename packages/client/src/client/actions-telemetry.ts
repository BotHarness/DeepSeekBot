import { telemetrySurface } from './telemetry-surface.js';
import type { InvokeAction, BridgeActions } from './actions.js';

export async function recorded<T>(work: Promise<T>, record: () => void): Promise<T> {
  const value = await work;
  record();
  return value;
}

export function createTelemetryActions(invoke: InvokeAction) {
  return {
    telemetryEvent: (event, properties = {}) => {
      void invoke('telemetryEvent', {
        event,
        properties: { ...properties, surface: telemetrySurface() },
      }).catch(() => {});
    },
  } satisfies Pick<BridgeActions, 'telemetryEvent'>;
}
