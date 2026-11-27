import { MARKETPLACE_SKILL_REVISION } from '../../host-protocol/src/marketplace-skill.js';
import type { D1Database } from './d1.js';
import type { R2Bucket } from './r2.js';
import {
  MAX_SKILL_BYTES,
  MAX_SKILL_FILES,
  MAX_SKILL_MD_CHARS,
  parseSkillFrontmatter,
  scanSkillUpload,
} from './skill-scan.js';
import {
  contentMatchesKind,
  isUploadPath,
  MAX_BOTS_PER_ACCOUNT,
  MAX_UPLOAD_PATH_LENGTH,
} from './upload-files.js';
import { skillId } from './skills.js';

export const SKILL_MINE_PATH = '/v1/me/skills';
export const SKILL_MINE_ROUTE = /^\/v1\/me\/skills\/([0-9a-f]{24})$/u;
export const SKILL_FILES_ROUTE = /^\/v1\/skills\/([0-9a-f]{24})\/files\/([0-9a-f]{32})$/u;
export const MAX_SKILL_PUBLISH_BODY =
  Math.ceil(MAX_SKILL_BYTES / 3) * 4 + MAX_SKILL_FILES * (MAX_UPLOAD_PATH_LENGTH * 6 + 32) + 1024;

const key = (id: string, revision: string) => `skills/${id}/${revision}.json`;
const revisionId = () => crypto.randomUUID().replaceAll('-', '');
const decoder = new TextDecoder();

type UploadRefusal =
  | 'invalid-skill-upload'
  | 'invalid-skill-md'
  | 'skill-too-large'
  | 'skill-secret-detected'
  | 'skill-malicious-content'
  | 'skill-not-found'
  | 'skill-upload-limit'
  | 'skill-upload-changed'
  | 'author-required'
  | 'author-changed';

const refuse = (code: UploadRefusal) => ({ ok: false, code }) as const;
const accepted = (id: string) => ({ ok: true, id }) as const;

export async function removeUploadedSkill(
  db: D1Database,
  bucket: R2Bucket,
  account: string,
  id: string,
): Promise<boolean> {
  const row = await db
    .prepare(`UPDATE marketplace_skills SET visibility = 'hidden_missing', upload_deleted = 1
      WHERE id = ? AND upload_account = ? RETURNING upload_revision, upload_retired_revision`)
    .bind(id, account)
    .first<{ upload_revision: string; upload_retired_revision: string | null }>();
  if (row === null) return false;
  await bucket.delete([
    key(id, row.upload_revision),
    ...(row.upload_retired_revision === null ? [] : [key(id, row.upload_retired_revision)]),
  ]);
  await db
    .prepare(
      'DELETE FROM marketplace_skills WHERE id = ? AND upload_account = ? AND upload_deleted = 1',
    )
    .bind(id, account)
    .run();
  return true;
}

function prepare(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return refuse('invalid-skill-upload');
  if (value.length > MAX_SKILL_FILES) return refuse('skill-too-large');

  const files: { path: string; data: string; size: number; text: string }[] = [];
  const paths = new Set<string>();
  let unsupported = false;
  let size = 0;
  for (const file of value) {
    if (typeof file !== 'object' || file === null || Array.isArray(file))
      return refuse('invalid-skill-upload');
    const { path, data } = Object.fromEntries(Object.entries(file));
    if (
      typeof path !== 'string' ||
      !isUploadPath(path) ||
      path
        .split('/')
        .some((part) =>
          /^\.git|[<>:"|?*]|[. ]$|^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(
            part,
          ),
        ) ||
      paths.has(path.toLowerCase()) ||
      typeof data !== 'string'
    )
      return refuse('invalid-skill-upload');

    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
    } catch {
      return refuse('invalid-skill-upload');
    }
    size += bytes.byteLength;
    if (size > MAX_SKILL_BYTES) return refuse('skill-too-large');
    if (!contentMatchesKind(path, bytes)) unsupported = true;
    paths.add(path.toLowerCase());
    files.push({ path, data, size: bytes.byteLength, text: decoder.decode(bytes) });
  }

  for (const path of paths) {
    const parts = path.split('/');
    for (let length = 1; length < parts.length; length += 1) {
      if (paths.has(parts.slice(0, length).join('/'))) return refuse('invalid-skill-upload');
    }
  }

  const result = scanSkillUpload(files);
  if (result.kind === 'refused') return refuse(result.code);
  const { scan } = result;
  if (unsupported) return refuse('invalid-skill-upload');
  const content = files.find((file) => file.path === 'SKILL.md')?.text;
  const frontmatter =
    content === undefined || content.length > MAX_SKILL_MD_CHARS
      ? undefined
      : parseSkillFrontmatter(content);
  if (content === undefined || frontmatter === undefined) return refuse('invalid-skill-md');

  return {
    ok: true,
    columns: [
      frontmatter.name,
      frontmatter.description,
      content,
      JSON.stringify(files.map(({ path, size }) => ({ path, size }))),
      JSON.stringify(scan.scripts),
      scan.verdict,
      JSON.stringify(scan.findings),
    ],
    bundle: new TextEncoder().encode(
      JSON.stringify(files.map(({ path, data }) => ({ path, data }))),
    ),
  } as const;
}

export function createSkillUploads(db: D1Database, bucket: R2Bucket, now: () => Date) {
  const find = (account: string, id: string) =>
    db
      .prepare(`SELECT upload_revision, upload_retired_revision, upload_deleted
        FROM marketplace_skills WHERE upload_account = ? AND id = ?`)
      .bind(account, id)
      .first<{
        upload_revision: string;
        upload_retired_revision: string | null;
        upload_deleted: number;
      }>();

  const discardRetired = async (account: string, id: string, revision: string) => {
    await bucket.delete(key(id, revision));
    await db
      .prepare(`UPDATE marketplace_skills SET upload_retired_revision = NULL
        WHERE upload_account = ? AND id = ? AND upload_retired_revision = ?`)
      .bind(account, id, revision)
      .run();
  };

  return {
    async write(account: string, input: Record<string, unknown>, replacing?: string) {
      const { requestKey, expectedAuthorId } = input;
      if (
        (expectedAuthorId !== undefined && typeof expectedAuthorId !== 'string') ||
        (replacing === undefined &&
          (typeof requestKey !== 'string' || !MARKETPLACE_SKILL_REVISION.test(requestKey)))
      )
        return refuse('invalid-skill-upload');

      const author = await db
        .prepare('SELECT author_id, terms_accepted_at FROM authors WHERE account = ?')
        .bind(account)
        .first<{ author_id: string; terms_accepted_at: string | null }>();
      if (author?.terms_accepted_at == null) return refuse('author-required');
      if (expectedAuthorId !== undefined && expectedAuthorId !== author.author_id)
        return refuse('author-changed');

      const id = replacing ?? (await skillId(`upload:${account}`, String(requestKey)));
      const previous = await find(account, id);
      if (previous?.upload_deleted === 1) return refuse('skill-not-found');
      if (replacing === undefined && previous !== null) return accepted(id);
      if (replacing !== undefined && previous === null) return refuse('skill-not-found');
      const upload = prepare(input['files']);
      if (!upload.ok) return upload;
      if (previous?.upload_retired_revision != null)
        await discardRetired(account, id, previous.upload_retired_revision);

      const revision = revisionId();
      const nextKey = key(id, revision);
      const timestamp = now().toISOString();
      await bucket.put(nextKey, upload.bundle);
      let row: { id: string } | null;
      try {
        row =
          previous === null
            ? await db
                .prepare(`
            INSERT INTO marketplace_skills (
              id, repo_node_id, owner, repo, path, name, description, skill_md, files, scripts,
              scan, findings, commit_sha, visibility, pushed_at, first_seen_at, last_refreshed_at,
              upload_account, upload_revision
            )
            SELECT ?, ?, '', '', '', ?, ?, ?, ?, ?, ?, ?, '', 'listed', ?, ?, ?, account, ?
              FROM authors WHERE account = ? AND author_id = ? AND terms_accepted_at IS NOT NULL
              AND (SELECT COUNT(*) FROM marketplace_skills WHERE upload_account = ?) < ?
            ON CONFLICT (id) DO NOTHING RETURNING id`)
                .bind(
                  id,
                  `upload:${id}`,
                  ...upload.columns,
                  timestamp,
                  timestamp,
                  timestamp,
                  revision,
                  account,
                  author.author_id,
                  account,
                  MAX_BOTS_PER_ACCOUNT,
                )
                .first<{ id: string }>()
            : await db
                .prepare(`
            UPDATE marketplace_skills
               SET name = ?, description = ?, skill_md = ?, files = ?, scripts = ?,
                   scan = ?, findings = ?, pushed_at = ?, last_refreshed_at = ?,
                   upload_retired_revision = upload_revision, upload_revision = ?
             WHERE id = ? AND upload_account = ? AND upload_revision = ? AND upload_deleted = 0
               AND upload_retired_revision IS NULL
               AND EXISTS (SELECT 1 FROM authors WHERE account = ? AND author_id = ? AND terms_accepted_at IS NOT NULL)
            RETURNING id`)
                .bind(
                  ...upload.columns,
                  timestamp,
                  timestamp,
                  revision,
                  id,
                  account,
                  previous.upload_revision,
                  account,
                  author.author_id,
                )
                .first<{ id: string }>();
      } catch (error) {
        if ((await find(account, id))?.upload_revision !== revision) await bucket.delete(nextKey);
        throw error;
      }
      if (row === null) {
        await bucket.delete(nextKey);
        if (previous !== null) return refuse('skill-upload-changed');
        return (await find(account, id)) === null ? refuse('skill-upload-limit') : accepted(id);
      }
      if (previous !== null)
        await discardRetired(account, id, previous.upload_revision).catch(() => undefined);
      return accepted(id);
    },

    remove: (account: string, id: string) => removeUploadedSkill(db, bucket, account, id),

    async files(id: string, revision: string): Promise<ArrayBuffer | undefined> {
      const row = await db
        .prepare(
          "SELECT id FROM marketplace_skills WHERE id = ? AND upload_revision = ? AND visibility = 'listed'",
        )
        .bind(id, revision)
        .first();
      if (row === null) return;
      return (await bucket.get(key(id, revision)))?.arrayBuffer();
    },
  };
}
