import { randomUUID } from 'node:crypto';
import { credentialKey, type CredentialProvider } from '@deepseek-ai/dsh-credentials';

import { resolveGrants } from '../authorization/grants.js';
import { CONNECTOR_CATALOG, catalogEntry, type ConnectorCatalogEntry } from './catalog.js';
import { ComposioError, createComposioClient, type ComposioClient } from './composio.js';
import type {
  ConnectorAccess,
  ConnectorAccountRecord,
  ConnectorGrantRecord,
  ConnectorStore,
} from './store.js';

type Credentials = Pick<CredentialProvider, 'readRecord' | 'modifyRecord' | 'deleteRecord'>;

export type ConnectorErrorCode =
  | 'not-configured'
  | 'invalid'
  | 'not-found'
  | 'credential-unavailable'
  | 'upstream';

export class ConnectorError extends Error {
  constructor(
    readonly code: ConnectorErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface ConnectorAccountView extends ConnectorAccountRecord {
  name: string;
  grants: Array<{ botSlug: string; access: ConnectorAccess }>;
}

export interface ConnectorsView {
  configured: boolean;
  accounts: ConnectorAccountView[];
  catalog: readonly ConnectorCatalogEntry[];
}

export interface BotConnector {
  accountId: string;
  service: string;
  label: string;
  identity?: string;
  status: ConnectorAccountRecord['status'];
  access: ConnectorAccess;
}

export interface BotConnectorSession {
  url: string;
  headers: Record<string, string>;
  signature: string;
}

interface Config {
  apiKey: string;
  userId: string;
}

const CONFIG_KEY = credentialKey('botharness-connectors', 'composio');
const LABEL = /^[\p{L}\p{N}][\p{L}\p{N} ._@+-]{0,63}$/u;
const SLUG = /^[a-z0-9][a-z0-9_]{0,63}$/;

type Capability = `connector.${string}.${'read' | 'write'}`;

function capabilities(grant: ConnectorGrantRecord): Capability[] {
  const read: Capability = `connector.${grant.accountId}.read`;
  return grant.access === 'write' ? [read, `connector.${grant.accountId}.write`] : [read];
}

export function connectorAccess(
  grants: readonly ConnectorGrantRecord[],
  accountId: string,
): ConnectorAccess | undefined {
  const resolved = resolveGrants(grants.map((grant) => ({ allow: capabilities(grant), deny: [] })));
  if (resolved.granted.includes(`connector.${accountId}.write`)) return 'write';
  if (resolved.granted.includes(`connector.${accountId}.read`)) return 'read';
  return undefined;
}

export class ConnectorService {
  readonly #store: ConnectorStore;
  readonly #credentials: () => Credentials | undefined;
  readonly #client: ComposioClient;
  readonly #log: (phase: string, fields?: Record<string, string | number>) => void;
  readonly #listeners = new Set<() => void>();
  readonly #sessions = new Map<
    string,
    { signature: string; session: Promise<BotConnectorSession | undefined> }
  >();
  #config: Promise<Config | undefined> | undefined;

  constructor(options: {
    store: ConnectorStore;
    credentials: () => Credentials | undefined;
    client?: ComposioClient;
    log?: (phase: string, fields?: Record<string, string | number>) => void;
  }) {
    this.#store = options.store;
    this.#credentials = options.credentials;
    this.#client = options.client ?? createComposioClient();
    this.#log = options.log ?? (() => undefined);
  }

  onChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #changed(): void {
    this.#sessions.clear();
    for (const listener of [...this.#listeners]) listener();
  }

  #native(): Credentials {
    const credentials = this.#credentials();
    if (credentials === undefined)
      throw new ConnectorError('credential-unavailable', 'The credential store is unavailable.');
    return credentials;
  }

  async #readConfig(): Promise<Config | undefined> {
    this.#config ??= this.#native()
      .readRecord(CONFIG_KEY)
      .then((record) => {
        const payload =
          record?.kind === 'grant' ? (record.payload as Record<string, unknown>) : undefined;
        return typeof payload?.['apiKey'] === 'string' && typeof payload['userId'] === 'string'
          ? { apiKey: payload['apiKey'], userId: payload['userId'] }
          : undefined;
      })
      .catch((error: unknown) => {
        this.#config = undefined;
        throw error;
      });
    return this.#config;
  }

  async #requireConfig(): Promise<Config> {
    const config = await this.#readConfig();
    if (config === undefined)
      throw new ConnectorError('not-configured', 'Add a Composio API key in Settings first.');
    return config;
  }

  async #upstream<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof ComposioError) {
        this.#log('composio-failed', { status: error.status });
        throw new ConnectorError(
          error.status === 401 || error.status === 403 ? 'invalid' : 'upstream',
          error.status === 401 || error.status === 403
            ? 'Composio rejected the API key.'
            : 'Composio is unavailable; try again.',
        );
      }
      throw error;
    }
  }

  async view(): Promise<ConnectorsView> {
    const configured = (await this.#readConfig().catch(() => undefined)) !== undefined;
    const grants = this.#store.grants();
    return {
      configured,
      accounts: this.#store.accounts().map((account) => ({
        ...account,
        name: catalogEntry(account.service)?.name ?? account.service,
        grants: grants
          .filter((grant) => grant.accountId === account.accountId)
          .map((grant) => ({ botSlug: grant.botSlug, access: grant.access })),
      })),
      catalog: CONNECTOR_CATALOG,
    };
  }

  async setKey(apiKey: string): Promise<ConnectorsView> {
    const key = apiKey.trim();
    if (key.length < 8 || key.length > 512 || /\s/.test(key))
      throw new ConnectorError('invalid', 'The Composio API key is malformed.');
    await this.#upstream(() => this.#client.verify(key));
    const current = await this.#readConfig().catch(() => undefined);
    const userId = current?.userId ?? 'botharness_' + randomUUID();
    await this.#native().modifyRecord(CONFIG_KEY, async () => ({
      kind: 'grant',
      payload: { apiKey: key, userId },
    }));
    this.#config = Promise.resolve({ apiKey: key, userId });
    this.#log('key-set');
    this.#changed();
    return this.view();
  }

  async clearKey(): Promise<ConnectorsView> {
    await this.#native()
      .deleteRecord(CONFIG_KEY)
      .catch(() => undefined);
    this.#config = Promise.resolve(undefined);
    this.#log('key-cleared');
    this.#changed();
    return this.view();
  }

  async connect(input: {
    service: string;
    label?: string;
  }): Promise<{ account: ConnectorAccountRecord; url: string }> {
    const service = input.service.trim().toLowerCase();
    if (!SLUG.test(service)) throw new ConnectorError('invalid', 'The service name is invalid.');
    const label = (input.label ?? catalogEntry(service)?.name ?? service).trim();
    if (!LABEL.test(label)) throw new ConnectorError('invalid', 'The account label is invalid.');
    if (
      this.#store
        .accounts()
        .some((account) => account.service === service && account.label === label)
    )
      throw new ConnectorError('invalid', 'An account with this label already exists.');
    const config = await this.#requireConfig();
    const link = await this.#upstream(() =>
      this.#client.link(config.apiKey, config.userId, service, label),
    );
    const account = this.#store.createAccount({
      service,
      label,
      externalId: link.accountId,
    });
    this.#log('account-linking', { service });
    this.#changed();
    return { account, url: link.url };
  }

  async refresh(): Promise<ConnectorsView> {
    const config = await this.#requireConfig();
    const remote = await this.#upstream(() => this.#client.accounts(config.apiKey, config.userId));
    const byId = new Map(remote.map((account) => [account.id, account]));
    let changed = false;
    for (const account of this.#store.accounts()) {
      const found = byId.get(account.externalId);
      const status = found?.status ?? (account.status === 'pending' ? 'pending' : 'expired');
      const updated = this.#store.updateAccount(account.accountId, {
        status,
        ...(found?.identity === undefined ? {} : { identity: found.identity }),
      });
      if (updated !== undefined && updated.revision !== account.revision) changed = true;
    }
    if (changed) this.#changed();
    return this.view();
  }

  grant(botSlug: string, accountId: string, access: ConnectorAccess | undefined): boolean {
    const changed = this.#store.setGrant(botSlug, accountId, access);
    if (!changed && access !== undefined)
      throw new ConnectorError('not-found', 'The App connection does not exist.');
    if (changed) {
      this.#log(access === undefined ? 'grant-removed' : 'grant-set', {
        access: access ?? 'none',
      });
      this.#changed();
    }
    return changed;
  }

  async remove(accountId: string): Promise<boolean> {
    const account = this.#store.account(accountId);
    if (account === undefined) return false;
    const config = await this.#readConfig().catch(() => undefined);
    if (config !== undefined)
      await this.#upstream(() => this.#client.removeAccount(config.apiKey, account.externalId));
    this.#store.removeAccount(accountId);
    this.#log('account-removed', { service: account.service });
    this.#changed();
    return true;
  }

  async eraseBot(botSlug: string): Promise<void> {
    const held = this.#store
      .accounts()
      .filter((account) => account.holderSlug === botSlug)
      .map((account) => account.externalId);
    const before = this.#store.grants(botSlug).length;
    this.#store.eraseBot(botSlug);
    const config = await this.#readConfig().catch(() => undefined);
    if (config !== undefined)
      await Promise.allSettled(
        held.map((externalId) => this.#client.removeAccount(config.apiKey, externalId)),
      );
    if (held.length > 0 || before > 0) this.#changed();
  }

  forBot(botSlug: string): BotConnector[] {
    const grants = this.#store.grants(botSlug);
    return this.#store.accounts().flatMap((account) => {
      const access = connectorAccess(grants, account.accountId);
      if (access === undefined) return [];
      return [
        {
          accountId: account.accountId,
          service: account.service,
          label: account.label,
          ...(account.identity === undefined ? {} : { identity: account.identity }),
          status: account.status,
          access,
        },
      ];
    });
  }

  available(): ConnectorAccountRecord[] {
    return this.#store.accounts();
  }

  account(accountId: string): ConnectorAccountRecord | undefined {
    return this.#store.account(accountId);
  }

  async session(botSlug: string): Promise<BotConnectorSession | undefined> {
    const pinned: Record<string, string[]> = {};
    for (const connector of this.forBot(botSlug)) {
      if (connector.status !== 'active') continue;
      const externalId = this.#store.account(connector.accountId)?.externalId;
      if (externalId === undefined) continue;
      (pinned[connector.service] ??= []).push(externalId);
    }
    if (Object.keys(pinned).length === 0) return undefined;
    for (const ids of Object.values(pinned)) ids.sort();
    const signature = JSON.stringify(Object.entries(pinned).sort(([a], [b]) => a.localeCompare(b)));
    const cached = this.#sessions.get(botSlug);
    if (cached?.signature === signature) return cached.session;
    const session = (async () => {
      const config = await this.#readConfig().catch(() => undefined);
      if (config === undefined) return undefined;
      const created = await this.#upstream(() =>
        this.#client.session(config.apiKey, config.userId, pinned),
      );
      return {
        url: created.url,
        headers: { 'x-api-key': config.apiKey },
        signature,
      };
    })();
    this.#sessions.set(botSlug, { signature, session });
    session.catch(() => {
      if (this.#sessions.get(botSlug)?.session === session) this.#sessions.delete(botSlug);
    });
    return session;
  }
}
