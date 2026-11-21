import { asRecord, bridgeHost, unwrap, type BridgeCall } from '../../bridge-transport.js';
import { loadUsage } from '@botharness/host-client/usage';
import type { OverviewUsage } from '@botharness/host-client/usage';
import { type ProfileSessionUsage } from '../../bridge.js';
import { type UsageOverviewPeriod } from '../../bridge.js';
import { type UsageFilter, type UsageQueryResult } from '../../bridge.js';

export async function loadProfileUsage(
  call: BridgeCall,
  channelId: string,
  filter: UsageFilter,
): Promise<UsageQueryResult> {
  const value = asRecord(await unwrap(call, 'profileUsage', { channelId, filter }));
  const count = (input: unknown) =>
    input === null || (Number.isSafeInteger(input) && Number(input) >= 0);
  if (
    value === undefined ||
    !Array.isArray(value['rows']) ||
    value['rows'].length > 2000 ||
    !value['rows'].every((item) => {
      const row = asRecord(item);
      return (
        row !== undefined &&
        ['day', 'purpose', 'provider', 'model'].every((key) => typeof row[key] === 'string') &&
        ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'totalTokens'].every(
          (key) => count(row[key]),
        )
      );
    }) ||
    !count(value['periodTotal']) ||
    !count(value['allTimeTotal']) ||
    !['periodRecords', 'allTimeRecords'].every(
      (key) => Number.isSafeInteger(value[key]) && Number(value[key]) >= 0,
    ) ||
    !['models', 'providers'].every(
      (key) =>
        Array.isArray(value[key]) &&
        value[key].length <= 1000 &&
        value[key].every((item: unknown) => typeof item === 'string'),
    ) ||
    !['truncated', 'facetsTruncated', 'legacyBaseline'].every(
      (key) => typeof value[key] === 'boolean',
    ) ||
    !['ready', 'reconciling', 'degraded'].includes(String(value['freshness'])) ||
    typeof value['readAt'] !== 'string' ||
    !Number.isFinite(Date.parse(value['readAt'])) ||
    (value['reconciledAt'] !== null &&
      (typeof value['reconciledAt'] !== 'string' ||
        !Number.isFinite(Date.parse(value['reconciledAt'])))) ||
    !['start', 'end', 'model', 'provider', 'purpose'].every(
      (key) =>
        asRecord(value['filter'])?.[key] === (filter as unknown as Record<string, unknown>)[key],
    )
  )
    throw new Error('invalid Profile usage');
  return value as unknown as UsageQueryResult;
}

export async function loadProfileSessionUsage(
  call: BridgeCall,
  channelId: string,
): Promise<ProfileSessionUsage> {
  const value = asRecord(await unwrap(call, 'profileSessionUsage', { channelId }));
  if (
    value === undefined ||
    typeof value['slug'] !== 'string' ||
    value['weeks'] !== 26 ||
    typeof value['since'] !== 'string' ||
    !Number.isFinite(Date.parse(value['since'])) ||
    !Array.isArray(value['rows']) ||
    value['rows'].length > 6 ||
    !value['rows'].every((item) => {
      const row = asRecord(item);
      return (
        row !== undefined &&
        typeof row['sessionId'] === 'string' &&
        ['orchestrator', 'assignment'].includes(String(row['role'])) &&
        typeof row['label'] === 'string' &&
        row['label'].length <= 160 &&
        typeof row['updatedAt'] === 'string' &&
        Number.isFinite(Date.parse(row['updatedAt'])) &&
        ['ready', 'unknown', 'partial', 'unavailable'].includes(String(row['status'])) &&
        (row['totalTokens'] === null ||
          (Number.isSafeInteger(row['totalTokens']) && Number(row['totalTokens']) >= 0))
      );
    })
  )
    throw new Error('invalid Profile Session usage');
  return value as unknown as ProfileSessionUsage;
}

export async function loadOverviewUsage(
  call: BridgeCall,
  period: UsageOverviewPeriod,
  after?: string,
): Promise<OverviewUsage> {
  return loadUsage(bridgeHost(call), period, after);
}
