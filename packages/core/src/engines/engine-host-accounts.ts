import {
  engineAccountKey,
  type NamedEngineAccount,
} from '@botharness/host-protocol/subscription-engine';
import { lstatSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import {
  CLAUDE_MIN_VERSION,
  type ClaudeEngineOptions,
  ClaudeEngineSession,
  olderThan,
  sdkClaudeQuery,
} from './claude-engine.js';
import { resolveEngineCommand } from './engine-launch.js';
import { detectClaude, startClaudeLogin, type ClaudeStatus } from './claude-status.js';
import { CodexEngineSession, spawnCodexTransport } from './codex-engine.js';
import { detectCodex, startCodexLogin, type CodexStatus } from './codex-status.js';
import { readEngineAccount, requireSubscription, statusReport } from './engine-account.js';
import type { EngineLoginCodeInput } from './engine-command.js';
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
  requireOfferedEngineChoice,
  type EngineChoice,
  type EngineEvent,
  type EngineId,
  type EngineModel,
} from './engine-session.js';
import type { EngineStore, StoredEngineAccount } from './engine-store.js';

const MODELS_TTL_MS = 5 * 60_000;

interface AccountLogin {
  controller: AbortController;
  closed: Promise<void>;
  submitCode?: EngineLoginCodeInput;
}

export class EngineHostAccounts {
  readonly #store: EngineStore;
  readonly #options: EngineHostOptions;
  readonly #busy: (id: string) => boolean;
  readonly #models = new Map<string, { at: number; models: Promise<EngineModel[]> }>();
  readonly #statusProbes = new Map<string, Promise<CodexStatus | ClaudeStatus>>();
  readonly #readingModels = new Map<string, Promise<EngineModel[]>>();
  readonly #logins = new Map<string, AccountLogin>();

  constructor(store: EngineStore, options: EngineHostOptions, busy: (id: string) => boolean) {
    this.#store = store;
    this.#options = options;
    this.#busy = busy;
  }

  async close(): Promise<void> {
    const logins = [...this.#logins.values()];
    for (const login of logins) login.controller.abort();
    await Promise.all(logins.map(({ closed }) => closed));
  }

  codex(account: StoredEngineAccount): {
    command: string;
    home: string;
    env?: Readonly<Record<string, string | undefined>>;
  } {
    return {
      command: this.#options.codexCommand ?? 'codex',
      home: this.#accountHome(account),
      ...(this.#options.env === undefined ? {} : { env: this.#options.env }),
    };
  }

  #accountHome({ homeDir }: StoredEngineAccount): string {
    let home = this.#options.root;
    for (const part of homeDir.split('/')) {
      home = join(home, part);
      const entry = lstatSync(home, { throwIfNoEntry: false });
      if (entry !== undefined && !entry.isDirectory())
        throw new EngineRefusal(
          'engine-unavailable',
          'The subscription account home must be a Bot-owned directory',
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
    if (id !== 'claude' && id !== 'codex' && !/^(?:codex|claude)-/u.test(id))
      throw new EngineRefusal('unknown-engine', `Unknown Subscription Engine or account: ${id}`);
    this.#requireLocal();
    return this.#store.accountById(id === 'codex' ? engineAccountKey('codex') : id);
  }

  addAccount(engine: EngineId, name: string, expectedRevision: number): NamedEngineAccount {
    this.#requireLocal();
    const { id, name: displayName } = this.#store.addAccount(engine, name, expectedRevision);
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
    const account = this.#store.accountById(id);
    const home = this.#accountHome(account);
    this.#store.removeAccount(id, expectedRevision, () => {
      const references = [
        ...this.#store
          .selections()
          .flatMap((row) =>
            row.engine === account.engine && engineAccountKey(row.engine, row.accountId) === id
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

  #claude(account: StoredEngineAccount): {
    command: string;
    home: string;
    env?: Readonly<Record<string, string | undefined>>;
  } {
    return {
      command: this.#options.claudeCommand ?? 'claude',
      home: this.#accountHome(account),
      ...(this.#options.env === undefined ? {} : { env: this.#options.env }),
    };
  }

  async openClaudeSession(
    account: StoredEngineAccount,
    options: { cwd: string; instructions: string; resume?: string } & Pick<
      ClaudeEngineOptions,
      'gateway' | 'model' | 'effort' | 'permissionMode' | 'contextSeed' | 'workspaceMode'
    >,
  ): Promise<ClaudeEngineSession> {
    const claude = this.#claude(account);
    const executable = resolveEngineCommand(claude.command, { env: claude.env ?? process.env });
    if (executable === undefined)
      throw new EngineRefusal(
        'engine-not-installed',
        'Claude Code is not installed on this computer',
      );
    const { version } = await (this.#options.detectClaude ?? detectClaude)({
      ...claude,
      command: executable,
    });
    if (version === undefined || olderThan(version, CLAUDE_MIN_VERSION))
      throw new EngineRefusal(
        'engine-unavailable',
        `Claude Code ${version ?? 'of an unknown version'} cannot run a Bot here. Update it to ${CLAUDE_MIN_VERSION} or newer`,
      );
    return new ClaudeEngineSession({
      query: this.#options.openClaude ?? sdkClaudeQuery,
      executable,
      home: claude.home,
      ...(claude.env === undefined ? {} : { env: claude.env }),
      ...options,
    });
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

  #probeStatus(account: StoredEngineAccount): Promise<CodexStatus | ClaudeStatus> {
    const current = this.#statusProbes.get(account.id);
    if (current !== undefined) return current;
    const probe = probeStatus(() =>
      account.engine === 'codex'
        ? (this.#options.detectCodex ?? detectCodex)(this.codex(account))
        : (this.#options.detectClaude ?? detectClaude)(this.#claude(account)),
    ).finally(() => this.#statusProbes.delete(account.id));
    this.#statusProbes.set(account.id, probe);
    return probe;
  }

  async status(
    target?: string,
    allowed?: (accountId: string) => boolean,
  ): Promise<EngineStatusReport[]> {
    if (!this.#options.local && target === undefined) return [];
    const accounts = target === undefined ? this.#store.accounts().accounts : [this.target(target)];
    return Promise.all(
      accounts
        .filter(({ id }) => allowed?.(id) ?? true)
        .map(async (account) => {
          const { id, engine, name } = account;
          const detected = await this.#probeStatus(account);
          return {
            ...statusReport(
              engine,
              detected,
              engine === 'codex' ? 'chatgpt' : 'subscription',
              this.quota(engine, id),
            ),
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
    if (this.#logins.has(account.id))
      throw new EngineRefusal(
        'engine-account-busy',
        'Sign-in has already started for this account',
      );
    let resolveClosed!: () => void;
    const closed = new Promise<void>((resolve) => {
      resolveClosed = resolve;
    });
    const login: AccountLogin = { controller: new AbortController(), closed };
    this.#logins.set(account.id, login);
    this.#models.delete(account.id);
    const onExit = () => {
      if (this.#logins.get(account.id) === login) {
        this.#logins.delete(account.id);
        this.#models.delete(account.id);
      }
      resolveClosed();
    };
    try {
      const process = {
        signal: AbortSignal.any([login.controller.signal, AbortSignal.timeout(3 * 60_000)]),
        onExit,
      };
      const started =
        engine === 'codex'
          ? await (this.#options.startCodexLogin ?? startCodexLogin)({
              ...this.codex(account),
              ...process,
            })
          : await (this.#options.startClaudeLogin ?? startClaudeLogin)({
              ...this.#claude(account),
              ...process,
              onCodeInput: (submit) => (login.submitCode = submit),
            });
      const injected =
        engine === 'codex' ? this.#options.startCodexLogin : this.#options.startClaudeLogin;
      if (injected !== undefined) onExit();
      return { engine, started: true, ...started };
    } catch (error) {
      onExit();
      throw error;
    }
  }

  async cancelLogin(id: string): Promise<{ cancelled: boolean }> {
    const account = this.target(id);
    const login = this.#logins.get(account.id);
    if (login === undefined) return { cancelled: false };
    login.controller.abort();
    await login.closed;
    return { cancelled: true };
  }

  async submitClaudeCode(id: string, code: string): Promise<{ submitted: true }> {
    this.#requireLocal();
    const account = this.#store.resolveAccount('claude', id);
    const login = this.#logins.get(account.id);
    if (login === undefined)
      throw new EngineRefusal(
        'engine-login-not-pending',
        'Start sign-in for this Claude Code account before submitting a code.',
      );
    if (login.submitCode === undefined)
      throw new EngineRefusal(
        'engine-code-not-requested',
        'Claude Code has not opened a code input for this sign-in.',
      );
    await login.submitCode(code);
    return { submitted: true };
  }

  async validateChoice(engine: EngineId, choice: EngineChoice): Promise<void> {
    requireOfferedEngineChoice(engine, choice, await this.models(engine, choice.accountId));
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
        : await this.openClaudeSession(account, { cwd, instructions: '' });
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
