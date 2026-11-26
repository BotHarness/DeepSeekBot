import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { credentialKey, type CredentialProvider } from '@deepseek-ai/dsh-credentials';
import {
  OAuthError,
  type OAuthClientInformationMixed,
  type OAuthTokens,
} from '@modelcontextprotocol/client';
import { z } from 'zod';

import { ConnectorError } from './errors.js';
import {
  createRemoteMcpClient,
  remoteMcpUrl,
  type RemoteMcpClient,
  type RemoteMcpOAuth,
  type RemoteMcpTool,
} from './remote-mcp.js';
import type {
  ConnectorAccess,
  ConnectorAccountRecord,
  ConnectorMcpServerRecord,
  ConnectorStore,
} from './store.js';

type Credentials = Pick<CredentialProvider, 'readRecord' | 'modifyRecord' | 'deleteRecord'>;

export class RemoteMcpError extends ConnectorError {}

const READ_SCOPE = /(^|[:._/-])(read|readonly|view)($|[:._/-])/i;
const WRITE_SCOPE =
  /(^|[:._/-])(write|admin|manage|modify|edit|create|delete|send|full)($|[:._/-])/i;
const NEUTRAL_SCOPES: ReadonlySet<string> = new Set([
  'openid',
  'profile',
  'email',
  'offline_access',
  'introspection',
]);

export function grantedAccess(scope: string | undefined): ConnectorAccess {
  const scopes = (scope ?? '')
    .split(/\s+/)
    .filter((item) => item !== '' && !NEUTRAL_SCOPES.has(item));
  return scopes.length > 0 &&
    scopes.every((item) => READ_SCOPE.test(item) && !WRITE_SCOPE.test(item))
    ? 'read'
    : 'write';
}

export interface FeaturedMcpServer {
  service: string;
  name: string;
  url: string;
  summary: string;
  keywords: readonly string[];
}

export const FEATURED_MCP_SERVERS: readonly FeaturedMcpServer[] = [
  {
    service: 'mcp_posthog',
    name: 'PostHog',
    url: 'https://mcp.posthog.com/mcp',
    summary: 'Product analytics, insights, feature flags and errors',
    keywords: ['analytics', 'insight', 'feature flag', '分析', '埋点', '数据'],
  },
  {
    service: 'mcp_notion',
    name: 'Notion',
    url: 'https://mcp.notion.com/mcp',
    summary: 'Search, read and edit Notion pages and databases',
    keywords: ['docs', 'wiki', 'notes', '文档', '笔记'],
  },
  {
    service: 'mcp_linear',
    name: 'Linear',
    url: 'https://mcp.linear.app/mcp',
    summary: 'Issues, projects and cycles in Linear',
    keywords: ['issue', 'ticket', 'project', '任务', '工单'],
  },
  {
    service: 'mcp_sentry',
    name: 'Sentry',
    url: 'https://mcp.sentry.dev/mcp',
    summary: 'Errors, issues and releases in Sentry',
    keywords: ['error', 'crash', 'monitoring', '报错', '崩溃'],
  },
  {
    service: 'mcp_atlassian',
    name: 'Atlassian',
    url: 'https://mcp.atlassian.com/v1/mcp',
    summary: 'Jira issues and Confluence pages',
    keywords: ['jira', 'confluence', 'issue', '任务'],
  },
  {
    service: 'mcp_stripe',
    name: 'Stripe',
    url: 'https://mcp.stripe.com',
    summary: 'Customers, payments and subscriptions in Stripe',
    keywords: ['payment', 'billing', 'subscription', '支付', '订阅'],
  },
  {
    service: 'mcp_hubspot',
    name: 'HubSpot',
    url: 'https://mcp.hubspot.com/',
    summary: 'Contacts, companies and deals in HubSpot',
    keywords: ['crm', 'sales', 'contact', '客户', '销售'],
  },
  {
    service: 'mcp_vercel',
    name: 'Vercel',
    url: 'https://mcp.vercel.com',
    summary: 'Projects, deployments and logs on Vercel',
    keywords: ['deploy', 'hosting', '部署'],
  },
  {
    service: 'mcp_supabase',
    name: 'Supabase',
    url: 'https://mcp.supabase.com/mcp',
    summary: 'Databases, tables and functions in Supabase',
    keywords: ['database', 'postgres', 'sql', '数据库'],
  },
  {
    service: 'mcp_figma',
    name: 'Figma',
    url: 'https://mcp.figma.com/mcp',
    summary: 'Read Figma designs, components and variables',
    keywords: ['design', 'ui', '设计'],
  },
  {
    service: 'mcp_canva',
    name: 'Canva',
    url: 'https://mcp.canva.com/mcp',
    summary: 'Find, create and export Canva designs',
    keywords: ['design', 'poster', 'slides', '设计', '海报'],
  },
];

export interface McpApp {
  service: string;
  name: string;
  summary: string;
  url: string;
  featured: boolean;
  website?: string;
}

export interface McpAppSearch {
  apps: McpApp[];
  next?: string;
  offline?: true;
}

interface StoredAuth {
  oauth?: RemoteMcpOAuth;
  client?: OAuthClientInformationMixed;
  accessToken?: string | undefined;
  refreshToken?: string;
  expiresAt?: number;
}

const clientSchema = z.object({ client_id: z.string().min(1) }).passthrough();

const storedAuthSchema = z.object({
  oauth: z
    .object({
      authorizationServer: z.string().url(),
      metadata: z.object({}).passthrough().optional(),
      resource: z.string().url(),
      scope: z.string().optional(),
    })
    .optional(),
  client: clientSchema.optional(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  expiresAt: z.number().optional(),
});

function parseClient(payload: unknown): OAuthClientInformationMixed | undefined {
  const parsed = clientSchema.safeParse(payload);
  return parsed.success ? (parsed.data as OAuthClientInformationMixed) : undefined;
}

interface PendingLogin {
  accountId: string;
  oauth: RemoteMcpOAuth;
  client: OAuthClientInformationMixed;
  verifier: string;
  redirectUri: string;
  expiresAt: number;
}

const LOGIN_TTL_MS = 15 * 60_000;
const REJECTED: ReadonlySet<string> = new Set([
  'invalid_grant',
  'invalid_client',
  'unauthorized_client',
]);
const REFRESH_EARLY_MS = 120_000;
const TOOLS_TTL_MS = 10 * 60_000;
const LABEL = /^[\p{L}\p{N}][\p{L}\p{N} ._@+-]{0,63}$/u;
const SERVICE = /^mcp_[a-z0-9_]{1,59}$/;

function slug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function cleanLabel(name: string): string {
  const cleaned = name
    .replace(/[^\p{L}\p{N} ._@+-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64)
    .trim();
  return LABEL.test(cleaned) ? cleaned : 'Account';
}

function matches(server: FeaturedMcpServer, query: string): boolean {
  const text = query.trim().toLowerCase();
  if (text === '') return true;
  return [server.name, server.summary, server.service.slice(4), ...server.keywords].some(
    (word) => word.toLowerCase().includes(text) || text.includes(word.toLowerCase()),
  );
}

function authKey(accountId: string) {
  return credentialKey('botharness-connectors', `mcp-${accountId}`);
}

function clientKey(authorizationServer: string, redirectUri: string) {
  const digest = createHash('sha256')
    .update(`${authorizationServer}\n${redirectUri}`)
    .digest('hex')
    .slice(0, 32);
  return credentialKey('botharness-connectors', `mcp-client-${digest}`);
}

export class RemoteMcpConnectors {
  readonly #store: ConnectorStore;
  readonly #credentials: () => Credentials | undefined;
  readonly #client: RemoteMcpClient;
  readonly #redirectUri: () => string | undefined;
  readonly #changed: () => void;
  readonly #log: (phase: string, fields?: Record<string, string | number>) => void;
  readonly #pending = new Map<string, PendingLogin>();
  readonly #tools = new Map<string, { at: number; tools: Promise<RemoteMcpTool[]> }>();
  readonly #refreshing = new Map<string, Promise<StoredAuth | undefined>>();
  readonly #icons = new Map<string, string>();
  readonly #found = new Map<string, { url: string; name: string }>();
  readonly #attempts = new Map<string, string>();

  constructor(options: {
    store: ConnectorStore;
    credentials: () => Credentials | undefined;
    client?: RemoteMcpClient;
    redirectUri: () => string | undefined;
    changed: () => void;
    log?: (phase: string, fields?: Record<string, string | number>) => void;
  }) {
    this.#store = options.store;
    this.#credentials = options.credentials;
    this.#client = options.client ?? createRemoteMcpClient();
    this.#redirectUri = options.redirectUri;
    this.#changed = options.changed;
    this.#log = options.log ?? (() => undefined);
  }

  #native(): Credentials {
    const credentials = this.#credentials();
    if (credentials === undefined)
      throw new RemoteMcpError('credential-unavailable', 'The credential store is unavailable.');
    return credentials;
  }

  server(service: string): ConnectorMcpServerRecord | FeaturedMcpServer | undefined {
    return (
      this.#store.mcpServer(service) ??
      FEATURED_MCP_SERVERS.find((server) => server.service === service)
    );
  }

  name(service: string): string | undefined {
    return this.server(service)?.name ?? this.#found.get(service)?.name;
  }

  async connect(
    service: string,
    label?: string,
  ): Promise<{ account: ConnectorAccountRecord; url?: string }> {
    const known = this.server(service) ?? this.#found.get(service);
    if (known === undefined)
      throw new RemoteMcpError('not-found', 'Search for this MCP server again, then connect it.');
    const icon = this.#icons.get(service);
    return this.add({
      url: known.url,
      name: known.name,
      service,
      ...(icon === undefined ? {} : { icon }),
      ...(label === undefined ? {} : { label }),
    });
  }

  icon(service: string): string | undefined {
    const stored = this.#store.mcpServer(service)?.icon;
    return stored ?? this.#icons.get(service);
  }

  async image(url: string): Promise<string | undefined> {
    return this.#client.image(url);
  }

  async search(query: string, after?: string): Promise<McpAppSearch> {
    const cursor = after === '' ? undefined : after;
    const text = query.trim().slice(0, 80);
    const featured: McpApp[] =
      cursor === undefined
        ? FEATURED_MCP_SERVERS.filter((server) => matches(server, text)).map((server) => ({
            service: server.service,
            name: server.name,
            summary: server.summary,
            url: server.url,
            featured: true,
          }))
        : [];
    const latin = text
      .replace(/[^\x20-\x7e]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text !== '' && latin === '') return { apps: featured };
    let page: Awaited<ReturnType<RemoteMcpClient['registry']>>;
    try {
      page = await this.#client.registry(latin, cursor);
    } catch (error) {
      if (cursor !== undefined)
        throw new RemoteMcpError('upstream', 'The MCP Registry is unavailable; try again.');
      this.#log('mcp-registry-failed', { error: error instanceof Error ? error.name : 'unknown' });
      return { apps: featured, offline: true };
    }
    const urls = new Set(FEATURED_MCP_SERVERS.map((server) => server.url));
    const seen = new Set<string>();
    const apps = [...featured];
    for (const server of page.servers) {
      if (urls.has(server.url) || seen.has(server.url)) continue;
      seen.add(server.url);
      const digest = createHash('sha256').update(server.id).digest('hex').slice(0, 8);
      const service = `mcp_${slug(server.id).slice(0, 50) || 'server'}_${digest}`;
      if (!SERVICE.test(service)) continue;
      if (server.icon !== undefined && this.#icons.size < 5000)
        this.#icons.set(service, server.icon);
      if (this.#found.size < 5000) this.#found.set(service, { url: server.url, name: server.name });
      apps.push({
        service,
        name: server.name,
        summary: server.summary,
        url: server.url,
        featured: false,
        ...(server.website === undefined ? {} : { website: server.website }),
      });
    }
    return { apps, ...(page.next === undefined ? {} : { next: page.next }) };
  }

  async add(input: {
    url: string;
    name?: string;
    label?: string;
    icon?: string;
    service?: string;
  }): Promise<{ account: ConnectorAccountRecord; url?: string }> {
    const parsed = remoteMcpUrl(input.url);
    if (parsed === undefined)
      throw new RemoteMcpError('invalid', 'Use an https:// MCP server address.');
    const url = parsed.href;
    const featured = FEATURED_MCP_SERVERS.find((server) => server.url === url);
    const known = this.#store.mcpServers().find((server) => server.url === url);
    const name = (input.name ?? known?.name ?? featured?.name ?? parsed.hostname)
      .trim()
      .slice(0, 80);
    const service =
      known?.service ??
      featured?.service ??
      input.service ??
      `mcp_${slug(name) || slug(parsed.hostname) || 'server'}`.slice(0, 63);
    if (!SERVICE.test(service)) throw new RemoteMcpError('invalid', 'The server name is invalid.');
    const label = (input.label ?? cleanLabel(name)).trim();
    if (!LABEL.test(label)) throw new RemoteMcpError('invalid', 'The account label is invalid.');
    if (
      this.#store
        .accounts()
        .some((account) => account.service === service && account.label === label)
    )
      throw new RemoteMcpError('invalid', 'An account with this label already exists.');
    this.#claim(service, url);
    const oauth = await this.#client.discover(url);
    if (oauth === undefined) {
      const info = await this.#inspect(url);
      this.#claim(service, url);
      this.#saveServer(service, info.name ?? name, url, input.icon);
      const account = this.#store.createAccount({
        provider: 'mcp',
        service,
        label,
        externalId: randomUUID(),
        access: 'write',
      });
      const active = this.#store.updateAccount(account.accountId, { status: 'active' })!;
      this.#log('mcp-added', { service, auth: 'none' });
      this.#changed();
      return { account: active };
    }
    const redirectUri = this.#requireRedirect();
    const client = await this.#clientFor(oauth, redirectUri);
    this.#claim(service, url);
    this.#saveServer(service, name, url, input.icon);
    const account = this.#store.createAccount({
      provider: 'mcp',
      service,
      label,
      externalId: randomUUID(),
    });
    const signIn = await this.#begin(account.accountId, oauth, client, redirectUri);
    this.#log('mcp-added', { service, auth: 'oauth' });
    this.#changed();
    return { account, url: signIn };
  }

  async reconnect(accountId: string): Promise<{ account: ConnectorAccountRecord; url?: string }> {
    const account = this.#mcpAccount(accountId);
    const server = this.#requireServer(account.service);
    const oauth = await this.#client.discover(server.url);
    if (oauth === undefined) {
      await this.#inspect(server.url);
      const active = this.#store.updateAccount(accountId, { status: 'active', access: 'write' })!;
      this.#changed();
      return { account: active };
    }
    const redirectUri = this.#requireRedirect();
    const client = await this.#clientFor(oauth, redirectUri);
    const pending = this.#store.updateAccount(accountId, { status: 'pending', identity: null })!;
    const url = await this.#begin(accountId, oauth, client, redirectUri);
    this.#tools.delete(accountId);
    this.#changed();
    return { account: pending, url };
  }

  async finish(callback: string | URLSearchParams): Promise<ConnectorAccountRecord> {
    const params = typeof callback === 'string' ? new URL(callback.trim()).searchParams : callback;
    const state = params.get('state') ?? '';
    const login = this.#pending.get(state);
    if (login === undefined || login.expiresAt < Date.now()) {
      this.#pending.delete(state);
      throw new RemoteMcpError('invalid', 'This sign-in link expired; start it again.');
    }
    this.#pending.delete(state);
    const current = () => this.#attempts.get(login.accountId) === state;
    const stale = () =>
      new RemoteMcpError('invalid', 'A newer sign-in replaced this one; use the latest link.');
    if (!current()) throw stale();
    const account = this.#store.account(login.accountId);
    if (account === undefined)
      throw new RemoteMcpError('not-found', 'The App connection does not exist.');
    const failure = params.get('error');
    if (failure !== null) {
      this.#attempts.delete(login.accountId);
      this.#store.updateAccount(login.accountId, { status: 'failed' });
      this.#changed();
      throw new RemoteMcpError(
        'invalid',
        `The sign-in was refused: ${(params.get('error_description') ?? failure).slice(0, 200)}`,
      );
    }
    const code = params.get('code');
    if (code === null) throw new RemoteMcpError('invalid', 'The sign-in returned no code.');
    let tokens: OAuthTokens;
    try {
      tokens = await this.#client.exchange(login.oauth, login.client, {
        code,
        ...(params.get('iss') === null ? {} : { iss: params.get('iss')! }),
        verifier: login.verifier,
        redirectUri: login.redirectUri,
      });
    } catch (error) {
      if (!current()) throw stale();
      this.#attempts.delete(login.accountId);
      this.#store.updateAccount(login.accountId, { status: 'failed' });
      this.#changed();
      this.#log('mcp-exchange-failed', { error: error instanceof Error ? error.name : 'unknown' });
      throw new RemoteMcpError('upstream', 'The server refused the sign-in code; try again.');
    }
    if (!current()) throw stale();
    const access = grantedAccess(tokens.scope);
    const auth = this.#stored(login.oauth, login.client, tokens);
    await this.#native().modifyRecord(authKey(login.accountId), async () => ({
      kind: 'grant',
      payload: auth as unknown as Record<string, unknown>,
    }));
    const server = this.#requireServer(account.service);
    let tools: RemoteMcpTool[] | undefined;
    try {
      tools = (await this.#inspect(server.url, auth.accessToken)).tools;
    } catch (error) {
      this.#log('mcp-inspect-failed', { error: error instanceof Error ? error.name : 'unknown' });
    }
    if (!current()) throw stale();
    this.#attempts.delete(login.accountId);
    if (tools === undefined) this.#tools.delete(login.accountId);
    else this.#tools.set(login.accountId, { at: Date.now(), tools: Promise.resolve(tools) });
    const active = this.#store.updateAccount(login.accountId, { status: 'active', access })!;
    this.#log('mcp-signed-in', {
      service: account.service,
      access,
      tools: tools?.length ?? 0,
    });
    this.#changed();
    return active;
  }

  async remove(accountId: string): Promise<void> {
    const account = this.#mcpAccount(accountId);
    await this.#native().deleteRecord(authKey(accountId));
    this.#store.removeAccount(accountId);
    this.#tools.delete(accountId);
    this.#attempts.delete(accountId);
    for (const [state, login] of this.#pending)
      if (login.accountId === accountId) this.#pending.delete(state);
    if (!this.#store.accounts().some((other) => other.service === account.service))
      this.#store.removeMcpServer(account.service);
    this.#log('mcp-removed', { service: account.service });
    this.#changed();
  }

  async connection(
    accountId: string,
  ): Promise<{ url: string; headers: Record<string, string>; expiresAt?: number } | undefined> {
    const account = this.#store.account(accountId);
    if (account === undefined || account.provider !== 'mcp' || account.status !== 'active')
      return undefined;
    const server = this.#store.mcpServer(account.service);
    if (server === undefined) return undefined;
    const auth = await this.#fresh(accountId);
    if (auth === undefined) return { url: server.url, headers: {} };
    if (auth.accessToken === undefined) return undefined;
    return {
      url: server.url,
      headers: { Authorization: `Bearer ${auth.accessToken}` },
      ...(auth.expiresAt === undefined ? {} : { expiresAt: auth.expiresAt }),
    };
  }

  async tools(accountId: string): Promise<RemoteMcpTool[]> {
    const cached = this.#tools.get(accountId);
    if (cached !== undefined && Date.now() - cached.at < TOOLS_TTL_MS) return cached.tools;
    const tools = (async () => {
      const connection = await this.connection(accountId);
      if (connection === undefined) return [];
      const token = connection.headers['Authorization']?.slice('Bearer '.length);
      return (await this.#inspect(connection.url, token)).tools;
    })();
    this.#tools.set(accountId, { at: Date.now(), tools });
    tools.catch(() => {
      if (this.#tools.get(accountId)?.tools === tools) this.#tools.delete(accountId);
    });
    return tools;
  }

  async #inspect(url: string, token?: string) {
    try {
      return await this.#client.inspect(url, token);
    } catch (error) {
      this.#log('mcp-unreachable', { error: error instanceof Error ? error.name : 'unknown' });
      throw new RemoteMcpError(
        'upstream',
        'The MCP server did not answer; check the address and try again.',
      );
    }
  }

  async #fresh(accountId: string): Promise<StoredAuth | undefined> {
    const record = await this.#native().readRecord(authKey(accountId));
    if (record?.kind !== 'grant') return undefined;
    const parsed = storedAuthSchema.safeParse(record.payload);
    if (!parsed.success) {
      this.#expire(accountId);
      return { accessToken: undefined };
    }
    const auth = parsed.data as StoredAuth;
    if (auth.oauth === undefined) return undefined;
    const now = Date.now();
    if (auth.expiresAt === undefined) return auth;
    const refreshable = auth.refreshToken !== undefined && auth.client !== undefined;
    if (auth.expiresAt - (refreshable ? REFRESH_EARLY_MS : 0) > now) return auth;
    if (!refreshable) {
      this.#expire(accountId);
      return { ...auth, accessToken: undefined };
    }
    const running = this.#refreshing.get(accountId);
    if (running !== undefined) return running;
    const refresh = (async () => {
      try {
        const tokens = await this.#client.refresh(auth.oauth!, auth.client!, auth.refreshToken!);
        const next = this.#stored(auth.oauth!, auth.client!, tokens, auth.refreshToken);
        let newer: StoredAuth | undefined;
        await this.#native().modifyRecord(authKey(accountId), async (current) => {
          const stored =
            current?.kind === 'grant' ? storedAuthSchema.safeParse(current.payload) : undefined;
          if (
            stored?.success === true &&
            stored.data.refreshToken === auth.refreshToken &&
            stored.data.accessToken === auth.accessToken
          )
            return { kind: 'grant', payload: next as unknown as Record<string, unknown> };
          newer =
            stored?.success === true ? (stored.data as StoredAuth) : { accessToken: undefined };
          return current;
        });
        if (newer !== undefined) {
          this.#log('mcp-refresh-superseded');
          return newer;
        }
        const held = this.#store.account(accountId);
        if (held?.access !== undefined && typeof tokens.scope === 'string') {
          const updated = this.#store.updateAccount(accountId, {
            status: held.status,
            access: grantedAccess(tokens.scope),
          });
          if (updated?.revision !== held.revision) this.#changed();
        }
        this.#log('mcp-refreshed');
        return next;
      } catch (error) {
        this.#log('mcp-refresh-failed', {
          error: error instanceof Error ? error.name : 'unknown',
        });
        if (error instanceof OAuthError && REJECTED.has(error.code)) {
          const record = await this.#native().readRecord(authKey(accountId));
          const stored =
            record?.kind === 'grant' ? storedAuthSchema.safeParse(record.payload) : undefined;
          if (
            stored?.success === true &&
            (stored.data.refreshToken !== auth.refreshToken ||
              stored.data.accessToken !== auth.accessToken)
          ) {
            this.#log('mcp-refresh-superseded');
            return stored.data as StoredAuth;
          }
          this.#expire(accountId);
          return { ...auth, accessToken: undefined };
        }
        if (auth.expiresAt !== undefined && auth.expiresAt > Date.now()) return auth;
        throw new RemoteMcpError('upstream', 'The MCP server could not renew its sign-in yet.');
      } finally {
        this.#refreshing.delete(accountId);
      }
    })();
    this.#refreshing.set(accountId, refresh);
    return refresh;
  }

  #expire(accountId: string): void {
    const updated = this.#store.updateAccount(accountId, { status: 'expired' });
    if (updated !== undefined) this.#changed();
  }

  #stored(
    oauth: RemoteMcpOAuth,
    client: OAuthClientInformationMixed,
    tokens: OAuthTokens,
    previousRefresh?: string,
  ): StoredAuth {
    const refreshToken = tokens.refresh_token ?? previousRefresh;
    return {
      oauth,
      client,
      accessToken: tokens.access_token,
      ...(refreshToken === undefined ? {} : { refreshToken }),
      ...(typeof tokens.expires_in === 'number'
        ? { expiresAt: Date.now() + tokens.expires_in * 1000 }
        : {}),
    };
  }

  async #begin(
    accountId: string,
    oauth: RemoteMcpOAuth,
    client: OAuthClientInformationMixed,
    redirectUri: string,
  ): Promise<string> {
    const now = Date.now();
    for (const [state, login] of this.#pending)
      if (login.expiresAt < now || login.accountId === accountId) this.#pending.delete(state);
    const state = randomBytes(24).toString('base64url');
    let started: { url: string; verifier: string };
    try {
      started = await this.#client.authorize(oauth, client, redirectUri, state);
    } catch {
      throw new RemoteMcpError('upstream', 'The server could not start a sign-in.');
    }
    this.#attempts.set(accountId, state);
    this.#pending.set(state, {
      accountId,
      oauth,
      client,
      verifier: started.verifier,
      redirectUri,
      expiresAt: now + LOGIN_TTL_MS,
    });
    return started.url;
  }

  async #clientFor(
    oauth: RemoteMcpOAuth,
    redirectUri: string,
  ): Promise<OAuthClientInformationMixed> {
    const key = clientKey(oauth.authorizationServer, redirectUri);
    const record = await this.#native().readRecord(key);
    const stored = record?.kind === 'grant' ? parseClient(record.payload) : undefined;
    if (stored !== undefined) return stored;
    let client: OAuthClientInformationMixed;
    try {
      client = await this.#client.register(oauth, redirectUri);
    } catch (error) {
      this.#log('mcp-register-failed', { error: error instanceof Error ? error.name : 'unknown' });
      throw new RemoteMcpError(
        'upstream',
        'This server does not let new apps register for sign-in, so it cannot be connected here yet.',
      );
    }
    await this.#native().modifyRecord(key, async () => ({
      kind: 'grant',
      payload: client as unknown as Record<string, unknown>,
    }));
    return client;
  }

  #claim(service: string, url: string): void {
    const other = this.#store.mcpServer(service);
    if (other !== undefined && other.url !== url)
      throw new RemoteMcpError('invalid', 'Another MCP server already uses this name.');
  }

  #saveServer(service: string, name: string, url: string, icon?: string): void {
    const remembered = icon ?? this.#icons.get(service);
    this.#store.saveMcpServer({
      service,
      name,
      url,
      ...(remembered === undefined ? {} : { icon: remembered }),
    });
  }

  #requireRedirect(): string {
    const redirect = this.#redirectUri();
    if (redirect === undefined)
      throw new RemoteMcpError('upstream', 'The Host web address is not ready yet; try again.');
    return redirect;
  }

  #requireServer(service: string): ConnectorMcpServerRecord {
    const server = this.#store.mcpServer(service);
    if (server === undefined) throw new RemoteMcpError('not-found', 'The MCP server is unknown.');
    return server;
  }

  #mcpAccount(accountId: string): ConnectorAccountRecord {
    const account = this.#store.account(accountId);
    if (account === undefined || account.provider !== 'mcp')
      throw new RemoteMcpError('not-found', 'The App connection does not exist.');
    return account;
  }
}
