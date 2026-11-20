import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

export function createHeapObservation(cdp, { now = () => performance.now() } = {}) {
  const started = now();
  const samples = [];
  async function sample(stage, existingMetrics) {
    const result = existingMetrics ?? (await cdp.send('Performance.getMetrics'));
    const bytes = result.metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value;
    assert.ok(Number.isFinite(bytes) && bytes >= 0, 'Missing JSHeapUsedSize');
    const timestampSeconds = result.metrics.find((metric) => metric.name === 'Timestamp')?.value;
    const entry = {
      stage,
      atMs: now() - started,
      bytes,
      ...(Number.isFinite(timestampSeconds) ? { timestampSeconds } : {}),
    };
    samples.push(entry);
    return entry;
  }
  async function extend(seconds, { wait = delay } = {}) {
    assert.ok(Number.isInteger(seconds) && seconds >= 1 && seconds <= 60, 'Use 1–60 seconds');
    const deadline = now() + seconds * 1000;
    while (now() < deadline) {
      await wait(Math.min(1000, deadline - now()));
      await sample('extended-observation');
    }
  }
  return { samples, sample, extend };
}
