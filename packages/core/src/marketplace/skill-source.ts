import {
  parseMarketplaceSkillDetail,
  parseMarketplaceSkillPage,
  type MarketplaceSkill,
  type MarketplaceSkillDetail,
  type MarketplaceSkillPage,
} from '@botharness/host-protocol/marketplace-skill';
import { MAX_SKILL_BYTES, MAX_SKILL_FILES } from '../../../market/src/skill-scan.js';
import type { MarketplaceResult } from './client.js';

const REQUEST_TIMEOUT_MS = 15_000;
const RAW_BASE = 'https://raw.githubusercontent.com';

export interface MarketplaceSkillSource {
  list(query: { q?: string; cursor?: string }): Promise<MarketplaceResult<MarketplaceSkillPage>>;
  detail(id: string): Promise<MarketplaceResult<MarketplaceSkillDetail>>;
  receipt(id: string, targetHash: string): Promise<MarketplaceResult<{ counted: boolean }>>;
  files(
    skill: MarketplaceSkill,
    paths: readonly string[],
  ): Promise<MarketplaceResult<Map<string, Uint8Array>>>;
}

export function createMarketplaceSkillSource(options: {
  baseUrl: string;
  rawBase?: string;
  fetchImpl?: typeof fetch;
}): MarketplaceSkillSource {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/+$/u, '');
  const rawBase = (options.rawBase ?? RAW_BASE).replace(/\/+$/u, '');
  const send = async (url: string, init: RequestInit = {}): Promise<Response | undefined> => {
    try {
      return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch {
      return undefined;
    }
  };
  const request = async <T>(
    path: string,
    init: RequestInit,
    parse: (value: unknown) => T | undefined,
  ): Promise<MarketplaceResult<T>> => {
    const response = await send(`${baseUrl}${path}`, init);
    if (response === undefined) return { ok: false, code: 'marketplace-unavailable' };
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const code = (body as { error?: { code?: unknown } } | undefined)?.error?.code;
      return { ok: false, code: typeof code === 'string' ? code : 'marketplace-unavailable' };
    }
    const value = parse(body);
    return value === undefined
      ? { ok: false, code: 'marketplace-unavailable' }
      : { ok: true, value };
  };
  const encode = (path: string) => path.split('/').map(encodeURIComponent).join('/');
  return {
    list: ({ q, cursor }) => {
      const params = new URLSearchParams();
      if (q !== undefined && q.length > 0) params.set('q', q);
      if (cursor !== undefined) params.set('cursor', cursor);
      return request(
        params.size === 0 ? '/v1/skills' : `/v1/skills?${params}`,
        { method: 'GET', headers: { accept: 'application/json' } },
        parseMarketplaceSkillPage,
      );
    },
    detail: (id) =>
      request(
        `/v1/skills/${encodeURIComponent(id)}`,
        { method: 'GET', headers: { accept: 'application/json' } },
        parseMarketplaceSkillDetail,
      ),
    receipt: (id, targetHash) =>
      request(
        `/v1/skills/${encodeURIComponent(id)}/installs`,
        {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify({ targetHash }),
        },
        (value) => {
          const counted = (value as { counted?: unknown } | undefined)?.counted;
          return typeof counted === 'boolean' ? { counted } : undefined;
        },
      ),
    async files(skill, paths) {
      if (paths.length > MAX_SKILL_FILES) return { ok: false, code: 'skill-too-large' };
      const files = new Map<string, Uint8Array>();
      let total = 0;
      for (const path of paths) {
        const full = skill.path === '' ? path : `${skill.path}/${path}`;
        const response = await send(
          `${rawBase}/${encodeURIComponent(skill.owner)}/${encodeURIComponent(skill.repo)}/${skill.commitSha}/${encode(full)}`,
          { redirect: 'error' },
        );
        if (response === undefined || !response.ok)
          return { ok: false, code: 'skill-files-unavailable' };
        const bytes = new Uint8Array(await response.arrayBuffer());
        total += bytes.byteLength;
        if (total > MAX_SKILL_BYTES) return { ok: false, code: 'skill-too-large' };
        files.set(path, bytes);
      }
      return { ok: true, value: files };
    },
  };
}
