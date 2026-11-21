import {
  MAX_MARKETPLACE_AVATAR_BYTES,
  parseMarketplaceAvatarPublish,
  type MarketplaceAvatar,
  type MarketplaceAvatarPage,
} from '../../host-protocol/src/marketplace-avatar.js';
import { readMarketplaceAvatarImage } from '../../host-protocol/src/marketplace-avatar-image.js';
import type { D1Database } from './d1.js';
import type { R2Bucket } from './r2.js';
import { MAX_BOTS_PER_ACCOUNT } from './upload-files.js';

const PAGE_SIZE = 24;
const MAX_PUBLISH_BODY = Math.ceil(MAX_MARKETPLACE_AVATAR_BYTES / 3) * 4 + 4096;
export const AVATAR_ROUTE = /^\/v1\/avatars(?:\/([0-9a-f-]{36})(\/image)?)?$/u;
const CURSOR = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z)\/([0-9a-f-]{36})$/u;

interface AvatarRow {
  id: string;
  name: string;
  description: string;
  tags: string;
  author_id: string;
  display_name: string;
  created_at: string;
  content_type: string;
}

const selected = `SELECT a.*, authors.author_id, authors.display_name
  FROM marketplace_avatars a JOIN authors USING (account)`;
const objectKey = (id: string) => `avatars/${id}`;

function avatarFromRow(row: AvatarRow, origin: string): MarketplaceAvatar {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    tags: JSON.parse(row.tags),
    author: { id: row.author_id, name: row.display_name },
    imageUrl: `${origin}/v1/avatars/${row.id}/image`,
    applyCount: 0,
  };
}

export async function readAvatarPublishBody(request: Request) {
  if (request.body === null) return { kind: 'invalid' as const };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > MAX_PUBLISH_BODY) {
        await reader.cancel().catch(() => undefined);
        return { kind: 'oversize' as const };
      }
      chunks.push(chunk.value);
    }
    const decoder = new TextDecoder();
    const body: unknown = JSON.parse(
      chunks.map((chunk) => decoder.decode(chunk, { stream: true })).join('') + decoder.decode(),
    );
    if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
      return { kind: 'body' as const, body: Object.fromEntries(Object.entries(body)) };
    }
  } catch {
    return { kind: 'invalid' as const };
  } finally {
    reader.releaseLock();
  }
  return { kind: 'invalid' as const };
}

export function createMarketAvatars({
  db,
  bucket,
  now,
}: {
  db: D1Database;
  bucket: R2Bucket;
  now: () => Date;
}) {
  const byRequest = (account: string, key: string) =>
    db
      .prepare(`${selected} WHERE a.account = ? AND a.request_key = ?`)
      .bind(account, key)
      .first<AvatarRow>();
  const listed = (id: string) =>
    db
      .prepare(`${selected} WHERE a.id = ? AND a.visibility = 'listed'`)
      .bind(id)
      .first<AvatarRow>();

  return {
    async list(cursor: string | null, origin: string): Promise<MarketplaceAvatarPage | undefined> {
      const bounds = cursor === null ? null : CURSOR.exec(cursor);
      if (cursor !== null && bounds === null) return;
      const order = 'ORDER BY a.created_at DESC, a.id DESC LIMIT ?';
      const query =
        bounds === null
          ? db.prepare(`${selected} WHERE a.visibility = 'listed' ${order}`).bind(PAGE_SIZE + 1)
          : db
              .prepare(
                `${selected} WHERE a.visibility = 'listed' AND (a.created_at, a.id) < (?, ?) ${order}`,
              )
              .bind(bounds[1]!, bounds[2]!, PAGE_SIZE + 1);
      const { results } = await query.all<AvatarRow>();
      const page = results.slice(0, PAGE_SIZE);
      const last = page.at(-1);
      return {
        avatars: page.map((row) => avatarFromRow(row, origin)),
        nextCursor:
          results.length > PAGE_SIZE && last !== undefined ? `${last.created_at}/${last.id}` : null,
      };
    },

    async detail(id: string, origin: string) {
      const row = await listed(id);
      return row === null ? undefined : avatarFromRow(row, origin);
    },

    async image(id: string) {
      const row = await listed(id);
      if (row === null) return;
      const image = await bucket.get(objectKey(id));
      if (image === null) return;
      return { bytes: await image.arrayBuffer(), contentType: row.content_type };
    },

    async publish(account: string, input: Record<string, unknown>, origin: string) {
      const publish = parseMarketplaceAvatarPublish(input);
      if (publish === undefined) return { code: 'invalid-avatar-publish' as const };
      const existing = await byRequest(account, publish.requestKey);
      if (existing !== null) {
        if (
          publish.expectedAuthorId !== undefined &&
          publish.expectedAuthorId !== existing.author_id
        )
          return { code: 'author-changed' as const };
        return { avatar: avatarFromRow(existing, origin), created: false };
      }

      const image = readMarketplaceAvatarImage(publish.image);
      if (image === undefined) return { code: 'unprocessed-image' as const };
      const author = await db
        .prepare('SELECT author_id, terms_accepted_at FROM authors WHERE account = ?')
        .bind(account)
        .first<{ author_id: string; terms_accepted_at: string | null }>();
      if (publish.expectedAuthorId !== undefined && publish.expectedAuthorId !== author?.author_id)
        return { code: 'author-changed' as const };
      if (author?.terms_accepted_at == null) return { code: 'author-required' as const };

      const id = crypto.randomUUID();
      const key = objectKey(id);
      const timestamp = now().toISOString();
      await bucket.put(key, image.bytes);
      let row: AvatarRow | null;
      try {
        await db
          .prepare(`
          INSERT INTO marketplace_avatars (id, account, request_key, name, description, tags, content_type, created_at, updated_at)
          SELECT ?, account, ?, ?, ?, ?, ?, ?, ? FROM authors
          WHERE account = ? AND author_id = ? AND terms_accepted_at IS NOT NULL
            AND (SELECT COUNT(*) FROM marketplace_avatars WHERE account = ?) < ?
          ON CONFLICT (account, request_key) DO NOTHING
        `)
          .bind(
            id,
            publish.requestKey,
            publish.name,
            publish.description,
            JSON.stringify(publish.tags),
            image.contentType,
            timestamp,
            timestamp,
            account,
            author.author_id,
            account,
            MAX_BOTS_PER_ACCOUNT,
          )
          .run();
        row = await byRequest(account, publish.requestKey);
      } catch (error) {
        const committed = await byRequest(account, publish.requestKey);
        if (committed?.id !== id) await bucket.delete(key);
        throw error;
      }
      if (row?.id !== id) await bucket.delete(key);
      if (row === null) return { code: 'avatar-limit' as const };
      return { avatar: avatarFromRow(row, origin), created: row.id === id };
    },
  };
}
