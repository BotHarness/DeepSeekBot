export interface SchedulingCaptureRow {
  readonly kind: string;
  readonly at: number;
  readonly monotonicMs: number;
  readonly [key: string]: unknown;
}

export function createSchedulingCapture(capacity?: number): {
  record(event: unknown): void;
  snapshot(): {
    version: number;
    pid: number;
    timeOrigin: number;
    capacity: number;
    dropped: number;
    rejected: number;
    rows: SchedulingCaptureRow[];
  };
};
