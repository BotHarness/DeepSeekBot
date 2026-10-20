import type { D1Database } from './d1.js';
import { BOT_TOPIC, parseRepositoryUrl, type GitHubClient } from './github.js';
import {
  localizedPresentation,
  localizedReadme,
  readmeLanguages,
  type MarketplaceLanguage,
} from './localization.js';
import { prepareReadme } from './readme.js';
import { createRepositoryStore, isEligible, type RepositoryRow } from './repositories.js';

export interface MarketplaceEntry {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  displayName: string | null;
  tags: string[];
  roles: string[];
  bio: string | null;
  bioGenerated: boolean;
  banner: MarketplaceBanner | null;
  description: string | null;
  topics: string[];
  stars: number;
  pushedAt: string;
  htmlUrl: string;
  cloneUrl: string;
  defaultBranch: string;
  headCommit: { sha: string; committedAt: string } | null;
}

export type MarketplaceBanner = { recipe: { scene: string; seed: number } } | { image: string };

function parseBanner(value: string | null): MarketplaceBanner | null {
  if (value === null) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const recipe = parsed['recipe'] as Record<string, unknown> | undefined;
    if (
      recipe !== undefined &&
      typeof recipe['scene'] === 'string' &&
      typeof recipe['seed'] === 'number'
    ) {
      return { recipe: { scene: recipe['scene'], seed: recipe['seed'] } };
    }
    return typeof parsed['image'] === 'string' ? { image: parsed['image'] } : null;
  } catch {
    return null;
  }
}

export type SubmissionRefusal =
  | 'invalid-repository-url'
  | 'repository-not-found'
  | 'repository-private'
  | 'repository-archived'
  | 'repository-missing-topic'
  | 'repository-blocked'
  | 'upstream-unavailable';

export type SubmissionResult =
  | { ok: true; entry: MarketplaceEntry }
  | { ok: false; code: SubmissionRefusal };

export interface MarketplacePage {
  bots: MarketplaceEntry[];
  nextCursor?: string;
}

export const DEFAULT_PAGE_SIZE = 30;
export const MAX_PAGE_SIZE = 50;

function stringList(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function entryFromRow(row: RepositoryRow, language?: MarketplaceLanguage): MarketplaceEntry {
  const topics = stringList(row.topics).filter((topic) => topic !== BOT_TOPIC);
  const tags = stringList(row.roles);
  const presentation = localizedPresentation(row, language);
  return {
    id: row.node_id,
    owner: row.owner,
    name: row.name,
    fullName: `${row.owner}/${row.name}`,
    displayName: presentation.displayName,
    tags,
    roles: tags,
    bio: presentation.bio,
    bioGenerated: presentation.bioGenerated,
    banner: parseBanner(row.banner),
    description: row.description,
    topics,
    stars: row.stars,
    pushedAt: row.pushed_at,
    htmlUrl: row.html_url,
    cloneUrl: row.clone_url,
    defaultBranch: row.default_branch,
    headCommit:
      row.head_sha !== null && row.head_committed_at !== null
        ? { sha: row.head_sha, committedAt: row.head_committed_at }
        : null,
  };
}

export type BrowseSort = 'updated' | 'stars';

export const SEARCH_RESULT_LIMIT = 200;
export const MAX_QUERY_LENGTH = 100;

export type Cursor =
  | { mode: 'updated'; key: string; nodeId: string }
  | { mode: 'stars'; key: number; nodeId: string }
  | { mode: 'search'; offset: number };

export function encodeCursor(cursor: Cursor): string {
  return btoa(
    JSON.stringify(
      cursor.mode === 'search'
        ? [cursor.mode, cursor.offset]
        : [cursor.mode, cursor.key, cursor.nodeId],
    ),
  );
}

export function decodeCursor(cursor: string): Cursor | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(atob(cursor));
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;
  const [mode, key, nodeId] = parsed as unknown[];
  if (
    mode === 'search' &&
    parsed.length === 2 &&
    Number.isSafeInteger(key) &&
    (key as number) > 0
  ) {
    return { mode, offset: key as number };
  }
  if (parsed.length !== 3 || typeof nodeId !== 'string') return undefined;
  if (mode === 'updated' && typeof key === 'string') return { mode, key, nodeId };
  if (mode === 'stars' && Number.isSafeInteger(key)) return { mode, key: key as number, nodeId };
  return undefined;
}

export interface ListOptions {
  limit?: number;
  cursor?: string;
  sort?: BrowseSort;
  query?: string;
  topic?: string;
  language?: MarketplaceLanguage;
}

export interface TopicCount {
  topic: string;
  count: number;
}

function ftsQuery(terms: readonly string[]): string {
  return terms.map((term) => `"${term.replaceAll('"', '""')}"`).join(' ');
}

export interface MarketplaceDetail {
  bot: MarketplaceEntry;
  readme: string | null;
  readmeLanguage: MarketplaceLanguage | null;
  readmeLanguages: MarketplaceLanguage[];
  commitSha: string | null;
}

export interface Catalog {
  submit(url: string): Promise<SubmissionResult>;
  detail(id: string, language?: MarketplaceLanguage): Promise<MarketplaceDetail | undefined>;
  list(options: ListOptions): Promise<MarketplacePage | undefined>;
  topics(): Promise<TopicCount[]>;
}

export function createCatalog(deps: {
  db: D1Database;
  github: GitHubClient;
  now: () => Date;
}): Catalog {
  const { db, github } = deps;

  const store = createRepositoryStore(deps);

  return {
    async submit(url) {
      const locator = parseRepositoryUrl(url);
      if (locator === undefined) return { ok: false, code: 'invalid-repository-url' };
      const lookup = await github.repository(locator);
      if (!lookup.ok) {
        return {
          ok: false,
          code: lookup.reason === 'not-found' ? 'repository-not-found' : 'upstream-unavailable',
        };
      }
      const repository = lookup.value;
      const existing = await store.find(repository.nodeId);
      if (existing?.visibility === 'blocked') return { ok: false, code: 'repository-blocked' };
      if (repository.private) return { ok: false, code: 'repository-private' };
      if (!isEligible(repository)) {
        if (existing !== null) await store.index(repository, undefined);
        return {
          ok: false,
          code: repository.archived ? 'repository-archived' : 'repository-missing-topic',
        };
      }
      const commit = await github.headCommit(
        { owner: repository.owner, name: repository.name },
        repository.defaultBranch,
      );
      if (!commit.ok && commit.reason === 'unavailable') {
        return { ok: false, code: 'upstream-unavailable' };
      }
      const row = await store.index(repository, commit.ok ? commit.value : null);
      if (row === null) return { ok: false, code: 'upstream-unavailable' };
      if (row.visibility !== 'listed') return { ok: false, code: 'repository-blocked' };
      return { ok: true, entry: entryFromRow(row) };
    },

    async list(options) {
      const limit = Math.min(Math.max(options.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
      const toEntry = (row: RepositoryRow) => entryFromRow(row, options.language);
      const sort = options.sort ?? 'updated';
      const query = options.query?.trim() ?? '';
      const cursor = options.cursor === undefined ? undefined : decodeCursor(options.cursor);
      if (options.cursor !== undefined && cursor === undefined) return undefined;
      const topicClause =
        options.topic === undefined
          ? ''
          : ` AND (EXISTS (SELECT 1 FROM json_each(r.topics) WHERE value = ?)
                   OR EXISTS (SELECT 1 FROM json_each(r.roles) WHERE value = ?))`;
      const topicValues = options.topic === undefined ? [] : [options.topic, options.topic];

      if (query.length > 0) {
        if (cursor !== undefined && cursor.mode !== 'search') return undefined;
        const offset = cursor?.mode === 'search' ? cursor.offset : 0;
        const take = Math.min(limit, SEARCH_RESULT_LIMIT - offset);
        if (take <= 0) return { bots: [] };
        const terms = query.split(/\s+/u).filter((term) => term.length > 0);
        const statement = terms.every((term) => [...term].length >= 3)
          ? db
              .prepare(
                `SELECT r.* FROM indexed_repositories_fts f
                 JOIN indexed_repositories r ON r.rowid = f.rowid
                 WHERE indexed_repositories_fts MATCH ? AND r.visibility = 'listed'${topicClause}
                 ORDER BY bm25(indexed_repositories_fts, 10.0, 4.0, 4.0, 1.0, 4.0, 2.0), r.node_id
                 LIMIT ? OFFSET ?`,
              )
              .bind(ftsQuery(terms), ...topicValues, take + 1, offset)
          : db
              .prepare(
                `SELECT r.* FROM indexed_repositories r
                 WHERE r.visibility = 'listed'${terms
                   .map(
                     () =>
                       " AND instr(lower(r.name || ' ' || coalesce(r.description, '') || ' ' || r.topics || ' ' || r.roles || ' ' || coalesce(r.readme, '') || ' ' || coalesce(r.search_text, '')), lower(?)) > 0",
                   )
                   .join('')}${topicClause}
                 ORDER BY r.stars DESC, r.node_id DESC
                 LIMIT ? OFFSET ?`,
              )
              .bind(...terms, ...topicValues, take + 1, offset);
        const { results } = await statement.all<RepositoryRow>();
        const bots = results.slice(0, take).map(toEntry);
        const next = offset + take;
        return results.length > take && next < SEARCH_RESULT_LIMIT
          ? { bots, nextCursor: encodeCursor({ mode: 'search', offset: next }) }
          : { bots };
      }

      if (cursor !== undefined && cursor.mode !== sort) return undefined;
      const column = sort === 'stars' ? 'r.stars' : 'r.pushed_at';
      const after =
        cursor === undefined ? '' : ` AND (${column} < ? OR (${column} = ? AND r.node_id < ?))`;
      const afterValues = cursor === undefined ? [] : [cursor.key, cursor.key, cursor.nodeId];
      const { results } = await db
        .prepare(
          `SELECT r.* FROM indexed_repositories r
           WHERE r.visibility = 'listed'${topicClause}${after}
           ORDER BY ${column} DESC, r.node_id DESC
           LIMIT ?`,
        )
        .bind(...topicValues, ...afterValues, limit + 1)
        .all<RepositoryRow>();
      const page = results.slice(0, limit);
      const last = page.at(-1);
      if (results.length <= limit || last === undefined) return { bots: page.map(toEntry) };
      return {
        bots: page.map(toEntry),
        nextCursor: encodeCursor(
          sort === 'stars'
            ? { mode: 'stars', key: last.stars, nodeId: last.node_id }
            : { mode: 'updated', key: last.pushed_at, nodeId: last.node_id },
        ),
      };
    },

    async detail(id, language) {
      const row = await store.find(id);
      if (row === null || row.visibility !== 'listed') return undefined;
      const ref = row.head_sha ?? row.default_branch;
      const readme = localizedReadme(row, language);
      return {
        bot: entryFromRow(row, language),
        readme:
          readme.markdown === null
            ? null
            : prepareReadme(readme.markdown, { owner: row.owner, name: row.name, ref }),
        readmeLanguage: readme.language,
        readmeLanguages: readmeLanguages(row),
        commitSha: row.head_sha,
      };
    },

    async topics() {
      const { results } = await db
        .prepare(
          `SELECT topic, count(*) AS count
           FROM (
             SELECT r.node_id, t.value AS topic
             FROM indexed_repositories r, json_each(r.topics) t
             WHERE r.visibility = 'listed'
             UNION
             SELECT r.node_id, t.value AS topic
             FROM indexed_repositories r, json_each(r.roles) t
             WHERE r.visibility = 'listed'
           )
           WHERE topic <> ?
           GROUP BY topic
           ORDER BY count DESC, topic
           LIMIT 30`,
        )
        .bind(BOT_TOPIC)
        .all<TopicCount>();
      return results;
    },
  };
}
