import {
  ENGINE_QUOTA_WINDOWS,
  isEngineId,
  type EngineAccountIdentity,
  type EngineId,
  type EngineQuotaRefreshError,
  type EngineQuotaWindow,
  type EngineQuotaWindowId,
  type NamedEngineAccount,
} from '@botharness/host-protocol/subscription-engine';

import { answerRecord, finiteNumber, record, some, text, type HostCall } from './host-answer';
import type { SubscriptionModel } from './model-plans';

const REASONS = [
  'host-not-local',
  'not-installed',
  'signed-out',
  'not-subscription',
  'login-unknown',
] as const;

export type AccountUnavailableReason = (typeof REASONS)[number];

export interface AccountQuota {
  windows: Partial<Record<EngineQuotaWindowId, EngineQuotaWindow>>;
  usedPercent?: number;
  resetsAt?: string;
  limitedUntil?: string;
  observedAt: string;
  source?: 'live' | 'turn';
}

export type EngineStatusView = {
  engine: EngineId;
  installed: boolean;
  version?: string;
  email?: string;
  quota?: AccountQuota;
} & EngineAccountIdentity &
  ({ available: true } | { available: false; reason: AccountUnavailableReason });

export type EngineRole = 'orchestrator' | 'assignment';

export interface EngineSelectionView extends SubscriptionModel {
  botSlug: string;
  role: EngineRole;
  fallback?: boolean;
}

export interface EngineAccountsView {
  revision?: number;
  engines: EngineStatusView[];
  selections: EngineSelectionView[];
  accounts: NamedEngineAccount[];
}

export type SubscriptionAccountView = Omit<
  EngineStatusView,
  keyof EngineAccountIdentity | 'version'
> & {
  id?: string;
  name?: string;
  reason?: AccountUnavailableReason;
};

export interface SubscriptionAccountsView {
  revision?: number;
  accounts: SubscriptionAccountView[];
}

export type QuotaRefreshStatus = 'ok' | EngineQuotaRefreshError;

const isTime = (value: unknown): value is string =>
  text(value) && Number.isFinite(Date.parse(value));

function parseWindow(value: unknown): EngineQuotaWindow | undefined {
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

type AccountDetail = Pick<EngineStatusView, 'email' | 'quota'>;

function parseStatus(
  value: unknown,
  details: ReadonlyMap<string, AccountDetail>,
): EngineStatusView | undefined {
  const entry = record(value);
  const engine = entry?.['engine'];
  if (entry === undefined || !isEngineId(engine)) return undefined;
  const accountId = text(entry['accountId']) ? entry['accountId'] : undefined;
  const detail = accountId === undefined ? undefined : details.get(accountId);
  const snapshot = detail?.quota;
  const quota = usable(snapshot) ? snapshot : (parseAccountQuota(entry['quota']) ?? snapshot);
  const base = {
    engine,
    installed: entry['installed'] === true,
    ...(accountId === undefined ? {} : { accountId }),
    ...(text(entry['accountName']) ? { accountName: entry['accountName'] } : {}),
    ...(text(entry['version']) ? { version: entry['version'] } : {}),
    ...(detail?.email === undefined ? {} : { email: detail.email }),
    ...(quota === undefined ? {} : { quota }),
  };
  if (entry['available'] === true) return { ...base, available: true };
  return {
    ...base,
    available: false,
    reason: REASONS.find((reason) => reason === entry['reason']) ?? 'login-unknown',
  };
}

function parseSelection(value: unknown): EngineSelectionView | undefined {
  const row = record(value);
  const engine = row?.['engine'];
  const role = row?.['role'];
  if (
    !text(row?.['botSlug']) ||
    !isEngineId(engine) ||
    (role !== 'orchestrator' && role !== 'assignment')
  ) {
    return undefined;
  }
  return {
    botSlug: row['botSlug'],
    role,
    engine,
    ...(text(row['accountId']) ? { accountId: row['accountId'] } : {}),
    ...(text(row['model']) ? { model: row['model'] } : {}),
    ...(text(row['effort']) ? { effort: row['effort'] } : {}),
    ...(typeof row['fallback'] === 'boolean' ? { fallback: row['fallback'] } : {}),
  };
}

export function parseEngineAccounts(value: unknown, grantable = false): EngineAccountsView {
  const body = answerRecord(value, 'engineAccounts');
  const { engines, selections, accounts: rows, revision } = body;
  if (
    !Array.isArray(engines) ||
    !Array.isArray(selections) ||
    (grantable && !Array.isArray(rows))
  ) {
    throw new Error('Invalid subscription accounts');
  }
  const accounts: NamedEngineAccount[] = [];
  const details = new Map<string, AccountDetail>();
  for (const raw of Array.isArray(rows) ? rows : []) {
    const account = record(raw);
    if (!text(account?.['id'])) continue;
    const { id, engine, name, email } = account;
    if (isEngineId(engine) && text(name)) accounts.push({ id, engine, name });
    const quota = parseAccountQuota(account['quota']);
    details.set(id, {
      ...(text(email) ? { email } : {}),
      ...(quota === undefined ? {} : { quota }),
    });
  }
  return {
    ...(finiteNumber(revision) ? { revision } : {}),
    engines: some(engines, (entry) => parseStatus(entry, details)),
    selections: some(selections, parseSelection),
    accounts,
  };
}

export async function loadEngineAccounts(
  host: HostCall,
  grantable?: boolean,
): Promise<EngineAccountsView> {
  return parseEngineAccounts(
    await host.call('engineAccounts', grantable === undefined ? {} : { grantable }),
    grantable,
  );
}

export async function loadSubscriptionAccounts(host: HostCall): Promise<SubscriptionAccountsView> {
  const { revision, engines } = await loadEngineAccounts(host);
  return {
    ...(revision === undefined ? {} : { revision }),
    accounts: engines.map(({ accountId, accountName, version: _version, ...status }) => ({
      ...status,
      ...(accountId === undefined ? {} : { id: accountId }),
      ...(accountName === undefined ? {} : { name: accountName }),
    })),
  };
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
