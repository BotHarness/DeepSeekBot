import { readBoundedJson } from './bounded-json.js';
import {
  MAX_SKILL_PUBLISH_BODY,
  SKILL_FILES_ROUTE,
  SKILL_MINE_PATH,
  SKILL_MINE_ROUTE,
  type createSkillUploads,
} from './skill-uploads.js';
import type { Protection } from './protection.js';
import { SKILL_INSTALL_ROUTE, SKILL_LIST_PATH, SKILL_ROUTE, type MarketSkills } from './skills.js';

export const ADMIN_SKILLS_PATH = '/v1/admin/skills';
const TARGET_HASH = /^[0-9a-f]{64}$/u;
const MAX_QUERY = 100;

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

const failure = (status: number, code: string, headers: Record<string, string> = {}) =>
  json(status, { error: { code } }, headers);

async function body(request: Request): Promise<Record<string, unknown> | undefined> {
  try {
    const value: unknown = await request.json();
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

export function isSkillRoute(pathname: string): boolean {
  return (
    pathname === SKILL_LIST_PATH ||
    SKILL_FILES_ROUTE.test(pathname) ||
    SKILL_ROUTE.test(pathname) ||
    SKILL_INSTALL_ROUTE.test(pathname) ||
    pathname === ADMIN_SKILLS_PATH ||
    pathname === SKILL_MINE_PATH ||
    SKILL_MINE_ROUTE.test(pathname)
  );
}

export function isPublicSkillRead(pathname: string): boolean {
  return pathname === SKILL_LIST_PATH || SKILL_ROUTE.test(pathname);
}

export async function handleSkillRoute(
  request: Request,
  deps: {
    skills: MarketSkills | undefined;
    uploads: ReturnType<typeof createSkillUploads> | undefined;
    account: (request: Request) => Promise<string | undefined>;
    protection: Protection | undefined;
    admin: (request: Request) => Promise<boolean>;
  },
): Promise<Response> {
  const url = new URL(request.url);
  const { skills } = deps;
  if (skills === undefined) return failure(503, 'skills-unavailable');
  if (url.pathname === ADMIN_SKILLS_PATH) {
    if (request.method !== 'POST') return failure(405, 'method-not-allowed');
    if (!(await deps.admin(request))) return failure(401, 'unauthorized');
    const input = await body(request);
    const action = input?.['action'];
    if (action === 'index' && typeof input?.['url'] === 'string') {
      const result = await skills.indexUrl(input['url']);
      if (result.ok) return json(200, { report: result.report });
      const status: Record<string, number> = {
        'invalid-repository-url': 400,
        'repository-not-found': 404,
        'repository-private': 422,
        'upstream-unavailable': 502,
      };
      return failure(status[result.code] ?? 400, result.code);
    }
    if ((action === 'block' || action === 'restore') && typeof input?.['id'] === 'string') {
      const result = await skills.setBlocked(input['id'], action === 'block');
      return result === undefined ? failure(404, 'skill-not-found') : json(200, { skill: result });
    }
    return failure(400, 'invalid-admin-request');
  }
  const installId = SKILL_INSTALL_ROUTE.exec(url.pathname)?.[1];
  if (installId !== undefined) {
    if (request.method !== 'POST') return failure(405, 'method-not-allowed');
    const targetHash = (await body(request))?.['targetHash'];
    if (typeof targetHash !== 'string' || !TARGET_HASH.test(targetHash))
      return failure(400, 'invalid-receipt');
    const { protection } = deps;
    if (protection === undefined) return failure(503, 'receipts-unavailable');
    if (!(await protection.allow(await protection.source(request), 'install')))
      return failure(429, 'rate-limited', { 'retry-after': '3600' });
    const result = await skills.receipt(installId, targetHash);
    return result === undefined ? failure(404, 'skill-not-found') : json(202, result);
  }
  const files = SKILL_FILES_ROUTE.exec(url.pathname);
  if (files?.[1] !== undefined && files[2] !== undefined) {
    if (request.method !== 'GET') return failure(405, 'method-not-allowed');
    const bundle = await deps.uploads?.files(files[1], files[2]);
    return bundle === undefined
      ? failure(404, 'skill-files-unavailable')
      : new Response(bundle, {
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
          },
        });
  }
  const editing = SKILL_MINE_ROUTE.exec(url.pathname)?.[1];
  const mine = url.pathname === SKILL_MINE_PATH;
  const publishing = url.pathname === SKILL_LIST_PATH && request.method === 'POST';
  if (mine || editing !== undefined || publishing) {
    const reading = mine && request.method === 'GET';
    const removing = editing !== undefined && request.method === 'DELETE';
    const replacing = editing !== undefined && request.method === 'PUT';
    if (!reading && !removing && !replacing && !publishing)
      return failure(405, 'method-not-allowed');
    const { uploads } = deps;
    if (uploads === undefined) return failure(503, 'skills-unavailable');
    const account = await deps.account(request);
    if (account === undefined) return failure(401, 'unauthorized');
    const headers = { 'cache-control': 'no-store' };
    if (reading) return json(200, { skills: await skills.mine(account) }, headers);
    if (removing) {
      return (await uploads.remove(account, editing))
        ? json(200, { deleted: true }, headers)
        : failure(404, 'skill-not-found');
    }
    const input = await readBoundedJson(request, MAX_SKILL_PUBLISH_BODY);
    if (input.kind === 'oversize') return failure(413, 'skill-too-large');
    if (input.kind === 'invalid') return failure(400, 'invalid-skill-upload');
    const result = await uploads.write(account, input.body, editing);
    if (!result.ok) {
      const status = {
        'invalid-skill-upload': 400,
        'invalid-skill-md': 422,
        'skill-too-large': 413,
        'skill-secret-detected': 422,
        'skill-malicious-content': 422,
        'skill-not-found': 404,
        'skill-upload-limit': 409,
        'skill-upload-changed': 409,
        'author-required': 409,
        'author-changed': 409,
      }[result.code];
      return failure(status, result.code);
    }
    const skill = await skills.uploaded(account, result.id);
    return skill === undefined ? failure(404, 'skill-not-found') : json(200, { skill }, headers);
  }
  if (request.method !== 'GET') return failure(405, 'method-not-allowed');
  if (url.pathname === SKILL_LIST_PATH) {
    const q = url.searchParams.get('q') ?? undefined;
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limit = url.searchParams.get('limit');
    if (q !== undefined && q.length > MAX_QUERY) return failure(400, 'invalid-query');
    if (cursor !== undefined && !/^\d{1,6}$/u.test(cursor)) return failure(400, 'invalid-cursor');
    return json(
      200,
      await skills.list({
        ...(q === undefined ? {} : { q }),
        ...(cursor === undefined ? {} : { cursor }),
        ...(limit === null || !/^\d{1,2}$/u.test(limit) ? {} : { limit: Number(limit) }),
      }),
    );
  }
  const id = SKILL_ROUTE.exec(url.pathname)?.[1];
  const detail = id === undefined ? undefined : await skills.detail(id);
  return detail === undefined ? failure(404, 'skill-not-found') : json(200, detail);
}
