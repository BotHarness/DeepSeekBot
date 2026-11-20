import { randomUUID } from 'node:crypto';
import {
  DEFAULT_CODEX_ACCOUNT,
  engineAccountKey,
  type NamedEngineAccount,
} from '@botharness/host-protocol/subscription-engine';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  type EngineChoice,
  type EngineId,
  type EngineQuota,
  isEngineId,
  EngineRefusal,
} from './engine-session.js';

export type EngineRole = 'orchestrator' | 'assignment';

interface EngineFile {
  version: 1;
  bots: Record<string, BotEngine>;
  sessions: Record<string, EngineThread>;
  quota?: Record<string, EngineQuota>;
  subscriptionAccounts?: AccountSettings;
}

export interface StoredEngineAccount extends NamedEngineAccount {
  homeDir: string;
}

interface AccountSettings {
  revision: number;
  accounts: StoredEngineAccount[];
}

function codexAccount(id: string, name: string): StoredEngineAccount {
  return {
    id,
    name,
    engine: 'codex',
    homeDir: id === DEFAULT_CODEX_ACCOUNT ? 'codex/home' : `codex/accounts/${id}`,
  };
}

const claudeAccount: StoredEngineAccount = {
  id: 'claude',
  name: 'Claude Code',
  engine: 'claude',
  homeDir: 'claude/home',
};

function legacyAccounts(): AccountSettings {
  return { revision: 0, accounts: [codexAccount(DEFAULT_CODEX_ACCOUNT, 'Codex')] };
}

function parseAccounts(raw: unknown): AccountSettings {
  const settings = fields(raw);
  const revision = settings?.['revision'];
  const accounts = settings?.['accounts'];
  if (
    typeof revision !== 'number' ||
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    !Array.isArray(accounts)
  )
    throw new Error('Invalid Subscription Account settings');
  const seen = new Set<string>();
  return {
    revision,
    accounts: accounts.map((value: unknown) => {
      const row = fields(value);
      const id = row?.['id'];
      const name = row?.['name'];
      if (
        typeof id !== 'string' ||
        !/^codex-(?:default|[\da-f-]{36})$/u.test(id) ||
        typeof name !== 'string' ||
        name.trim() === '' ||
        row?.['engine'] !== 'codex' ||
        seen.has(id)
      )
        throw new Error('Invalid Codex account settings');
      seen.add(id);
      return codexAccount(id, name);
    }),
  };
}

interface EngineThread {
  engine: EngineId;
  nativeId: string;
  account?: string;
  accountId?: string;
  lastTurn?: number;
}

interface AssignmentEngine extends EngineChoice {
  engine: EngineId;
}

interface BotEngine extends EngineChoice {
  orchestrator?: EngineId;
  assignment?: AssignmentEngine;
  fallback?: true;
  accounts?: Partial<Record<EngineId, string>>;
  models?: Partial<Record<EngineId, string>>;
}

export interface EngineSelection extends EngineChoice {
  botSlug: string;
  role: EngineRole;
  engine: EngineId;
  fallback: boolean;
}

export interface EngineStore {
  selection(botSlug: string, role: EngineRole): EngineId | undefined;
  select(
    botSlug: string,
    role: EngineRole,
    engine: EngineId | undefined,
    options?: { fallback?: boolean } & EngineChoice,
  ): void;
  fallback(botSlug: string, role: EngineRole): boolean;
  choice(botSlug: string, role: EngineRole): EngineChoice;
  account(botSlug: string, engine: EngineId): string | undefined;
  rememberAccount(botSlug: string, engine: EngineId, account: string): void;
  model(botSlug: string, engine: EngineId): string | undefined;
  rememberModel(botSlug: string, engine: EngineId, model: string): void;
  selections(): EngineSelection[];
  accounts(): AccountSettings;
  resolveAccount(engine: EngineId, accountId?: string): StoredEngineAccount;
  addAccount(name: string, expectedRevision: number): NamedEngineAccount;
  renameAccount(id: string, name: string, expectedRevision: number): NamedEngineAccount;
  removeAccount(
    id: string,
    expectedRevision: number,
    assertUnused: () => void,
  ): StoredEngineAccount;
  quota(engine: EngineId, accountId?: string): EngineQuota | undefined;
  rememberQuota(engine: EngineId, quota: EngineQuota, accountId?: string): void;
  nativeSession(sessionId: string): EngineThread | undefined;
  rememberNativeSession(
    sessionId: string,
    engine: EngineId,
    nativeId: string,
    account: string,
    lastTurn?: number,
    accountId?: string,
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
  if (value['subscriptionAccounts'] !== undefined)
    file.subscriptionAccounts = parseAccounts(value['subscriptionAccounts']);
  const accountIds = new Set(
    (file.subscriptionAccounts ?? legacyAccounts()).accounts.map(({ id }) => id),
  );
  for (const [slug, roles] of Object.entries(fields(value['bots']) ?? {})) {
    const entry = fields(roles);
    const orchestrator = entry?.['orchestrator'];
    const accounts: Partial<Record<EngineId, string>> = {};
    for (const [engine, account] of Object.entries(fields(entry?.['accounts']) ?? {}))
      if (isEngineId(engine) && typeof account === 'string' && account.trim())
        accounts[engine] = account;
    const models: Partial<Record<EngineId, string>> = {};
    for (const [engine, model] of Object.entries(fields(entry?.['models']) ?? {}))
      if (isEngineId(engine) && typeof model === 'string' && model.trim()) models[engine] = model;
    const assignment = fields(entry?.['assignment']);
    const assignmentEngine = assignment?.['engine'];
    file.bots[slug] = {
      ...(isEngineId(orchestrator) ? { orchestrator } : {}),
      ...(isEngineId(assignmentEngine)
        ? { assignment: { engine: assignmentEngine, ...choiceOf(assignment) } }
        : {}),
      ...(isEngineId(orchestrator) && entry?.['fallback'] === true
        ? { fallback: true as const }
        : {}),
      ...(isEngineId(orchestrator) ? choiceOf(entry) : {}),
      accounts,
      models,
    };
  }
  for (const [engine, raw] of Object.entries(fields(value['quota']) ?? {})) {
    const quota = parseQuota(raw);
    const id = engine === 'codex' ? DEFAULT_CODEX_ACCOUNT : engine;
    if ((id === 'claude' || accountIds.has(id)) && quota !== undefined)
      (file.quota ??= {})[id] = quota;
  }
  for (const [id, raw] of Object.entries(fields(value['sessions']) ?? {})) {
    const entry = fields(raw);
    const engine = entry?.['engine'];
    const nativeId = entry?.['nativeId'];
    const account = entry?.['account'];
    const lastTurn = entry?.['lastTurn'];
    if (isEngineId(engine) && typeof nativeId === 'string')
      file.sessions[id] = {
        engine,
        nativeId,
        ...(typeof account === 'string' ? { account } : {}),
        ...(typeof entry?.['accountId'] === 'string' ? { accountId: entry['accountId'] } : {}),
        ...(typeof lastTurn === 'number' && Number.isSafeInteger(lastTurn) && lastTurn > 0
          ? { lastTurn }
          : {}),
      };
  }
  return file;
}

function choiceOf(entry: Fields | undefined): EngineChoice {
  const model = entry?.['model'];
  const effort = entry?.['effort'];
  const accountId = entry?.['accountId'];
  return {
    ...(typeof model === 'string' && model !== '' ? { model } : {}),
    ...(typeof effort === 'string' && effort !== '' ? { effort } : {}),
    ...(typeof accountId === 'string' && accountId !== '' ? { accountId } : {}),
  };
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
    file.subscriptionAccounts ??= legacyAccounts();
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, path);
    cache = file;
  };
  const writeAccounts = (file: EngineFile) => {
    try {
      write(file);
    } catch {
      throw new EngineRefusal(
        'engine-account-write-failed',
        'Could not save subscription accounts',
      );
    }
  };
  const settings = () => read().subscriptionAccounts ?? legacyAccounts();
  const editAccounts = (expectedRevision: number) => {
    const current = settings();
    if (current.revision !== expectedRevision)
      throw new EngineRefusal(
        'engine-account-conflict',
        'Subscription accounts changed. Read them again.',
      );
    return { revision: current.revision + 1, accounts: [...current.accounts] };
  };
  const resolveAccount = (engine: EngineId, accountId?: string): StoredEngineAccount => {
    const id = engineAccountKey(engine, accountId);
    const account =
      engine === 'claude'
        ? id === claudeAccount.id
          ? claudeAccount
          : undefined
        : settings().accounts.find((row) => row.id === id);
    if (account === undefined)
      throw new EngineRefusal(
        'engine-account-not-found',
        `Subscription account ${id} was not found`,
      );
    return account;
  };
  return {
    selection: (botSlug, role) =>
      role === 'assignment'
        ? read().bots[botSlug]?.assignment?.engine
        : read().bots[botSlug]?.orchestrator,
    select: (botSlug, role, engine, options) => {
      const file = structuredClone(read());
      const entry = file.bots[botSlug] ?? {};
      if (role === 'assignment') {
        if (engine === undefined) delete entry.assignment;
        else entry.assignment = { engine, ...choiceOf(options as Fields | undefined) };
        file.bots[botSlug] = entry;
        write(file);
        return;
      }
      delete entry.model;
      delete entry.effort;
      delete entry.accountId;
      if (engine === undefined) {
        delete entry.orchestrator;
        delete entry.fallback;
      } else {
        entry.orchestrator = engine;
        if (options?.fallback === true) entry.fallback = true;
        else delete entry.fallback;
        Object.assign(entry, choiceOf(options as Fields | undefined));
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
    fallback: (botSlug, role) => role === 'orchestrator' && read().bots[botSlug]?.fallback === true,
    choice: (botSlug, role) => {
      const entry = read().bots[botSlug];
      return choiceOf((role === 'assignment' ? entry?.assignment : entry) as Fields | undefined);
    },
    selections: () =>
      Object.entries(read().bots).flatMap(([botSlug, roles]): EngineSelection[] => [
        ...(roles.orchestrator === undefined
          ? []
          : [
              {
                botSlug,
                role: 'orchestrator' as const,
                engine: roles.orchestrator,
                fallback: roles.fallback === true,
                ...choiceOf(roles as Fields),
              },
            ]),
        ...(roles.assignment === undefined
          ? []
          : [
              {
                botSlug,
                role: 'assignment' as const,
                engine: roles.assignment.engine,
                fallback: false,
                ...choiceOf(roles.assignment as unknown as Fields),
              },
            ]),
      ]),
    accounts: () => {
      const { revision, accounts } = settings();
      return { revision, accounts: [...accounts, claudeAccount] };
    },
    resolveAccount,
    addAccount: (name, expectedRevision) => {
      const subscriptionAccounts = editAccounts(expectedRevision);
      const account = codexAccount(`codex-${randomUUID()}`, name);
      subscriptionAccounts.accounts.push(account);
      writeAccounts({ ...read(), subscriptionAccounts });
      return account;
    },
    renameAccount: (id, name, expectedRevision) => {
      const subscriptionAccounts = editAccounts(expectedRevision);
      resolveAccount('codex', id);
      const renamed = codexAccount(id, name);
      subscriptionAccounts.accounts = subscriptionAccounts.accounts.map((row) =>
        row.id === id ? renamed : row,
      );
      writeAccounts({ ...read(), subscriptionAccounts });
      return renamed;
    },
    removeAccount: (id, expectedRevision, assertUnused) => {
      const subscriptionAccounts = editAccounts(expectedRevision);
      const removed = resolveAccount('codex', id);
      assertUnused();
      subscriptionAccounts.accounts = subscriptionAccounts.accounts.filter((row) => row.id !== id);
      const quota = { ...read().quota };
      delete quota[id];
      writeAccounts({ ...read(), quota, subscriptionAccounts });
      return removed;
    },
    quota: (engine, accountId) => read().quota?.[engineAccountKey(engine, accountId)],
    rememberQuota: (engine, quota, accountId) => {
      const file = structuredClone(read());
      (file.quota ??= {})[engineAccountKey(engine, accountId)] = quota;
      write(file);
    },
    nativeSession: (sessionId) => read().sessions[sessionId],
    rememberNativeSession: (sessionId, engine, nativeId, account, lastTurn, accountId) => {
      const file = structuredClone(read());
      file.sessions[sessionId] = {
        engine,
        nativeId,
        account,
        ...(accountId === undefined ? {} : { accountId }),
        ...(lastTurn === undefined ? {} : { lastTurn }),
      };
      write(file);
    },
  };
}

export function engineStorePath(root: string): string {
  return join(root, 'engines.json');
}
