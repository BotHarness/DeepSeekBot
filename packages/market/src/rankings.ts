import { entryFromRow, type MarketplaceEntry } from './catalog.js';
import type { D1Database } from './d1.js';
import type { MarketplaceLanguage } from './localization.js';
import type { RepositoryRow } from './repositories.js';

export const RANKING_SECTIONS = ['hot', 'new', 'rising'] as const;
export type RankingSection = (typeof RANKING_SECTIONS)[number];

export function isRankingSection(value: string): value is RankingSection {
  return (RANKING_SECTIONS as readonly string[]).includes(value);
}

const DAY_MS = 86_400_000;
export const RANKING_WINDOW_MS = 7 * DAY_MS;
export const SECTION_SIZE = 20;
export const RISING_FLOOR = 3;
export const SNAPSHOT_RETENTION_DAYS = 30;

export interface RankedEntry {
  bot: MarketplaceEntry;
  score: number;
}

export interface SectionView {
  section: RankingSection;
  day: string | null;
  entries: RankedEntry[];
}

export interface SnapshotReport {
  day: string;
  hot: number;
  new: number;
  rising: number;
}

export interface Rankings {
  snapshot(): Promise<SnapshotReport>;
  section(section: RankingSection, language?: MarketplaceLanguage): Promise<SectionView>;
}

export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

export function createRankings(deps: { db: D1Database; now: () => Date }): Rankings {
  const { db } = deps;

  const count = async (day: string, section: RankingSection): Promise<number> =>
    (
      await db
        .prepare('SELECT count(*) AS total FROM ranking_snapshots WHERE day = ? AND section = ?')
        .bind(day, section)
        .first<{ total: number }>()
    )?.total ?? 0;

  return {
    async snapshot() {
      const now = deps.now();
      const at = now.getTime();
      const day = utcDay(now);
      const recent = at - RANKING_WINDOW_MS;
      const previous = at - 2 * RANKING_WINDOW_MS;
      await db.prepare('DELETE FROM ranking_snapshots WHERE day = ?').bind(day).run();
      await db
        .prepare(
          `INSERT INTO ranking_snapshots (day, section, rank, bot_id, score)
           SELECT ?, 'hot', row_number() OVER (ORDER BY recent DESC, installs DESC, stars DESC, node_id),
             node_id, recent
           FROM (
             SELECT r.node_id, r.installs, r.stars, count(*) AS recent
             FROM install_receipts i JOIN indexed_repositories r ON r.node_id = i.bot_id
             WHERE i.created_at >= ? AND r.visibility = 'listed'
             GROUP BY r.node_id
             ORDER BY recent DESC, r.installs DESC, r.stars DESC, r.node_id
             LIMIT ?
           )`,
        )
        .bind(day, recent, SECTION_SIZE)
        .run();
      await db
        .prepare(
          `INSERT INTO ranking_snapshots (day, section, rank, bot_id, score)
           SELECT ?, 'new', row_number() OVER (ORDER BY first_seen_at DESC, node_id), node_id, 0
           FROM (
             SELECT node_id, first_seen_at FROM indexed_repositories
             WHERE visibility = 'listed' AND first_seen_at >= ?
             ORDER BY first_seen_at DESC, node_id
             LIMIT ?
           )`,
        )
        .bind(day, new Date(recent).toISOString(), SECTION_SIZE)
        .run();
      await db
        .prepare(
          `INSERT INTO ranking_snapshots (day, section, rank, bot_id, score)
           SELECT ?, 'rising', row_number() OVER (ORDER BY recent - earlier DESC, recent DESC, node_id),
             node_id, recent - earlier
           FROM (
             SELECT r.node_id,
               sum(CASE WHEN i.created_at >= ? THEN 1 ELSE 0 END) AS recent,
               sum(CASE WHEN i.created_at < ? THEN 1 ELSE 0 END) AS earlier
             FROM install_receipts i JOIN indexed_repositories r ON r.node_id = i.bot_id
             WHERE i.created_at >= ? AND r.visibility = 'listed'
             GROUP BY r.node_id
             HAVING recent >= ? AND recent > earlier
             ORDER BY recent - earlier DESC, recent DESC, r.node_id
             LIMIT ?
           )`,
        )
        .bind(day, recent, recent, previous, RISING_FLOOR, SECTION_SIZE)
        .run();
      await db
        .prepare(
          'INSERT INTO ranking_runs (day, created_at) VALUES (?, ?) ON CONFLICT (day) DO UPDATE SET created_at = excluded.created_at',
        )
        .bind(day, at)
        .run();
      const oldest = utcDay(new Date(at - SNAPSHOT_RETENTION_DAYS * DAY_MS));
      await db.prepare('DELETE FROM ranking_snapshots WHERE day < ?').bind(oldest).run();
      await db.prepare('DELETE FROM ranking_runs WHERE day < ?').bind(oldest).run();
      return {
        day,
        hot: await count(day, 'hot'),
        new: await count(day, 'new'),
        rising: await count(day, 'rising'),
      };
    },

    async section(section, language) {
      const run = await db
        .prepare('SELECT day FROM ranking_runs ORDER BY day DESC LIMIT 1')
        .first<{ day: string }>();
      if (run === null) return { section, day: null, entries: [] };
      const { results } = await db
        .prepare(
          `SELECT r.*, s.score AS ranking_score
           FROM ranking_snapshots s JOIN indexed_repositories r ON r.node_id = s.bot_id
           WHERE s.day = ? AND s.section = ? AND r.visibility = 'listed'
           ORDER BY s.rank`,
        )
        .bind(run.day, section)
        .all<RepositoryRow & { ranking_score: number }>();
      return {
        section,
        day: run.day,
        entries: results.map((row) => ({
          bot: entryFromRow(row, language),
          score: row.ranking_score,
        })),
      };
    },
  };
}
