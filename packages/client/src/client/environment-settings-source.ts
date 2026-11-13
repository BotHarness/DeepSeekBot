import type { ModelSettingsClient } from '../../../../apps/mobile/src/host/bot-settings.js';
import { unwrap, type BridgeCall } from './bridge.js';

interface LocalEnvironmentSettings {
  models: ModelSettingsClient;
  openPreferences(): void;
  openHostSettings(): void;
}

let local: LocalEnvironmentSettings | undefined;

export function mountLocalEnvironmentSettings(
  call: BridgeCall,
  openPreferences: () => void,
  openHostSettings: () => void,
) {
  const source: LocalEnvironmentSettings = {
    models: { call: (method, args = {}) => unwrap(call, method, args) },
    openPreferences,
    openHostSettings,
  };
  local = source;
  return () => {
    if (local === source) local = undefined;
  };
}

export function localEnvironmentSettings(): LocalEnvironmentSettings | undefined {
  return local;
}
