import type { D1Database } from './d1.js';
import type { Scope } from './schemas.js';
import type { Store } from './store.js';

export interface LinksEnv {
  LINKS_DB: D1Database;
  LINKS_BOOTSTRAP_TOKEN?: string;
  POSTHOG_HOST?: string;
  POSTHOG_KEY?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ADMIN_DEV_EMAIL?: string;
  ADMIN_ORIGIN?: string;
  ASSETS?: { fetch(request: Request): Promise<Response> };
}

export type Principal = { kind: 'bootstrap' } | { kind: 'token'; id: string; scope: Scope };

export type AppEnv = {
  Bindings: LinksEnv;
  Variables: { principal: Principal; store: Store; adminEmail: string };
};
