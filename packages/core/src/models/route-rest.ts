import type { ModelRoute } from './presets.js';

export const LONG_RETRY_AFTER_MS = 60_000;
export const DEFAULT_REST_MS = 60 * 60_000;
export const RATE_LIMIT_REST_MS = 5 * 60_000;

export type RestReason = 'quota' | 'credential' | 'rate-limit';

const QUOTA_CODES = new Set(['QUOTA', 'ACCOUNT_QUOTA', 'QUOTA_EXCEEDED']);

export interface RouteFailure {
  readonly code: string;
  readonly message?: string;
  readonly status?: number;
  readonly providerRetryAfterMs?: number;
}

const UNIT_MS: Record<string, number> = { d: 86_400_000, h: 3_600_000, m: 60_000, s: 1_000 };

export function resetHintMs(message: string | undefined): number | undefined {
  const hint = /\breset(?:s|ting)?\s+(?:in|after)\s+((?:\d+\s*[dhms]\s*)+)/iu.exec(message ?? '');
  if (hint === null) return undefined;
  let total = 0;
  for (const [, amount, unit] of hint[1]!.matchAll(/(\d+)\s*([dhms])/giu))
    total += Number(amount) * UNIT_MS[unit!.toLowerCase()]!;
  return total > 0 ? total : undefined;
}

export function quotaRestMs(failure: RouteFailure): number | undefined {
  const delay =
    typeof failure.providerRetryAfterMs === 'number' &&
    Number.isFinite(failure.providerRetryAfterMs) &&
    failure.providerRetryAfterMs > 0
      ? failure.providerRetryAfterMs
      : resetHintMs(failure.message);
  if (QUOTA_CODES.has(failure.code)) return delay ?? DEFAULT_REST_MS;
  if ((failure.code === 'RATE_LIMIT' || failure.status === 429) && delay !== undefined)
    return delay > LONG_RETRY_AFTER_MS ? delay : undefined;
  return undefined;
}

export interface RestingRoute {
  provider: string;
  model: string;
  until: string;
  reason?: RestReason;
}

type RouteKey = Pick<ModelRoute, 'provider' | 'model'>;

export interface RouteRests {
  rest(route: RouteKey, untilMs: number, reason?: RestReason): RestingRoute;
  restingUntil(route: RouteKey): RestingRoute | undefined;
  list(): RestingRoute[];
}

interface RestEntry {
  provider: string;
  model: string;
  untilMs: number;
  reason?: RestReason;
}

const keyOf = (route: RouteKey) => JSON.stringify([route.provider, route.model]);

const view = (entry: RestEntry): RestingRoute => ({
  provider: entry.provider,
  model: entry.model,
  until: new Date(entry.untilMs).toISOString(),
  ...(entry.reason === undefined ? {} : { reason: entry.reason }),
});

export function createRouteRests(options: { now?: () => number } = {}): RouteRests {
  const now = options.now ?? Date.now;
  const rests = new Map<string, RestEntry>();
  const live = (key: string) => {
    const entry = rests.get(key);
    if (entry === undefined) return undefined;
    if (entry.untilMs > now()) return entry;
    rests.delete(key);
    return undefined;
  };
  return {
    rest(route, untilMs, reason) {
      const key = keyOf(route);
      const previous = live(key);
      const entry = {
        provider: route.provider,
        model: route.model,
        untilMs: Math.max(untilMs, previous?.untilMs ?? 0),
        ...(reason === undefined
          ? previous?.reason === undefined
            ? {}
            : { reason: previous.reason }
          : { reason }),
      };
      rests.set(key, entry);
      return view(entry);
    },
    restingUntil(route) {
      const entry = live(keyOf(route));
      return entry === undefined ? undefined : view(entry);
    },
    list() {
      return [...rests.keys()].flatMap((key) => {
        const entry = live(key);
        return entry === undefined ? [] : [view(entry)];
      });
    },
  };
}
