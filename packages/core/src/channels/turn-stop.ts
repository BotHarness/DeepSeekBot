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

export interface ChannelTurnStopRest {
  provider: string;
  model: string;
  until: string;
}

export function isChannelTurnStopRests(value: unknown): value is ChannelTurnStopRest[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 32 &&
    value.every((rest) => {
      if (typeof rest !== 'object' || rest === null) return false;
      const fields = rest as Record<string, unknown>;
      return (
        ['provider', 'model', 'until'].every(
          (key) => typeof fields[key] === 'string' && fields[key].length > 0,
        ) && Number.isFinite(Date.parse(fields['until'] as string))
      );
    })
  );
}

export interface ChannelTurnStopEngine {
  engine: string;
  account: string;
  until: string;
}

export function isChannelTurnStopEngine(value: unknown): value is ChannelTurnStopEngine {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const fields = value as Record<string, unknown>;
  return (
    Object.keys(fields).length === 3 &&
    ['engine', 'account', 'until'].every(
      (key) => typeof fields[key] === 'string' && fields[key].length > 0,
    ) &&
    Number.isFinite(Date.parse(fields['until'] as string))
  );
}
