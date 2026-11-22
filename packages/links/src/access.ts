import { createMiddleware } from 'hono/factory';
import { Jwt } from 'hono/utils/jwt';
import type { HonoJsonWebKey } from 'hono/utils/jwt/types';
import type { AppEnv } from './env.js';
import { logWorker } from './worker-log.js';

export const ACCESS_HEADER = 'cf-access-jwt-assertion';
const KEYS_TTL_MS = 3_600_000;
const REFRESH_AFTER_MS = 60_000;

interface CachedKeys {
  keys: HonoJsonWebKey[];
  fetchedAt: number;
}

const keyCache = new Map<string, CachedKeys>();

export function accessTeam(domain: string): string {
  return domain
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
}

async function fetchKeys(team: string): Promise<CachedKeys> {
  const response = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error(`access certs ${response.status}`);
  const body = (await response.json()) as { keys?: HonoJsonWebKey[] };
  const cached = { keys: body.keys ?? [], fetchedAt: Date.now() };
  keyCache.set(team, cached);
  return cached;
}

async function accessKeys(team: string): Promise<CachedKeys> {
  const cached = keyCache.get(team);
  if (cached && Date.now() - cached.fetchedAt < KEYS_TTL_MS) return cached;
  return fetchKeys(team);
}

export async function verifyAccessJwt(
  token: string,
  teamDomain: string,
  audience: string,
): Promise<string | null> {
  const team = accessTeam(teamDomain);
  const verify = (keys: HonoJsonWebKey[]) =>
    Jwt.verifyWithJwks(token, {
      keys,
      verification: { iss: `https://${team}`, aud: audience },
      allowedAlgorithms: ['RS256'],
    });
  let cached = await accessKeys(team);
  let payload;
  try {
    payload = await verify(cached.keys);
  } catch {
    if (Date.now() - cached.fetchedAt < REFRESH_AFTER_MS) return null;
    cached = await fetchKeys(team);
    try {
      payload = await verify(cached.keys);
    } catch {
      return null;
    }
  }
  return typeof payload.email === 'string' && payload.email.includes('@') ? payload.email : null;
}

export function devBypassEmail(env: AppEnv['Bindings']): string | null {
  return env.ADMIN_DEV_EMAIL && !env.ACCESS_AUD ? env.ADMIN_DEV_EMAIL : null;
}

export const accessAuth = createMiddleware<AppEnv>(async (c, next) => {
  const dev = devBypassEmail(c.env);
  if (dev) {
    c.set('adminEmail', dev);
    return next();
  }
  const team = c.env.ACCESS_TEAM_DOMAIN;
  const audience = c.env.ACCESS_AUD;
  if (!team || !audience) return c.text('Admin is not configured (Cloudflare Access).', 503);
  const token = c.req.header(ACCESS_HEADER);
  if (!token) return c.text('Sign in through Cloudflare Access.', 401);
  let email: string | null;
  try {
    email = await verifyAccessJwt(token, team, audience);
  } catch (err) {
    logWorker('error', { module: 'links-worker', phase: 'access', error: String(err) });
    return c.text('Cloudflare Access keys are unavailable.', 503);
  }
  if (!email) return c.text('This Cloudflare Access session is not valid for this app.', 403);
  c.set('adminEmail', email);
  return next();
});
