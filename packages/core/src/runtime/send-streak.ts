export const SEND_STREAK_LIMIT = 3;

const CLOSED_SOURCE_LIMIT = 200;

const streaks = new WeakMap<object, { destination: string; calls: Set<string> }>();
const closedSources = new Map<string, Set<string>>();

export function recordSend(run: object, destination: string, callId: string): number {
  const current = streaks.get(run);
  const streak =
    current?.destination === destination ? current : { destination, calls: new Set<string>() };
  streak.calls.add(callId);
  streaks.set(run, streak);
  return streak.calls.size;
}

export function resetSendStreak(run: object): void {
  streaks.delete(run);
}

export function closeStreakSource(sessionId: string, sourceEventId: string): void {
  const sources = closedSources.get(sessionId) ?? new Set<string>();
  sources.add(sourceEventId);
  if (sources.size > CLOSED_SOURCE_LIMIT) sources.delete(sources.values().next().value!);
  closedSources.delete(sessionId);
  closedSources.set(sessionId, sources);
  if (closedSources.size > CLOSED_SOURCE_LIMIT)
    closedSources.delete(closedSources.keys().next().value!);
}

export function isStreakSourceClosed(sessionId: string, sourceEventId: string): boolean {
  return closedSources.get(sessionId)?.has(sourceEventId) === true;
}
