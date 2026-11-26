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
    SKILL_ROUTE.test(pathname) ||
    SKILL_INSTALL_ROUTE.test(pathname) ||
    pathname === ADMIN_SKILLS_PATH
  );
}

export function isPublicSkillRead(pathname: string): boolean {
  return pathname === SKILL_LIST_PATH || SKILL_ROUTE.test(pathname);
}

export async function handleSkillRoute(
  request: Request,
  deps: {
    skills: MarketSkills | undefined;
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
