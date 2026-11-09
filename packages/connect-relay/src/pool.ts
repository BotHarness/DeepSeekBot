export const ONLINE = new Set(['healthy', 'degraded']);

export interface PoolTunnel {
  id: string;
  account: string;
  zone: string;
  tunnelCreatedAt: string | null;
  lastUsedAt: string | null;
  status: string | null;
  inactiveSince: string | null;
}

export interface EvictionPolicy {
  offlineGraceMs: number;
  protectMs: number;
  freshMs: number;
}

export type EvictionTier = 'gone' | 'offline' | 'idle';

export interface Victim {
  id: string;
  tier: EvictionTier;
}

const time = (value: string | null | undefined): number => {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
};

export function pickVictim(
  candidates: readonly PoolTunnel[],
  requester: { id: string; lastUsedAt: number },
  now: number,
  policy: EvictionPolicy,
): Victim | undefined {
  const others = candidates.filter((candidate) => candidate.id !== requester.id);
  const gone = others.find((candidate) => candidate.status === 'gone');
  if (gone !== undefined) return { id: gone.id, tier: 'gone' };
  const offline = others
    .filter((candidate) => candidate.status !== null && !ONLINE.has(candidate.status))
    .map((candidate) => ({
      candidate,
      since: time(candidate.inactiveSince ?? candidate.tunnelCreatedAt),
    }))
    .filter(({ since }) => now - since > policy.offlineGraceMs)
    .sort((left, right) => left.since - right.since)[0];
  if (offline !== undefined) return { id: offline.candidate.id, tier: 'offline' };
  const perAccount = new Map<string, number>();
  for (const candidate of candidates)
    perAccount.set(candidate.account, (perAccount.get(candidate.account) ?? 0) + 1);
  const idle = others
    .filter((candidate) => candidate.status !== null && ONLINE.has(candidate.status))
    .map((candidate) => ({
      candidate,
      used: time(candidate.lastUsedAt ?? candidate.tunnelCreatedAt),
    }))
    .filter(
      ({ candidate, used }) =>
        now - used > policy.protectMs &&
        now - time(candidate.tunnelCreatedAt) > policy.freshMs &&
        used < requester.lastUsedAt,
    )
    .sort(
      (left, right) =>
        left.used - right.used ||
        (perAccount.get(right.candidate.account) ?? 0) -
          (perAccount.get(left.candidate.account) ?? 0),
    )[0];
  return idle === undefined ? undefined : { id: idle.candidate.id, tier: 'idle' };
}

export function pickZone(
  zones: readonly string[],
  used: ReadonlyMap<string, number>,
  capacity: number,
): string | undefined {
  let best: { zone: string; free: number } | undefined;
  for (const zone of zones) {
    const free = capacity - (used.get(zone) ?? 0);
    if (free > 0 && (best === undefined || free > best.free)) best = { zone, free };
  }
  return best?.zone;
}
