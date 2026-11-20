export const DIAGNOSTIC_LOG_FORMAT = 'deepseekbot-diagnostic-logs';
export const DIAGNOSTIC_LOG_VERSION = 1;

export const DIAGNOSTIC_LOG_LIMITS = {
  bodyBytes: 64 * 1024,
  entriesPerBatch: 200,
  clockSkewMs: 24 * 60 * 60 * 1000,
  fieldsPerEntry: 24,
  fieldText: 300,
  hostText: 1000,
  entriesPerMinute: 600,
  hostEntriesPerMinute: 300,
  eventEntriesPerMinute: 600,
  listDefault: 300,
  listMax: 1000,
  exportDefaultHours: 24,
  exportMaxHours: 7 * 24,
  exportMaxRows: 50_000,
} as const;

export const CLIENT_PLUGIN = 'client';
export const HOST_PLUGIN = 'host';

export type DiagnosticFieldValue = string | number | boolean | null;

export type DiagnosticLogErrorCode =
  | 'invalid-report'
  | 'report-too-large'
  | 'rate-limited'
  | 'persistence-unavailable'
  | 'invalid-input';

export class DiagnosticLogError extends Error {
  constructor(
    readonly code: DiagnosticLogErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DiagnosticLogError';
  }
}

export function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
