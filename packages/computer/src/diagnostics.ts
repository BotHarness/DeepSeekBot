import type { LogOwnerScope } from '../../core/src/logs/log-db.js';

export interface ComputerDiagnosticEvent {
  readonly at: string;
  readonly kind: 'lifecycle' | 'container' | 'viewer' | 'computer-action' | 'computer-unlock';
  readonly detail: string;
}

export interface ComputerDiagnostics {
  record(kind: ComputerDiagnosticEvent['kind'], detail: string): void;
  tail(limit?: number): readonly ComputerDiagnosticEvent[];
}

export interface ComputerDiagnosticsSink {
  write(event: ComputerDiagnosticEvent): void;
}

export interface ComputerLogEntry {
  readonly plugin: string;
  readonly owner: LogOwnerScope;
  readonly kind: string;
  readonly detail: string;
  readonly ts: number;
}

export function toLogEntry(
  event: ComputerDiagnosticEvent,
  plugin: string,
  owner: LogOwnerScope,
): ComputerLogEntry {
  const ts = Date.parse(event.at);
  return {
    plugin,
    owner,
    kind: event.kind,
    detail: event.detail,
    ts: Number.isNaN(ts) ? Date.now() : ts,
  };
}

export const DIAGNOSTICS_LIMIT = 200;

export function createComputerDiagnostics(
  limit = DIAGNOSTICS_LIMIT,
  sink?: ComputerDiagnosticsSink | undefined,
): ComputerDiagnostics {
  const events: ComputerDiagnosticEvent[] = [];
  return {
    record(kind, detail) {
      const event: ComputerDiagnosticEvent = { at: new Date().toISOString(), kind, detail };
      events.push(event);
      if (events.length > limit) events.splice(0, events.length - limit);
      try {
        sink?.write(event);
      } catch {}
    },
    tail(count = limit) {
      const size = Math.max(0, Math.min(count, events.length));
      return events.slice(events.length - size);
    },
  };
}
