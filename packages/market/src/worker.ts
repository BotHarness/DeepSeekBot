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
import { createSummarizer, refreshSummaries, type Summarizer } from './summary.js';

export interface MarketEnv {
  MARKET_DB: D1Database;
  GITHUB_TOKEN?: string;
  ALTCHA_HMAC_KEY?: string;
  ADMIN_TOKEN?: string;
  REPORT_THRESHOLD?: string;
  SUMMARY_API_KEY?: string;
  SUMMARY_API_BASE?: string;
  SUMMARY_MODEL?: string;
}

export interface MarketHandlerDeps {
  catalog: Catalog;
  moderation: Moderation;
  protection: Protection | undefined;
  adminToken: string | undefined;
  reportThreshold: number;
}

export interface MarketOptions {
  now?: () => Date;
  limits?: Partial<ProtectionLimits>;
  challengeNumber?: () => number;
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

function failure(status: number, code: string, headers: Record<string, string> = {}): Response {
  const response = json(status, { error: { code } });
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

function isBrowseSort(value: string): value is BrowseSort {
  return value === 'updated' || value === 'stars';
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
      const page = await catalog.list({
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
  const catalog = createCatalog({ db, github, now });
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
  if (phase !== 'refresh' || summarizer === undefined) return;
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

export default {
  fetch(request: Request, env: MarketEnv): Promise<Response> {
    return handlerForEnv(env)(request);
  },
  scheduled(
    controller: { cron: string },
    env: MarketEnv,
    context: { waitUntil(promise: Promise<unknown>): void },
  ): void {
    context.waitUntil(runScheduled(controller.cron, env));
  },
};
