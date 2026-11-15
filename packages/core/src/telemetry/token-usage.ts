import type { UsageTelemetryDay, UsageTelemetrySnapshot } from '../usage/telemetry.js';
import type { TelemetryService, TelemetryValue } from './service.js';

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function tokenUsageProperties(day: UsageTelemetryDay): Record<string, TelemetryValue> {
  const properties: Record<string, TelemetryValue> = {
    day_timestamp: Date.parse(`${day.day}T00:00:00Z`),
    reported_total_token_count: day.reportedTotalTokens,
    unknown_total_count: day.unknownTotalCount,
    is_partial: false,
  };
  for (const [key, value] of [
    ['input_token_count', day.inputTokens],
    ['output_token_count', day.outputTokens],
    ['cache_read_token_count', day.cacheReadTokens],
    ['cache_write_token_count', day.cacheWriteTokens],
    ['total_token_count', day.totalTokens],
  ] as const) {
    if (value === null) properties['is_partial'] = true;
    else properties[key] = value;
  }
  return properties;
}

export function startTokenUsage(options: {
  telemetry: Pick<TelemetryService, 'enabled' | 'capture'>;
  snapshot: () => UsageTelemetrySnapshot | undefined;
  intervalMs?: number;
  log?: (message: string) => void;
}): () => void {
  const sent = new Map<string, string>();
  const tick = (): boolean => {
    if (!options.telemetry.enabled) {
      sent.clear();
      return true;
    }
    try {
      const snapshot = options.snapshot();
      if (snapshot === undefined) return false;
      const { days } = snapshot;
      const retained = new Set(days.map((day) => day.day));
      for (const day of sent.keys()) if (!retained.has(day)) sent.delete(day);
      for (const day of days) {
        const properties = { ...tokenUsageProperties(day), is_reconciled: snapshot.isReconciled };
        const signature = JSON.stringify(properties);
        if (sent.get(day.day) === signature) continue;
        options.telemetry.capture('app:token_usage_report', properties);
        sent.set(day.day, signature);
      }
    } catch {
      options.log?.('telemetry phase=token-usage-skipped');
    }
    return true;
  };
  let timer: ReturnType<typeof setTimeout>;
  const run = (): void => {
    const ready = tick();
    const interval = options.intervalMs ?? CHECK_INTERVAL_MS;
    timer = setTimeout(run, ready ? interval : Math.min(interval, 1000));
    timer.unref?.();
  };
  run();
  return () => clearTimeout(timer);
}
