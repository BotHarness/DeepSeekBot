import { DEFAULT_REST_MS } from '../models/route-rest.js';
import type { EngineEvent, EngineId, EngineQuota } from './engine-session.js';

export interface EngineQuotaView {
  usedPercent?: number;
  resetsAt?: string;
  limitedUntil?: string;
  observedAt: string;
}

export function engineQuotaLimit(
  engine: EngineId,
  quota: EngineQuota | undefined,
  now: number,
): { account: string; until: string } | undefined {
  if (quota?.limited !== true) return undefined;
  const reset = Date.parse(quota.resetsAt ?? '');
  const until = Number.isFinite(reset) ? reset : Date.parse(quota.observedAt) + DEFAULT_REST_MS;
  return until > now
    ? { account: quota.account ?? engine, until: new Date(until).toISOString() }
    : undefined;
}

export function engineQuotaView(
  engine: EngineId,
  quota: EngineQuota | undefined,
  now: number,
): EngineQuotaView | undefined {
  if (quota === undefined) return undefined;
  const limit = engineQuotaLimit(engine, quota, now);
  const current =
    quota.resetsAt === undefined || Date.parse(quota.resetsAt) > now
      ? quota.usedPercent
      : undefined;
  return {
    ...(current === undefined ? {} : { usedPercent: current }),
    ...(quota.resetsAt === undefined ? {} : { resetsAt: quota.resetsAt }),
    ...(limit === undefined ? {} : { limitedUntil: limit.until }),
    observedAt: quota.observedAt,
  };
}

export function recordEngineQuota(
  account: string,
  event: Extract<EngineEvent, { kind: 'rate-limit' }>,
  previous: EngineQuota | undefined,
  now: number,
): EngineQuota {
  const reset = event.resetsAt === undefined ? undefined : new Date(event.resetsAt * 1000);
  const previousReset = previous?.resetsAt;
  const resetsAt =
    reset !== undefined &&
    Number.isFinite(reset.getTime()) &&
    (!event.limited || reset.getTime() > now)
      ? reset.toISOString()
      : event.limited &&
          previous?.limited === true &&
          previous.account === account &&
          previousReset !== undefined &&
          Date.parse(previousReset) > now
        ? previousReset
        : undefined;
  const usedPercent = event.usedPercent ?? (event.limited ? 100 : previous?.usedPercent);
  return {
    account,
    ...(usedPercent === undefined ? {} : { usedPercent }),
    ...(resetsAt === undefined ? {} : { resetsAt }),
    limited: event.limited,
    observedAt: new Date(now).toISOString(),
  };
}
