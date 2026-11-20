import { describe, expect, it } from 'vitest';

import type { VoiceCallMediaStats } from '../src/voice/call-contract.js';
import { createCallPerf, perfFields } from '../src/voice/call-perf.js';

const stats = (patch: Partial<VoiceCallMediaStats> = {}): VoiceCallMediaStats => ({
  uplinkPackets: 0,
  uplinkBytes: 0,
  uplinkLost: 0,
  concealedSamples: 0,
  receivedSamples: 0,
  downlinkPackets: 0,
  downlinkBytes: 0,
  ...patch,
});

describe('call media performance', () => {
  it('needs two samples before it reports a rate', () => {
    const perf = createCallPerf(5_000);
    expect(perf.sample(stats(), 0, 0)).toBeUndefined();
    expect(perf.view()).toBeUndefined();
  });

  it('turns cumulative counters into per-second rates and a running summary', () => {
    const perf = createCallPerf(5_000);
    perf.sample(stats(), 0, 0);
    const talking = perf.sample(
      stats({ uplinkPackets: 250, uplinkBytes: 50_000, downlinkPackets: 30, downlinkBytes: 600 }),
      5_000,
      250,
    );
    expect(talking).toMatchObject({ uplinkPps: 50, uplinkKbps: 80, downlinkPps: 6, hostCpuPct: 5 });
    perf.sample(
      stats({
        uplinkPackets: 280,
        uplinkBytes: 51_000,
        downlinkPackets: 280,
        downlinkBytes: 25_600,
      }),
      10_000,
      300,
    );
    expect(perf.view()).toMatchObject({
      samples: 2,
      sampleMs: 5_000,
      uplinkPps: { avg: 28, max: 50 },
      downlinkPps: { avg: 28, max: 50 },
      hostCpuPct: { avg: 3, max: 5 },
      uplinkLossPct: 0,
    });
  });

  it('never reports negative rates when a counter resets', () => {
    const perf = createCallPerf(5_000);
    perf.sample(stats({ uplinkPackets: 500 }), 0, 0);
    expect(perf.sample(stats({ uplinkPackets: 10 }), 5_000, 0)?.uplinkPps).toBe(0);
  });

  it('flattens a sample into numeric log fields', () => {
    const perf = createCallPerf(5_000);
    perf.sample(stats(), 0, 0);
    const sample = perf.sample(stats({ uplinkPackets: 29, rttMs: 8 }), 5_000, 0)!;
    expect(perfFields(sample)).toMatchObject({ atMs: 5_000, uplinkPps: 5.8, rttMs: 8 });
  });

  it('weights the whole-call average by how long each interval lasted', () => {
    const perf = createCallPerf(5_000);
    perf.sample(stats(), 0, 0);
    perf.sample(stats({ uplinkPackets: 500 }), 10_000, 0);
    perf.sample(stats({ uplinkPackets: 500 }), 12_000, 0);
    expect(perf.view()?.uplinkPps).toEqual({ avg: 41.7, max: 50 });
  });

  it('reports how often the helper saw the connection drop', () => {
    const perf = createCallPerf(5_000);
    perf.sample(stats({ disconnects: 0 }), 0, 0);
    const sample = perf.sample(stats({ disconnects: 1 }), 5_000, 0);
    expect(sample?.disconnects).toBe(1);
    expect(perf.view()?.disconnects).toBe(1);
  });
});
