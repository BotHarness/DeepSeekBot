import {
  ENGINE_QUOTA_WINDOWS,
  isEngineId,
  type EngineId,
  type EngineQuotaRefreshError,
  type EngineQuotaWindowId,
} from '@botharness/host-protocol/subscription-engine';

import { answerRecord, finiteNumber, record, text, type HostCall } from './host-answer';

export type AccountUnavailableReason =
  | 'host-not-local'
  | 'not-installed'
  | 'signed-out'
  | 'not-subscription'
  | 'login-unknown';

const REASONS: readonly AccountUnavailableReason[] = [
  'host-not-local',
  'not-installed',
  'signed-out',
  'not-subscription',
  'login-unknown',
];

export interface AccountQuotaWindow {
  remainingPercent?: number;
  resetsAt?: string;
  windowMinutes?: number;
}

export interface AccountQuota {
  windows: Partial<Record<EngineQuotaWindowId, AccountQuotaWindow>>;
  usedPercent?: number;
  resetsAt?: string;
  limitedUntil?: string;
  observedAt: string;
  source?: 'live' | 'turn';
}

export interface SubscriptionAccountView {
  engine: EngineId;
  id?: string;
  name?: string;
  installed: boolean;
  available: boolean;
  reason?: AccountUnavailableReason;
  email?: string;
  quota?: AccountQuota;
}

export interface SubscriptionAccountsView {
  revision?: number;
  accounts: SubscriptionAccountView[];
}

export type QuotaRefreshStatus = 'ok' | EngineQuotaRefreshError;

const isTime = (value: unknown): value is string =>
  text(value) && Number.isFinite(Date.parse(value));

function parseWindow(value: unknown): AccountQuotaWindow | undefined {
  const window = record(value);
  if (window === undefined) return undefined;
  const remaining = window['remainingPercent'];
  const minutes = window['windowMinutes'];
  return {
    ...(finiteNumber(remaining) ? { remainingPercent: Math.min(100, Math.max(0, remaining)) } : {}),
    ...(isTime(window['resetsAt']) ? { resetsAt: window['resetsAt'] } : {}),
    ...(finiteNumber(minutes) && minutes > 0 ? { windowMinutes: minutes } : {}),
  };
}

export function parseAccountQuota(value: unknown): AccountQuota | undefined {
  const quota = record(value);
  if (quota === undefined || !isTime(quota['observedAt'])) return undefined;
  const rows = record(quota['windows']) ?? {};
  const windows: AccountQuota['windows'] = {};
  for (const id of ENGINE_QUOTA_WINDOWS) {
    const window = parseWindow(rows[id]);
    if (window !== undefined) windows[id] = window;
  }
  const used = quota['usedPercent'];
  const source = quota['source'];
  return {
    windows,
    ...(finiteNumber(used) ? { usedPercent: used } : {}),
    ...(isTime(quota['resetsAt']) ? { resetsAt: quota['resetsAt'] } : {}),
    ...(isTime(quota['limitedUntil']) ? { limitedUntil: quota['limitedUntil'] } : {}),
    observedAt: quota['observedAt'],
    ...(source === 'live' || source === 'turn' ? { source } : {}),
  };
}

const usable = (quota: AccountQuota | undefined): quota is AccountQuota =>
  quota !== undefined && (Object.keys(quota.windows).length > 0 || quota.usedPercent !== undefined);

export function parseSubscriptionAccounts(value: unknown): SubscriptionAccountsView {
  const body = answerRecord(value, 'engineAccounts');
  const engines = body['engines'];
  if (!Array.isArray(engines)) throw new Error('Invalid subscription accounts');
  const details = new Map<string, { email?: string; quota?: AccountQuota }>();
  for (const raw of Array.isArray(body['accounts']) ? body['accounts'] : []) {
    const account = record(raw);
    if (!text(account?.['id'])) continue;
    const quota = parseAccountQuota(account['quota']);
    details.set(account['id'], {
      ...(text(account['email']) ? { email: account['email'] } : {}),
      ...(quota === undefined ? {} : { quota }),
    });
  }
  const accounts = engines.flatMap((raw): SubscriptionAccountView[] => {
    const entry = record(raw);
    const engine = entry?.['engine'];
    if (entry === undefined || !isEngineId(engine)) return [];
    const id = text(entry['accountId']) ? entry['accountId'] : undefined;
    const detail = id === undefined ? undefined : details.get(id);
    const status = parseAccountQuota(entry['quota']);
    const quota = usable(detail?.quota) ? detail.quota : (status ?? detail?.quota);
    const available = entry['available'] === true;
    const reason = entry['reason'];
    return [
      {
        engine,
        ...(id === undefined ? {} : { id }),
        ...(text(entry['accountName']) ? { name: entry['accountName'] } : {}),
        installed: entry['installed'] === true,
        available,
        ...(available
          ? {}
          : {
              reason: REASONS.includes(reason as AccountUnavailableReason)
                ? (reason as AccountUnavailableReason)
                : 'login-unknown',
            }),
        ...(detail?.email === undefined ? {} : { email: detail.email }),
        ...(quota === undefined ? {} : { quota }),
      },
    ];
  });
  return {
    ...(finiteNumber(body['revision']) ? { revision: body['revision'] } : {}),
    accounts,
  };
}

export async function loadSubscriptionAccounts(host: HostCall): Promise<SubscriptionAccountsView> {
  return parseSubscriptionAccounts(await host.call('engineAccounts', {}));
}

export async function refreshAccountQuota(host: HostCall, id: string): Promise<QuotaRefreshStatus> {
  const status = record(await host.call('engineAccountQuotaRefresh', { id }))?.['status'];
  return status === 'ok' || status === 'signed-out' || status === 'timeout'
    ? status
    : 'unavailable';
}

export async function signInAccount(host: HostCall, id: string): Promise<{ url?: string }> {
  const url = record(await host.call('engineAccountLogin', { id }))?.['url'];
  return text(url) ? { url } : {};
}

export async function cancelAccountSignIn(host: HostCall, id: string): Promise<void> {
  await host.call('engineAccountLoginCancel', { id });
}

export async function addAccount(
  host: HostCall,
  input: { engine: EngineId; name: string; expectedRevision: number },
): Promise<void> {
  await host.call('engineAccountAdd', { ...input });
}

export async function renameAccount(
  host: HostCall,
  input: { id: string; name: string; expectedRevision: number },
): Promise<void> {
  await host.call('engineAccountRename', { ...input });
}

export async function removeAccount(
  host: HostCall,
  input: { id: string; expectedRevision: number },
): Promise<{ homeCleanupPending?: true }> {
  const answer = record(await host.call('engineAccountRemove', { ...input, confirm: true }));
  return answer?.['homeCleanupPending'] === true ? { homeCleanupPending: true } : {};
}

export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '•••';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const suffix = dot > 0 ? domain.slice(dot) : '';
  return `${local.slice(0, local.length > 2 ? 2 : 1)}•••@${host.slice(0, 1)}•••${suffix}`;
}

export interface ShownQuotaWindow {
  id: EngineQuotaWindowId;
  remaining: number;
  resetsAt?: string;
}

export function shownQuotaWindows(
  quota: AccountQuota | undefined,
  now: number,
): ShownQuotaWindow[] {
  const windows = quota?.windows ?? {};
  return ENGINE_QUOTA_WINDOWS.flatMap((id) => {
    const window = windows[id];
    if (window?.remainingPercent === undefined) return [];
    if (window.resetsAt !== undefined && Date.parse(window.resetsAt) <= now) return [];
    return [
      {
        id,
        remaining: Math.round(window.remainingPercent),
        ...(window.resetsAt === undefined ? {} : { resetsAt: window.resetsAt }),
      },
    ];
  });
}

export function quotaLimited(quota: AccountQuota | undefined, now: number): boolean {
  return quota?.limitedUntil !== undefined && Date.parse(quota.limitedUntil) > now;
}

export function quotaRemaining(quota: AccountQuota | undefined, now: number): number | undefined {
  const windows = shownQuotaWindows(quota, now);
  if (windows.length > 0) return Math.min(...windows.map((window) => window.remaining));
  if (quota?.usedPercent === undefined) return undefined;
  if (quota.resetsAt !== undefined && Date.parse(quota.resetsAt) <= now) return undefined;
  return Math.max(0, Math.round(100 - quota.usedPercent));
}

const STALE_MS = 5 * 60_000;

export function quotaStale(quota: AccountQuota | undefined, now: number): boolean {
  return (
    quota === undefined || quota.source !== 'live' || now - Date.parse(quota.observedAt) > STALE_MS
  );
}

export type QuotaLevel = 'high' | 'medium' | 'low';

export function quotaLevel(remaining: number): QuotaLevel {
  return remaining >= 50 ? 'high' : remaining >= 20 ? 'medium' : 'low';
}

export function quotaCountdown(
  resetsAt: string,
  now: number,
): { days: number; hours: number; minutes: number } {
  const total = Math.max(1, Math.ceil((Date.parse(resetsAt) - now) / 60_000));
  return {
    days: Math.floor(total / 1440),
    hours: Math.floor((total % 1440) / 60),
    minutes: total % 60,
  };
}
