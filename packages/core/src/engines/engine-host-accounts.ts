import {
  engineAccountKey,
  type NamedEngineAccount,
} from '@botharness/host-protocol/subscription-engine';
import { lstatSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { detectClaude, startClaudeLogin, type ClaudeStatus } from './claude-status.js';
import { CodexEngineSession, spawnCodexTransport } from './codex-engine.js';
import { detectCodex, startCodexLogin, type CodexStatus } from './codex-status.js';
import { readEngineAccount, requireSubscription, statusReport } from './engine-account.js';
import type { EngineHostOptions } from './engine-host.js';
import type { EngineStatusReport } from './engine-host-types.js';
import {
  engineQuotaLimit,
  engineQuotaView,
  recordEngineQuota,
  type EngineQuotaView,
} from './engine-quota.js';
import {
  EngineRefusal,
  type EngineChoice,
  type EngineEvent,
  type EngineId,
  type EngineModel,
  type EngineSession,
} from './engine-session.js';
import type { EngineStore, StoredEngineAccount } from './engine-store.js';

const MODELS_TTL_MS = 5 * 60_000;

export class EngineHostAccounts {
  readonly #store: EngineStore;
  readonly #options: EngineHostOptions;
  readonly #busy: (id: string) => boolean;
  readonly #openClaude: (input: { cwd: string; instructions: string }) => Promise<EngineSession>;
  readonly #models = new Map<string, { at: number; models: Promise<EngineModel[]> }>();
  readonly #statusProbes = new Map<string, Promise<CodexStatus | ClaudeStatus>>();
  readonly #readingModels = new Map<string, Promise<EngineModel[]>>();
  readonly #logins = new Map<string, AbortController>();

  constructor(
    store: EngineStore,
    options: EngineHostOptions,
    busy: (id: string) => boolean,
    openClaude: (input: { cwd: string; instructions: string }) => Promise<EngineSession>,
  ) {
    this.#store = store;
    this.#options = options;
    this.#busy = busy;
    this.#openClaude = openClaude;
  }

  close(): void {
    for (const login of this.#logins.values()) login.abort();
  }

  codex(account: StoredEngineAccount): {
    command: string;
    home: string;
    env?: Readonly<Record<string, string | undefined>>;
  } {
    return {
      command: this.#options.codexCommand ?? 'codex',
      home: this.#codexHome(account),
      ...(this.#options.env === undefined ? {} : { env: this.#options.env }),
    };
  }

  #codexHome({ homeDir }: StoredEngineAccount): string {
    let home = this.#options.root;
    for (const part of homeDir.split('/')) {
      home = join(home, part);
      const entry = lstatSync(home, { throwIfNoEntry: false });
      if (entry !== undefined && !entry.isDirectory())
        throw new EngineRefusal(
          'engine-unavailable',
          'The Codex home must be a Bot-owned directory',
        );
    }
    return home;
  }

  #requireLocal(): void {
    if (!this.#options.local)
      throw new EngineRefusal(
        'engine-unavailable',
        'Subscription Engines run only on a local Host',
      );
  }

  accounts(): { revision?: number; accounts: NamedEngineAccount[] } {
    if (!this.#options.local) return { accounts: [] };
    const { revision, accounts } = this.#store.accounts();
    return { revision, accounts: accounts.map(({ id, engine, name }) => ({ id, engine, name })) };
  }

  resolveAccount(engine: EngineId, accountId?: string): NamedEngineAccount {
    this.#requireLocal();
    return this.#store.resolveAccount(engine, accountId);
  }

  target(id: string): StoredEngineAccount {
    if (id !== 'claude' && id !== 'codex' && !id.startsWith('codex-'))
      throw new EngineRefusal('unknown-engine', `Unknown Subscription Engine or account: ${id}`);
    this.#requireLocal();
    return this.#store.resolveAccount(
      id === 'claude' ? 'claude' : 'codex',
      id === 'codex' ? undefined : id,
    );
  }

  addAccount(name: string, expectedRevision: number): NamedEngineAccount {
    this.#requireLocal();
    const { id, engine, name: displayName } = this.#store.addAccount(name, expectedRevision);
    this.#options.accountsChanged?.();
    return { id, engine, name: displayName };
  }

  renameAccount(id: string, name: string, expectedRevision: number): NamedEngineAccount {
    this.#requireLocal();
    const { engine, name: displayName } = this.#store.renameAccount(id, name, expectedRevision);
    this.#options.accountsChanged?.();
    return { id, engine, name: displayName };
  }

  removeAccount(id: string, expectedRevision: number): { id: string; homeCleanupPending?: true } {
    this.#requireLocal();
    if (this.#store.accounts().revision !== expectedRevision)
      throw new EngineRefusal(
        'engine-account-conflict',
        'Subscription accounts changed. Read them again.',
      );
    const account = this.#store.resolveAccount('codex', id);
    const home = this.#codexHome(account);
    this.#store.removeAccount(id, expectedRevision, () => {
      const references = [
        ...this.#store
          .selections()
          .flatMap((row) =>
            row.engine === 'codex' && engineAccountKey(row.engine, row.accountId) === id
              ? [`Bot ${row.botSlug} (${row.role})`]
              : [],
          ),
        ...(this.#options.accountUses?.(id) ?? []),
      ];
      if (references.length > 0)
        throw new EngineRefusal('engine-account-in-use', references.join(', '), references);
      if (
        this.#statusProbes.has(id) ||
        this.#readingModels.has(id) ||
        this.#logins.has(id) ||
        this.#busy(id)
      )
        throw new EngineRefusal(
          'engine-account-busy',
          'The subscription account is still running. Try again after it stops.',
        );
    });
    this.#models.delete(id);
    this.#options.accountsChanged?.();
    try {
      rmSync(home, { recursive: true, force: true });
      return { id };
    } catch {
      return { id, homeCleanupPending: true };
    }
  }

  claude(): {
    command: string;
    home: string;
    env?: Readonly<Record<string, string | undefined>>;
  } {
    return {
      command: this.#options.claudeCommand ?? 'claude',
      home: join(this.#options.root, 'claude', 'home'),
      ...(this.#options.env === undefined ? {} : { env: this.#options.env }),
    };
  }

  limit(engine: EngineId, accountId?: string): { account: string; until: string } | undefined {
    return engineQuotaLimit(engine, this.#store.quota(engine, accountId), this.#now());
  }

  quota(engine: EngineId, accountId?: string): EngineQuotaView | undefined {
    return engineQuotaView(engine, this.#store.quota(engine, accountId), this.#now());
  }

  #now(): number {
    return (this.#options.now ?? Date.now)();
  }

  record(
    engine: EngineId,
    accountId: string,
    account: string,
    event: Extract<EngineEvent, { kind: 'rate-limit' }>,
  ) {
    this.#store.rememberQuota(
      engine,
      recordEngineQuota(account, event, this.#store.quota(engine, accountId), this.#now()),
      accountId,
    );
  }

  #codexStatus(account: StoredEngineAccount): Promise<CodexStatus | ClaudeStatus> {
    const current = this.#statusProbes.get(account.id);
    if (current !== undefined) return current;
    const probe = probeStatus(() =>
      (this.#options.detectCodex ?? detectCodex)(this.codex(account)),
    ).finally(() => this.#statusProbes.delete(account.id));
    this.#statusProbes.set(account.id, probe);
    return probe;
  }

  async status(target?: string): Promise<EngineStatusReport[]> {
    if (!this.#options.local && target === undefined) return [];
    const accounts = target === undefined ? this.#store.accounts().accounts : [this.target(target)];
    return Promise.all(
      accounts.map(async (account) => {
        const { id, engine, name } = account;
        if (engine === 'claude') {
          const detected = await probeStatus(() =>
            (this.#options.detectClaude ?? detectClaude)(this.claude()),
          );
          return statusReport(engine, detected, 'subscription', this.quota(engine));
        }
        const detected = await this.#codexStatus(account);
        return {
          ...statusReport(engine, detected, 'chatgpt', this.quota(engine, id)),
          accountId: id,
          accountName: name,
        };
      }),
    );
  }

  async login(
    engine: EngineId,
    accountId?: string,
  ): Promise<{ engine: EngineId; started: true; url?: string }> {
    this.#requireLocal();
    const account = this.#store.resolveAccount(engine, accountId);
    if (engine === 'claude')
      return {
        engine,
        started: true,
        ...(await (this.#options.startClaudeLogin ?? startClaudeLogin)(this.claude())),
      };
    if (this.#logins.has(account.id))
      throw new EngineRefusal(
        'engine-account-busy',
        'Sign-in has already started for this account',
      );
    const controller = new AbortController();
    this.#logins.set(account.id, controller);
    this.#models.delete(account.id);
    const onExit = () => {
      if (this.#logins.get(account.id) === controller) this.#logins.delete(account.id);
      this.#models.delete(account.id);
    };
    try {
      const started = await (this.#options.startCodexLogin ?? startCodexLogin)({
        ...this.codex(account),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(3 * 60_000)]),
        onExit,
      });
      if (this.#options.startCodexLogin !== undefined) onExit();
      return { engine, started: true, ...started };
    } catch (error) {
      onExit();
      throw error;
    }
  }

  async validateChoice(engine: EngineId, choice: EngineChoice): Promise<void> {
    const models = await this.models(engine, choice.accountId);
    if (choice.model === undefined && choice.effort === undefined) return;
    const picked =
      choice.model === undefined
        ? (models.find((entry) => entry.isDefault === true) ?? models[0])
        : models.find((entry) => entry.id === choice.model);
    if (picked === undefined)
      throw new EngineRefusal(
        'unknown-model',
        `${choice.model ?? 'The default model'} is not offered by this ${engine} subscription. List them with deepseekbot engine models ${engine}`,
      );
    if (
      choice.effort !== undefined &&
      !picked.efforts.some((option) => option.id === choice.effort)
    )
      throw new EngineRefusal(
        'unknown-effort',
        picked.efforts.length === 0
          ? `${picked.id} takes no effort level`
          : `${picked.id} takes effort ${picked.efforts.map((option) => option.id).join(', ')}`,
      );
  }

  async models(engine: EngineId, accountId?: string): Promise<EngineModel[]> {
    this.#requireLocal();
    const account = this.#store.resolveAccount(engine, accountId);
    const { id } = account;
    const cached = this.#models.get(id);
    if (cached !== undefined && this.#now() - cached.at < MODELS_TTL_MS) return cached.models;
    const reading = this.#readingModels.get(id);
    if (reading !== undefined) return reading;
    const models = this.#listModels(account).finally(() => this.#readingModels.delete(id));
    this.#readingModels.set(id, models);
    const entry = { at: this.#now(), models };
    this.#models.set(id, entry);
    models.catch(() => {
      if (this.#models.get(id) === entry) this.#models.delete(id);
    });
    return models;
  }

  async #listModels(account: StoredEngineAccount): Promise<EngineModel[]> {
    const cwd = join(this.#options.root, 'workdirs', '.models');
    mkdirSync(cwd, { recursive: true });
    const session =
      account.engine === 'codex'
        ? new CodexEngineSession(
            (this.#options.openCodex ?? spawnCodexTransport)({ ...this.codex(account), cwd }),
            { cwd, instructions: '' },
          )
        : await this.#openClaude({ cwd, instructions: '' });
    try {
      requireSubscription(await readEngineAccount(session), account.id);
      return await session.models();
    } finally {
      await session.close().catch(() => undefined);
    }
  }
}

async function probeStatus(detect: () => Promise<CodexStatus | ClaudeStatus>) {
  try {
    return await detect();
  } catch {
    return { installed: true, login: 'unknown' } satisfies CodexStatus | ClaudeStatus;
  }
}
