import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { type EngineId, isEngineId } from './engine-session.js';

export type EngineRole = 'orchestrator';

interface EngineFile {
  version: 1;
  bots: Record<string, { orchestrator?: EngineId }>;
  sessions: Record<string, { engine: EngineId; nativeId: string; account?: string }>;
}

export interface EngineStore {
  selection(botSlug: string, role: EngineRole): EngineId | undefined;
  select(botSlug: string, role: EngineRole, engine: EngineId | undefined): void;
  selections(): Array<{ botSlug: string; role: EngineRole; engine: EngineId }>;
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

function parse(text: string): EngineFile {
  const value = JSON.parse(text) as Partial<EngineFile>;
  const file = empty();
  for (const [slug, roles] of Object.entries(value.bots ?? {}))
    if (isEngineId(roles?.orchestrator)) file.bots[slug] = { orchestrator: roles.orchestrator };
  for (const [id, entry] of Object.entries(value.sessions ?? {}))
    if (isEngineId(entry?.engine) && typeof entry.nativeId === 'string')
      file.sessions[id] = {
        engine: entry.engine,
        nativeId: entry.nativeId,
        ...(typeof entry.account === 'string' ? { account: entry.account } : {}),
      };
  return file;
}

export function createEngineStore(path: string): EngineStore {
  let cache: EngineFile | undefined;
  const read = (): EngineFile => {
    if (cache !== undefined) return cache;
    cache = existsSync(path) ? parse(readFileSync(path, 'utf8')) : empty();
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
    select: (botSlug, _role, engine) => {
      const file = structuredClone(read());
      if (engine === undefined) delete file.bots[botSlug];
      else file.bots[botSlug] = { orchestrator: engine };
      write(file);
    },
    selections: () =>
      Object.entries(read().bots).flatMap(([botSlug, roles]) =>
        roles.orchestrator === undefined
          ? []
          : [{ botSlug, role: 'orchestrator' as const, engine: roles.orchestrator }],
      ),
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
