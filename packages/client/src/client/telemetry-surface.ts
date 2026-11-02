export type ClientTelemetrySurface = 'desktop_app' | 'browser';

export interface TelemetryRpc {
  call(path: string, method: string, options?: { args?: unknown }): Promise<unknown>;
}

export function telemetrySurface(): ClientTelemetrySurface {
  return typeof globalThis === 'object' && 'dshDesktop' in globalThis ? 'desktop_app' : 'browser';
}

export function recordViewerOpen(
  rpc: TelemetryRpc | undefined,
  panel: 'browser' | 'computer',
): void {
  void rpc
    ?.call('/api', 'botharness/telemetryEvent', {
      args: {
        event: 'viewer:subpanel_open',
        properties: { panel, surface: telemetrySurface() },
      },
    })
    .catch(() => {});
}
