import {
  createCatalog,
  MAX_QUERY_LENGTH,
  type BrowseSort,
  type Catalog,
  type SubmissionRefusal,
} from './catalog.js';
import type { D1Database } from './d1.js';
import { createCrawler } from './crawl.js';
import { createGitHubClient, parseRepositoryUrl, type GitHubClient } from './github.js';
import {
  createModeration,
  DEFAULT_REPORT_THRESHOLD,
  MAX_REPORT_REASON_LENGTH,
  type BlocklistTarget,
  type Moderation,
} from './moderation.js';
import { parseMarketplaceLanguage } from './localization.js';
import { isPublicRead, preflight, publicResponse } from './public-api.js';
import {
  createProtection,
  DEFAULT_LIMITS,
  sameSecret,
  type Protection,
  type ProtectionLimits,
} from './protection.js';
import { prepareReadme } from './readme.js';
import { createSummarizer, refreshSummaries, type Summarizer } from './summary.js';
import { bearer, createAccessTokenVerifier, workosKeys, type AccessTokenVerifier } from './auth.js';
import type { R2Bucket } from './r2.js';
import { createRankings, isRankingSection, type Rankings } from './rankings.js';
import { createReceipts, isMarketplaceHostId, type Receipts } from './receipts.js';
import { MAX_UPLOAD_FILE_BYTES } from './upload-files.js';
import {
  createUploads,
  UPLOAD_REFUSAL_STATUS,
  type UploadResult,
  type Uploads,
} from './uploads.js';

export interface MarketEnv {
  MARKET_DB: D1Database;
  GITHUB_TOKEN?: string;
  ALTCHA_HMAC_KEY?: string;
  ADMIN_TOKEN?: string;
  REPORT_THRESHOLD?: string;
  SUMMARY_API_KEY?: string;
  SUMMARY_API_BASE?: string;
  SUMMARY_MODEL?: string;
  MARKET_FILES?: R2Bucket | undefined;
  WORKOS_CLIENT_ID?: string;
}

export interface MarketHandlerDeps {
  catalog: Catalog;
  moderation: Moderation;
  protection: Protection | undefined;
  adminToken: string | undefined;
  reportThreshold: number;
  receipts?: Receipts | undefined;
  rankings?: Rankings | undefined;
  uploads?: { store: Uploads; verifier: AccessTokenVerifier } | undefined;
}

export interface MarketOptions {
  now?: () => Date;
  limits?: Partial<ProtectionLimits>;
  challengeNumber?: () => number;
  verifier?: AccessTokenVerifier;
}

const refusalStatus: Record<SubmissionRefusal, number> = {
  'invalid-repository-url': 400,
  'repository-not-found': 404,
  'repository-private': 422,
  'repository-archived': 422,
  'repository-missing-topic': 422,
  'repository-blocked': 403,
  'upstream-unavailable': 502,
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function failure(
  status: number,
  code: string,
  headers: Record<string, string> = {},
  path?: string,
): Response {
  const response = json(status, { error: path === undefined ? { code } : { code, path } });
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  return response;
}

async function readBody(request: Request): Promise<Record<string, unknown> | undefined> {
  try {
    const body: unknown = await request.json();
    return typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function blocklistTarget(body: Record<string, unknown>): BlocklistTarget | undefined {
  const { id, url } = body;
  if (typeof id === 'string' && id.length > 0 && url === undefined) return { id };
  if (typeof url === 'string' && url.length > 0 && id === undefined) return { url };
  return undefined;
}

function refused<T>(result: UploadResult<T> & { ok: false }): Response {
  return failure(UPLOAD_REFUSAL_STATUS[result.code], result.code, {}, result.path);
}

function decodePath(value: string): string | undefined {
  try {
    return value.split('/').map(decodeURIComponent).join('/');
  } catch {
    return undefined;
  }
}

function isBrowseSort(value: string): value is BrowseSort {
  return value === 'updated' || value === 'created' || value === 'stars';
}

export function createMarketHandler(
  deps: MarketHandlerDeps,
): (request: Request) => Promise<Response> {
  const { catalog, moderation, protection } = deps;
  const guard = async (
    request: Request,
    payload: unknown,
    action: 'submit' | 'report',
  ): Promise<{ ok: true; source: string } | { ok: false; response: Response }> => {
    if (protection === undefined) {
      return { ok: false, response: failure(503, 'challenge-unavailable') };
    }
    const check = await protection.verify(payload);
    if (!check.ok) return { ok: false, response: failure(400, check.code) };
    const source = await protection.source(request);
    if (!(await protection.allow(source, action))) {
      return { ok: false, response: failure(429, 'rate-limited', { 'retry-after': '3600' }) };
    }
    return { ok: true, source };
  };

  const route = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (url.pathname === '/v1/challenge') {
      if (request.method !== 'GET') return failure(405, 'method-not-allowed');
      if (protection === undefined) return failure(503, 'challenge-unavailable');
      const response = json(200, await protection.challenge(await protection.source(request)));
      response.headers.set('cache-control', 'no-store');
      return response;
    }
    if (url.pathname === '/v1/admin/blocklist') {
      if (request.method !== 'POST') return failure(405, 'method-not-allowed');
      const given = /^Bearer (.+)$/u.exec(request.headers.get('authorization') ?? '')?.[1];
      if (
        deps.adminToken === undefined ||
        given === undefined ||
        !(await sameSecret(given, deps.adminToken))
      ) {
        return failure(401, 'unauthorized');
      }
      const body = await readBody(request);
      const target = body === undefined ? undefined : blocklistTarget(body);
      const action = body?.['action'];
      if (target === undefined || (action !== 'block' && action !== 'restore')) {
        return failure(400, 'invalid-admin-request');
      }
      const result =
        action === 'block' ? await moderation.block(target) : await moderation.restore(target);
      if (result.ok) return json(200, { bot: result.bot });
      const status = {
        'bot-not-found': 404,
        'invalid-repository-url': 400,
        'upstream-unavailable': 502,
      };
      return failure(status[result.code], result.code);
    }
    const viewMatch = /^\/v1\/bots\/([^/]+)\/view\/(.+)$/u.exec(url.pathname);
    if (viewMatch !== null) {
      if (request.method !== 'GET') return failure(405, 'method-not-allowed');
      const id = decodePath(viewMatch[1]!);
      const path = decodePath(viewMatch[2]!);
      const file =
        id === undefined || path === undefined || deps.uploads === undefined
          ? undefined
          : await deps.uploads.store.readText(id, path);
      if (file === undefined) return failure(404, 'file-not-found');
      if (file === null) return failure(415, 'file-not-text');
      const directory = file.path.split('/').slice(0, -1).join('/');
      return json(200, {
        file: {
          path: file.path,
          size: file.size,
          type: file.type,
          text:
            file.type === 'markdown'
              ? prepareReadme(file.text, {
                  owner: '',
                  name: '',
                  ref: '',
                  filesBase: `${url.origin}/v1/bots/${encodeURIComponent(id!)}/files`,
                  ...(directory === '' ? {} : { directory }),
                })
              : file.text,
        },
      });
    }
    const fileMatch = /^\/v1\/bots\/([^/]+)\/files\/(.+)$/u.exec(url.pathname);
    if (fileMatch !== null) {
      if (request.method !== 'GET') return failure(405, 'method-not-allowed');
      const id = decodePath(fileMatch[1]!);
      const path = decodePath(fileMatch[2]!);
      const file =
        id === undefined || path === undefined || deps.uploads === undefined
          ? undefined
          : await deps.uploads.store.readFile(id, path);
      if (file === undefined) return failure(404, 'file-not-found');
      return new Response(file.bytes, {
        status: 200,
        headers: {
          'content-type': file.contentType,
          'x-content-type-options': 'nosniff',
          'content-security-policy': "default-src 'none'; sandbox",
        },
      });
    }
    if (
      url.pathname === '/v1/me' ||
      url.pathname.startsWith('/v1/me/') ||
      url.pathname.startsWith('/v1/uploads')
    ) {
      if (deps.uploads === undefined) return failure(503, 'uploads-unavailable');
      const token = bearer(request);
      const account = token === undefined ? undefined : await deps.uploads.verifier.verify(token);
      if (account === undefined) return failure(401, 'unauthorized');
      const store = deps.uploads.store;
      if (url.pathname === '/v1/me') {
        if (request.method === 'GET') return json(200, { author: await store.author(account) });
        if (request.method === 'DELETE') {
          await store.removeAccount(account);
          return json(200, { deleted: true });
        }
        if (request.method !== 'PUT') return failure(405, 'method-not-allowed');
        const body = await readBody(request);
        const saved = await store.saveAuthor(account, {
          displayName: body?.['displayName'],
          acceptTerms: body?.['acceptTerms'],
        });
        return saved.ok ? json(200, { author: saved.value }) : refused(saved);
      }
      if (url.pathname === '/v1/me/bots') {
        if (request.method !== 'GET') return failure(405, 'method-not-allowed');
        const lang = parseMarketplaceLanguage(url.searchParams.get('lang'));
        return json(200, { bots: await catalog.authored(account, lang) });
      }
      const mine = /^\/v1\/me\/bots\/([^/]+)$/u.exec(url.pathname);
      if (mine !== null) {
        if (request.method !== 'DELETE') return failure(405, 'method-not-allowed');
        const id = decodePath(mine[1]!);
        return id !== undefined && (await store.remove(account, id))
          ? json(200, { deleted: true })
          : failure(404, 'bot-not-found');
      }
      if (url.pathname === '/v1/uploads') {
        if (request.method !== 'POST') return failure(405, 'method-not-allowed');
        const body = await readBody(request);
        if (body === undefined) return failure(400, 'invalid-upload');
        const begun = await store.begin(account, body);
        return begun.ok ? json(201, { upload: begun.value }) : refused(begun);
      }
      const put = /^\/v1\/uploads\/([a-f0-9]{32})\/files\/(.+)$/u.exec(url.pathname);
      if (put !== null) {
        if (request.method !== 'PUT') return failure(405, 'method-not-allowed');
        const path = decodePath(put[2]!);
        if (path === undefined) return failure(400, 'invalid-path');
        const declared = Number(request.headers.get('content-length') ?? '0');
        if (declared > MAX_UPLOAD_FILE_BYTES) return failure(413, 'file-too-large', {}, path);
        const bytes = new Uint8Array(await request.arrayBuffer());
        if (bytes.byteLength > MAX_UPLOAD_FILE_BYTES)
          return failure(413, 'file-too-large', {}, path);
        const stored = await store.putFile(account, put[1]!, path, bytes);
        return stored.ok ? new Response(null, { status: 204 }) : refused(stored);
      }
      const publish = /^\/v1\/uploads\/([a-f0-9]{32})\/publish$/u.exec(url.pathname);
      if (publish !== null) {
        if (request.method !== 'POST') return failure(405, 'method-not-allowed');
        const published = await store.publish(account, publish[1]!, url.origin);
        if (!published.ok) return refused(published);
        const detail = await catalog.detail(published.value);
        return detail === undefined
          ? failure(404, 'bot-not-found')
          : json(201, { bot: detail.bot });
      }
      return failure(404, 'not-found');
    }
    const installId = /^\/v1\/bots\/([^/]+)\/installs$/u.exec(url.pathname)?.[1];
    if (installId !== undefined) {
      if (request.method !== 'POST') return failure(405, 'method-not-allowed');
      if (protection === undefined || deps.receipts === undefined) {
        return failure(503, 'receipts-unavailable');
      }
      const id = decodePath(installId);
      const hostId = (await readBody(request))?.['hostId'];
      if (id === undefined) return failure(404, 'bot-not-found');
      if (!isMarketplaceHostId(hostId)) return failure(400, 'invalid-receipt');
      if (!(await protection.allow(await protection.source(request), 'install'))) {
        return failure(429, 'rate-limited', { 'retry-after': '3600' });
      }
      const recorded = await deps.receipts.record(id, hostId);
      return recorded.ok
        ? json(202, { counted: recorded.counted, installs: recorded.installs })
        : failure(404, 'bot-not-found');
    }
    const reportId = /^\/v1\/bots\/([^/]+)\/reports$/u.exec(url.pathname)?.[1];
    if (reportId !== undefined) {
      if (request.method !== 'POST') return failure(405, 'method-not-allowed');
      let id: string;
      try {
        id = decodeURIComponent(reportId);
      } catch {
        return failure(404, 'bot-not-found');
      }
      const body = await readBody(request);
      const reasonValue = body?.['reason'];
      const reason = typeof reasonValue === 'string' ? reasonValue.trim() : '';
      if (
        (reasonValue !== undefined && typeof reasonValue !== 'string') ||
        [...reason].length > MAX_REPORT_REASON_LENGTH
      ) {
        return failure(400, 'invalid-report');
      }
      const guarded = await guard(request, body?.['altcha'], 'report');
      if (!guarded.ok) return guarded.response;
      const received = await moderation.report({
        id,
        source: guarded.source,
        reason: reason.length === 0 ? undefined : reason,
        threshold: deps.reportThreshold,
      });
      return received ? json(202, { received: true }) : failure(404, 'bot-not-found');
    }
    if (url.pathname === '/v1/bots') {
      if (request.method !== 'GET') return failure(405, 'method-not-allowed');
      const limitParam = url.searchParams.get('limit');
      const limit = limitParam === null ? undefined : Number(limitParam);
      if (limit !== undefined && !Number.isInteger(limit)) return failure(400, 'invalid-limit');
      const cursor = url.searchParams.get('cursor') ?? undefined;
      const sortParam = url.searchParams.get('sort') ?? 'updated';
      if (!isBrowseSort(sortParam)) return failure(400, 'invalid-sort');
      const query = url.searchParams.get('q')?.trim() ?? '';
      if ([...query].length > MAX_QUERY_LENGTH) return failure(400, 'invalid-query');
      const topic = url.searchParams.get('topic')?.trim().toLowerCase() ?? '';
      const language = parseMarketplaceLanguage(url.searchParams.get('lang'));
      const include = url.searchParams.get('include') ?? '';
      const page = await catalog.list({
        ...(include.split(',').includes('uploads') ? { includeUploads: true } : {}),
        ...(language === undefined ? {} : { language }),
        sort: sortParam,
        ...(limit === undefined ? {} : { limit }),
        ...(cursor === undefined ? {} : { cursor }),
        ...(query.length === 0 ? {} : { query }),
        ...(topic.length === 0 ? {} : { topic }),
      });
      return page === undefined ? failure(400, 'invalid-cursor') : json(200, page);
    }
    const detailId = /^\/v1\/bots\/([^/]+)$/u.exec(url.pathname)?.[1];
    if (detailId !== undefined) {
      if (request.method !== 'GET') return failure(405, 'method-not-allowed');
      let id: string;
      try {
        id = decodeURIComponent(detailId);
      } catch {
        return failure(404, 'bot-not-found');
      }
      const detail = await catalog.detail(
        id,
        parseMarketplaceLanguage(url.searchParams.get('lang')),
      );
      return detail === undefined ? failure(404, 'bot-not-found') : json(200, detail);
    }
    const sectionName = /^\/v1\/sections\/([^/]+)$/u.exec(url.pathname)?.[1];
    if (sectionName !== undefined) {
      if (request.method !== 'GET') return failure(405, 'method-not-allowed');
      if (!isRankingSection(sectionName) || deps.rankings === undefined) {
        return failure(404, 'section-not-found');
      }
      return json(
        200,
        await deps.rankings.section(
          sectionName,
          parseMarketplaceLanguage(url.searchParams.get('lang')),
        ),
      );
    }
    if (url.pathname === '/v1/topics') {
      if (request.method !== 'GET') return failure(405, 'method-not-allowed');
      return json(200, { topics: await catalog.topics() });
    }
    if (url.pathname === '/v1/submissions') {
      if (request.method !== 'POST') return failure(405, 'method-not-allowed');
      const body = await readBody(request);
      const guarded = await guard(request, body?.['altcha'], 'submit');
      if (!guarded.ok) return guarded.response;
      const submitted = body?.['url'];
      const locator = typeof submitted === 'string' ? parseRepositoryUrl(submitted) : undefined;
      if (typeof submitted !== 'string' || locator === undefined) {
        return failure(400, 'invalid-repository-url');
      }
      const retryAfter = await protection?.claimRepository(
        `${locator.owner}/${locator.name}`.toLowerCase(),
      );
      if (retryAfter !== undefined) {
        return failure(429, 'repository-rate-limited', { 'retry-after': String(retryAfter) });
      }
      const result = await catalog.submit(submitted);
      return result.ok
        ? json(201, { bot: result.entry })
        : failure(refusalStatus[result.code], result.code);
    }
    return failure(404, 'not-found');
  };

  return async (request) => {
    if (!isPublicRead(new URL(request.url).pathname)) return route(request);
    if (request.method === 'OPTIONS') return preflight(request);
    return publicResponse(request, await route(request));
  };
}

function reportThreshold(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_REPORT_THRESHOLD;
}

export function handlerForEnv(
  env: MarketEnv,
  github: GitHubClient = createGitHubClient({ token: env.GITHUB_TOKEN }),
  options: MarketOptions = {},
): (request: Request) => Promise<Response> {
  const now = options.now ?? (() => new Date());
  const db = env.MARKET_DB;
  const bucket = env.MARKET_FILES;
  const clientId = env.WORKOS_CLIENT_ID;
  const store = bucket === undefined ? undefined : createUploads({ db, bucket, now });
  const verifier =
    options.verifier ??
    (clientId === undefined || clientId.length === 0
      ? undefined
      : createAccessTokenVerifier({ clientId, keys: workosKeys(clientId) }));
  const catalog = createCatalog({
    db,
    github,
    now,
    ...(store === undefined ? {} : { uploadedFiles: (id: string) => store.files(id) }),
  });
  const key = env.ALTCHA_HMAC_KEY;
  return createMarketHandler({
    catalog,
    moderation: createModeration({ db, github, catalog, now }),
    protection:
      key === undefined || key.length === 0
        ? undefined
        : createProtection({
            db,
            key,
            now,
            limits: { ...DEFAULT_LIMITS, ...options.limits },
            ...(options.challengeNumber === undefined
              ? {}
              : { challengeNumber: options.challengeNumber }),
          }),
    adminToken:
      env.ADMIN_TOKEN === undefined || env.ADMIN_TOKEN.length === 0 ? undefined : env.ADMIN_TOKEN,
    reportThreshold: reportThreshold(env.REPORT_THRESHOLD),
    receipts: createReceipts({ db, now }),
    rankings: createRankings({ db, now }),
    uploads: store === undefined || verifier === undefined ? undefined : { store, verifier },
  });
}

export const DISCOVERY_CRON = '0 3 * * *';
export const REFRESH_CRON = '17 * * * *';

export const DEFAULT_SUMMARY_API_BASE = 'https://opencode.ai/inference/go/v1';
export const DEFAULT_SUMMARY_MODEL = 'free,deepseek-v4.1-flash';

export function summarizerForEnv(env: MarketEnv, fetchImpl?: typeof fetch): Summarizer | undefined {
  const apiKey = env.SUMMARY_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) return undefined;
  return createSummarizer({
    apiKey,
    apiBase: env.SUMMARY_API_BASE || DEFAULT_SUMMARY_API_BASE,
    model: env.SUMMARY_MODEL || DEFAULT_SUMMARY_MODEL,
    ...(fetchImpl === undefined ? {} : { fetchImpl }),
  });
}

export async function runScheduled(
  cron: string,
  env: MarketEnv,
  github: GitHubClient = createGitHubClient({ token: env.GITHUB_TOKEN }),
  log: (line: string) => void = (line) => console.log(line),
  summarizer: Summarizer | undefined = summarizerForEnv(env),
): Promise<void> {
  const crawler = createCrawler({ db: env.MARKET_DB, github, now: () => new Date() });
  const started = Date.now();
  const phase = cron === DISCOVERY_CRON ? 'discovery' : 'refresh';
  const report = phase === 'discovery' ? await crawler.discover() : await crawler.refresh();
  log(
    JSON.stringify({
      module: 'marketplace-worker',
      initiator: 'scheduled',
      phase,
      durationMs: Date.now() - started,
      ...report,
    }),
  );
  if (phase !== 'refresh') return;
  if (summarizer === undefined) {
    log(
      JSON.stringify({
        module: 'marketplace-worker',
        initiator: 'scheduled',
        phase: 'summaries',
        skipped: 'missing-summary-api-key',
      }),
    );
    return;
  }
  const summaryStarted = Date.now();
  const summaries = await refreshSummaries({ db: env.MARKET_DB, summarizer });
  log(
    JSON.stringify({
      module: 'marketplace-worker',
      initiator: 'scheduled',
      phase: 'summaries',
      model: summarizer.model,
      durationMs: Date.now() - summaryStarted,
      ...summaries,
    }),
  );
}

export async function runDaily(
  env: MarketEnv,
  log: (line: string) => void = (line) => console.log(line),
  now: () => Date = () => new Date(),
): Promise<void> {
  const started = Date.now();
  try {
    const snapshot = await createRankings({ db: env.MARKET_DB, now }).snapshot();
    log(
      JSON.stringify({
        module: 'marketplace-worker',
        initiator: 'scheduled',
        phase: 'rankings',
        durationMs: Date.now() - started,
        ...snapshot,
      }),
    );
  } catch (error) {
    log(
      JSON.stringify({
        module: 'marketplace-worker',
        initiator: 'scheduled',
        phase: 'rankings',
        durationMs: Date.now() - started,
        failed: error instanceof Error ? error.message : 'unknown',
      }),
    );
  }
}

export default {
  fetch(request: Request, env: MarketEnv): Promise<Response> {
    return handlerForEnv(env)(request);
  },
  scheduled(
    controller: { cron: string },
    env: MarketEnv,
    context: { waitUntil(promise: Promise<unknown>): void },
  ): void {
    const crawl = runScheduled(controller.cron, env);
    context.waitUntil(
      controller.cron === DISCOVERY_CRON
        ? crawl.then(undefined, (error: unknown) => console.error(error)).then(() => runDaily(env))
        : crawl,
    );
  },
};
