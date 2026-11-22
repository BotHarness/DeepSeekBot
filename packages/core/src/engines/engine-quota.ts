import {
  ENGINE_QUOTA_WINDOWS,
  type EngineQuotaRefreshError,
  type EngineQuotaSnapshot,
  type EngineQuotaWindow,
} from '@botharness/host-protocol/subscription-engine';
import { z } from 'zod';

import { DEFAULT_REST_MS } from '../models/route-rest.js';
import type { EngineEvent, EngineQuota } from './engine-session.js';

type QuotaEvent = Extract<EngineEvent, { kind: 'rate-limit' }>;

export interface EngineQuotaView extends EngineQuotaSnapshot {
  usedPercent?: number;
  resetsAt?: string;
}

export type ProviderQuota =
  | { status: 'ok'; windows: EngineQuotaSnapshot['windows']; email?: string; blocked?: boolean }
  | { status: EngineQuotaRefreshError; email?: string };

export function quotaTime(value: number | string | undefined): string | undefined {
  const time = typeof value === 'number' ? value : Date.parse(value ?? '');
  const date = new Date(time);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

export function quotaWindow(
  used: number | undefined,
  resetsAt: string | undefined,
  windowMinutes?: number,
): EngineQuotaWindow {
  return {
    ...(used === undefined || !Number.isFinite(used)
      ? {}
      : { remainingPercent: Math.round((100 - Math.max(0, Math.min(100, used))) * 1000) / 1000 }),
    ...(resetsAt === undefined ? {} : { resetsAt }),
    ...(windowMinutes === undefined ? {} : { windowMinutes }),
  };
}

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function codexRetryTime(message: string | undefined, now: number): string | undefined {
  const match =
    /\btry again at (?:(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})(?:st|nd|rd|th), (\d{4}) )?(1[0-2]|[1-9]):([0-5]\d) (AM|PM)\b/iu.exec(
      message ?? '',
    );
  if (match === null) return undefined;
  const [, month, day, year, hour, minute, period] = match;
  const date = new Date(now);
  if (month !== undefined) {
    const index = months.findIndex((name) => name.toLowerCase() === month.toLowerCase());
    date.setFullYear(Number(year), index, Number(day));
    if (date.getMonth() !== index) return undefined;
  }
  date.setHours(
    (Number(hour) % 12) + (period?.toUpperCase() === 'PM' ? 12 : 0),
    Number(minute),
    0,
    0,
  );
  if (month === undefined && date.getTime() <= now) date.setDate(date.getDate() + 1);
  return date.getTime() > now ? date.toISOString() : undefined;
}

const storedWindow = z
  .object({
    remainingPercent: z.number().min(0).max(100).optional(),
    resetsAt: z.string().optional(),
    windowMinutes: z.number().positive().optional(),
  })
  .transform(({ remainingPercent, resetsAt, windowMinutes }): EngineQuotaWindow => ({
    ...(remainingPercent === undefined ? {} : { remainingPercent }),
    ...(resetsAt === undefined ? {} : { resetsAt }),
    ...(windowMinutes === undefined ? {} : { windowMinutes }),
  }));
const storedQuota = z.object({
  windows: z.object({ session: storedWindow.optional(), weekly: storedWindow.optional() }),
  observedAt: z.string(),
  source: z.enum(['live', 'turn']),
  limitedUntil: z.string().optional(),
  unclassified: storedWindow.optional(),
  email: z.email().optional(),
});
const legacyQuota = z.object({
  limited: z.boolean(),
  observedAt: z.string(),
  resetsAt: z.string().optional(),
  usedPercent: z.number().optional(),
});

export function parseStoredEngineQuota(value: unknown): EngineQuota | undefined {
  const parsed = storedQuota.safeParse(value);
  if (parsed.success) {
    const {
      windows: { session, weekly },
      observedAt,
      source,
      limitedUntil,
      email,
      unclassified,
    } = parsed.data;
    return {
      windows: {
        ...(session === undefined ? {} : { session }),
        ...(weekly === undefined ? {} : { weekly }),
      },
      observedAt,
      source,
      ...(limitedUntil === undefined ? {} : { limitedUntil }),
      ...(email === undefined ? {} : { email }),
      ...(unclassified === undefined ? {} : { unclassified }),
    };
  }
  const legacy = legacyQuota.safeParse(value);
  if (!legacy.success) return undefined;
  const { limited, observedAt, resetsAt, usedPercent } = legacy.data;
  const limit = limited
    ? (quotaTime(resetsAt) ?? quotaTime(Date.parse(observedAt) + DEFAULT_REST_MS))
    : undefined;
  return {
    windows: {},
    observedAt,
    source: 'turn',
    unclassified: quotaWindow(usedPercent, quotaTime(resetsAt)),
    ...(limit === undefined ? {} : { limitedUntil: limit }),
  };
}

function activeTime(time: string | undefined, now: number): string | undefined {
  return time !== undefined && Date.parse(time) > now ? time : undefined;
}

export function engineQuotaLimit(quota: EngineQuota | undefined, now: number): string | undefined {
  return activeTime(quota?.limitedUntil, now);
}

function currentWindow(window: EngineQuotaWindow, now: number): EngineQuotaWindow {
  if (window.resetsAt === undefined || activeTime(window.resetsAt, now) !== undefined)
    return window;
  const { remainingPercent: _expired, ...rest } = window;
  return rest;
}

export function engineQuotaSnapshot(
  quota: EngineQuota | undefined,
  now: number,
): EngineQuotaSnapshot | undefined {
  if (quota === undefined) return undefined;
  const windows: EngineQuotaSnapshot['windows'] = {};
  for (const key of ENGINE_QUOTA_WINDOWS) {
    const window = quota.windows[key];
    if (window !== undefined) windows[key] = currentWindow(window, now);
  }
  const limitedUntil = engineQuotaLimit(quota, now);
  return {
    windows,
    ...(limitedUntil === undefined ? {} : { limitedUntil }),
    observedAt: quota.observedAt,
    source: quota.source,
  };
}

export function engineQuotaView(
  quota: EngineQuota | undefined,
  now: number,
): EngineQuotaView | undefined {
  const snapshot = engineQuotaSnapshot(quota, now);
  if (snapshot === undefined) return undefined;
  let shown: EngineQuotaWindow | undefined;
  for (const window of Object.values(snapshot.windows)) {
    if (
      shown === undefined ||
      (window.remainingPercent ?? Infinity) < (shown.remainingPercent ?? Infinity)
    )
      shown = window;
  }
  if (shown === undefined && quota?.unclassified !== undefined)
    shown = currentWindow(quota.unclassified, now);
  return {
    ...snapshot,
    ...(shown?.remainingPercent === undefined
      ? {}
      : { usedPercent: Math.round((100 - shown.remainingPercent) * 1000) / 1000 }),
    ...(shown?.resetsAt === undefined ? {} : { resetsAt: shown.resetsAt }),
  };
}

export function recordEngineQuota(
  event: QuotaEvent,
  previous: EngineQuota | undefined,
  now: number,
): EngineQuota {
  const limitedUntil = event.limited
    ? (activeTime(event.resetsAt, now) ??
      codexRetryTime(event.retryMessage, now) ??
      activeTime(previous?.limitedUntil, now) ??
      quotaTime(now + DEFAULT_REST_MS))
    : undefined;
  const unclassified = event.unclassified ?? previous?.unclassified;
  const windows = { ...previous?.windows };
  for (const key of ENGINE_QUOTA_WINDOWS) {
    const incoming = event.windows?.[key];
    if (incoming === undefined) continue;
    const prior = windows[key];
    const samePeriod =
      prior !== undefined &&
      (incoming.resetsAt === prior.resetsAt ||
        (incoming.resetsAt === undefined && activeTime(prior.resetsAt, now) !== undefined));
    windows[key] = samePeriod ? { ...prior, ...incoming } : incoming;
  }
  return {
    windows,
    ...(unclassified === undefined ? {} : { unclassified }),
    ...(limitedUntil === undefined ? {} : { limitedUntil }),
    ...(previous?.email === undefined ? {} : { email: previous.email }),
    observedAt: new Date(now).toISOString(),
    source: 'turn',
  };
}

export function recordLiveEngineQuota(
  result: Extract<ProviderQuota, { status: 'ok' }>,
  previous: EngineQuota | undefined,
  now: number,
): EngineQuota {
  const resets = Object.values(result.windows).flatMap((window) =>
    window?.remainingPercent === 0 && activeTime(window.resetsAt, now) !== undefined
      ? [Date.parse(window.resetsAt ?? '')]
      : [],
  );
  const limitedUntil =
    result.blocked === true
      ? (quotaTime(Math.max(...resets)) ?? activeTime(previous?.limitedUntil, now))
      : result.blocked === false
        ? undefined
        : activeTime(previous?.limitedUntil, now);
  return {
    windows: result.windows,
    source: 'live',
    observedAt: new Date(now).toISOString(),
    ...(limitedUntil === undefined ? {} : { limitedUntil }),
    ...(result.email === undefined ? {} : { email: result.email }),
  };
}

export function quotaEmail(value: unknown): string | undefined {
  return z.email().safeParse(value).data;
}
