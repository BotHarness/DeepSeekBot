import type { BridgeRpcReceiver } from '../../bridge/rpc-types.js';
import { unwrap } from '../../bridge/rpc-result.js';
import type { TelemetryStatus } from '../../telemetry/service.js';
import type { GitStatus } from '../../memory/managed-git.js';
import type { DiagnosticsAdapterMethods } from './methods.js';

export function telemetryEvent(
  methods: DiagnosticsAdapterMethods,
  event: string,
  properties?: Record<string, string | boolean>,
): null {
  return unwrap(methods.telemetryEvent({ event, properties: properties ?? {} }));
}

export function ping(methods: DiagnosticsAdapterMethods) {
  return unwrap(methods.ping({}));
}

export function developerModeSet(
  methods: DiagnosticsAdapterMethods,
  enabled: boolean,
): { accepted: boolean } {
  return unwrap(methods.developerModeSet({ enabled }));
}

export function telemetryStatus(methods: DiagnosticsAdapterMethods): TelemetryStatus {
  return unwrap(methods.telemetryStatus());
}

export function gitStatus(methods: DiagnosticsAdapterMethods): GitStatus {
  return unwrap(methods.gitStatus());
}

export function gitInstall(methods: DiagnosticsAdapterMethods): GitStatus {
  return unwrap(methods.gitInstall());
}

export function telemetrySet(
  methods: DiagnosticsAdapterMethods,
  enabled: boolean,
): TelemetryStatus {
  return unwrap(methods.telemetrySet({ enabled }));
}

export const diagnosticsRpcMethods = {
  telemetryEvent(event: string, properties?: Record<string, string | boolean>): null {
    return telemetryEvent(this.methods, event, properties);
  },

  ping() {
    return ping(this.methods);
  },

  developerModeSet(enabled: boolean): { accepted: boolean } {
    return developerModeSet(this.methods, enabled);
  },
} satisfies ThisType<BridgeRpcReceiver>;

export const hostDiagnosticsRpc = {
  telemetryStatus(): TelemetryStatus {
    return telemetryStatus(this.methods);
  },

  gitStatus(): GitStatus {
    return gitStatus(this.methods);
  },

  gitInstall(): GitStatus {
    return gitInstall(this.methods);
  },

  telemetrySet(enabled: boolean): TelemetryStatus {
    return telemetrySet(this.methods, enabled);
  },
} satisfies ThisType<BridgeRpcReceiver>;
