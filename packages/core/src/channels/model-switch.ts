export interface ChannelModelSwitchRoute {
  provider: string;
  model: string;
}

export interface ChannelModelSwitch {
  botSlug: string;
  botName: string;
  sessionId: string;
  from: ChannelModelSwitchRoute;
  to: ChannelModelSwitchRoute;
  reason: 'quota' | 'credential' | 'rate-limit';
  until?: string;
}

const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

function isRoute(value: unknown): value is ChannelModelSwitchRoute {
  if (typeof value !== 'object' || value === null) return false;
  const route = value as Record<string, unknown>;
  return text(route['provider']) && text(route['model']);
}

export function isChannelModelSwitch(value: unknown): value is ChannelModelSwitch {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    text(record['botSlug']) &&
    text(record['botName']) &&
    text(record['sessionId']) &&
    isRoute(record['from']) &&
    isRoute(record['to']) &&
    (record['reason'] === 'quota' ||
      record['reason'] === 'credential' ||
      record['reason'] === 'rate-limit') &&
    (record['until'] === undefined ||
      (text(record['until']) && Number.isFinite(Date.parse(record['until']))))
  );
}
