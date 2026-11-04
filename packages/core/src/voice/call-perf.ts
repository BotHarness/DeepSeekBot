import type {
  VoiceCallMediaStats,
  VoiceCallPerf,
  VoiceCallPerfRange,
  VoiceCallPerfSample,
} from './call-contract.js';

interface Range {
  sum: number;
  max: number;
  count: number;
  weight: number;
}

const round = (value: number) => Math.round(value * 10) / 10;

function range(): Range {
  return { sum: 0, max: 0, count: 0, weight: 0 };
}

function add(target: Range, value: number | undefined, weight = 1) {
  if (value === undefined || !Number.isFinite(value)) return;
  target.sum += value * weight;
  target.max = Math.max(target.max, value);
  target.count += 1;
  target.weight += weight;
}

function summary(target: Range): VoiceCallPerfRange {
  return {
    avg: round(target.weight === 0 ? 0 : target.sum / target.weight),
    max: round(target.max),
  };
}

export interface CallPerf {
  sample(
    stats: VoiceCallMediaStats,
    atMs: number,
    hostCpuMs: number,
  ): VoiceCallPerfSample | undefined;
  view(): VoiceCallPerf | undefined;
}

export function createCallPerf(sampleMs: number): CallPerf {
  let previous: { stats: VoiceCallMediaStats; atMs: number; hostCpuMs: number } | undefined;
  let last: VoiceCallPerfSample | undefined;
  let samples = 0;
  let first: VoiceCallMediaStats | undefined;
  let latest: VoiceCallMediaStats | undefined;
  const ranges = {
    uplinkPps: range(),
    downlinkPps: range(),
    uplinkKbps: range(),
    downlinkKbps: range(),
    hostCpuPct: range(),
    helperCpuPct: range(),
    rttMs: range(),
  };
  return {
    sample(stats, atMs, hostCpuMs) {
      first ??= stats;
      latest = stats;
      const before = previous;
      previous = { stats, atMs, hostCpuMs };
      if (before === undefined || atMs <= before.atMs) return undefined;
      const seconds = (atMs - before.atMs) / 1000;
      const delta = (key: keyof VoiceCallMediaStats) =>
        Math.max(0, (stats[key] ?? 0) - (before.stats[key] ?? 0));
      const received = delta('uplinkPackets');
      const lost = delta('uplinkLost');
      const samplesIn = delta('receivedSamples');
      const next: VoiceCallPerfSample = {
        atMs,
        uplinkPps: round(received / seconds),
        uplinkKbps: round((delta('uplinkBytes') * 8) / 1000 / seconds),
        uplinkLossPct: round(received + lost === 0 ? 0 : (lost * 100) / (received + lost)),
        concealedPct: round(samplesIn === 0 ? 0 : (delta('concealedSamples') * 100) / samplesIn),
        downlinkPps: round(delta('downlinkPackets') / seconds),
        downlinkKbps: round((delta('downlinkBytes') * 8) / 1000 / seconds),
        ...(stats.jitterMs === undefined ? {} : { jitterMs: round(stats.jitterMs) }),
        ...(stats.rttMs === undefined ? {} : { rttMs: round(stats.rttMs) }),
        ...(stats.helperCpuPct === undefined ? {} : { helperCpuPct: round(stats.helperCpuPct) }),
        ...(stats.disconnects === undefined ? {} : { disconnects: stats.disconnects }),
        hostCpuPct: round(((hostCpuMs - before.hostCpuMs) * 100) / (atMs - before.atMs)),
      };
      last = next;
      samples += 1;
      add(ranges.uplinkPps, received / seconds, seconds);
      add(ranges.downlinkPps, delta('downlinkPackets') / seconds, seconds);
      add(ranges.uplinkKbps, (delta('uplinkBytes') * 8) / 1000 / seconds, seconds);
      add(ranges.downlinkKbps, (delta('downlinkBytes') * 8) / 1000 / seconds, seconds);
      add(ranges.hostCpuPct, next.hostCpuPct);
      add(ranges.helperCpuPct, next.helperCpuPct);
      add(ranges.rttMs, next.rttMs);
      return next;
    },
    view() {
      if (last === undefined || first === undefined || latest === undefined) return undefined;
      const received = latest.uplinkPackets - first.uplinkPackets;
      const lost = latest.uplinkLost - first.uplinkLost;
      return {
        samples,
        sampleMs,
        last,
        uplinkPps: summary(ranges.uplinkPps),
        downlinkPps: summary(ranges.downlinkPps),
        uplinkKbps: summary(ranges.uplinkKbps),
        downlinkKbps: summary(ranges.downlinkKbps),
        hostCpuPct: summary(ranges.hostCpuPct),
        ...(ranges.helperCpuPct.count === 0 ? {} : { helperCpuPct: summary(ranges.helperCpuPct) }),
        ...(ranges.rttMs.count === 0 ? {} : { rttMs: summary(ranges.rttMs) }),
        uplinkLossPct: round(received + lost <= 0 ? 0 : (lost * 100) / (received + lost)),
        ...(latest.disconnects === undefined ? {} : { disconnects: latest.disconnects }),
      };
    },
  };
}

export function perfFields(sample: VoiceCallPerfSample): Record<string, number> {
  const fields: Record<string, number> = {};
  for (const [key, value] of Object.entries(sample))
    if (typeof value === 'number') fields[key] = value;
  return fields;
}

export function parseStats(value: unknown): VoiceCallMediaStats | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const fields = value as Record<string, unknown>;
  const count = (key: string) => {
    const raw = fields[key];
    return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : 0;
  };
  const optional = (key: string, out: string) => {
    const raw = fields[key];
    return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? { [out]: raw } : {};
  };
  return {
    uplinkPackets: count('packetsReceived'),
    uplinkBytes: count('bytesReceived'),
    uplinkLost: count('packetsLost'),
    concealedSamples: count('concealedSamples'),
    receivedSamples: count('totalSamplesReceived'),
    downlinkPackets: count('packetsSent'),
    downlinkBytes: count('bytesSent'),
    ...optional('jitterMs', 'jitterMs'),
    ...optional('roundTripTimeMs', 'rttMs'),
    ...optional('cpuPercent', 'helperCpuPct'),
    ...optional('disconnects', 'disconnects'),
  };
}
