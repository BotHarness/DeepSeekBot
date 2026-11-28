import { createHash, randomUUID } from 'node:crypto';
import { credentialKey, type CredentialProvider } from '@deepseek-ai/dsh-credentials';

import { narrow, resolveGrants } from '../kernel/grants.js';
import {
  CONNECTOR_CATALOG,
  catalogEntry,
  connectorCapabilities,
  matchesCatalog,
  type ConnectorCapability,
  type ConnectorCatalogEntry,
} from './catalog.js';
import { ComposioError, createComposioClient, type ComposioClient } from './composio.js';
import { ConnectorError } from './errors.js';
import { FEATURED_MCP_SERVERS, RemoteMcpConnectors } from './remote.js';
import type { RemoteMcpClient } from './remote-mcp.js';
import type {
  ConnectorAccess,
  ConnectorAccountRecord,
  ConnectorGrantRecord,
  ConnectorStore,
} from './store.js';

type Credentials = Pick<CredentialProvider, 'readRecord' | 'modifyRecord' | 'deleteRecord'>;

export { ConnectorError, type ConnectorErrorCode } from './errors.js';

export interface ConnectorAccountView extends ConnectorAccountRecord {
  name: string;
  grants: Array<{ botSlug: string; botName?: string; access: ConnectorAccess }>;
}

export interface ConnectorsView {
  configured: boolean;
  accounts: ConnectorAccountView[];
  catalog: readonly ConnectorCatalogEntry[];
}

export interface ConnectorApp {
  service: string;
  name: string;
  summary: string;
  featured: boolean;
}

export interface ConnectorAppSearch {
  apps: ConnectorApp[];
  next?: string;
  total?: number;
  source: 'composio' | 'featured';
  offline?: true;
}

export interface BotConnector {
  accountId: string;
  provider: ConnectorAccountRecord['provider'];
  service: string;
  label: string;
  identity?: string;
  status: ConnectorAccountRecord['status'];
  access: ConnectorAccess;
}

export interface ConnectorRequestPreview {
  service: string;
  name: string;
  access: ConnectorAccess;
  reason: string;
  account?: { accountId: string; label: string; identity?: string; holder: 'shared' | 'bot' };
}

export interface BotConnectorSession {
  url: string;
  headers: Record<string, string>;
  signature: string;
}

export interface ConnectorSessionScope {
  sessionId: string;
  ceiling?: readonly ConnectorCapability[];
}

interface OneTimeGrant extends ConnectorGrantRecord {
  revision: number;
}

const REQUEST_LIFETIME_MS = 24 * 60 * 60 * 1000;

interface Config {
  apiKey: string;
  userId: string;
}

const CONFIG_KEY = credentialKey('botharness-connectors', 'composio');
const LABEL = /^[\p{L}\p{N}][\p{L}\p{N} ._@+-]{0,63}$/u;
const SLUG = /^[a-z0-9][a-z0-9_]{0,63}$/;

function defaultLabel(name: string): string {
  const cleaned = name
    .replace(/[^\p{L}\p{N} ._@+-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64)
    .trim();
  return LABEL.test(cleaned) ? cleaned : 'Account';
}

export function connectorAccess(
  grants: readonly ConnectorGrantRecord[],
  accountId: string,
  ceiling?: readonly ConnectorCapability[],
): ConnectorAccess | undefined {
  const { read, write } = connectorCapabilities(accountId);
  const assigned = grants.filter((grant) => grant.accountId === accountId);
  const permissions = resolveGrants<
    ConnectorCapability,
    { allow: ConnectorCapability[]; deny: never[] }
  >(
    assigned.map((grant) => ({
      allow: grant.access === 'write' ? [read, write] : [read],
      deny: [],
    })),
  );
  const { granted } = ceiling === undefined ? permissions : narrow(permissions, ceiling);
  if (!granted.includes(read)) return undefined;
  return granted.includes(write) ? 'write' : 'read';
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
  readonly #once = new Map<string, Map<string, OneTimeGrant>>();
  readonly #requestChoices = new Map<string, Promise<boolean>>();
  #config: Promise<Config | undefined> | undefined;
  readonly #names = new Map<string, string>();
  readonly #logos = new Map<string, Promise<string | null>>();
  readonly remote: RemoteMcpConnectors;

  constructor(options: {
    store: ConnectorStore;
    credentials: () => Credentials | undefined;
    client?: ComposioClient;
    mcpClient?: RemoteMcpClient;
    redirectUri?: () => string | undefined | Promise<string | undefined>;
    log?: (phase: string, fields?: Record<string, string | number>) => void;
  }) {
    this.#store = options.store;
    this.#credentials = options.credentials;
    this.#client = options.client ?? createComposioClient();
    this.#log = options.log ?? (() => undefined);
    this.remote = new RemoteMcpConnectors({
      store: options.store,
      credentials: options.credentials,
      ...(options.mcpClient === undefined ? {} : { client: options.mcpClient }),
      redirectUri: options.redirectUri ?? (() => undefined),
      changed: () => this.#changed(),
      log: this.#log,
    });
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
        this.#log('composio-failed', { status: error.status, slug: error.slug ?? '' });
        if (error.slug === 'APIKey_InsufficientPermissions')
          throw new ConnectorError(
            'invalid',
            'The Composio API key lacks a permission this needs. Use a key with write access to Session management, Session tool execution, Connected accounts and Auth configs.',
          );
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

  appName(service: string): string {
    return (
      catalogEntry(service)?.name ??
      this.remote.name(service) ??
      this.#names.get(service) ??
      service
    );
  }

  async logos(services: readonly string[]): Promise<Record<string, string>> {
    const wanted = [...new Set(services)].filter((service) => SLUG.test(service)).slice(0, 60);
    const found = await Promise.all(
      wanted.map(async (service) => [service, await this.#logo(service)] as const),
    );
    const logos: Record<string, string> = {};
    for (const [service, logo] of found) if (logo !== null) logos[service] = logo;
    return logos;
  }

  #logo(service: string): Promise<string | null> {
    const cached = this.#logos.get(service);
    if (cached !== undefined) return cached;
    if (this.#logos.size >= 3000) this.#logos.delete(this.#logos.keys().next().value!);
    const mcp = service.startsWith('mcp_');
    const icon = mcp ? this.remote.icon(service) : undefined;
    const featured = mcp && FEATURED_MCP_SERVERS.some((server) => server.service === service);
    const fetched =
      icon !== undefined
        ? this.remote.image(icon)
        : featured
          ? this.#client.logo(service.slice('mcp_'.length))
          : mcp
            ? Promise.resolve(undefined)
            : this.#client.logo(service);
    const pending = fetched.then(
      (logo) => logo ?? null,
      (error: unknown) => {
        this.#logos.delete(service);
        this.#log('logo-failed', {
          service,
          error: error instanceof Error ? error.name : 'unknown',
        });
        return null;
      },
    );
    this.#logos.set(service, pending);
    return pending;
  }

  async searchApps(query: string, after?: string): Promise<ConnectorAppSearch> {
    const text = query.trim().slice(0, 80);
    const cursor = after === '' ? undefined : after;
    const matches: ConnectorApp[] = CONNECTOR_CATALOG.filter((entry) =>
      matchesCatalog(entry, text),
    ).map((entry) => ({
      service: entry.service,
      name: entry.name,
      summary: entry.summary,
      featured: true,
    }));
    const featured = cursor === undefined ? matches : [];
    const latin = text
      .replace(/[^\x20-\x7e]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const local: ConnectorAppSearch = { apps: featured, source: 'featured' };
    if (text !== '' && latin === '') return local;
    const config = await this.#readConfig().catch(() => undefined);
    if (config === undefined) return local;
    let page: Awaited<ReturnType<ComposioClient['toolkits']>>;
    try {
      page = await this.#upstream(() => this.#client.toolkits(config.apiKey, latin, cursor));
    } catch (error) {
      if (cursor !== undefined) throw error;
      if (!(error instanceof ConnectorError))
        this.#log('composio-unreachable', {
          error: error instanceof Error ? error.name : 'unknown',
        });
      return { ...local, offline: true };
    }
    const seen = new Set(matches.map((app) => app.service));
    const remote: ConnectorApp[] = [];
    for (const item of page.items) {
      if (!SLUG.test(item.service) || seen.has(item.service)) continue;
      seen.add(item.service);
      if (this.#names.size < 5000) this.#names.set(item.service, item.name);
      remote.push({
        service: item.service,
        name: item.name,
        summary: item.summary,
        featured: catalogEntry(item.service) !== undefined,
      });
    }
    return {
      apps: [...featured, ...remote],
      ...(page.next === undefined ? {} : { next: page.next }),
      ...(page.total === undefined ? {} : { total: page.total }),
      source: 'composio',
    };
  }

  async view(): Promise<ConnectorsView> {
    const configured = (await this.#readConfig().catch(() => undefined)) !== undefined;
    const grants = this.#store.grants();
    return {
      configured,
      accounts: this.#store.accounts().map((account) => ({
        ...account,
        name: this.appName(account.service),
        grants: grants
          .filter((grant) => grant.accountId === account.accountId)
          .map((grant): { botSlug: string; botName?: string; access: ConnectorAccess } => ({
            botSlug: grant.botSlug,
            access: grant.access,
          })),
      })),
      catalog: CONNECTOR_CATALOG,
    };
  }

  async setKey(apiKey: string): Promise<ConnectorsView> {
    const key = apiKey.trim();
    if (key.length < 8 || key.length > 512 || /\s/.test(key))
      throw new ConnectorError('invalid', 'The Composio API key is malformed.');
    if (/^ck_/i.test(key))
      throw new ConnectorError(
        'invalid',
        'This is a Composio Connect MCP key (ck_). Use the project API key that starts with ak_ from Platform › your project › Settings › API Keys.',
      );
    if (/^uak_/i.test(key))
      throw new ConnectorError(
        'invalid',
        'This is a personal Composio user API key (uak_). Use the project API key that starts with ak_.',
      );
    await this.#upstream(() => this.#client.verify(key));
    const current = await this.#readConfig();
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
    await this.#native().deleteRecord(CONFIG_KEY);
    this.#config = Promise.resolve(undefined);
    this.#log('key-cleared');
    this.#changed();
    return this.view();
  }

  async connect(input: {
    service: string;
    label?: string;
  }): Promise<{ account: ConnectorAccountRecord; url?: string }> {
    const service = input.service.trim().toLowerCase();
    if (service.startsWith('mcp_')) return this.remote.connect(service, input.label);
    if (!SLUG.test(service)) throw new ConnectorError('invalid', 'The service name is invalid.');
    const label = (input.label ?? defaultLabel(this.appName(service))).trim();
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

  async reconnect(accountId: string): Promise<{ account: ConnectorAccountRecord; url?: string }> {
    const current = this.#store.account(accountId);
    if (current === undefined)
      throw new ConnectorError('not-found', 'The App connection does not exist.');
    if (current.provider === 'mcp') return this.remote.reconnect(accountId);
    const config = await this.#requireConfig();
    await this.#upstream(() => this.#client.removeAccount(config.apiKey, current.externalId));
    const link = await this.#upstream(() =>
      this.#client.link(config.apiKey, config.userId, current.service, current.label),
    );
    const account = this.#store.updateAccount(accountId, {
      status: 'pending',
      identity: null,
      externalId: link.accountId,
    })!;
    this.#log('account-relinking', { service: current.service });
    this.#changed();
    return { account, url: link.url };
  }

  async refresh(): Promise<ConnectorsView> {
    const config = await this.#readConfig().catch(() => undefined);
    if (config === undefined) return this.view();
    const remote = await this.#upstream(() => this.#client.accounts(config.apiKey, config.userId));
    const byId = new Map(remote.map((account) => [account.id, account]));
    let changed = false;
    for (const account of this.#store.accounts()) {
      if (account.provider !== 'composio') continue;
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
    let changed = this.#store.setGrant(botSlug, accountId, access);
    if (!changed && access !== undefined)
      throw new ConnectorError('not-found', 'The App connection does not exist.');
    if (access === undefined) {
      for (const [sessionId, grants] of this.#once) {
        if (grants.get(accountId)?.botSlug !== botSlug) continue;
        changed = grants.delete(accountId) || changed;
        if (grants.size === 0) this.#once.delete(sessionId);
      }
    }
    if (changed) {
      this.#log(access === undefined ? 'grant-removed' : 'grant-set', {
        access: access ?? 'none',
      });
      this.#changed();
    }
    return changed;
  }

  async decideOnce(
    sessionId: string,
    callId: string,
    decide: () => Promise<boolean>,
  ): Promise<boolean> {
    const key = JSON.stringify([sessionId, callId]);
    if (this.#requestChoices.has(key)) return false;
    const result = Promise.resolve().then(decide);
    this.#requestChoices.set(key, result);
    const forget = () => {
      if (this.#requestChoices.get(key) === result) this.#requestChoices.delete(key);
    };
    try {
      const accepted = await result;
      if (accepted) setTimeout(forget, REQUEST_LIFETIME_MS).unref();
      else forget();
      return accepted;
    } catch (error) {
      forget();
      throw error;
    }
  }

  async takeOnceDecision(sessionId: string, callId: string): Promise<boolean> {
    const key = JSON.stringify([sessionId, callId]);
    const result = this.#requestChoices.get(key);
    if (result === undefined) return false;
    this.#requestChoices.delete(key);
    return result.catch(() => false);
  }

  grantOnce(botSlug: string, sessionId: string, accountId: string, access: ConnectorAccess): void {
    const account = this.account(accountId);
    if (account?.status !== 'active')
      throw new ConnectorError('not-found', 'The App connection is unavailable.');
    const grant: OneTimeGrant = {
      botSlug,
      accountId,
      access,
      revision: account.revision,
      grantedAt: new Date().toISOString(),
    };
    const grants = this.#once.get(sessionId) ?? new Map<string, OneTimeGrant>();
    grants.set(accountId, grant);
    this.#once.set(sessionId, grants);
    setTimeout(() => {
      if (this.#once.get(sessionId)?.get(accountId) !== grant) return;
      grants.delete(accountId);
      if (grants.size === 0) this.#once.delete(sessionId);
      this.#changed();
    }, REQUEST_LIFETIME_MS).unref();
    this.#changed();
  }

  consumeOnce(botSlug: string, sessionId: string, accounts: ReadonlySet<string>): () => void {
    const grants = this.#once.get(sessionId);
    if (grants === undefined) return () => undefined;
    let consumed = false;
    for (const id of accounts) {
      if (grants.get(id)?.botSlug === botSlug) consumed = grants.delete(id) || consumed;
    }
    if (grants.size === 0) this.#once.delete(sessionId);
    return consumed ? () => this.#changed() : () => undefined;
  }

  async remove(accountId: string): Promise<boolean> {
    const account = this.#store.account(accountId);
    if (account === undefined) return false;
    if (account.provider === 'mcp') {
      await this.remote.remove(accountId);
      return true;
    }
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
      .filter((account) => account.holderSlug === botSlug && account.provider === 'composio')
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

  forBot(botSlug: string, scope?: ConnectorSessionScope): BotConnector[] {
    const grants = this.#store.grants(botSlug);
    const temporary = scope === undefined ? undefined : this.#once.get(scope.sessionId);
    return this.#store.accounts().flatMap((account) => {
      const once = temporary?.get(account.accountId);
      const assigned =
        once?.botSlug === botSlug && once.revision === account.revision
          ? [...grants, once]
          : grants;
      const granted = connectorAccess(assigned, account.accountId);
      if (granted === undefined) return [];
      const signedIn = account.provider === 'mcp' ? (account.access ?? granted) : granted;
      const access =
        scope?.ceiling === undefined
          ? signedIn
          : connectorAccess(
              [
                {
                  botSlug,
                  accountId: account.accountId,
                  access: signedIn,
                  grantedAt: account.createdAt,
                },
              ],
              account.accountId,
              scope.ceiling,
            );
      if (access === undefined) return [];
      return [
        {
          accountId: account.accountId,
          provider: account.provider,
          service: account.service,
          label: account.label,
          ...(account.identity === undefined ? {} : { identity: account.identity }),
          status: account.status,
          access,
        },
      ];
    });
  }

  explainGrant(botSlug: string, accountId: string) {
    const account = this.account(accountId);
    if (account === undefined)
      throw new ConnectorError('not-found', 'The App connection does not exist.');
    const grant = this.#store.grants(botSlug).find((record) => record.accountId === accountId);
    const effective = this.forBot(botSlug).find(
      (connector) => connector.accountId === accountId && connector.status === 'active',
    );
    const source =
      account.provider === 'mcp' && account.access !== undefined ? 'account-sign-in' : 'bot-grant';
    const permissionsSource =
      grant === undefined ? 'no-bot-grant' : effective === undefined ? 'account-inactive' : source;
    const { read, write, grant: manage } = connectorCapabilities(accountId);
    return {
      botSlug,
      accountId,
      accountStatus: account.status,
      storedAccess: grant?.access ?? null,
      effectiveAccess: effective?.access ?? null,
      permissions: [
        {
          capability: read,
          allowed: effective !== undefined,
          source: permissionsSource,
        },
        {
          capability: write,
          allowed: effective?.access === 'write',
          source: permissionsSource,
        },
        { capability: manage, allowed: false, source: 'host-owner-only' },
      ],
    };
  }

  available(): ConnectorAccountRecord[] {
    return this.#store.accounts();
  }

  account(accountId: string): ConnectorAccountRecord | undefined {
    return this.#store.account(accountId);
  }

  requestedAccount(args: unknown): ConnectorAccountRecord | undefined {
    if (typeof args !== 'object' || args === null) return undefined;
    const { account_id: accountId, service } = args as Record<string, unknown>;
    if (typeof accountId === 'string' && accountId !== '') return this.account(accountId);
    if (typeof service !== 'string') return undefined;
    const active = this.#store
      .accounts()
      .filter((account) => account.service === service && account.status === 'active');
    return active.length === 1 ? active[0] : undefined;
  }

  requestPreview(botSlug: string, args: unknown): ConnectorRequestPreview | undefined {
    if (typeof args !== 'object' || args === null) return undefined;
    const source = args as Record<string, unknown>;
    const account = this.requestedAccount(args);
    const service = account?.service ?? source['service'];
    if (typeof service !== 'string' || service === '') return undefined;
    const reason = typeof source['reason'] === 'string' ? source['reason'].slice(0, 500) : '';
    const asked = source['access'] === 'write' ? 'write' : 'read';
    return {
      service,
      name: this.appName(service),
      access: account?.provider === 'mcp' ? (account.access ?? asked) : asked,
      reason,
      ...(account === undefined
        ? {}
        : {
            account: {
              accountId: account.accountId,
              label: account.label,
              ...(account.identity === undefined ? {} : { identity: account.identity }),
              holder: account.holderSlug === botSlug ? ('bot' as const) : ('shared' as const),
            },
          }),
    };
  }

  onceGrants(botSlug: string): Array<{ accountId: string; access: ConnectorAccess }> {
    const found = new Map<string, ConnectorAccess>();
    for (const grants of this.#once.values())
      for (const grant of grants.values()) {
        if (grant.botSlug !== botSlug) continue;
        if (this.account(grant.accountId)?.revision !== grant.revision) continue;
        if (found.get(grant.accountId) !== 'write') found.set(grant.accountId, grant.access);
      }
    return [...found].map(([accountId, access]) => ({ accountId, access }));
  }

  async session(
    botSlug: string,
    scope?: ConnectorSessionScope,
  ): Promise<BotConnectorSession | undefined> {
    const pinned: Record<string, string[]> = {};
    for (const connector of this.forBot(botSlug, scope)) {
      if (connector.status !== 'active' || connector.provider !== 'composio') continue;
      const externalId = this.#store.account(connector.accountId)?.externalId;
      if (externalId === undefined) continue;
      (pinned[connector.service] ??= []).push(externalId);
    }
    if (Object.keys(pinned).length === 0) return undefined;
    for (const ids of Object.values(pinned)) ids.sort();
    const signature = JSON.stringify(Object.entries(pinned).sort(([a], [b]) => a.localeCompare(b)));
    const sessionKey =
      scope !== undefined && (this.#once.has(scope.sessionId) || scope.ceiling !== undefined)
        ? JSON.stringify([botSlug, scope.sessionId])
        : botSlug;
    const cached = this.#sessions.get(sessionKey);
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
        signature: `${signature}#${createHash('sha256').update(config.apiKey).digest('hex').slice(0, 16)}`,
      };
    })();
    this.#sessions.set(sessionKey, { signature, session });
    session.catch(() => {
      if (this.#sessions.get(sessionKey)?.session === session) this.#sessions.delete(sessionKey);
    });
    return session;
  }
}
