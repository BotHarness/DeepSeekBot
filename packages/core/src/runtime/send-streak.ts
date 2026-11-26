export const SEND_STREAK_LIMIT = 3;

const streaks = new WeakMap<object, { destination: string; calls: Set<string> }>();

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
