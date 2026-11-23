import type {
  UsageTelemetryDay,
  UsageTelemetryModelDay,
  UsageTelemetrySnapshot,
} from '../usage/telemetry.js';
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

export function modelUsageProperties(row: UsageTelemetryModelDay): Record<string, TelemetryValue> {
  return {
    ...tokenUsageProperties(row),
    provider_kind: row.providerKind,
    model_id: row.modelId,
  };
}

interface ReportRow {
  day: string;
  key: string;
  properties: Record<string, TelemetryValue>;
  vanished?: Record<string, TelemetryValue>;
}

const ZERO_DAY = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 0,
  reportedTotalTokens: 0,
  unknownTotalCount: 0,
};

interface ReportOptions {
  telemetry: Pick<TelemetryService, 'enabled' | 'capture'>;
  snapshot: () => UsageTelemetrySnapshot | undefined;
  intervalMs?: number;
  log?: (message: string) => void;
}

function startSnapshotReport(
  options: ReportOptions,
  report: {
    event: 'app:token_usage_report' | 'app:model_usage_report';
    phase: string;
    rows: (snapshot: UsageTelemetrySnapshot) => ReportRow[];
  },
): () => void {
  const sent = new Map<string, Omit<ReportRow, 'key' | 'properties'> & { signature: string }>();
  const tick = (): boolean => {
    if (!options.telemetry.enabled) {
      sent.clear();
      return true;
    }
    try {
      const snapshot = options.snapshot();
      if (snapshot === undefined) return false;
      const retained = new Set(snapshot.days.map((day) => day.day));
      const current = report.rows(snapshot);
      const present = new Set(current.map((row) => row.key));
      for (const [key, previous] of sent) {
        if (!retained.has(previous.day)) sent.delete(key);
        else if (!present.has(key) && previous.vanished !== undefined)
          current.push({ ...previous, key, properties: previous.vanished });
      }
      for (const row of current) {
        const properties = { ...row.properties, is_reconciled: snapshot.isReconciled };
        const signature = JSON.stringify(properties);
        if (sent.get(row.key)?.signature === signature) continue;
        options.telemetry.capture(report.event, properties);
        sent.set(row.key, {
          day: row.day,
          signature,
          ...(row.vanished === undefined ? {} : { vanished: row.vanished }),
        });
      }
    } catch {
      options.log?.(`telemetry phase=${report.phase}-skipped`);
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

export function startTokenUsage(options: ReportOptions): () => void {
  return startSnapshotReport(options, {
    event: 'app:token_usage_report',
    phase: 'token-usage',
    rows: ({ days }) =>
      days.map((day) => ({ day: day.day, key: day.day, properties: tokenUsageProperties(day) })),
  });
}

export function startModelUsage(options: ReportOptions): () => void {
  return startSnapshotReport(options, {
    event: 'app:model_usage_report',
    phase: 'model-usage',
    rows: ({ models }) =>
      models.map((row) => ({
        day: row.day,
        key: JSON.stringify([row.day, row.providerKind, row.modelId]),
        properties: modelUsageProperties(row),
        vanished: modelUsageProperties({ ...row, ...ZERO_DAY }),
      })),
  });
}
