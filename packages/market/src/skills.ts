import type { D1Database } from './d1.js';
import {
  parseRepositoryUrl,
  type GitHubClient,
  type GitHubRepository,
  type GitHubTreeBlob,
  type RepositoryLocator,
} from './github.js';
import {
  MAX_SKILL_BYTES,
  MAX_SKILL_FILES,
  MAX_SKILL_MD_CHARS,
  SKILL_TOPIC,
  parseSkillFrontmatter,
  scanSkillFiles,
  type SkillFinding,
  type SkillScanVerdict,
} from './skill-scan.js';
import { uploadFileKind } from './upload-files.js';
import { recordSkillInstall } from './receipts.js';

export const SKILL_LIST_PATH = '/v1/skills';
export const SKILL_ROUTE = /^\/v1\/skills\/([0-9a-f]{24})$/u;
export const SKILL_INSTALL_ROUTE = /^\/v1\/skills\/([0-9a-f]{24})\/installs$/u;
export const SKILL_PAGE_SIZE = 24;
export const MAX_SKILLS_PER_REPOSITORY = 50;
const MAX_SCANNED_FILES = 30;
const MAX_SCANNED_FILE_BYTES = 256 * 1024;
const MAX_SEARCH_PAGES = 10;
const OFFICIAL_OWNERS = new Set(['botharness']);

export interface MarketplaceSkillFile {
  path: string;
  size: number;
}

export interface MarketplaceSkill {
  id: string;
  name: string;
  description: string;
  owner: string;
  repo: string;
  fullName: string;
  path: string;
  htmlUrl: string;
  commitSha: string;
  stars: number;
  installs: number;
  scripts: string[];
  scan: Exclude<SkillScanVerdict, 'blocked'>;
  findings: SkillFinding[];
  fileCount: number;
  size: number;
  official: boolean;
  pushedAt: string;
}

export interface MarketplaceSkillDetail {
  skill: MarketplaceSkill;
  content: string;
  files: MarketplaceSkillFile[];
}

export interface SkillIndexReport {
  repositories: number;
  listed: number;
  rejected: number;
  hidden: number;
  skipped: number;
}

interface SkillRow {
  id: string;
  repo_node_id: string;
  owner: string;
  repo: string;
  path: string;
  name: string;
  description: string;
  skill_md: string;
  files: string;
  scripts: string;
  scan: SkillScanVerdict;
  findings: string;
  commit_sha: string;
  stars: number;
  pushed_at: string;
  curated: number;
  visibility: 'listed' | 'hidden_missing' | 'rejected' | 'blocked';
  installs: number;
}

const COLUMNS =
  'id, repo_node_id, owner, repo, path, name, description, skill_md, files, scripts, scan, findings, commit_sha, stars, pushed_at, curated, visibility, installs';

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function folderOf(path: string): string {
  const at = path.lastIndexOf('/');
  return at === -1 ? '' : path.slice(0, at);
}

function within(folder: string, path: string): boolean {
  return folder === '' || path.startsWith(`${folder}/`);
}

function relativeTo(folder: string, path: string): string {
  return folder === '' ? path : path.slice(folder.length + 1);
}

export async function skillId(repositoryId: string, path: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${repositoryId}\n${path}`),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 24);
}

export function toMarketplaceSkill(row: SkillRow): MarketplaceSkill {
  const files = parseJson<MarketplaceSkillFile[]>(row.files, []);
  const encodedPath = row.path.split('/').map(encodeURIComponent).join('/');
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    owner: row.owner,
    repo: row.repo,
    fullName: `${row.owner}/${row.repo}`,
    path: row.path,
    htmlUrl: `https://github.com/${row.owner}/${row.repo}/tree/${row.commit_sha}${row.path === '' ? '' : `/${encodedPath}`}`,
    commitSha: row.commit_sha,
    stars: row.stars,
    installs: row.installs,
    scripts: parseJson<string[]>(row.scripts, []),
    scan: row.scan === 'warning' ? 'warning' : 'clean',
    findings: parseJson<SkillFinding[]>(row.findings, []),
    fileCount: files.length,
    size: files.reduce((total, file) => total + file.size, 0),
    official: OFFICIAL_OWNERS.has(row.owner.toLowerCase()),
    pushedAt: row.pushed_at,
  };
}

export function createMarketSkills(deps: {
  db: D1Database;
  github: GitHubClient;
  now: () => Date;
}) {
  const { db, github } = deps;
  const stamp = () => deps.now().toISOString();

  const rowsFor = async (repositoryId: string): Promise<SkillRow[]> =>
    (
      await db
        .prepare(`SELECT ${COLUMNS} FROM marketplace_skills WHERE repo_node_id = ?`)
        .bind(repositoryId)
        .all<SkillRow>()
    ).results;

  const hideRepository = async (repositoryId: string): Promise<number> =>
    (
      await db
        .prepare(
          `UPDATE marketplace_skills SET visibility = 'hidden_missing', last_refreshed_at = ?
           WHERE repo_node_id = ? AND visibility = 'listed' RETURNING id`,
        )
        .bind(stamp(), repositoryId)
        .all<{ id: string }>()
    ).results.length;

  const indexSkill = async ({
    id,
    repository,
    locator,
    sha,
    folder,
    blobs,
    existing,
    curated,
  }: {
    id: string;
    repository: GitHubRepository;
    locator: RepositoryLocator;
    sha: string;
    folder: string;
    blobs: readonly GitHubTreeBlob[];
    existing: SkillRow | undefined;
    curated: boolean;
  }): Promise<'listed' | 'rejected' | 'skipped' | 'retry'> => {
    const files = blobs
      .filter((blob) => within(folder, blob.path))
      .map((blob) => ({ path: relativeTo(folder, blob.path), size: blob.size }))
      .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
    if (files.length > MAX_SKILL_FILES) return 'skipped';
    if (files.reduce((total, file) => total + file.size, 0) > MAX_SKILL_BYTES) return 'skipped';
    const at = (path: string) => (folder === '' ? path : `${folder}/${path}`);
    if (existing !== undefined && existing.commit_sha === sha) {
      await db
        .prepare(
          `UPDATE marketplace_skills SET owner = ?, repo = ?, stars = ?, pushed_at = ?, curated = MAX(curated, ?),
             last_refreshed_at = ?,
             visibility = CASE WHEN visibility = 'hidden_missing' AND scan != 'blocked' THEN 'listed' ELSE visibility END
           WHERE id = ?`,
        )
        .bind(
          repository.owner,
          repository.name,
          repository.stars,
          repository.pushedAt,
          curated ? 1 : 0,
          stamp(),
          id,
        )
        .run();
      return existing.scan === 'blocked' ? 'rejected' : 'listed';
    }
    const content = await github.fileAt(locator, at('SKILL.md'), sha);
    if (!content.ok) return 'retry';
    if (content.value === null || content.value.length > MAX_SKILL_MD_CHARS) return 'skipped';
    const skillMd = content.value;
    const frontmatter = parseSkillFrontmatter(skillMd);
    if (frontmatter === undefined) return 'skipped';
    const scanned: { path: string; text: string | null }[] = [{ path: 'SKILL.md', text: skillMd }];
    let budget = MAX_SCANNED_FILES;
    for (const file of files) {
      if (file.path === 'SKILL.md') continue;
      const kind = uploadFileKind(file.path);
      if (
        (kind === 'text' || kind === 'script') &&
        file.size <= MAX_SCANNED_FILE_BYTES &&
        budget > 0
      ) {
        budget -= 1;
        const read = await github.fileAt(locator, at(file.path), sha);
        if (!read.ok) return 'retry';
        scanned.push({ path: file.path, text: read.value });
      } else {
        scanned.push({ path: file.path, text: null });
      }
    }
    const scan = scanSkillFiles(scanned);
    const visibility = scan.verdict === 'blocked' ? 'rejected' : 'listed';
    const now = stamp();
    const written = await db
      .prepare(
        `INSERT INTO marketplace_skills (${COLUMNS}, first_seen_at, last_refreshed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           owner = excluded.owner, repo = excluded.repo, name = excluded.name,
           description = excluded.description, skill_md = excluded.skill_md, files = excluded.files,
           scripts = excluded.scripts, scan = excluded.scan, findings = excluded.findings,
           commit_sha = excluded.commit_sha, stars = excluded.stars, pushed_at = excluded.pushed_at,
           curated = MAX(marketplace_skills.curated, excluded.curated),
           visibility = CASE WHEN marketplace_skills.visibility = 'blocked' THEN 'blocked' ELSE excluded.visibility END,
           last_refreshed_at = excluded.last_refreshed_at
         RETURNING visibility`,
      )
      .bind(
        id,
        repository.nodeId,
        repository.owner,
        repository.name,
        folder,
        frontmatter.name,
        frontmatter.description,
        skillMd,
        JSON.stringify(files),
        JSON.stringify(scan.scripts),
        scan.verdict,
        JSON.stringify(scan.findings),
        sha,
        repository.stars,
        repository.pushedAt,
        curated ? 1 : 0,
        visibility,
        now,
        now,
      )
      .first<{ visibility: string }>();
    return written?.visibility === 'listed' ? 'listed' : 'rejected';
  };

  const indexRepository = async (
    repository: GitHubRepository,
    options: { curated: boolean },
  ): Promise<SkillIndexReport> => {
    const report: SkillIndexReport = {
      repositories: 1,
      listed: 0,
      rejected: 0,
      hidden: 0,
      skipped: 0,
    };
    const existing = await rowsFor(repository.nodeId);
    const curated = options.curated || existing.some((row) => row.curated === 1);
    if (
      repository.private ||
      repository.archived ||
      (!curated && !repository.topics.includes(SKILL_TOPIC))
    ) {
      report.hidden = await hideRepository(repository.nodeId);
      return report;
    }
    const locator = { owner: repository.owner, name: repository.name };
    const head = await github.headCommit(locator, repository.defaultBranch);
    if (!head.ok) {
      if (head.reason === 'not-found') report.hidden = await hideRepository(repository.nodeId);
      return report;
    }
    const tree = await github.tree(locator, head.value.sha);
    if (!tree.ok || tree.value.truncated) return report;
    const folders = tree.value.blobs
      .filter((blob) => blob.path === 'SKILL.md' || blob.path.endsWith('/SKILL.md'))
      .map((blob) => folderOf(blob.path))
      .filter((folder) => !folder.split('/').some((part) => part.startsWith('.git')))
      .sort()
      .slice(0, MAX_SKILLS_PER_REPOSITORY);
    const seen = new Set<string>();
    for (const folder of folders) {
      const id = await skillId(repository.nodeId, folder);
      const outcome = await indexSkill({
        id,
        repository,
        locator,
        sha: head.value.sha,
        folder,
        blobs: tree.value.blobs,
        existing: existing.find((row) => row.id === id),
        curated,
      });
      if (outcome === 'retry') {
        seen.add(id);
        report.skipped += 1;
        continue;
      }
      if (outcome === 'skipped') {
        report.skipped += 1;
        continue;
      }
      seen.add(id);
      report[outcome] += 1;
    }
    for (const row of existing) {
      if (seen.has(row.id) || row.visibility !== 'listed') continue;
      await db
        .prepare(
          `UPDATE marketplace_skills SET visibility = 'hidden_missing', last_refreshed_at = ? WHERE id = ?`,
        )
        .bind(stamp(), row.id)
        .run();
      report.hidden += 1;
    }
    return report;
  };

  const find = async (id: string): Promise<SkillRow | undefined> =>
    (await db
      .prepare(`SELECT ${COLUMNS} FROM marketplace_skills WHERE id = ?`)
      .bind(id)
      .first<SkillRow>()) ?? undefined;

  return {
    indexRepository,

    async indexUrl(
      url: string,
    ): Promise<{ ok: true; report: SkillIndexReport } | { ok: false; code: string }> {
      const locator = parseRepositoryUrl(url);
      if (locator === undefined) return { ok: false, code: 'invalid-repository-url' };
      const repository = await github.repository(locator);
      if (!repository.ok)
        return {
          ok: false,
          code: repository.reason === 'not-found' ? 'repository-not-found' : 'upstream-unavailable',
        };
      if (repository.value.private) return { ok: false, code: 'repository-private' };
      return {
        ok: true,
        report: await indexRepository(repository.value, { curated: true }),
      };
    },

    async discover(): Promise<SkillIndexReport & { complete: boolean }> {
      const report = {
        repositories: 0,
        listed: 0,
        rejected: 0,
        hidden: 0,
        skipped: 0,
        complete: false,
      };
      const found = new Map<string, GitHubRepository>();
      let complete = false;
      for (let page = 1; page <= MAX_SEARCH_PAGES; page += 1) {
        const result = await github.searchTopicPage(SKILL_TOPIC, page);
        if (!result.ok) break;
        for (const repository of result.value.repositories)
          found.set(repository.nodeId, repository);
        if (result.value.incomplete === true) break;
        if (result.value.repositories.length === 0 || found.size >= result.value.totalCount) {
          complete = true;
          break;
        }
      }
      const known = (
        await db
          .prepare(`SELECT DISTINCT repo_node_id, owner, repo, curated FROM marketplace_skills`)
          .all<{
            repo_node_id: string;
            owner: string;
            repo: string;
            curated: number;
          }>()
      ).results;
      for (const row of known) {
        if (found.has(row.repo_node_id)) continue;
        if (row.curated === 1) {
          const repository = await github.repository({
            owner: row.owner,
            name: row.repo,
          });
          if (repository.ok) found.set(repository.value.nodeId, repository.value);
          else if (repository.reason === 'not-found')
            report.hidden += await hideRepository(row.repo_node_id);
        } else if (complete) {
          report.hidden += await hideRepository(row.repo_node_id);
        }
      }
      for (const repository of found.values()) {
        const one = await indexRepository(repository, { curated: false }).catch(() => undefined);
        report.repositories += 1;
        if (one === undefined) {
          report.skipped += 1;
          continue;
        }
        report.listed += one.listed;
        report.rejected += one.rejected;
        report.hidden += one.hidden;
        report.skipped += one.skipped;
      }
      report.complete = complete;
      return report;
    },

    async list(query: {
      q?: string;
      cursor?: string;
      limit?: number;
    }): Promise<{ skills: MarketplaceSkill[]; nextCursor: string | null }> {
      const offset = query.cursor === undefined ? 0 : Number(query.cursor);
      const limit = Math.min(Math.max(query.limit ?? SKILL_PAGE_SIZE, 1), 50);
      const q = query.q?.trim();
      const filter =
        q === undefined || q.length === 0
          ? ''
          : `AND (instr(lower(name), ?1) > 0 OR instr(lower(description), ?1) > 0 OR instr(lower(owner || '/' || repo), ?1) > 0)`;
      const statement = db.prepare(
        `SELECT ${COLUMNS} FROM marketplace_skills WHERE visibility = 'listed' ${filter}
         ORDER BY installs DESC, stars DESC, name ASC, id ASC LIMIT ${limit + 1} OFFSET ${offset}`,
      );
      const rows = (
        await (filter === '' ? statement : statement.bind((q ?? '').toLowerCase())).all<SkillRow>()
      ).results;
      return {
        skills: rows.slice(0, limit).map(toMarketplaceSkill),
        nextCursor: rows.length > limit ? String(offset + limit) : null,
      };
    },

    async detail(id: string): Promise<MarketplaceSkillDetail | undefined> {
      const row = await find(id);
      if (row === undefined || row.visibility !== 'listed') return undefined;
      return {
        skill: toMarketplaceSkill(row),
        content: row.skill_md,
        files: parseJson<MarketplaceSkillFile[]>(row.files, []),
      };
    },

    async receipt(
      id: string,
      targetHash: string,
    ): Promise<{ counted: boolean; installs: number } | undefined> {
      const result = await recordSkillInstall(deps, id, targetHash);
      return result.ok ? { counted: result.counted, installs: result.installs } : undefined;
    },

    async setBlocked(
      id: string,
      blocked: boolean,
    ): Promise<{ id: string; name: string; visibility: string } | undefined> {
      const row = await db
        .prepare(
          `UPDATE marketplace_skills
           SET visibility = CASE WHEN ?1 = 1 THEN 'blocked' WHEN scan = 'blocked' THEN 'rejected' ELSE 'hidden_missing' END
           WHERE id = ?2 RETURNING name, visibility`,
        )
        .bind(blocked ? 1 : 0, id)
        .first<{ name: string; visibility: string }>();
      return row === null ? undefined : { id, name: row.name, visibility: row.visibility };
    },
  };
}

export type MarketSkills = ReturnType<typeof createMarketSkills>;
