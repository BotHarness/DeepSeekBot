import {
  BOT_DESCRIPTOR_PATH,
  MAX_DESCRIPTOR_BYTES,
  parseBotDescriptor,
} from '../../core/src/marketplace/descriptor.js';
import type { D1Database } from './d1.js';
import type { R2Bucket } from './r2.js';
import { MAX_README_LENGTH } from './repositories.js';
import {
  contentMatchesKind,
  imageContentType,
  isUploadPath,
  MAX_BOTS_PER_ACCOUNT,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_FILE_BYTES,
  MAX_UPLOAD_FILES,
  sha256Hex,
  uploadFileKind,
  type UploadFileKind,
} from './upload-files.js';

export const MAX_AUTHOR_NAME_LENGTH = 40;
export const PENDING_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

const AUTHOR_ID_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
const AUTHOR_ID_LENGTH = 6;
const SHA256 = /^[a-f0-9]{64}$/u;

export interface Author {
  id: string;
  name: string;
  termsAcceptedAt: string;
}

export interface UploadedFile {
  path: string;
  size: number;
  kind: UploadFileKind;
}

export type UploadRefusal =
  | 'author-required'
  | 'terms-required'
  | 'invalid-author-name'
  | 'invalid-upload'
  | 'invalid-path'
  | 'duplicate-path'
  | 'file-type-refused'
  | 'file-too-large'
  | 'too-many-files'
  | 'too-large'
  | 'bot-limit'
  | 'upload-not-found'
  | 'file-not-in-upload'
  | 'file-mismatch'
  | 'files-missing';

export const UPLOAD_REFUSAL_STATUS: Record<UploadRefusal, number> = {
  'author-required': 409,
  'terms-required': 400,
  'invalid-author-name': 400,
  'invalid-upload': 400,
  'invalid-path': 400,
  'duplicate-path': 400,
  'file-type-refused': 415,
  'file-too-large': 413,
  'too-many-files': 413,
  'too-large': 413,
  'bot-limit': 409,
  'upload-not-found': 404,
  'file-not-in-upload': 404,
  'file-mismatch': 422,
  'files-missing': 409,
};

export type UploadResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: UploadRefusal; path?: string };

interface AuthorRow {
  account: string;
  author_id: string;
  display_name: string;
  terms_accepted_at: string;
}

interface UploadRow {
  upload_id: string;
  account: string;
  bot_id: string;
  presentation: string;
  created_at: string;
}

interface Presentation {
  displayName: string;
  bio: string | null;
  tags: string[];
}

function random(alphabet: string, length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
}

function authorFromRow(row: AuthorRow): Author {
  return { id: row.author_id, name: row.display_name, termsAcceptedAt: row.terms_accepted_at };
}

function refuse<T>(code: UploadRefusal, path?: string): UploadResult<T> {
  return path === undefined ? { ok: false, code } : { ok: false, code, path };
}

export function fileKey(botId: string, path: string): string {
  return `bots/${botId}/${path}`;
}

function parsePresentation(input: Record<string, unknown>): Presentation | undefined {
  const descriptor = parseBotDescriptor(
    JSON.stringify({ name: input['displayName'], bio: input['bio'], tags: input['tags'] }),
  );
  if (descriptor?.name === undefined) return undefined;
  if (input['bio'] !== undefined && input['bio'] !== null && descriptor.bio === undefined)
    return undefined;
  if (input['tags'] !== undefined && descriptor.tags === undefined) return undefined;
  return {
    displayName: descriptor.name,
    bio: descriptor.bio ?? null,
    tags: descriptor.tags ?? [],
  };
}

export interface Uploads {
  author(account: string): Promise<Author | null>;
  saveAuthor(
    account: string,
    input: { displayName: unknown; acceptTerms: unknown },
  ): Promise<UploadResult<Author>>;
  begin(
    account: string,
    input: Record<string, unknown>,
  ): Promise<UploadResult<{ id: string; botId: string }>>;
  putFile(
    account: string,
    uploadId: string,
    path: string,
    bytes: Uint8Array<ArrayBuffer>,
  ): Promise<UploadResult<{ path: string }>>;
  publish(account: string, uploadId: string, origin: string): Promise<UploadResult<string>>;
  files(botId: string): Promise<UploadedFile[]>;
  readFile(
    botId: string,
    path: string,
  ): Promise<{ bytes: ArrayBuffer; contentType: string } | undefined>;
}

export function createUploads(deps: {
  db: D1Database;
  bucket: R2Bucket;
  now: () => Date;
}): Uploads {
  const { db, bucket } = deps;

  const author = async (account: string) => {
    const row = await db
      .prepare('SELECT * FROM authors WHERE account = ?')
      .bind(account)
      .first<AuthorRow>();
    return row === null ? null : authorFromRow(row);
  };

  const upload = (account: string, uploadId: string) =>
    db
      .prepare('SELECT * FROM uploads WHERE upload_id = ? AND account = ?')
      .bind(uploadId, account)
      .first<UploadRow>();

  const discardBotFiles = async (botId: string) => {
    const { results } = await db
      .prepare('SELECT path FROM uploaded_files WHERE bot_id = ? AND stored = 1')
      .bind(botId)
      .all<{ path: string }>();
    for (let start = 0; start < results.length; start += 1000) {
      await bucket.delete(
        results.slice(start, start + 1000).map((row) => fileKey(botId, row.path)),
      );
    }
    await db.prepare('DELETE FROM uploaded_files WHERE bot_id = ?').bind(botId).run();
  };

  const discardStale = async (account: string) => {
    const cutoff = new Date(deps.now().getTime() - PENDING_UPLOAD_TTL_MS).toISOString();
    const { results } = await db
      .prepare('SELECT bot_id FROM uploads WHERE account = ? AND created_at < ?')
      .bind(account, cutoff)
      .all<{ bot_id: string }>();
    for (const row of results) {
      await discardBotFiles(row.bot_id);
      await db.prepare('DELETE FROM uploads WHERE bot_id = ?').bind(row.bot_id).run();
    }
  };

  const readText = async (botId: string, path: string, maxBytes: number) => {
    const object = await bucket.get(fileKey(botId, path));
    if (object === null || object.size > maxBytes) return undefined;
    return new TextDecoder().decode(await object.arrayBuffer());
  };

  return {
    author,

    async saveAuthor(account, input) {
      const name = typeof input.displayName === 'string' ? input.displayName.trim() : '';
      if (name.length === 0 || [...name].length > MAX_AUTHOR_NAME_LENGTH || /[\p{Cc}]/u.test(name))
        return refuse('invalid-author-name');
      const existing = await author(account);
      const now = deps.now().toISOString();
      if (existing === null) {
        if (input.acceptTerms !== true) return refuse('terms-required');
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const id = random(AUTHOR_ID_ALPHABET, AUTHOR_ID_LENGTH);
          const taken = await db
            .prepare('SELECT 1 AS taken FROM authors WHERE author_id = ?')
            .bind(id)
            .first();
          if (taken !== null) continue;
          await db
            .prepare(
              `INSERT INTO authors (account, author_id, display_name, terms_accepted_at, created_at)
               VALUES (?, ?, ?, ?, ?) ON CONFLICT (account) DO NOTHING`,
            )
            .bind(account, id, name, now, now)
            .run();
          return { ok: true, value: (await author(account))! };
        }
        throw new Error('author id space exhausted');
      }
      await db
        .prepare('UPDATE authors SET display_name = ? WHERE account = ?')
        .bind(name, account)
        .run();
      await db
        .prepare(
          "UPDATE indexed_repositories SET owner = ? WHERE author_account = ? AND source = 'upload'",
        )
        .bind(name, account)
        .run();
      return { ok: true, value: { ...existing, name } };
    },

    async begin(account, input) {
      if ((await author(account)) === null) return refuse('author-required');
      const presentation = parsePresentation(input);
      const files = input['files'];
      if (presentation === undefined || !Array.isArray(files) || files.length === 0)
        return refuse('invalid-upload');
      if (files.length > MAX_UPLOAD_FILES) return refuse('too-many-files');
      const manifest: Array<{ path: string; size: number; sha256: string; kind: UploadFileKind }> =
        [];
      const seen = new Set<string>();
      let total = 0;
      for (const file of files as unknown[]) {
        const entry =
          typeof file === 'object' && file !== null ? (file as Record<string, unknown>) : {};
        const { path, size, sha256 } = entry;
        if (typeof path !== 'string' || !isUploadPath(path))
          return refuse('invalid-path', typeof path === 'string' ? path : undefined);
        if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0)
          return refuse('invalid-upload', path);
        if (typeof sha256 !== 'string' || !SHA256.test(sha256))
          return refuse('invalid-upload', path);
        if (seen.has(path)) return refuse('duplicate-path', path);
        seen.add(path);
        const kind = uploadFileKind(path);
        if (kind === undefined) return refuse('file-type-refused', path);
        if (size > MAX_UPLOAD_FILE_BYTES) return refuse('file-too-large', path);
        total += size;
        if (total > MAX_UPLOAD_BYTES) return refuse('too-large');
        manifest.push({ path, size, sha256, kind });
      }
      await discardStale(account);
      const counted = await db
        .prepare(
          `SELECT (SELECT count(*) FROM indexed_repositories WHERE author_account = ? AND source = 'upload')
                + (SELECT count(*) FROM uploads WHERE account = ?) AS total`,
        )
        .bind(account, account)
        .first<{ total: number }>();
      if ((counted?.total ?? 0) >= MAX_BOTS_PER_ACCOUNT) return refuse('bot-limit');
      const botId = `U_${random(AUTHOR_ID_ALPHABET, 20)}`;
      const id = random('0123456789abcdef', 32);
      await db
        .prepare(
          `INSERT INTO uploaded_files (bot_id, path, size, sha256, kind)
           SELECT ?, json_extract(value, '$.path'), json_extract(value, '$.size'),
                  json_extract(value, '$.sha256'), json_extract(value, '$.kind')
           FROM json_each(?)`,
        )
        .bind(botId, JSON.stringify(manifest))
        .run();
      await db
        .prepare(
          'INSERT INTO uploads (upload_id, account, bot_id, presentation, created_at) VALUES (?, ?, ?, ?, ?)',
        )
        .bind(id, account, botId, JSON.stringify(presentation), deps.now().toISOString())
        .run();
      return { ok: true, value: { id, botId } };
    },

    async putFile(account, uploadId, path, bytes) {
      const pending = await upload(account, uploadId);
      if (pending === null) return refuse('upload-not-found');
      const expected = await db
        .prepare('SELECT size, sha256 FROM uploaded_files WHERE bot_id = ? AND path = ?')
        .bind(pending.bot_id, path)
        .first<{ size: number; sha256: string }>();
      if (expected === null) return refuse('file-not-in-upload', path);
      if (
        bytes.byteLength !== expected.size ||
        (await sha256Hex(bytes)) !== expected.sha256 ||
        !contentMatchesKind(path, bytes)
      )
        return refuse('file-mismatch', path);
      await bucket.put(fileKey(pending.bot_id, path), bytes);
      await db
        .prepare('UPDATE uploaded_files SET stored = 1 WHERE bot_id = ? AND path = ?')
        .bind(pending.bot_id, path)
        .run();
      return { ok: true, value: { path } };
    },

    async publish(account, uploadId, origin) {
      const pending = await upload(account, uploadId);
      if (pending === null) return refuse('upload-not-found');
      const owner = await author(account);
      if (owner === null) return refuse('author-required');
      const missing = await db
        .prepare('SELECT path FROM uploaded_files WHERE bot_id = ? AND stored = 0 LIMIT 1')
        .bind(pending.bot_id)
        .first<{ path: string }>();
      if (missing !== null) return refuse('files-missing', missing.path);
      const presentation = JSON.parse(pending.presentation) as Presentation;
      const botId = pending.bot_id;
      const names = new Set(
        (
          await db
            .prepare('SELECT path FROM uploaded_files WHERE bot_id = ?')
            .bind(botId)
            .all<{ path: string }>()
        ).results.map((row) => row.path),
      );
      const descriptorText = names.has(BOT_DESCRIPTOR_PATH)
        ? await readText(botId, BOT_DESCRIPTOR_PATH, MAX_DESCRIPTOR_BYTES)
        : undefined;
      const descriptor =
        descriptorText === undefined ? undefined : parseBotDescriptor(descriptorText);
      const base = `${origin}/v1/bots/${botId}/files`;
      const banner = descriptor?.banner;
      const storedBanner =
        banner === undefined
          ? null
          : 'recipe' in banner
            ? { recipe: banner.recipe }
            : names.has(banner.image) && imageContentType(banner.image) !== undefined
              ? { image: `${base}/${banner.image.split('/').map(encodeURIComponent).join('/')}` }
              : null;
      const readmePath = [...names].find((name) => /^readme\.md$/iu.test(name));
      const readme =
        readmePath === undefined
          ? null
          : ((await readText(botId, readmePath, MAX_UPLOAD_FILE_BYTES))?.slice(
              0,
              MAX_README_LENGTH,
            ) ?? null);
      const now = deps.now().toISOString();
      await db
        .prepare(
          `INSERT INTO indexed_repositories (
            node_id, owner, name, html_url, clone_url, description, topics, stars, pushed_at,
            default_branch, head_sha, head_committed_at, visibility, first_seen_at, last_refreshed_at,
            created_at, readme, readme_pushed_at, display_name, roles, bio, banner, source,
            author_account, author_id
          ) VALUES (?, ?, ?, ?, '', ?, '[]', 0, ?, 'main', NULL, NULL, 'listed', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'upload', ?, ?)`,
        )
        .bind(
          botId,
          owner.name,
          presentation.displayName,
          `${origin}/v1/bots/${botId}`,
          presentation.bio,
          now,
          now,
          now,
          now,
          readme,
          now,
          presentation.displayName,
          JSON.stringify(presentation.tags),
          presentation.bio,
          storedBanner === null ? null : JSON.stringify(storedBanner),
          account,
          owner.id,
        )
        .run();
      await db.prepare('DELETE FROM uploads WHERE upload_id = ?').bind(uploadId).run();
      return { ok: true, value: botId };
    },

    async files(botId) {
      const { results } = await db
        .prepare(
          'SELECT path, size, kind FROM uploaded_files WHERE bot_id = ? AND stored = 1 ORDER BY path',
        )
        .bind(botId)
        .all<UploadedFile>();
      return results;
    },

    async readFile(botId, path) {
      const listed = await db
        .prepare(
          `SELECT f.kind AS kind FROM uploaded_files f
           JOIN indexed_repositories r ON r.node_id = f.bot_id
           WHERE f.bot_id = ? AND f.path = ? AND f.stored = 1
             AND r.source = 'upload' AND r.visibility = 'listed'`,
        )
        .bind(botId, path)
        .first<{ kind: UploadFileKind }>();
      if (listed === null) return undefined;
      const object = await bucket.get(fileKey(botId, path));
      if (object === null) return undefined;
      return {
        bytes: await object.arrayBuffer(),
        contentType:
          listed.kind === 'image'
            ? (imageContentType(path) ?? 'application/octet-stream')
            : 'text/plain; charset=utf-8',
      };
    },
  };
}
