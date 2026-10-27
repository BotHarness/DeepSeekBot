import {
  createChallenge,
  sha256Hex,
  verifySolution,
  type AltchaChallenge,
  type ChallengeTier,
} from '../../core/src/marketplace/altcha.js';
import type { D1Database } from './d1.js';

export interface ProtectionLimits {
  submitPerHour: number;
  reportPerHour: number;
  installPerHour: number;
  repositoryCooldownMs: number;
  elevatedAfter: number;
  highAfter: number;
}

export const DEFAULT_LIMITS: ProtectionLimits = {
  submitPerHour: 10,
  reportPerHour: 20,
  installPerHour: 60,
  repositoryCooldownMs: 5 * 60_000,
  elevatedAfter: 5,
  highAfter: 20,
};

export const TIER_WINDOW_MS = 10 * 60_000;
const HOUR_MS = 60 * 60_000;

export type ChallengeRefusal =
  | 'challenge-required'
  | 'challenge-invalid'
  | 'challenge-expired'
  | 'challenge-replayed';

export type LimitedAction = 'submit' | 'report' | 'install';

export interface Protection {
  source(request: Request): Promise<string>;
  challenge(source: string): Promise<AltchaChallenge>;
  verify(payload: unknown): Promise<{ ok: true } | { ok: false; code: ChallengeRefusal }>;
  allow(source: string, action: LimitedAction): Promise<boolean>;
  claimRepository(locator: string): Promise<number | undefined>;
}

export function tierFor(recentChallenges: number, limits: ProtectionLimits): ChallengeTier {
  if (recentChallenges >= limits.highAfter) return 'high';
  if (recentChallenges >= limits.elevatedAfter) return 'elevated';
  return 'default';
}

export function createProtection(deps: {
  db: D1Database;
  key: string;
  now: () => Date;
  limits: ProtectionLimits;
  challengeNumber?: () => number;
}): Protection {
  const { db, key, limits } = deps;

  const count = async (source: string, action: string, since: number): Promise<number> => {
    const row = await db
      .prepare(
        'SELECT COUNT(*) AS total FROM request_events WHERE source_hash = ? AND action = ? AND created_at > ?',
      )
      .bind(source, action, since)
      .first<{ total: number }>();
    return row?.total ?? 0;
  };

  const record = (source: string, action: string, at: number) =>
    db
      .prepare('INSERT INTO request_events (source_hash, action, created_at) VALUES (?, ?, ?)')
      .bind(source, action, at)
      .run();

  return {
    async source(request) {
      const address = request.headers.get('cf-connecting-ip') ?? 'unknown';
      return sha256Hex(`${key}\n${address}`);
    },

    async challenge(source) {
      const now = deps.now();
      const at = now.getTime();
      await db
        .prepare('DELETE FROM request_events WHERE created_at <= ?')
        .bind(at - HOUR_MS)
        .run();
      await db
        .prepare('DELETE FROM used_challenges WHERE expires_at < ?')
        .bind(Math.floor(at / 1000))
        .run();
      const tier = tierFor(await count(source, 'challenge', at - TIER_WINDOW_MS), limits);
      await record(source, 'challenge', at);
      const number = deps.challengeNumber?.();
      return createChallenge({ key, tier, now, ...(number === undefined ? {} : { number }) });
    },

    async verify(payload) {
      if (typeof payload !== 'string' || payload.length === 0) {
        return { ok: false, code: 'challenge-required' };
      }
      const check = await verifySolution({ key, payload, now: deps.now() });
      if (!check.ok) {
        return {
          ok: false,
          code: check.reason === 'expired' ? 'challenge-expired' : 'challenge-invalid',
        };
      }
      const claimed = await db
        .prepare(
          'INSERT INTO used_challenges (challenge, expires_at) VALUES (?, ?) ON CONFLICT (challenge) DO NOTHING RETURNING challenge',
        )
        .bind(check.challenge, check.expiresAt)
        .first<{ challenge: string }>();
      return claimed === null ? { ok: false, code: 'challenge-replayed' } : { ok: true };
    },

    async allow(source, action) {
      const at = deps.now().getTime();
      const limit =
        action === 'submit'
          ? limits.submitPerHour
          : action === 'report'
            ? limits.reportPerHour
            : limits.installPerHour;
      if ((await count(source, action, at - HOUR_MS)) >= limit) return false;
      await record(source, action, at);
      return true;
    },

    async claimRepository(locator) {
      const at = deps.now().getTime();
      const row = await db
        .prepare('SELECT crawled_at FROM repository_crawls WHERE locator = ?')
        .bind(locator)
        .first<{ crawled_at: number }>();
      if (row !== null && at - row.crawled_at < limits.repositoryCooldownMs) {
        return Math.ceil((row.crawled_at + limits.repositoryCooldownMs - at) / 1000);
      }
      await db
        .prepare(
          'INSERT INTO repository_crawls (locator, crawled_at) VALUES (?, ?) ON CONFLICT (locator) DO UPDATE SET crawled_at = excluded.crawled_at',
        )
        .bind(locator, at)
        .run();
      return undefined;
    },
  };
}

export async function sameSecret(given: string, expected: string): Promise<boolean> {
  const [left, right] = await Promise.all([sha256Hex(given), sha256Hex(expected)]);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
