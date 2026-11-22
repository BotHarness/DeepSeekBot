import { asObject, invalidInput, type BridgeResult } from '../../bridge/method-utils.js';
import {
  isClientTelemetryEventName,
  telemetryEventProperties,
  type TelemetrySurface,
} from '../../telemetry/events.js';
import type { TelemetryStatus } from '../../telemetry/service.js';
import { probeGit } from '../../memory/git-probe.js';
import type { GitStatus } from '../../memory/managed-git.js';
import { MIN_PHONE_APP_VERSION } from '../../devices/client-compat.js';
import type { BridgeMethodsDeps } from '../../bridge/methods.js';

function unmanagedGitStatus(): GitStatus {
  const git = probeGit();
  return git.available
    ? {
        ...git,
        source: 'system',
        installable: false,
        install: { phase: 'idle' },
      }
    : { ...git, installable: false, install: { phase: 'idle' } };
}

function telemetryUnavailable(): BridgeResult<never> {
  return {
    ok: false,
    error: {
      code: 'telemetry-unavailable',
      message: 'Usage statistics are unavailable',
    },
  };
}

export interface DiagnosticsAdapterMethods {
  telemetryEvent(payload: unknown): BridgeResult<null>;
  ping(payload: unknown): BridgeResult<{ ok: true; version?: string; minAppVersion: string }>;
  developerModeSet(payload: unknown): BridgeResult<{ accepted: boolean }>;
  telemetryStatus(): BridgeResult<TelemetryStatus>;
  gitStatus(): BridgeResult<GitStatus>;
  gitInstall(): BridgeResult<GitStatus>;
  telemetrySet(payload: unknown): BridgeResult<TelemetryStatus>;
}

export function createDiagnosticsAdapterMethods(
  deps: BridgeMethodsDeps,
): DiagnosticsAdapterMethods {
  return {
    telemetryEvent(payload) {
      const source = asObject(payload);
      const event = source['event'];
      if (!isClientTelemetryEventName(event)) return invalidInput('Unknown telemetry event');
      const properties = telemetryEventProperties(event, asObject(source['properties']));
      if (properties === undefined) return invalidInput('Invalid telemetry event properties');
      deps.telemetry?.capture?.(event, properties);
      if (event === 'app:bot_mode_enter') {
        const surface = properties['surface'];
        deps.activeDay?.mark(
          'bot_mode_enter',
          typeof surface === 'string' ? (surface as TelemetrySurface) : undefined,
        );
      }
      return { ok: true, value: null };
    },
    telemetryStatus() {
      return {
        ok: true,
        value: deps.telemetry?.status() ?? {
          enabled: false,
          preference: false,
        },
      };
    },
    gitStatus() {
      return { ok: true, value: deps.git?.status() ?? unmanagedGitStatus() };
    },
    gitInstall() {
      return { ok: true, value: deps.git?.install() ?? unmanagedGitStatus() };
    },
    telemetrySet(payload) {
      const enabled = asObject(payload)['enabled'];
      if (typeof enabled !== 'boolean') return invalidInput('enabled is required');
      if (deps.telemetry === undefined) return telemetryUnavailable();
      try {
        return { ok: true, value: deps.telemetry.setPreference(enabled) };
      } catch {
        return {
          ok: false,
          error: {
            code: 'telemetry-persist-failed',
            message: 'The usage statistics choice could not be saved',
          },
        };
      }
    },
    ping() {
      const version = deps.hostVersion?.();
      return {
        ok: true,
        value: {
          ok: true,
          ...(version === undefined ? {} : { version }),
          minAppVersion: MIN_PHONE_APP_VERSION,
        },
      };
    },
    developerModeSet(payload) {
      const enabled = asObject(payload)['enabled'];
      if (typeof enabled !== 'boolean') return invalidInput('enabled is required');
      deps.developerMode?.set(enabled);
      return {
        ok: true,
        value: { accepted: deps.developerMode !== undefined },
      };
    },
  };
}
