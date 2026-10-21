import { BOT_DESCRIPTOR_PATH, parseBotDescriptor } from '../../core/src/marketplace/descriptor.js';
import type { D1Database } from './d1.js';
import {
  BOT_TOPIC,
  type GitHubClient,
  type GitHubCommit,
  type GitHubRepository,
} from './github.js';
import { localizedReadmeFiles, searchText, storedMap, type LanguageMap } from './localization.js';

export type Visibility = 'listed' | 'hidden_missing' | 'hidden_reported' | 'blocked';

export interface RepositoryRow {
  node_id: string;
  owner: string;
  name: string;
  html_url: string;
  clone_url: string;
  description: string | null;
  topics: string;
  stars: number;
  pushed_at: string;
  created_at: string;
  default_branch: string;
  head_sha: string | null;
  head_committed_at: string | null;
  visibility: Visibility;
  readme: string | null;
  readme_pushed_at: string | null;
  display_name: string | null;
  roles: string;
  bio: string | null;
  banner: string | null;
  readmes: string | null;
  localized: string | null;
  summary: string | null;
  summary_key: string | null;
  summary_checked_at: string | null;
  summary_failures: number;
  search_text: string | null;
}

export const MAX_README_LENGTH = 200_000;

export function isEligible(repository: GitHubRepository): boolean {
  return !repository.private && !repository.archived && repository.topics.includes(BOT_TOPIC);
}

export interface RepositoryStore {
  find(nodeId: string): Promise<RepositoryRow | null>;
  index(
    repository: GitHubRepository,
    head: GitHubCommit | null | undefined,
  ): Promise<RepositoryRow | null>;
  hide(nodeId: string): Promise<boolean>;
  listedIds(): Promise<string[]>;
  refreshableIds(): Promise<string[]>;
}

export function createRepositoryStore(deps: {
  db: D1Database;
  github: GitHubClient;
  now: () => Date;
}): RepositoryStore {
  const { db, github } = deps;

  const find = (nodeId: string): Promise<RepositoryRow | null> =>
    db
      .prepare('SELECT * FROM indexed_repositories WHERE node_id = ?')
      .bind(nodeId)
      .first<RepositoryRow>();

  const refreshPresentation = async (row: RepositoryRow): Promise<void> => {
    if (row.visibility !== 'listed' || row.readme_pushed_at === row.pushed_at) return;
    const locator = { owner: row.owner, name: row.name };
    const [readme, descriptorFile, rootFiles] = await Promise.all([
      github.readme(locator),
      github.file(locator, BOT_DESCRIPTOR_PATH),
      github.rootFiles(locator),
    ]);
    if (!readme.ok || !descriptorFile.ok || !rootFiles.ok) return;
    const readmes: LanguageMap<string> = {};
    for (const [language, file] of Object.entries(localizedReadmeFiles(rootFiles.value))) {
      const variant = await github.file(locator, file);
      if (!variant.ok) return;
      if (variant.value !== null && variant.value.trim().length > 0) {
        readmes[language as keyof LanguageMap<string>] = variant.value.slice(0, MAX_README_LENGTH);
      }
    }
    const descriptor =
      descriptorFile.value === null ? undefined : parseBotDescriptor(descriptorFile.value);
    const banner = descriptor?.banner;
    const ref = row.head_sha ?? row.default_branch;
    const stored =
      banner === undefined
        ? null
        : 'recipe' in banner
          ? { recipe: banner.recipe }
          : {
              image: `https://raw.githubusercontent.com/${row.owner}/${row.name}/${ref}/${banner.image
                .split('/')
                .map(encodeURIComponent)
                .join('/')}`,
            };
    const localized = storedMap(descriptor?.i18n ?? {});
    const storedReadmes = storedMap(readmes);
    await db
      .prepare(
        `UPDATE indexed_repositories SET readme = ?, readme_pushed_at = ?, display_name = ?, roles = ?,
           bio = ?, banner = ?, readmes = ?, localized = ?, search_text = ?, summary_failures = 0
         WHERE node_id = ?`,
      )
      .bind(
        readme.value?.slice(0, MAX_README_LENGTH) ?? null,
        row.pushed_at,
        descriptor?.name ?? null,
        JSON.stringify(descriptor?.tags ?? []),
        descriptor?.bio ?? null,
        stored === null ? null : JSON.stringify(stored),
        storedReadmes,
        localized,
        searchText({ readmes: storedReadmes, localized, summary: row.summary }),
        row.node_id,
      )
      .run();
  };

  return {
    find,

    async index(repository, head) {
      const existing = await find(repository.nodeId);
      const eligible = isEligible(repository);
      if (existing === null && !eligible) return null;
      const now = deps.now().toISOString();
      await db
        .prepare(
          `INSERT INTO indexed_repositories (
            node_id, owner, name, html_url, clone_url, description, topics, stars, pushed_at,
            default_branch, head_sha, head_committed_at, visibility, first_seen_at, last_refreshed_at,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (node_id) DO UPDATE SET
            owner = excluded.owner,
            name = excluded.name,
            html_url = excluded.html_url,
            clone_url = excluded.clone_url,
            summary_checked_at = CASE
              WHEN indexed_repositories.description IS excluded.description THEN indexed_repositories.summary_checked_at
            END,
            summary_failures = CASE
              WHEN indexed_repositories.description IS excluded.description THEN indexed_repositories.summary_failures
              ELSE 0
            END,
            description = excluded.description,
            topics = excluded.topics,
            stars = excluded.stars,
            pushed_at = excluded.pushed_at,
            created_at = CASE WHEN ? THEN excluded.created_at ELSE indexed_repositories.created_at END,
            default_branch = excluded.default_branch,
            head_sha = CASE WHEN ? THEN excluded.head_sha ELSE indexed_repositories.head_sha END,
            head_committed_at = CASE WHEN ? THEN excluded.head_committed_at ELSE indexed_repositories.head_committed_at END,
            visibility = CASE
              WHEN indexed_repositories.visibility IN ('blocked', 'hidden_reported') THEN indexed_repositories.visibility
              ELSE excluded.visibility
            END,
            last_refreshed_at = excluded.last_refreshed_at`,
        )
        .bind(
          repository.nodeId,
          repository.owner,
          repository.name,
          repository.htmlUrl,
          repository.cloneUrl,
          repository.description,
          JSON.stringify(repository.topics),
          repository.stars,
          repository.pushedAt,
          repository.defaultBranch,
          head?.sha ?? null,
          head?.committedAt ?? null,
          eligible ? 'listed' : 'hidden_missing',
          now,
          now,
          repository.createdAt ?? now,
          repository.createdAt === null ? 0 : 1,
          head === undefined ? 0 : 1,
          head === undefined ? 0 : 1,
        )
        .run();
      const row = await find(repository.nodeId);
      if (row !== null) await refreshPresentation(row);
      return row === null ? null : await find(repository.nodeId);
    },

    async hide(nodeId) {
      const row = await find(nodeId);
      if (row?.visibility !== 'listed') return false;
      await db
        .prepare(
          "UPDATE indexed_repositories SET visibility = 'hidden_missing', last_refreshed_at = ? WHERE node_id = ? AND visibility = 'listed'",
        )
        .bind(deps.now().toISOString(), nodeId)
        .run();
      return true;
    },

    async listedIds() {
      const { results } = await db
        .prepare("SELECT node_id FROM indexed_repositories WHERE visibility = 'listed'")
        .all<{ node_id: string }>();
      return results.map((row) => row.node_id);
    },

    async refreshableIds() {
      const { results } = await db
        .prepare(
          "SELECT node_id FROM indexed_repositories WHERE visibility <> 'blocked' ORDER BY node_id",
        )
        .all<{ node_id: string }>();
      return results.map((row) => row.node_id);
    },
  };
}
