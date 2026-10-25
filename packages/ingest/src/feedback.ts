import { feedbackRatingSchema } from '../../core/src/diagnostics/feedback-contract.js';
import { feedbackView } from './feedback-view.js';

const MAX_BYTES = 16 * 1024 * 1024;
const RETENTION_MS = 30 * 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };

export interface FeedbackBucket {
  get(key: string): Promise<{
    customMetadata: Record<string, string>;
    arrayBuffer(): Promise<ArrayBuffer>;
  } | null>;
  put(
    key: string,
    data: ArrayBuffer,
    options: {
      onlyIf?: { etagDoesNotMatch: string };
      customMetadata: Record<string, string>;
    },
  ): Promise<object | null>;
  delete(key: string): Promise<void>;
  list(options: { prefix: string; cursor?: string; limit: number }): Promise<{
    objects: Array<{ key: string }>;
    truncated: boolean;
    cursor?: string;
  }>;
}

interface FeedbackServiceOptions {
  bucket: FeedbackBucket;
  adminToken: string;
  now?: () => number;
  log?: (event: {
    phase: 'index-failed';
    reportId: string;
    durationMs: number;
    reason: 'index-unavailable';
  }) => void;
  index?: (event: {
    reportId: string;
    rating: string;
    tags: string[];
    version: string;
    bytes: number;
  }) => Promise<void>;
}

async function digest(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, '0')).join('');
}

async function limitedBody(request: Request): Promise<ArrayBuffer> {
  const chunks: Uint8Array[] = [];
  const reader = request.body?.getReader();
  let size = 0;
  if (reader) {
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > MAX_BYTES) {
          await reader.cancel();
          throw new Error('too-large');
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

export function createFeedbackService(options: FeedbackServiceOptions) {
  const now = options.now ?? Date.now;
  const error = (code: string, status: number) =>
    Response.json({ error: { code } }, { status, headers });
  const receipt = (reportId: string, expires: string, status = 200) =>
    Response.json({ reportId, expiresAt: expires }, { status, headers });
  const erase = async (key: string) => {
    await options.bucket.put(key, new ArrayBuffer(0), { customMetadata: { deleted: 'true' } });
  };
  const authorized = async (request: Request) => {
    if (options.adminToken.length < 32) return false;
    const supplied = request.headers.get('authorization') ?? '';
    return (
      (await digest(new TextEncoder().encode(supplied))) ===
      (await digest(new TextEncoder().encode(`Bearer ${options.adminToken}`)))
    );
  };
  return {
    async fetch(request: Request): Promise<Response> {
      const parts = new URL(request.url).pathname.split('/');
      const reportId = parts[2] ?? '';
      if (parts[1] !== 'feedback' || !UUID.test(reportId) || parts.length > 4)
        return error('not-found', 404);
      const key = `reports/${reportId}`;
      if (request.method === 'GET' && parts[3] === 'view') return feedbackView(reportId);
      try {
        if (request.method === 'POST' && parts.length === 3) {
          const body = await limitedBody(request);
          const mime = request.headers.get('content-type') ?? '';
          const form = await new Response(body, { headers: { 'content-type': mime } }).formData();
          const raw = form.get('metadata');
          const archive = form.get('archive');
          if (
            typeof raw !== 'string' ||
            raw.length > 8192 ||
            !(archive instanceof Blob) ||
            archive.size === 0
          )
            return error('invalid-input', 400);
          const metadata: unknown = JSON.parse(raw);
          if (
            !metadata ||
            typeof metadata !== 'object' ||
            !('version' in metadata) ||
            typeof metadata.version !== 'string' ||
            metadata.version.length > 80
          )
            return error('invalid-input', 400);
          const { version, ...rating } = metadata;
          const parsed = feedbackRatingSchema.safeParse(rating);
          if (!parsed.success) return error('invalid-input', 400);
          const feedback = parsed.data;
          const payload = new Uint8Array(await archive.arrayBuffer());
          const fingerprint = await digest(
            new TextEncoder().encode(
              JSON.stringify({ feedback, version, archive: await digest(payload) }),
            ),
          );
          const prior = await options.bucket.get(key);
          if (prior) {
            if (
              prior.customMetadata['deleted'] === 'true' ||
              Date.parse(prior.customMetadata['expires'] ?? '') <= now()
            )
              return error('report-expired', 410);
            return prior.customMetadata['digest'] === fingerprint
              ? receipt(reportId, prior.customMetadata['expires'] ?? '')
              : error('report-conflict', 409);
          }
          const expires = new Date(now() + RETENTION_MS).toISOString();
          const stored = await options.bucket.put(key, body, {
            onlyIf: { etagDoesNotMatch: '*' },
            customMetadata: { digest: fingerprint, expires, mime },
          });
          if (!stored) {
            const winner = await options.bucket.get(key);
            return winner?.customMetadata['digest'] === fingerprint &&
              winner.customMetadata['deleted'] !== 'true'
              ? receipt(reportId, winner.customMetadata['expires'] ?? '')
              : error('report-conflict', 409);
          }
          const indexStarted = now();
          try {
            await options.index?.({
              reportId,
              rating: feedback.rating,
              tags: feedback.tags,
              version,
              bytes: payload.length,
            });
          } catch {
            options.log?.({
              phase: 'index-failed',
              reportId,
              durationMs: now() - indexStarted,
              reason: 'index-unavailable',
            });
          }
          return receipt(reportId, expires, 201);
        }
        if (!(await authorized(request))) return error('unauthorized', 401);
        const stored = await options.bucket.get(key);
        if (!stored) return error('not-found', 404);
        if (stored.customMetadata['deleted'] === 'true') return error('report-expired', 410);
        if (Date.parse(stored.customMetadata['expires'] ?? '') <= now()) {
          await erase(key);
          return error('report-expired', 410);
        }
        if (request.method === 'DELETE' && parts.length === 3) {
          await erase(key);
          return Response.json({ reportId, deleted: true }, { headers });
        }
        if (request.method !== 'GET') return error('method-not-allowed', 405);
        const form = await new Response(await stored.arrayBuffer(), {
          headers: { 'content-type': stored.customMetadata['mime'] ?? '' },
        }).formData();
        if (parts[3] === 'archive') {
          const archive = form.get('archive');
          if (!(archive instanceof Blob)) return error('report-unavailable', 500);
          return new Response(archive, {
            headers: {
              ...headers,
              'content-type': 'application/zip',
              'content-disposition': `attachment; filename="feedback-${reportId}.zip"`,
            },
          });
        }
        if (parts.length !== 3) return error('not-found', 404);
        const raw = form.get('metadata');
        if (typeof raw !== 'string') return error('report-unavailable', 500);
        return Response.json(
          { reportId, expiresAt: stored.customMetadata['expires'], feedback: JSON.parse(raw) },
          { headers },
        );
      } catch (failure) {
        const tooLarge = failure instanceof Error && failure.message === 'too-large';
        const invalid = failure instanceof SyntaxError || failure instanceof TypeError;
        return error(
          tooLarge ? 'too-large' : invalid ? 'invalid-input' : 'report-unavailable',
          tooLarge ? 413 : invalid ? 400 : 503,
        );
      }
    },
    async expire(): Promise<void> {
      let cursor: string | undefined;
      do {
        const page = await options.bucket.list({
          prefix: 'reports/',
          limit: 100,
          ...(cursor ? { cursor } : {}),
        });
        for (const item of page.objects) {
          const stored = await options.bucket.get(item.key);
          if (stored && Date.parse(stored.customMetadata['expires'] ?? '') <= now())
            await erase(item.key);
        }
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
    },
  };
}
