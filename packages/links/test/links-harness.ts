import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { D1Database, D1PreparedStatement, D1Value } from '../src/d1.js';
import { app, type LinksEnv } from '../src/worker.js';

export const BOOTSTRAP = 'bootstrap-secret-0123456789abcdefghijklmnop';
export const ORIGIN = 'https://go.tobs.app';

export function createLocalD1(): { db: D1Database; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(':memory:');
  const migrations = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(migrations).sort()) {
    sqlite.exec(readFileSync(new URL(file, migrations), 'utf8'));
  }
  const statement = (query: string, values: D1Value[]): D1PreparedStatement => ({
    bind: (...next) => statement(query, next),
    first: <T>() =>
      Promise.resolve(
        (sqlite.prepare(query).get(...(values as SQLInputValue[])) ?? null) as T | null,
      ),
    all: <T>() =>
      Promise.resolve({
        results: sqlite.prepare(query).all(...(values as SQLInputValue[])) as T[],
      }),
    run: () => Promise.resolve(sqlite.prepare(query).run(...(values as SQLInputValue[]))),
  });
  const db: D1Database = {
    prepare: (query) => statement(query, []),
    batch: async (statements) => {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const item of statements) results.push(await item.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { db, sqlite };
}

export function createHarness(overrides: Partial<LinksEnv> = {}) {
  const { db, sqlite } = createLocalD1();
  const env: LinksEnv = {
    LINKS_DB: db,
    LINKS_BOOTSTRAP_TOKEN: BOOTSTRAP,
    POSTHOG_HOST: 'https://us.i.posthog.com',
    POSTHOG_KEY: 'phc_test',
    ...overrides,
  };
  const pending: Promise<unknown>[] = [];
  const executionCtx = {
    waitUntil: (promise: Promise<unknown>) => {
      pending.push(promise);
    },
    passThroughOnException: () => {},
    props: {},
  };
  const request = async (
    path: string,
    init: {
      method?: string;
      token?: string;
      body?: unknown;
      userAgent?: string;
      headers?: Record<string, string>;
      origin?: string;
    } = {},
  ) => {
    const headers: Record<string, string> = { ...init.headers };
    if (init.token !== undefined) headers.authorization = `Bearer ${init.token}`;
    if (init.body !== undefined && headers['content-type'] === undefined) {
      headers['content-type'] = 'application/json';
    }
    if (init.userAgent !== undefined) headers['user-agent'] = init.userAgent;
    const response = await app.request(
      `${init.origin ?? ORIGIN}${path}`,
      {
        method: init.method ?? 'GET',
        headers,
        ...(init.body === undefined
          ? {}
          : { body: typeof init.body === 'string' ? init.body : JSON.stringify(init.body) }),
      },
      env,
      executionCtx,
    );
    await Promise.all(pending.splice(0));
    return response;
  };
  const createToken = async (scope: 'read' | 'write', expiresInDays: number | null = 90) => {
    const response = await request('/v1/tokens', {
      method: 'POST',
      token: BOOTSTRAP,
      body: { name: `${scope} token`, scope, expiresInDays },
    });
    return (await response.json()) as { id: string; token: string; prefix: string };
  };
  return { env, sqlite, request, createToken };
}
