import type { BridgeCall, ModelCatalogEntryView } from './bridge.js';
import { list, record, unwrap } from './team-bridge.js';
import { routeKey } from './team-roles-bridge.js';

export const USAGE_VIEW = 'usage.view';
export const USAGE_PERIODS = ['today', 'week', 'month', 'quarter'] as const;
export type UsagePeriod = (typeof USAGE_PERIODS)[number];

export interface UsageTotals {
  readonly totalTokens: number | null;
  readonly partial: boolean;
}

export interface MemberUsage {
  readonly humanId: string;
  readonly displayName: string;
  readonly deleted: boolean;
  readonly totals: UsageTotals;
  readonly bots: readonly { slug: string; displayName: string; totals: UsageTotals }[];
}

export interface MemberUsageView {
  readonly members: readonly MemberUsage[];
  readonly legacy: boolean;
}

function totalsOf(value: unknown): UsageTotals {
  const row = record(value);
  const total = row?.['totalTokens'];
  return {
    totalTokens: typeof total === 'number' && Number.isFinite(total) && total >= 0 ? total : null,
    partial: row?.['partial'] === true,
  };
}

export function parseMemberUsage(value: unknown): MemberUsage | undefined {
  const row = record(value);
  const humanId = row?.['humanId'];
  if (row === undefined || typeof humanId !== 'string' || humanId.length === 0) return undefined;
  const name = row['displayName'];
  const bots = list(row['bots'], (item) => {
    const bot = record(item);
    const slug = bot?.['slug'];
    if (typeof slug !== 'string') return undefined;
    const display = bot?.['displayName'];
    return {
      slug,
      displayName: typeof display === 'string' && display.length > 0 ? display : slug,
      totals: totalsOf(bot?.['totals']),
    };
  });
  return {
    humanId,
    displayName: typeof name === 'string' && name.length > 0 ? name : humanId,
    deleted: row['deleted'] === true,
    totals: totalsOf(row['totals']),
    bots: [...bots].sort((a, b) => (b.totals.totalTokens ?? 0) - (a.totals.totalTokens ?? 0)),
  };
}

export function sortMembers(members: readonly MemberUsage[]): MemberUsage[] {
  return [...members].sort(
    (a, b) =>
      (b.totals.totalTokens ?? 0) - (a.totals.totalTokens ?? 0) ||
      a.displayName.localeCompare(b.displayName),
  );
}

export async function loadMemberUsage(
  call: BridgeCall,
  period: UsagePeriod,
  signal?: AbortSignal,
): Promise<MemberUsageView> {
  const value = record(await unwrap(call, 'usageByMember', { period }, signal));
  return {
    members: sortMembers(list(value?.['members'], parseMemberUsage)),
    legacy: value?.['legacy'] === true,
  };
}

export function modelChoices(
  models: readonly ModelCatalogEntryView[],
): { route: string; label: string }[] {
  const seen = new Set<string>();
  return models.flatMap((entry) => {
    const route = routeKey(entry.provider, entry.model);
    if (seen.has(route)) return [];
    seen.add(route);
    return [{ route, label: `${entry.providerName} · ${entry.modelName}` }];
  });
}
