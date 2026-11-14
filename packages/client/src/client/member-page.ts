const REMOTE_ACCESS_SNAPSHOT_KEY = '__DSH_REMOTE_ACCESS__';

export function memberPage(scope: Record<string, unknown> = globalThis as never): boolean {
  const baseline = scope[REMOTE_ACCESS_SNAPSHOT_KEY];
  if (baseline === null || typeof baseline !== 'object') return false;
  return (baseline as { owner?: unknown }).owner !== true;
}
