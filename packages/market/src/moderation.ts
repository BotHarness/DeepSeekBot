import type { Catalog } from './catalog.js';
import type { D1Database } from './d1.js';
import { parseRepositoryUrl, type GitHubClient } from './github.js';
import { createRepositoryStore, type RepositoryRow, type Visibility } from './repositories.js';

export const MAX_REPORT_REASON_LENGTH = 500;
export const DEFAULT_REPORT_THRESHOLD = 3;

export type BlocklistTarget = { id: string } | { url: string };

export type BlocklistResult =
  | { ok: true; bot: { id: string; fullName: string; visibility: Visibility } }
  | { ok: false; code: 'bot-not-found' | 'invalid-repository-url' | 'upstream-unavailable' };

export interface Moderation {
  report(options: {
    id: string;
    source: string;
    reason: string | undefined;
    threshold: number;
  }): Promise<boolean>;
  block(target: BlocklistTarget): Promise<BlocklistResult>;
  restore(target: BlocklistTarget): Promise<BlocklistResult>;
}

export function createModeration(deps: {
  db: D1Database;
  github: GitHubClient;
  catalog: Catalog;
  now: () => Date;
}): Moderation {
  const { db, github, catalog } = deps;
  const store = createRepositoryStore(deps);

  const setVisibility = (nodeId: string, visibility: Visibility) =>
    db
      .prepare(
        'UPDATE indexed_repositories SET visibility = ?, last_refreshed_at = ? WHERE node_id = ?',
      )
      .bind(visibility, deps.now().toISOString(), nodeId)
      .run();

  const resolve = async (
    target: BlocklistTarget,
    fetchMissing: boolean,
  ): Promise<
    RepositoryRow | 'bot-not-found' | 'invalid-repository-url' | 'upstream-unavailable'
  > => {
    if ('id' in target) return (await store.find(target.id)) ?? 'bot-not-found';
    const locator = parseRepositoryUrl(target.url);
    if (locator === undefined) return 'invalid-repository-url';
    const indexed = await db
      .prepare(
        "SELECT * FROM indexed_repositories WHERE source = 'github' AND lower(owner) = lower(?) AND lower(name) = lower(?)",
      )
      .bind(locator.owner, locator.name)
      .first<RepositoryRow>();
    if (indexed !== null || !fetchMissing) return indexed ?? 'bot-not-found';
    const lookup = await github.repository(locator);
    if (!lookup.ok) {
      return lookup.reason === 'not-found' ? 'bot-not-found' : 'upstream-unavailable';
    }
    return (await store.index(lookup.value, undefined)) ?? 'upstream-unavailable';
  };

  const summary = async (nodeId: string): Promise<BlocklistResult> => {
    const row = await store.find(nodeId);
    return row === null
      ? { ok: false, code: 'bot-not-found' }
      : {
          ok: true,
          bot: {
            id: row.node_id,
            fullName: `${row.owner}/${row.name}`,
            visibility: row.visibility,
          },
        };
  };

  return {
    async report({ id, source, reason, threshold }) {
      const row = await store.find(id);
      if (row?.visibility !== 'listed') return false;
      await db
        .prepare(
          'INSERT INTO reports (node_id, source_hash, reason, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (node_id, source_hash) DO NOTHING',
        )
        .bind(id, source, reason ?? null, deps.now().toISOString())
        .run();
      const counted = await db
        .prepare('SELECT COUNT(*) AS total FROM reports WHERE node_id = ?')
        .bind(id)
        .first<{ total: number }>();
      if ((counted?.total ?? 0) >= threshold) {
        await db
          .prepare(
            "UPDATE indexed_repositories SET visibility = 'hidden_reported' WHERE node_id = ? AND visibility = 'listed'",
          )
          .bind(id)
          .run();
      }
      return true;
    },

    async block(target) {
      const row = await resolve(target, true);
      if (typeof row === 'string') return { ok: false, code: row };
      await setVisibility(row.node_id, 'blocked');
      return summary(row.node_id);
    },

    async restore(target) {
      const row = await resolve(target, false);
      if (typeof row === 'string') return { ok: false, code: row };
      await db.prepare('DELETE FROM reports WHERE node_id = ?').bind(row.node_id).run();
      if (row.source === 'upload') {
        await setVisibility(row.node_id, 'listed');
        return summary(row.node_id);
      }
      await setVisibility(row.node_id, 'hidden_missing');
      await catalog.submit(row.html_url);
      return summary(row.node_id);
    },
  };
}
