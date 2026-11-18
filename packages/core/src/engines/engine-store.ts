import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { type EngineId, type EngineQuota, isEngineId } from './engine-session.js';

export type EngineRole = 'orchestrator';

interface EngineFile {
  version: 1;
  bots: Record<
    string,
    {
      orchestrator?: EngineId;
      fallback?: true;
      accounts?: Partial<Record<EngineId, string>>;
      models?: Partial<Record<EngineId, string>>;
    }
  >;
  sessions: Record<string, { engine: EngineId; nativeId: string; account?: string }>;
  quota?: Partial<Record<EngineId, EngineQuota>>;
}

export interface EngineStore {
  selection(botSlug: string, role: EngineRole): EngineId | undefined;
  select(
    botSlug: string,
    role: EngineRole,
    engine: EngineId | undefined,
    options?: { fallback?: boolean },
  ): void;
  fallback(botSlug: string, role: EngineRole): boolean;
  account(botSlug: string, engine: EngineId): string | undefined;
  rememberAccount(botSlug: string, engine: EngineId, account: string): void;
  model(botSlug: string, engine: EngineId): string | undefined;
  rememberModel(botSlug: string, engine: EngineId, model: string): void;
  selections(): Array<{ botSlug: string; role: EngineRole; engine: EngineId; fallback: boolean }>;
  quota(engine: EngineId): EngineQuota | undefined;
  rememberQuota(engine: EngineId, quota: EngineQuota): void;
  nativeSession(
    sessionId: string,
  ): { engine: EngineId; nativeId: string; account?: string } | undefined;
  rememberNativeSession(
    sessionId: string,
    engine: EngineId,
    nativeId: string,
    account: string,
  ): void;
}

function empty(): EngineFile {
  return { version: 1, bots: {}, sessions: {} };
}

type Fields = Record<string, unknown>;

const fields = (value: unknown): Fields | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Fields)
    : undefined;

function parse(text: string, path: string): EngineFile {
  const value = fields(JSON.parse(text));
  if (value?.['version'] !== 1)
    throw new Error(
      `${path} is not a version 1 engine selection file. Move it aside to reset the Subscription Engine choices.`,
    );
  const file = empty();
  for (const [slug, roles] of Object.entries(fields(value['bots']) ?? {})) {
    const orchestrator = fields(roles)?.['orchestrator'];
    const accounts: Partial<Record<EngineId, string>> = {};
    for (const [engine, account] of Object.entries(fields(fields(roles)?.['accounts']) ?? {}))
      if (isEngineId(engine) && typeof account === 'string' && account.trim())
        accounts[engine] = account;
    const models: Partial<Record<EngineId, string>> = {};
    for (const [engine, model] of Object.entries(fields(fields(roles)?.['models']) ?? {}))
      if (isEngineId(engine) && typeof model === 'string' && model.trim()) models[engine] = model;
    file.bots[slug] = {
      ...(isEngineId(orchestrator) ? { orchestrator } : {}),
      ...(isEngineId(orchestrator) && fields(roles)?.['fallback'] === true
        ? { fallback: true as const }
        : {}),
      accounts,
      models,
    };
  }
  for (const [engine, raw] of Object.entries(fields(value['quota']) ?? {})) {
    const quota = parseQuota(raw);
    if (isEngineId(engine) && quota !== undefined) (file.quota ??= {})[engine] = quota;
  }
  for (const [id, raw] of Object.entries(fields(value['sessions']) ?? {})) {
    const entry = fields(raw);
    const engine = entry?.['engine'];
    const nativeId = entry?.['nativeId'];
    const account = entry?.['account'];
    if (isEngineId(engine) && typeof nativeId === 'string')
      file.sessions[id] = { engine, nativeId, ...(typeof account === 'string' ? { account } : {}) };
  }
  return file;
}

function parseQuota(raw: unknown): EngineQuota | undefined {
  const entry = fields(raw);
  if (typeof entry?.['limited'] !== 'boolean' || typeof entry['observedAt'] !== 'string')
    return undefined;
  const { account, usedPercent, resetsAt } = entry;
  return {
    ...(typeof account === 'string' ? { account } : {}),
    ...(typeof usedPercent === 'number' && Number.isFinite(usedPercent) ? { usedPercent } : {}),
    ...(typeof resetsAt === 'string' ? { resetsAt } : {}),
    limited: entry['limited'],
    observedAt: entry['observedAt'],
  };
}

export function createEngineStore(path: string): EngineStore {
  let cache: EngineFile | undefined;
  const read = (): EngineFile => {
    if (cache !== undefined) return cache;
    cache = existsSync(path) ? parse(readFileSync(path, 'utf8'), path) : empty();
    return cache;
  };
  const write = (file: EngineFile) => {
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, path);
    cache = file;
  };
  return {
    selection: (botSlug) => read().bots[botSlug]?.orchestrator,
    select: (botSlug, _role, engine, options) => {
      const file = structuredClone(read());
      const entry = file.bots[botSlug] ?? {};
      if (engine === undefined) {
        delete entry.orchestrator;
        delete entry.fallback;
      } else {
        entry.orchestrator = engine;
        if (options?.fallback === true) entry.fallback = true;
        else delete entry.fallback;
      }
      file.bots[botSlug] = entry;
      write(file);
    },
    account: (botSlug, engine) => read().bots[botSlug]?.accounts?.[engine],
    rememberAccount: (botSlug, engine, account) => {
      const file = structuredClone(read());
      const entry = (file.bots[botSlug] ??= {});
      (entry.accounts ??= {})[engine] = account;
      write(file);
    },
    model: (botSlug, engine) => read().bots[botSlug]?.models?.[engine],
    rememberModel: (botSlug, engine, model) => {
      const file = structuredClone(read());
      const entry = (file.bots[botSlug] ??= {});
      (entry.models ??= {})[engine] = model;
      write(file);
    },
    fallback: (botSlug) => read().bots[botSlug]?.fallback === true,
    selections: () =>
      Object.entries(read().bots).flatMap(([botSlug, roles]) =>
        roles.orchestrator === undefined
          ? []
          : [
              {
                botSlug,
                role: 'orchestrator' as const,
                engine: roles.orchestrator,
                fallback: roles.fallback === true,
              },
            ],
      ),
    quota: (engine) => read().quota?.[engine],
    rememberQuota: (engine, quota) => {
      const file = structuredClone(read());
      (file.quota ??= {})[engine] = quota;
      write(file);
    },
    nativeSession: (sessionId) => read().sessions[sessionId],
    rememberNativeSession: (sessionId, engine, nativeId, account) => {
      const file = structuredClone(read());
      file.sessions[sessionId] = { engine, nativeId, account };
      write(file);
    },
  };
}

export function engineStorePath(root: string): string {
  return join(root, 'engines.json');
}
