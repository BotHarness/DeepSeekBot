export type ChannelTurnStopTarget =
  | { scope: 'session'; role: 'orchestrator' | 'assignment'; sessionId: string; title?: string }
  | { scope: 'bot' };

export function isChannelTurnStopTarget(value: unknown): value is ChannelTurnStopTarget {
  if (typeof value !== 'object' || value === null) return false;
  const target = value as Record<string, unknown>;
  if (target['scope'] === 'bot') return Object.keys(target).length === 1;
  return (
    target['scope'] === 'session' &&
    (target['role'] === 'orchestrator' || target['role'] === 'assignment') &&
    typeof target['sessionId'] === 'string' &&
    target['sessionId'].length > 0 &&
    (target['title'] === undefined ||
      (typeof target['title'] === 'string' && target['title'].length > 0))
  );
}
