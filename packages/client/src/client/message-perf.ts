import type { ChannelMessagePerf } from '../../../core/src/channels/channel.js';
import type { TimelinePage, TimelinePageRequest } from './bridge.js';
import type { ChannelMessage } from './store.js';

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function parseMessagePerf(value: unknown): ChannelMessagePerf | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const perf = value as Record<string, unknown>;
  if (!finite(perf['outputTokens']) || !finite(perf['elapsedMs'])) return undefined;
  if (perf['outputTokens'] <= 0 || perf['elapsedMs'] <= 0) return undefined;
  return {
    outputTokens: perf['outputTokens'],
    elapsedMs: perf['elapsedMs'],
    estimated: perf['estimated'] !== false,
  };
}

export const AVERAGE_PERF_WINDOW = 20;
export const AVERAGE_PERF_SCAN = 200;

export interface AveragePerfView {
  tokensPerSecond: number;
  estimated: boolean;
  count: number;
}

function isPerfEligible(
  message: ChannelMessage,
): message is ChannelMessage & { perf: ChannelMessagePerf } {
  return (
    message.contentPurged !== true &&
    message.author.kind === 'bot' &&
    message.streaming !== true &&
    message.pending !== true &&
    message.unconfirmed !== true &&
    message.failed === undefined &&
    message.sessionFailure === undefined &&
    message.perf !== undefined
  );
}

export async function loadAveragePerf(
  loadPage: (request: TimelinePageRequest) => Promise<TimelinePage>,
): Promise<AveragePerfView | undefined> {
  const measured: ChannelMessage[] = [];
  let request: TimelinePageRequest = {};
  let scanned = 0;
  let pages = 0;
  while (measured.length < AVERAGE_PERF_WINDOW && scanned < AVERAGE_PERF_SCAN && pages < 4) {
    pages += 1;
    const page = await loadPage(request);
    if (page.entries.length === 0) break;
    for (let index = page.entries.length - 1; index >= 0; index -= 1) {
      if (scanned >= AVERAGE_PERF_SCAN) break;
      scanned += 1;
      const message = page.entries[index]!;
      if (!isPerfEligible(message)) continue;
      measured.push(message);
      if (measured.length === AVERAGE_PERF_WINDOW) break;
    }
    if (!page.hasOlder || page.olderCursor === null) break;
    request = { direction: 'older', cursor: page.olderCursor };
  }
  return averagePerfView(measured);
}

export function averagePerfView(messages: readonly ChannelMessage[]): AveragePerfView | undefined {
  let outputTokens = 0;
  let elapsedMs = 0;
  let count = 0;
  let estimated = false;
  for (let index = messages.length - 1; index >= 0 && count < AVERAGE_PERF_WINDOW; index -= 1) {
    const message = messages[index]!;
    if (!isPerfEligible(message)) continue;
    outputTokens += message.perf.outputTokens;
    elapsedMs += message.perf.elapsedMs;
    count += 1;
    estimated ||= message.perf.estimated;
  }
  if (count === 0) return undefined;
  const tokensPerSecond = Math.round((outputTokens / elapsedMs) * 1000);
  return { tokensPerSecond, estimated, count };
}

export interface MessagePerfView {
  tokensPerSecond: number;
  estimated: boolean;
}

export function messagePerfView(message: ChannelMessage): MessagePerfView | undefined {
  if (!isPerfEligible(message)) return undefined;
  const perf = message.perf;
  const tokensPerSecond = Math.round(perf.outputTokens / (perf.elapsedMs / 1000));
  if (!Number.isFinite(tokensPerSecond) || tokensPerSecond <= 0) return undefined;
  return { tokensPerSecond, estimated: perf.estimated };
}
