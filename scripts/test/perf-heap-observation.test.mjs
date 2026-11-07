import { describe, expect, it } from 'vitest';
import { createHeapObservation } from '../perf-heap-observation.mjs';

describe('separate bounded natural-GC observation', () => {
  it('keeps raw bytes and the canonical endpoint separate from later samples', async () => {
    let timestamp = 100;
    let bytes = 70_839_000;
    const calls = [];
    const cdp = {
      async send(method) {
        calls.push(method);
        return { metrics: [{ name: 'JSHeapUsedSize', value: bytes }] };
      },
    };
    const observation = createHeapObservation(cdp, { now: () => timestamp });
    const endpoint = await observation.sample('canonical-endpoint');
    await observation.extend(3, {
      async wait(milliseconds) {
        timestamp += milliseconds;
        bytes = 44_000_000;
      },
    });
    expect(endpoint).toEqual({ stage: 'canonical-endpoint', atMs: 0, bytes: 70_839_000 });
    expect(observation.samples.map((sample) => sample.atMs)).toEqual([0, 1000, 2000, 3000]);
    expect(observation.samples.at(-1).bytes).toBe(44_000_000);
    expect(calls).toEqual(Array(4).fill('Performance.getMetrics'));
  });

  it('uses an existing metrics sample without another browser command', async () => {
    const observation = createHeapObservation({
      send: () => {
        throw new Error('extra command');
      },
    });
    await observation.sample('canonical-endpoint', {
      metrics: [{ name: 'JSHeapUsedSize', value: 71_000_000 }],
    });
    expect(observation.samples[0].bytes).toBe(71_000_000);
  });

  it.each([-1, 0, 61, NaN, Infinity])('refuses an unbounded/invalid window %s', async (seconds) => {
    const observation = createHeapObservation({});
    await expect(observation.extend(seconds)).rejects.toThrow('1–60 seconds');
  });

  it('rejects missing heap metrics rather than reporting a favorable zero', async () => {
    const observation = createHeapObservation({ send: async () => ({ metrics: [] }) });
    await expect(observation.sample('load')).rejects.toThrow('Missing JSHeapUsedSize');
  });
});
