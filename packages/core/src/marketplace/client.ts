import { isPixelBannerRecipe, type PixelBannerRecipe } from '@botharness/pixel-banner';

import { parseChallenge, type AltchaChallenge } from './altcha.js';
import { parseMarketplaceLanguage, type MarketplaceLanguage } from './language.js';

export type MarketplaceBanner = { recipe: PixelBannerRecipe } | { image: string };

const BANNER_IMAGE_ORIGIN = 'https://raw.githubusercontent.com/';

export interface MarketplaceEntry {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  displayName: string | null;
  roles: string[];
  description: string | null;
  descriptionGenerated: boolean;
  banner: MarketplaceBanner | null;
  topics: string[];
  stars: number;
  pushedAt: string;
  createdAt?: string;
  htmlUrl: string;
  cloneUrl: string;
  defaultBranch: string;
  headCommit: { sha: string; committedAt: string } | null;
}

export interface MarketplacePage {
  bots: MarketplaceEntry[];
  nextCursor?: string;
}

export type MarketplaceSort = 'updated' | 'created' | 'stars';

export interface MarketplaceQuery {
  cursor?: string;
  sort?: MarketplaceSort;
  q?: string;
  topic?: string;
  lang?: MarketplaceLanguage;
}

export interface MarketplaceTopic {
  topic: string;
  count: number;
}

export interface MarketplaceDetail {
  bot: MarketplaceEntry;
  readme: string | null;
  readmeLanguage: MarketplaceLanguage | null;
  commitSha: string | null;
}

export type MarketplaceResult<T> = { ok: true; value: T } | { ok: false; code: string };

export interface MarketplaceClient {
  list(query: MarketplaceQuery): Promise<MarketplaceResult<MarketplacePage>>;
  topics(): Promise<MarketplaceResult<MarketplaceTopic[]>>;
  detail(id: string, lang?: MarketplaceLanguage): Promise<MarketplaceResult<MarketplaceDetail>>;
  challenge(): Promise<MarketplaceResult<AltchaChallenge>>;
  submit(url: string, altcha: string): Promise<MarketplaceResult<{ bot: MarketplaceEntry }>>;
  report(
    id: string,
    options: { altcha: string; reason?: string },
  ): Promise<MarketplaceResult<{ received: true }>>;
}

const REQUEST_TIMEOUT_MS = 15_000;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseBanner(value: unknown): MarketplaceBanner | null {
  const source = record(value);
  if (source === undefined) return null;
  if (isPixelBannerRecipe(source['recipe'])) {
    return { recipe: { scene: source['recipe'].scene, seed: source['recipe'].seed } };
  }
  const image = source['image'];
  return typeof image === 'string' && image.startsWith(BANNER_IMAGE_ORIGIN) ? { image } : null;
}

function parseEntry(value: unknown): MarketplaceEntry | undefined {
  const source = record(value);
  if (source === undefined) return undefined;
  const strings = [
    'id',
    'owner',
    'name',
    'fullName',
    'pushedAt',
    'htmlUrl',
    'cloneUrl',
    'defaultBranch',
  ] as const;
  if (!strings.every((key) => typeof source[key] === 'string')) return undefined;
  const description = source['description'];
  const stars = source['stars'];
  const topics = source['topics'];
  const head = record(source['headCommit']);
  if (description !== null && typeof description !== 'string') return undefined;
  if (typeof stars !== 'number' || !Array.isArray(topics)) return undefined;
  const displayName = source['displayName'];
  const roles = Array.isArray(source['tags']) ? source['tags'] : source['roles'];
  const bio = source['bio'];
  return {
    id: source['id'] as string,
    owner: source['owner'] as string,
    name: source['name'] as string,
    fullName: source['fullName'] as string,
    displayName: typeof displayName === 'string' && displayName.length > 0 ? displayName : null,
    roles: Array.isArray(roles)
      ? roles.filter((role): role is string => typeof role === 'string')
      : [],
    description: typeof bio === 'string' && bio.length > 0 ? bio : description,
    descriptionGenerated:
      typeof bio === 'string' && bio.length > 0 && source['bioGenerated'] === true,
    banner: parseBanner(source['banner']),
    topics: topics.filter((topic): topic is string => typeof topic === 'string'),
    stars,
    pushedAt: source['pushedAt'] as string,
    ...(typeof source['createdAt'] === 'string' ? { createdAt: source['createdAt'] } : {}),
    htmlUrl: source['htmlUrl'] as string,
    cloneUrl: source['cloneUrl'] as string,
    defaultBranch: source['defaultBranch'] as string,
    headCommit:
      head !== undefined &&
      typeof head['sha'] === 'string' &&
      typeof head['committedAt'] === 'string'
        ? { sha: head['sha'], committedAt: head['committedAt'] }
        : null,
  };
}

export function parseMarketplacePage(value: unknown): MarketplacePage | undefined {
  const source = record(value);
  if (source === undefined || !Array.isArray(source['bots'])) return undefined;
  const bots = source['bots'].map(parseEntry);
  if (!bots.every((bot): bot is MarketplaceEntry => bot !== undefined)) return undefined;
  const nextCursor = source['nextCursor'];
  return typeof nextCursor === 'string' ? { bots, nextCursor } : { bots };
}

export function parseMarketplaceDetail(value: unknown): MarketplaceDetail | undefined {
  const source = record(value);
  const bot = parseEntry(source?.['bot']);
  const readme = source?.['readme'];
  const commitSha = source?.['commitSha'];
  if (bot === undefined || (readme !== null && typeof readme !== 'string')) return undefined;
  if (commitSha !== null && typeof commitSha !== 'string') return undefined;
  const readmeLanguage = source?.['readmeLanguage'];
  return {
    bot,
    readme,
    readmeLanguage:
      typeof readmeLanguage === 'string'
        ? (parseMarketplaceLanguage(readmeLanguage) ?? null)
        : null,
    commitSha,
  };
}

export function parseMarketplaceTopics(value: unknown): MarketplaceTopic[] | undefined {
  const topics = record(value)?.['topics'];
  if (!Array.isArray(topics)) return undefined;
  const parsed = topics.map((item) => {
    const source = record(item);
    return typeof source?.['topic'] === 'string' && typeof source['count'] === 'number'
      ? { topic: source['topic'], count: source['count'] }
      : undefined;
  });
  return parsed.every((item): item is MarketplaceTopic => item !== undefined) ? parsed : undefined;
}

function listPath(query: MarketplaceQuery): string {
  const params = new URLSearchParams();
  if (query.sort !== undefined) params.set('sort', query.sort);
  if (query.q !== undefined) params.set('q', query.q);
  if (query.topic !== undefined) params.set('topic', query.topic);
  if (query.cursor !== undefined) params.set('cursor', query.cursor);
  if (query.lang !== undefined) params.set('lang', query.lang);
  const search = params.toString();
  return search.length === 0 ? '/v1/bots' : `/v1/bots?${search}`;
}

export function parseMarketplaceSubmission(value: unknown): { bot: MarketplaceEntry } | undefined {
  const bot = parseEntry(record(value)?.['bot']);
  return bot === undefined ? undefined : { bot };
}

function parseReceipt(value: unknown): { received: true } | undefined {
  return record(value)?.['received'] === true ? { received: true } : undefined;
}

export function createMarketplaceClient(options: {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): MarketplaceClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/+$/u, '');
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;

  const request = async <T>(
    path: string,
    init: RequestInit,
    parse: (value: unknown) => T | undefined,
  ): Promise<MarketplaceResult<T>> => {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return { ok: false, code: 'marketplace-unavailable' };
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { ok: false, code: 'marketplace-unavailable' };
    }
    if (!response.ok) {
      const code = record(record(body)?.['error'])?.['code'];
      return { ok: false, code: typeof code === 'string' ? code : 'marketplace-unavailable' };
    }
    const value = parse(body);
    return value === undefined
      ? { ok: false, code: 'marketplace-unavailable' }
      : { ok: true, value };
  };

  return {
    list: (query) =>
      request(
        listPath(query),
        { method: 'GET', headers: { accept: 'application/json' } },
        parseMarketplacePage,
      ),
    detail: (id, lang) =>
      request(
        `/v1/bots/${encodeURIComponent(id)}${lang === undefined ? '' : `?lang=${lang}`}`,
        { method: 'GET', headers: { accept: 'application/json' } },
        parseMarketplaceDetail,
      ),
    topics: () =>
      request(
        '/v1/topics',
        { method: 'GET', headers: { accept: 'application/json' } },
        parseMarketplaceTopics,
      ),
    challenge: () =>
      request(
        '/v1/challenge',
        { method: 'GET', headers: { accept: 'application/json' } },
        parseChallenge,
      ),
    submit: (url, altcha) =>
      request(
        '/v1/submissions',
        {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify({ url, altcha }),
        },
        parseMarketplaceSubmission,
      ),
    report: (id, options) =>
      request(
        `/v1/bots/${encodeURIComponent(id)}/reports`,
        {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify(options),
        },
        parseReceipt,
      ),
  };
}
