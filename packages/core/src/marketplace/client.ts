import { isPixelBannerRecipe, type PixelBannerRecipe } from '@botharness/pixel-banner';

import { canonicalRecipe, isAvatarRecipe, type AvatarRecipe } from '../bots/avatar-appearance.js';
import { parseChallenge, type AltchaChallenge } from './altcha.js';
import { parseMarketplaceLanguage, type MarketplaceLanguage } from './language.js';

export type MarketplaceBanner = { recipe: PixelBannerRecipe } | { image: string };
export type MarketplaceAvatar = { recipe: AvatarRecipe } | { image: string };

const ART_IMAGE_ORIGIN = 'https://raw.githubusercontent.com/';

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
  avatar: MarketplaceAvatar | null;
  topics: string[];
  stars: number;
  installs: number;
  pushedAt: string;
  createdAt?: string;
  htmlUrl: string;
  cloneUrl: string;
  defaultBranch: string;
  headCommit: { sha: string; committedAt: string } | null;
  source: MarketplaceSource;
  author: MarketplaceAuthor | null;
}

export type MarketplaceSource = 'github' | 'upload';

export interface MarketplaceAuthor {
  name: string;
  id: string;
}

export interface MarketplaceAuthorAccount extends MarketplaceAuthor {
  termsAcceptedAt: string;
}

export type MarketplaceFileKind = 'text' | 'script' | 'image';

export interface MarketplaceFile {
  path: string;
  size: number;
  kind: MarketplaceFileKind;
}

export interface MarketplaceUploadInput {
  displayName: string;
  bio?: string;
  tags?: string[];
  files: Array<{ path: string; size: number; sha256: string }>;
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
  includeUploads?: boolean;
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
  files?: MarketplaceFile[];
}

export type MarketplaceResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; path?: string };

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
  author(token: string): Promise<MarketplaceResult<MarketplaceAuthorAccount | null>>;
  saveAuthor(
    token: string,
    input: { displayName: string; acceptTerms: boolean },
  ): Promise<MarketplaceResult<MarketplaceAuthorAccount>>;
  beginUpload(
    token: string,
    input: MarketplaceUploadInput,
  ): Promise<MarketplaceResult<{ id: string; botId: string }>>;
  putUploadFile(
    token: string,
    uploadId: string,
    path: string,
    bytes: Uint8Array,
  ): Promise<MarketplaceResult<true>>;
  publishUpload(token: string, uploadId: string): Promise<MarketplaceResult<MarketplaceEntry>>;
  file(id: string, path: string): Promise<MarketplaceResult<Uint8Array>>;
  installReceipt(
    id: string,
    hostId: string,
  ): Promise<MarketplaceResult<{ counted: boolean; installs: number }>>;
}

const REQUEST_TIMEOUT_MS = 15_000;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function artImage(value: unknown, filesBase: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.startsWith(ART_IMAGE_ORIGIN)) return value;
  return filesBase !== undefined && value.startsWith(filesBase) ? value : undefined;
}

function parseBanner(value: unknown, filesBase?: string): MarketplaceBanner | null {
  const source = record(value);
  if (source === undefined) return null;
  if (isPixelBannerRecipe(source['recipe'])) {
    return { recipe: { scene: source['recipe'].scene, seed: source['recipe'].seed } };
  }
  const image = artImage(source['image'], filesBase);
  return image === undefined ? null : { image };
}

function parseAvatar(value: unknown, filesBase?: string): MarketplaceAvatar | null {
  const source = record(value);
  if (source === undefined) return null;
  if (isAvatarRecipe(source['recipe'])) return { recipe: canonicalRecipe(source['recipe']) };
  const image = artImage(source['image'], filesBase);
  return image === undefined ? null : { image };
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
  const htmlUrl = source['htmlUrl'] as string;
  const filesBase =
    source['source'] === 'upload' && htmlUrl.startsWith('https://')
      ? `${htmlUrl}/files/`
      : undefined;
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
    banner: parseBanner(source['banner'], filesBase),
    avatar: parseAvatar(source['avatar'], filesBase),
    topics: topics.filter((topic): topic is string => typeof topic === 'string'),
    stars,
    installs:
      typeof source['installs'] === 'number' && Number.isSafeInteger(source['installs'])
        ? Math.max(source['installs'], 0)
        : 0,
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
    source: source['source'] === 'upload' ? 'upload' : 'github',
    author: parseAuthor(source['author']) ?? null,
  };
}

function parseAuthor(value: unknown): MarketplaceAuthor | undefined {
  const source = record(value);
  return typeof source?.['name'] === 'string' && typeof source['id'] === 'string'
    ? { name: source['name'], id: source['id'] }
    : undefined;
}

function parseAuthorAccount(value: unknown): MarketplaceAuthorAccount | undefined {
  const author = parseAuthor(value);
  const accepted = record(value)?.['termsAcceptedAt'];
  return author === undefined || typeof accepted !== 'string'
    ? undefined
    : { ...author, termsAcceptedAt: accepted };
}

const FILE_KINDS: readonly string[] = ['text', 'script', 'image'];

function parseFiles(value: unknown): MarketplaceFile[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const files = value.map((item) => {
    const source = record(item);
    return typeof source?.['path'] === 'string' &&
      typeof source['size'] === 'number' &&
      typeof source['kind'] === 'string' &&
      FILE_KINDS.includes(source['kind'])
      ? { path: source['path'], size: source['size'], kind: source['kind'] as MarketplaceFileKind }
      : undefined;
  });
  return files.every((file): file is MarketplaceFile => file !== undefined) ? files : undefined;
}

export function filePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
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
  const files = parseFiles(source?.['files']);
  return {
    bot,
    readme,
    readmeLanguage:
      typeof readmeLanguage === 'string'
        ? (parseMarketplaceLanguage(readmeLanguage) ?? null)
        : null,
    commitSha,
    ...(files === undefined ? {} : { files }),
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
  if (query.includeUploads === true) params.set('include', 'uploads');
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

  const send = async (path: string, init: RequestInit): Promise<Response | undefined> => {
    try {
      return await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return undefined;
    }
  };

  const refusal = async (
    response: Response,
  ): Promise<{ ok: false; code: string; path?: string }> => {
    const error = record(record(await response.json().catch(() => undefined))?.['error']);
    const code = error?.['code'];
    const path = error?.['path'];
    return {
      ok: false,
      code: typeof code === 'string' ? code : 'marketplace-unavailable',
      ...(typeof path === 'string' ? { path } : {}),
    };
  };

  const authorized = (token: string, json: boolean): Record<string, string> => ({
    accept: 'application/json',
    authorization: `Bearer ${token}`,
    ...(json ? { 'content-type': 'application/json' } : {}),
  });

  const request = async <T>(
    path: string,
    init: RequestInit,
    parse: (value: unknown) => T | undefined,
  ): Promise<MarketplaceResult<T>> => {
    const response = await send(path, init);
    if (response === undefined) return { ok: false, code: 'marketplace-unavailable' };
    if (!response.ok) return refusal(response);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { ok: false, code: 'marketplace-unavailable' };
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
    author: (token) =>
      request('/v1/me', { method: 'GET', headers: authorized(token, false) }, (value) => {
        const author = record(value)?.['author'];
        return author === null ? null : parseAuthorAccount(author);
      }),
    saveAuthor: (token, input) =>
      request(
        '/v1/me',
        { method: 'PUT', headers: authorized(token, true), body: JSON.stringify(input) },
        (value) => parseAuthorAccount(record(value)?.['author']),
      ),
    beginUpload: (token, input) =>
      request(
        '/v1/uploads',
        { method: 'POST', headers: authorized(token, true), body: JSON.stringify(input) },
        (value) => {
          const upload = record(record(value)?.['upload']);
          return typeof upload?.['id'] === 'string' && typeof upload['botId'] === 'string'
            ? { id: upload['id'], botId: upload['botId'] }
            : undefined;
        },
      ),
    async putUploadFile(token, uploadId, path, bytes) {
      const response = await send(
        `/v1/uploads/${encodeURIComponent(uploadId)}/files/${filePath(path)}`,
        {
          method: 'PUT',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' },
          body: new Uint8Array(bytes),
        },
      );
      if (response === undefined) return { ok: false, code: 'marketplace-unavailable' };
      return response.ok ? { ok: true, value: true } : refusal(response);
    },
    publishUpload: (token, uploadId) =>
      request(
        `/v1/uploads/${encodeURIComponent(uploadId)}/publish`,
        { method: 'POST', headers: authorized(token, false) },
        (value) => parseEntry(record(value)?.['bot']),
      ),
    installReceipt: (id, hostId) =>
      request(
        `/v1/bots/${encodeURIComponent(id)}/installs`,
        {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify({ hostId }),
        },
        (value) => {
          const body = record(value);
          return typeof body?.['counted'] === 'boolean' && typeof body['installs'] === 'number'
            ? { counted: body['counted'], installs: body['installs'] }
            : undefined;
        },
      ),
    async file(id, path) {
      const response = await send(`/v1/bots/${encodeURIComponent(id)}/files/${filePath(path)}`, {
        method: 'GET',
      });
      if (response === undefined) return { ok: false, code: 'marketplace-unavailable' };
      if (!response.ok) return refusal(response);
      try {
        return { ok: true, value: new Uint8Array(await response.arrayBuffer()) };
      } catch {
        return { ok: false, code: 'marketplace-unavailable' };
      }
    },
  };
}
