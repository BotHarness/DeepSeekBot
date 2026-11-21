import type { Catalog } from './catalog.js';
import type { D1Database } from './d1.js';
import { parseRepositoryUrl, type GitHubClient } from './github.js';
import { createRepositoryStore, type RepositoryRow, type Visibility } from './repositories.js';

export const MAX_REPORT_REASON_LENGTH = 500;
export const DEFAULT_REPORT_THRESHOLD = 3;

export type EntryKind = 'bot' | 'avatar';
export type BlocklistTarget =
  | { kind: 'bot'; id: string }
  | { kind: 'bot'; url: string }
  | { kind: 'avatar'; id: string };

const entries = {
  bot: { table: 'indexed_repositories', id: 'node_id' },
  avatar: { table: 'marketplace_avatars', id: 'id' },
} satisfies Record<EntryKind, { table: string; id: string }>;

export type BlocklistResult =
  | { ok: true; bot: { id: string; fullName: string; visibility: Visibility } }
  | { ok: true; avatar: { id: string; name: string; visibility: Visibility } }
  | {
      ok: false;
      code:
        | 'bot-not-found'
        | 'avatar-not-found'
        | 'invalid-repository-url'
        | 'upstream-unavailable';
    };

export interface Moderation {
  report(options: {
    kind: EntryKind;
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

  const setBotVisibility = (nodeId: string, visibility: Visibility) =>
    db
      .prepare(
        'UPDATE indexed_repositories SET visibility = ?, last_refreshed_at = ? WHERE node_id = ?',
      )
      .bind(visibility, deps.now().toISOString(), nodeId)
      .run();

  const resolveBot = async (
    target: Extract<BlocklistTarget, { kind: 'bot' }>,
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

  const summarizeBot = async (nodeId: string): Promise<BlocklistResult> => {
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

  const moderateAvatar = async (
    id: string,
    visibility: 'listed' | 'blocked',
  ): Promise<BlocklistResult> => {
    const avatar = await db
      .prepare(
        'UPDATE marketplace_avatars SET visibility = ? WHERE id = ? RETURNING id, name, visibility',
      )
      .bind(visibility, id)
      .first<{ id: string; name: string; visibility: Visibility }>();
    return avatar === null ? { ok: false, code: 'avatar-not-found' } : { ok: true, avatar };
  };

  return {
    async report({ kind, id, source, reason, threshold }) {
      const entry = entries[kind];
      const reportKey = kind === 'bot' ? id : `avatar:${id}`;
      const listed = `FROM ${entry.table} WHERE ${entry.id} = ? AND visibility = 'listed'`;
      const [admission] = await db.batch([
        db.prepare(`SELECT 1 ${listed}`).bind(id),
        db
          .prepare(`
            INSERT INTO reports (node_id, source_hash, reason, created_at)
            SELECT ?, ?, ?, ? ${listed}
            ON CONFLICT (node_id, source_hash) DO NOTHING
          `)
          .bind(reportKey, source, reason ?? null, deps.now().toISOString(), id),
        db
          .prepare(`
            UPDATE ${entry.table} SET visibility = 'hidden_reported'
            WHERE ${entry.id} = ? AND visibility = 'listed'
              AND (SELECT COUNT(*) FROM reports WHERE node_id = ?) >= ?
          `)
          .bind(id, reportKey, threshold),
      ]);
      return (admission?.results.length ?? 0) > 0;
    },

    async block(target) {
      if (target.kind === 'avatar') return moderateAvatar(target.id, 'blocked');
      const row = await resolveBot(target, true);
      if (typeof row === 'string') return { ok: false, code: row };
      await setBotVisibility(row.node_id, 'blocked');
      return summarizeBot(row.node_id);
    },

    async restore(target) {
      if (target.kind === 'avatar') return moderateAvatar(target.id, 'listed');
      const row = await resolveBot(target, false);
      if (typeof row === 'string') return { ok: false, code: row };
      await db.prepare('DELETE FROM reports WHERE node_id = ?').bind(row.node_id).run();
      if (row.source === 'upload') {
        await setBotVisibility(row.node_id, 'listed');
        return summarizeBot(row.node_id);
      }
      await setBotVisibility(row.node_id, 'hidden_missing');
      await catalog.submit(row.html_url);
      return summarizeBot(row.node_id);
    },
  };
}
