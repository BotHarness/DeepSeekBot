import { z } from 'zod';

export const COMPOSIO_API = 'https://backend.composio.dev/api/v3.1';
export const COMPOSIO_LOGOS = 'https://logos.composio.dev/api';
const LOGO_BYTES = 256 * 1024;
const LOGO_TYPES = new Set(['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const SVG_PROLOG = /^\s*(?:(?:<\?xml[^>]*\?>|<!DOCTYPE svg[^>[]*>)\s*)*/i;
const COMPOSIO_FALLBACK_LOGO = 'composio-fallback';
const UNSAFE_SVG =
  /<!|<\?|<script|<foreignObject|<image|<iframe|<use\b|\bon[a-z]+\s*=|(?:xlink:)?href\s*=\s*["'](?!#)|url\(\s*["']?(?!#)/i;

export class ComposioError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly slug?: string,
  ) {
    super(message);
  }
}

const sessionSchema = z.object({
  session_id: z.string().min(1),
  mcp: z.object({ type: z.string(), url: z.string().min(1) }),
});

const linkSchema = z.object({
  redirect_url: z.string().min(1),
  connected_account_id: z.string().min(1),
});

const accountSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  toolkit: z.object({ slug: z.string() }).optional(),
  alias: z.string().nullish(),
  word_id: z.string().nullish(),
  state: z
    .object({ val: z.record(z.string(), z.unknown()).optional() })
    .passthrough()
    .nullish(),
});

const accountsPageSchema = z.object({
  items: z.array(accountSchema),
  next_cursor: z.string().nullish(),
});

const toolkitsPageSchema = z.object({
  items: z.array(
    z.object({
      slug: z.string().min(1),
      name: z.string().min(1),
      no_auth: z.boolean().nullish(),
      composio_managed_auth_schemes: z.array(z.string()).nullish(),
      meta: z
        .object({
          description: z.string().nullish(),
          categories: z.array(z.object({ name: z.string() })).nullish(),
        })
        .nullish(),
    }),
  ),
  next_cursor: z.string().nullish(),
  total_items: z.number().nullish(),
});

export interface ComposioToolkit {
  service: string;
  name: string;
  summary: string;
  categories: string[];
}

export interface ComposioToolkitPage {
  items: ComposioToolkit[];
  next?: string;
  total?: number;
}

export interface ComposioAccount {
  id: string;
  service: string;
  status: 'active' | 'pending' | 'expired' | 'failed';
  identity?: string;
}

export interface ComposioSession {
  sessionId: string;
  url: string;
}

export interface ComposioClient {
  verify(apiKey: string): Promise<void>;
  link(
    apiKey: string,
    userId: string,
    service: string,
    alias: string,
  ): Promise<{ url: string; accountId: string }>;
  accounts(apiKey: string, userId: string): Promise<ComposioAccount[]>;
  removeAccount(apiKey: string, accountId: string): Promise<void>;
  toolkits(apiKey: string, query: string, cursor?: string): Promise<ComposioToolkitPage>;
  logo(service: string): Promise<string | undefined>;
  session(
    apiKey: string,
    userId: string,
    pinned: Readonly<Record<string, readonly string[]>>,
  ): Promise<ComposioSession>;
}

function status(raw: string): ComposioAccount['status'] {
  switch (raw.toUpperCase()) {
    case 'ACTIVE':
      return 'active';
    case 'INITIALIZING':
    case 'INITIATED':
      return 'pending';
    case 'EXPIRED':
    case 'INACTIVE':
      return 'expired';
    default:
      return 'failed';
  }
}

function identity(account: z.infer<typeof accountSchema>): string | undefined {
  const display = account.state?.val?.['displayName'];
  if (typeof display === 'string' && display.trim() !== '') return display.trim().slice(0, 200);
  const email = account.state?.val?.['email'];
  if (typeof email === 'string' && email.trim() !== '') return email.trim().slice(0, 200);
  return undefined;
}

export function trustedComposioUrl(value: string, base = COMPOSIO_API): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (
    url.protocol === 'https:' &&
    (url.hostname === 'composio.dev' || url.hostname.endsWith('.composio.dev'))
  )
    return true;
  return base !== COMPOSIO_API && new URL(base).origin === url.origin;
}

export function createComposioClient(
  options: { base?: string; logos?: string; fetch?: typeof fetch } = {},
): ComposioClient {
  const base = (options.base ?? COMPOSIO_API).replace(/\/$/, '');
  const logos = (options.logos ?? COMPOSIO_LOGOS).replace(/\/$/, '');
  const fetchImpl = options.fetch ?? fetch;
  const call = async (
    apiKey: string,
    path: string,
    init: { method?: string; body?: unknown; timeoutMs?: number } = {},
  ): Promise<unknown> => {
    const headers: Record<string, string> = { 'x-api-key': apiKey };
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetchImpl(base + path, {
      method: init.method ?? 'GET',
      headers,
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      signal: AbortSignal.timeout(init.timeoutMs ?? 20_000),
    });
    if (!response.ok) {
      let detail = '';
      let slug: string | undefined;
      try {
        const body = (await response.json()) as {
          error?: { message?: unknown; slug?: unknown };
          message?: unknown;
        };
        const message = body.error?.message ?? body.message;
        if (typeof message === 'string') detail = ': ' + message.slice(0, 300);
        if (typeof body.error?.slug === 'string') slug = body.error.slug;
      } catch {
        detail = '';
      }
      throw new ComposioError(
        response.status,
        `Composio returned HTTP ${response.status}${detail}`,
        slug,
      );
    }
    if (response.status === 204) return undefined;
    return (await response.json()) as unknown;
  };

  const client: ComposioClient = {
    async verify(apiKey) {
      await call(apiKey, '/connected_accounts?limit=1');
    },
    async link(apiKey, userId, service, alias) {
      const session = sessionSchema.parse(
        await call(apiKey, '/tool_router/session', {
          method: 'POST',
          body: {
            user_id: userId,
            toolkits: { enable: [service] },
            manage_connections: { enable: true },
            multi_account: { enable: true, max_accounts_per_toolkit: 10 },
          },
        }),
      );
      const link = linkSchema.parse(
        await call(apiKey, `/tool_router/session/${encodeURIComponent(session.session_id)}/link`, {
          method: 'POST',
          body: { toolkit: service, alias },
        }),
      );
      if (!link.redirect_url.startsWith('https://') && !trustedComposioUrl(link.redirect_url, base))
        throw new ComposioError(502, 'Composio returned an untrusted sign-in link');
      return { url: link.redirect_url, accountId: link.connected_account_id };
    },
    async accounts(apiKey, userId) {
      const accounts: ComposioAccount[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 20; page += 1) {
        const query = new URLSearchParams({
          user_ids: userId,
          limit: '100',
          account_type: 'ALL',
        });
        if (cursor !== undefined) query.set('cursor', cursor);
        const body = accountsPageSchema.parse(await call(apiKey, `/connected_accounts?${query}`));
        for (const item of body.items) {
          const found = identity(item);
          accounts.push({
            id: item.id,
            service: item.toolkit?.slug.toLowerCase() ?? '',
            status: status(item.status),
            ...(found === undefined ? {} : { identity: found }),
          });
        }
        if (!body.next_cursor) return accounts;
        cursor = body.next_cursor;
      }
      throw new ComposioError(
        502,
        'Composio returned more connected accounts than one listing reads.',
      );
    },
    async removeAccount(apiKey, accountId) {
      try {
        await call(
          apiKey,
          `/connected_accounts/${encodeURIComponent(accountId)}?revoke_on_delete=true`,
          {
            method: 'DELETE',
          },
        );
      } catch (error) {
        if (!(error instanceof ComposioError) || error.status !== 404) throw error;
      }
    },
    async logo(service) {
      const response = await fetchImpl(`${logos}/${encodeURIComponent(service)}`, {
        signal: AbortSignal.timeout(8_000),
      });
      const type = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
      if (!response.ok || !LOGO_TYPES.has(type)) return undefined;
      const declared = Number(response.headers.get('content-length') ?? '0');
      if (declared > LOGO_BYTES) return undefined;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > LOGO_BYTES) return undefined;
      if (type !== 'image/svg+xml') return `data:${type};base64,${bytes.toString('base64')}`;
      const svg = bytes
        .toString('utf8')
        .replace(/\s+/g, ' ')
        .replace(/<!--.*?-->/g, '')
        .replace(SVG_PROLOG, '')
        .trim();
      if (!/^<svg[\s>]/i.test(svg) || UNSAFE_SVG.test(svg) || svg.includes(COMPOSIO_FALLBACK_LOGO))
        return undefined;
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    },
    async toolkits(apiKey, query, cursor) {
      const params = new URLSearchParams({ limit: '30', sort_by: 'usage' });
      if (query.trim() !== '') params.set('search', query.trim().slice(0, 80));
      if (cursor !== undefined) params.set('cursor', cursor);
      const body = toolkitsPageSchema.parse(await call(apiKey, `/toolkits?${params}`));
      return {
        items: body.items
          .filter(
            (item) =>
              item.no_auth !== true && (item.composio_managed_auth_schemes?.length ?? 0) > 0,
          )
          .map((item) => ({
            service: item.slug.toLowerCase(),
            name: item.name,
            summary: (item.meta?.description ?? '').slice(0, 200),
            categories: (item.meta?.categories ?? []).map((category) => category.name),
          })),
        ...(body.next_cursor ? { next: body.next_cursor } : {}),
        ...(typeof body.total_items === 'number' ? { total: body.total_items } : {}),
      };
    },
    async session(apiKey, userId, pinned) {
      const services = Object.keys(pinned).sort();
      const several = services.some((service) => (pinned[service]?.length ?? 0) > 1);
      const parsed = sessionSchema.parse(
        await call(apiKey, '/tool_router/session', {
          method: 'POST',
          timeoutMs: 30_000,
          body: {
            user_id: userId,
            toolkits: { enable: services },
            connected_accounts: Object.fromEntries(
              services.map((service) => [service, [...(pinned[service] ?? [])]]),
            ),
            manage_connections: { enable: false },
            ...(several
              ? {
                  multi_account: {
                    enable: true,
                    max_accounts_per_toolkit: 10,
                    require_explicit_selection: true,
                  },
                }
              : {}),
          },
        }),
      );
      if (!trustedComposioUrl(parsed.mcp.url, base))
        throw new ComposioError(502, 'Composio returned an untrusted MCP URL');
      return { sessionId: parsed.session_id, url: parsed.mcp.url };
    },
  };
  return client;
}
