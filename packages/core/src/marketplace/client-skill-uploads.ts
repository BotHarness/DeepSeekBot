import {
  parseMarketplaceSkill,
  parseMarketplaceSkillPage,
  type MarketplaceSkill,
  type MarketplaceSkillUploadInput,
} from '@botharness/host-protocol/marketplace-skill';
import { asObject } from '../kernel/method-utils.js';
import type { MarketplaceResult } from './client.js';

export interface SkillUploadClient {
  skillWrite(
    token: string,
    input: MarketplaceSkillUploadInput,
    replacing?: string,
  ): Promise<MarketplaceResult<MarketplaceSkill>>;
  skillMine(token: string): Promise<MarketplaceResult<MarketplaceSkill[]>>;
  skillDelete(token: string, id: string): Promise<MarketplaceResult<{ deleted: true }>>;
}

type RequestJson = <T>(
  path: string,
  init: RequestInit,
  parse: (value: unknown) => T | undefined,
) => Promise<MarketplaceResult<T>>;

export function createSkillUploadClient(
  request: RequestJson,
  authorized: (token: string, json: boolean) => Record<string, string>,
): SkillUploadClient {
  return {
    skillWrite: (token, input, replacing) =>
      request(
        replacing === undefined ? '/v1/skills' : `/v1/me/skills/${encodeURIComponent(replacing)}`,
        {
          method: replacing === undefined ? 'POST' : 'PUT',
          headers: authorized(token, true),
          body: JSON.stringify(input),
        },
        (value) => parseMarketplaceSkill(asObject(value)['skill']),
      ),
    skillMine: (token) =>
      request(
        '/v1/me/skills',
        { method: 'GET', headers: authorized(token, false) },
        (value) =>
          parseMarketplaceSkillPage({ skills: asObject(value)['skills'], nextCursor: null })
            ?.skills,
      ),
    skillDelete: (token, id) =>
      request(
        `/v1/me/skills/${encodeURIComponent(id)}`,
        { method: 'DELETE', headers: authorized(token, false) },
        (value) => (asObject(value)['deleted'] === true ? { deleted: true as const } : undefined),
      ),
  };
}
