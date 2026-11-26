import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import { createDiagnosticsAdapterMethods } from './methods.js';
import { mountClientDiagnostics, mountFetch, mountTelemetryWatches } from './plugin.js';
import { diagnosticsRpc } from './rpc.js';

export interface DiagnosticsBridgeContext {
  deps: Parameters<typeof createDiagnosticsAdapterMethods>[0];
}

export interface DiagnosticsHostHooks {
  profileStartup(...input: Parameters<typeof mountClientDiagnostics>): void;
  afterEnvironments(...input: Parameters<typeof mountTelemetryWatches>): void;
  connectionRoutes(...input: Parameters<typeof mountFetch>): void;
}

export function createDiagnosticsContribution() {
  return {
    id: 'diagnostics',
    bridgeMethods: ({ deps }) => createDiagnosticsAdapterMethods(deps),
    rpc: diagnosticsRpc,
    host: {
      profileStartup: mountClientDiagnostics,
      afterEnvironments: mountTelemetryWatches,
      connectionRoutes: mountFetch,
    },
  } satisfies FeatureContribution<DiagnosticsBridgeContext, never, DiagnosticsHostHooks>;
}
