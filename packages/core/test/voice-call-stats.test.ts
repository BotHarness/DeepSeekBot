import { describe, expect, it } from 'vitest';

import { parseStats } from '../src/voice/call-perf.js';

describe('call helper stats', () => {
  it('reads the helper stats and drops malformed fields', () => {
    expect(parseStats(null)).toBeUndefined();
    expect(
      parseStats({
        packetsReceived: 12,
        bytesReceived: 900,
        packetsLost: -1,
        packetsSent: 'x',
        roundTripTimeMs: 4.5,
        cpuPercent: 7,
        disconnects: 2,
        jitterMs: Number.NaN,
      }),
    ).toEqual({
      uplinkPackets: 12,
      uplinkBytes: 900,
      uplinkLost: 0,
      concealedSamples: 0,
      receivedSamples: 0,
      downlinkPackets: 0,
      downlinkBytes: 0,
      rttMs: 4.5,
      helperCpuPct: 7,
      disconnects: 2,
    });
  });
});
