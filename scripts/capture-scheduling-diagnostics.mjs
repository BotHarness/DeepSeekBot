import { channel } from 'node:diagnostics_channel';
import { open, rename } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { isMainThread } from 'node:worker_threads';

const CAPACITY = 4096;
const fields = {
  'heartbeat-owner-enter': ['call', 'operation', 'active'],
  'heartbeat-owner-settle': ['call', 'operation', 'outcome'],
  steer: ['turn', 'delivered'],
  'scan-start': ['turn', 'operation'],
  'scan-coalesced': ['turn', 'operation'],
  'scan-end': ['turn', 'operation', 'outcome'],
  'exec-dispatch': ['operation', 'scan', 'mode'],
  'exec-settle': ['operation', 'scan', 'outcome'],
};

export function createSchedulingCapture(capacity = CAPACITY) {
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > CAPACITY) {
    throw new Error('Invalid diagnostic capacity');
  }
  const rows = [];
  let dropped = 0;
  let rejected = 0;
  return {
    record(event) {
      try {
        const allowed = fields[event?.kind];
        if (!allowed || !Number.isFinite(event.at) || !Number.isFinite(event.monotonicMs)) {
          rejected++;
          return;
        }
        const row = { kind: event.kind, at: event.at, monotonicMs: event.monotonicMs };
        for (const key of allowed) {
          const value = event[key];
          const valid =
            key === 'delivered' || key === 'active'
              ? typeof value === 'boolean'
              : key === 'mode'
                ? value === 'worker' || value === 'direct'
                : key === 'outcome'
                  ? ['ok', 'stale', 'error'].includes(value)
                  : Number.isSafeInteger(value) && value >= 0;
          if (!valid) {
            rejected++;
            return;
          }
          row[key] = value;
        }
        if (rows.length === capacity) {
          rows.shift();
          dropped++;
        }
        rows.push(row);
      } catch {
        rejected++;
      }
    },
    snapshot() {
      return {
        version: 1,
        pid: process.pid,
        timeOrigin: performance.timeOrigin,
        capacity,
        dropped,
        rejected,
        rows: rows.slice(),
      };
    },
  };
}

const destination = process.env.BOTHARNESS_SCHEDULING_REPORT;
if (isMainThread && process.env.BOTHARNESS_SCHEDULING_DIAGNOSTICS === '1' && destination) {
  if (!isAbsolute(destination)) throw new Error('Scheduling report must use an absolute path');
  const capture = createSchedulingCapture();
  channel('botharness.scheduling.v1').subscribe(capture.record);
  let writing = false;
  let writeFailures = 0;
  const flush = async () => {
    if (writing) return;
    if (capture.snapshot().rows.length === 0) return;
    writing = true;
    try {
      const report = `${destination}.${process.pid}.json`;
      const temporary = `${report}.tmp`;
      const file = await open(temporary, 'w', 0o600);
      try {
        await file.writeFile(JSON.stringify({ ...capture.snapshot(), writeFailures }));
      } finally {
        await file.close();
      }
      await rename(temporary, report);
    } catch {
      writeFailures++;
    } finally {
      writing = false;
    }
  };
  setInterval(() => {
    void flush();
  }, 1000).unref();
}
