import type { ModelSettingsClient } from '../../../../apps/mobile/src/host/bot-settings.js';
import { unwrap, type BridgeCall } from './bridge.js';

interface LocalModelBinding {
  readonly models: ModelSettingsClient;
  readonly hostId: string | undefined;
  readonly generation: number;
}

interface LocalEnvironmentSettings {
  readonly models: ModelSettingsClient;
  resolveIdentity(hostId: string | undefined): LocalModelBinding;
  openPreferences(): void;
  openHostSettings(): void;
}

let local: LocalEnvironmentSettings | undefined;

export function mountLocalEnvironmentSettings(
  call: BridgeCall,
  openPreferences: () => void,
  openHostSettings: () => void,
) {
  let binding: LocalModelBinding;
  let source: LocalEnvironmentSettings;
  const createModels = (): ModelSettingsClient => {
    const models: ModelSettingsClient = {
      async call(method, args = {}) {
        if (local !== source || binding.models !== models)
          throw Error('environment-settings-owner-changed');
        const value = await unwrap(call, method, args);
        if (local !== source || binding.models !== models)
          throw Error('environment-settings-owner-changed');
        return value;
      },
    };
    return models;
  };
  binding = { models: createModels(), hostId: undefined, generation: 0 };
  source = {
    get models() {
      return binding.models;
    },
    resolveIdentity(hostId) {
      if (hostId !== undefined && binding.hostId !== undefined && hostId !== binding.hostId)
        binding = { models: createModels(), hostId, generation: binding.generation + 1 };
      else if (hostId !== undefined) binding = { ...binding, hostId };
      return binding;
    },
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
