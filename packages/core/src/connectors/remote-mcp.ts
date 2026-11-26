import {
  Client,
  StreamableHTTPClientTransport,
  discoverOAuthServerInfo,
  exchangeAuthorization,
  refreshAuthorization,
  registerClient,
  startAuthorization,
  type AuthorizationServerMetadata,
  type OAuthClientInformationMixed,
  type OAuthTokens,
} from '@modelcontextprotocol/client';
import { z } from 'zod';

import { fetchImage, safeImageUrl } from './images.js';

export const MCP_REGISTRY = 'https://registry.modelcontextprotocol.io/v0';

export interface RemoteMcpOAuth {
  authorizationServer: string;
  metadata?: AuthorizationServerMetadata;
  resource: string;
  scope?: string;
}

export interface RemoteMcpTool {
  name: string;
  readOnly: boolean;
}

export interface RemoteMcpServerInfo {
  name?: string;
  tools: RemoteMcpTool[];
}

export interface RegistryServer {
  id: string;
  name: string;
  summary: string;
  url: string;
  icon?: string;
  website?: string;
}

export interface RegistryPage {
  servers: RegistryServer[];
  next?: string;
}

export interface RemoteMcpClient {
  discover(url: string): Promise<RemoteMcpOAuth | undefined>;
  register(oauth: RemoteMcpOAuth, redirectUri: string): Promise<OAuthClientInformationMixed>;
  authorize(
    oauth: RemoteMcpOAuth,
    client: OAuthClientInformationMixed,
    redirectUri: string,
    state: string,
  ): Promise<{ url: string; verifier: string }>;
  exchange(
    oauth: RemoteMcpOAuth,
    client: OAuthClientInformationMixed,
    input: { code: string; iss?: string; verifier: string; redirectUri: string },
  ): Promise<OAuthTokens>;
  refresh(
    oauth: RemoteMcpOAuth,
    client: OAuthClientInformationMixed,
    refreshToken: string,
  ): Promise<OAuthTokens>;
  inspect(url: string, token?: string): Promise<RemoteMcpServerInfo>;
  image(url: string): Promise<string | undefined>;
  registry(query: string, cursor?: string): Promise<RegistryPage>;
}

const remoteSchema = z.object({
  type: z.string(),
  url: z.string(),
  headers: z
    .array(z.object({ name: z.string(), isRequired: z.boolean().nullish() }).passthrough())
    .nullish(),
});

const registrySchema = z.object({
  servers: z.array(
    z.object({
      server: z.object({
        name: z.string().min(1),
        title: z.string().nullish(),
        description: z.string().nullish(),
        websiteUrl: z.string().nullish(),
        icons: z.array(z.object({ src: z.string() }).passthrough()).nullish(),
        remotes: z.array(remoteSchema).nullish(),
      }),
      _meta: z
        .object({
          'io.modelcontextprotocol.registry/official': z
            .object({ status: z.string().nullish(), isLatest: z.boolean().nullish() })
            .passthrough()
            .nullish(),
        })
        .passthrough()
        .nullish(),
    }),
  ),
  metadata: z.object({ nextCursor: z.string().nullish() }).passthrough().nullish(),
});

export function remoteMcpUrl(value: string): URL | undefined {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return undefined;
  }
  if (url.username !== '' || url.password !== '') return undefined;
  if (url.protocol === 'https:') return url;
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  return url.protocol === 'http:' && loopback ? url : undefined;
}

function pick(server: z.infer<typeof registrySchema>['servers'][number]['server']) {
  for (const remote of server.remotes ?? []) {
    if (remote.type !== 'streamable-http') continue;
    if ((remote.headers ?? []).some((header) => header.isRequired === true)) continue;
    if (remote.url.includes('{')) continue;
    const url = remoteMcpUrl(remote.url);
    if (url !== undefined && url.protocol === 'https:') return url.href;
  }
  return undefined;
}

export function createRemoteMcpClient(
  options: { fetch?: typeof fetch; registry?: string; clientName?: string } = {},
): RemoteMcpClient {
  const fetchImpl = options.fetch ?? fetch;
  const registry = (options.registry ?? MCP_REGISTRY).replace(/\/$/, '');
  const clientName = options.clientName ?? 'Tobs';
  return {
    async discover(url) {
      let info: Awaited<ReturnType<typeof discoverOAuthServerInfo>>;
      try {
        info = await discoverOAuthServerInfo(url, { fetchFn: fetchImpl });
      } catch {
        return undefined;
      }
      if (info.authorizationServerMetadata === undefined && info.resourceMetadata === undefined)
        return undefined;
      const scopes = info.resourceMetadata?.scopes_supported;
      return {
        authorizationServer: String(info.authorizationServerUrl),
        ...(info.authorizationServerMetadata === undefined
          ? {}
          : { metadata: info.authorizationServerMetadata }),
        resource: info.resourceMetadata?.resource ?? url,
        ...(scopes !== undefined && scopes.length > 0 ? { scope: scopes.join(' ') } : {}),
      };
    },
    async register(oauth, redirectUri) {
      return registerClient(oauth.authorizationServer, {
        ...(oauth.metadata === undefined ? {} : { metadata: oauth.metadata }),
        clientMetadata: {
          client_name: clientName,
          redirect_uris: [redirectUri],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
          ...(oauth.scope === undefined ? {} : { scope: oauth.scope }),
        },
        fetchFn: fetchImpl,
      });
    },
    async authorize(oauth, client, redirectUri, state) {
      const started = await startAuthorization(oauth.authorizationServer, {
        ...(oauth.metadata === undefined ? {} : { metadata: oauth.metadata }),
        clientInformation: client,
        redirectUrl: redirectUri,
        state,
        resource: new URL(oauth.resource),
        ...(oauth.scope === undefined ? {} : { scope: oauth.scope }),
      });
      return { url: started.authorizationUrl.href, verifier: started.codeVerifier };
    },
    exchange(oauth, client, input) {
      return exchangeAuthorization(oauth.authorizationServer, {
        ...(oauth.metadata === undefined ? {} : { metadata: oauth.metadata }),
        clientInformation: client,
        authorizationCode: input.code,
        ...(input.iss === undefined ? {} : { iss: input.iss }),
        codeVerifier: input.verifier,
        redirectUri: input.redirectUri,
        resource: new URL(oauth.resource),
        fetchFn: fetchImpl,
      });
    },
    refresh(oauth, client, refreshToken) {
      return refreshAuthorization(oauth.authorizationServer, {
        ...(oauth.metadata === undefined ? {} : { metadata: oauth.metadata }),
        clientInformation: client,
        refreshToken,
        resource: new URL(oauth.resource),
        fetchFn: fetchImpl,
      });
    },
    async inspect(url, token) {
      const client = new Client({ name: clientName, version: '1.0.0' });
      const transport = new StreamableHTTPClientTransport(new URL(url), {
        fetch: fetchImpl,
        ...(token === undefined
          ? {}
          : { requestInit: { headers: { Authorization: `Bearer ${token}` } } }),
      });
      await client.connect(transport);
      try {
        const tools: RemoteMcpTool[] = [];
        let cursor: string | undefined;
        for (let page = 0; page < 20; page += 1) {
          const listed = await client.listTools(cursor === undefined ? {} : { cursor });
          for (const tool of listed.tools)
            tools.push({ name: tool.name, readOnly: tool.annotations?.readOnlyHint === true });
          cursor = listed.nextCursor;
          if (cursor === undefined) break;
        }
        const name = client.getServerVersion()?.title ?? client.getServerVersion()?.name;
        return { ...(name === undefined ? {} : { name }), tools };
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    async image(url) {
      const safe = safeImageUrl(url);
      return safe === undefined ? undefined : fetchImage(fetchImpl, safe.href);
    },
    async registry(query, cursor) {
      const params = new URLSearchParams({ limit: '30', version: 'latest' });
      if (query.trim() !== '') params.set('search', query.trim().slice(0, 80));
      if (cursor !== undefined) params.set('cursor', cursor);
      const response = await fetchImpl(`${registry}/servers?${params}`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`MCP Registry answered ${response.status}`);
      const body = registrySchema.parse(await response.json());
      const servers: RegistryServer[] = [];
      for (const entry of body.servers) {
        const official = entry._meta?.['io.modelcontextprotocol.registry/official'];
        if (
          official?.status !== undefined &&
          official.status !== null &&
          official.status !== 'active'
        )
          continue;
        const url = pick(entry.server);
        if (url === undefined) continue;
        const icon = entry.server.icons?.map((item) => safeImageUrl(item.src)).find(Boolean);
        const website =
          entry.server.websiteUrl === undefined || entry.server.websiteUrl === null
            ? undefined
            : safeImageUrl(entry.server.websiteUrl);
        servers.push({
          id: entry.server.name,
          name: (
            entry.server.title ??
            entry.server.name.split('/').pop() ??
            entry.server.name
          ).slice(0, 80),
          summary: (entry.server.description ?? '').slice(0, 200),
          url,
          ...(icon === undefined ? {} : { icon: icon.href }),
          ...(website === undefined ? {} : { website: website.href }),
        });
      }
      const next = body.metadata?.nextCursor;
      return { servers, ...(next ? { next } : {}) };
    },
  };
}
