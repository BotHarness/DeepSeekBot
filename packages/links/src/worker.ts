import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { HTTPException } from 'hono/http-exception';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { admin } from './admin.js';
import type { AppEnv } from './env.js';
import { createMcpServer } from './mcp.js';
import * as operations from './operations.js';
import { isPreviewer, sendLinkClicked, siteRoot, targetUrl } from './redirect.js';
import {
  CampaignClicksSchema,
  CampaignCreateSchema,
  CampaignSchema,
  CampaignUpdateSchema,
  CreatedTokenSchema,
  ErrorSchema,
  LinkClicksSchema,
  LinkCreateSchema,
  LinkSchema,
  LinkUpdateSchema,
  RESERVED_SLUGS,
  TokenCreateSchema,
  TokenSchema,
} from './schemas.js';
import { createStore } from './store.js';
import { hashToken, MIN_BOOTSTRAP_LENGTH, sameSecret, TOKEN_PATTERN } from './tokens.js';

export type { LinksEnv, Principal } from './env.js';

const TOUCH_INTERVAL_MS = 3_600_000;

const security = [{ bearerAuth: [] }];
const json = <T extends z.ZodType>(schema: T, description: string) => ({
  content: { 'application/json': { schema } },
  description,
});
const errorResponse = (description: string) => json(ErrorSchema, description);
const authErrors = {
  401: errorResponse('Missing, unknown, expired or revoked token'),
  403: errorResponse('The token scope does not allow this operation'),
};
const SlugParam = z.object({
  slug: z.string().openapi({ param: { name: 'slug', in: 'path' }, example: 'ph-launch' }),
});
const IncludeArchived = z
  .enum(['true', 'false'])
  .optional()
  .openapi({ description: 'true also lists archived entries' });

const error = (code: string) => ({ error: { code } });
const now = () => new Date().toISOString();

export const app = new OpenAPIHono<AppEnv>({
  defaultHook: (result, c) => {
    if (result.success) return;
    return c.json(
      {
        error: {
          code: 'invalid-request',
          issues: result.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      },
      400,
    );
  },
});

app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  description: 'A Personal Access Token (bhl_…); GET needs read or write scope, changes need write',
});

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  console.error(JSON.stringify({ module: 'links-worker', phase: 'error', error: String(err) }));
  return c.json(error('internal-error'), 500);
});

app.use('*', async (c, next) => {
  c.set('store', createStore(c.env.LINKS_DB));
  await next();
});

async function verifyBearer(
  token: string,
  c: Context<AppEnv>,
  allowBootstrap: boolean,
): Promise<boolean> {
  const bootstrap = c.env.LINKS_BOOTSTRAP_TOKEN;
  if (
    allowBootstrap &&
    bootstrap !== undefined &&
    bootstrap.length >= MIN_BOOTSTRAP_LENGTH &&
    (await sameSecret(token, bootstrap))
  ) {
    c.set('principal', { kind: 'bootstrap' });
    return true;
  }
  if (!TOKEN_PATTERN.test(token)) return false;
  const at = new Date();
  const found = await c.var.store.activeToken(await hashToken(token), at.toISOString());
  if (!found) return false;
  c.set('principal', { kind: 'token', id: found.id, scope: found.scope });
  c.executionCtx.waitUntil(
    c.var.store.touchToken(
      found.id,
      at.toISOString(),
      new Date(at.getTime() - TOUCH_INTERVAL_MS).toISOString(),
    ),
  );
  return true;
}

const tokenAuth = (allowBootstrap: boolean) =>
  bearerAuth<AppEnv>({
    noAuthenticationHeader: { message: error('unauthorized') },
    invalidAuthenticationHeader: { message: error('unauthorized') },
    invalidToken: { message: error('unauthorized') },
    verifyToken: (token, c) => verifyBearer(token, c, allowBootstrap),
  });

app.use('/v1/*', tokenAuth(true));

app.use('/v1/*', async (c, next) => {
  const principal = c.var.principal;
  const tokenRoute = c.req.path === '/v1/tokens' || c.req.path.startsWith('/v1/tokens/');
  const reading = c.req.method === 'GET' || c.req.method === 'HEAD';
  if (principal.kind === 'bootstrap') {
    if (!tokenRoute) return c.json(error('bootstrap-token-only-manages-tokens'), 403);
  } else if ((tokenRoute || !reading) && principal.scope !== 'write') {
    return c.json(error('insufficient-scope'), 403);
  }
  await next();
});

app.openapi(
  createRoute({
    method: 'post',
    path: '/v1/tokens',
    tags: ['Tokens'],
    summary: 'Create a Personal Access Token; the plaintext is returned only here',
    security,
    request: { body: { content: { 'application/json': { schema: TokenCreateSchema } } } },
    responses: {
      201: json(CreatedTokenSchema, 'The new token with its plaintext value'),
      400: errorResponse('Invalid request'),
      ...authErrors,
    },
  }),
  async (c) => {
    return c.json(await operations.createToken(c.var.store, c.req.valid('json')), 201);
  },
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/v1/tokens',
    tags: ['Tokens'],
    summary: 'List tokens without their secrets',
    security,
    responses: { 200: json(z.object({ tokens: z.array(TokenSchema) }), 'Tokens'), ...authErrors },
  }),
  async (c) => c.json({ tokens: await c.var.store.tokens() }, 200),
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/v1/tokens/{id}/revoke',
    tags: ['Tokens'],
    summary: 'Revoke a token',
    security,
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: json(TokenSchema, 'The revoked token'),
      404: errorResponse('token-not-found'),
      ...authErrors,
    },
  }),
  async (c) => {
    const result = await operations.revokeToken(c.var.store, c.req.valid('param').id);
    return result.ok ? c.json(result.value, 200) : c.json(error(result.code), result.status);
  },
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/v1/campaigns',
    tags: ['Campaigns'],
    summary: 'Create a Campaign',
    security,
    request: { body: { content: { 'application/json': { schema: CampaignCreateSchema } } } },
    responses: {
      201: json(CampaignSchema, 'The new Campaign'),
      400: errorResponse('Invalid request'),
      409: errorResponse('campaign-slug-taken'),
      ...authErrors,
    },
  }),
  async (c) => {
    const result = await operations.createCampaign(c.var.store, c.req.valid('json'));
    return result.ok ? c.json(result.value, 201) : c.json(error(result.code), result.status);
  },
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/v1/campaigns',
    tags: ['Campaigns'],
    summary: 'List Campaigns, newest first',
    security,
    request: { query: z.object({ includeArchived: IncludeArchived }) },
    responses: {
      200: json(z.object({ campaigns: z.array(CampaignSchema) }), 'Campaigns'),
      ...authErrors,
    },
  }),
  async (c) => {
    const includeArchived = c.req.valid('query').includeArchived === 'true';
    return c.json({ campaigns: await c.var.store.campaigns(includeArchived) }, 200);
  },
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/v1/campaigns/{slug}',
    tags: ['Campaigns'],
    summary: 'Read a Campaign',
    security,
    request: { params: SlugParam },
    responses: {
      200: json(CampaignSchema, 'The Campaign'),
      404: errorResponse('campaign-not-found'),
      ...authErrors,
    },
  }),
  async (c) => {
    const found = await c.var.store.campaign(c.req.valid('param').slug);
    return found ? c.json(found, 200) : c.json(error('campaign-not-found'), 404);
  },
);

app.openapi(
  createRoute({
    method: 'patch',
    path: '/v1/campaigns/{slug}',
    tags: ['Campaigns'],
    summary: 'Update a Campaign name or description; the slug is fixed',
    security,
    request: {
      params: SlugParam,
      body: { content: { 'application/json': { schema: CampaignUpdateSchema } } },
    },
    responses: {
      200: json(CampaignSchema, 'The updated Campaign'),
      400: errorResponse('Invalid request'),
      404: errorResponse('campaign-not-found'),
      ...authErrors,
    },
  }),
  async (c) => {
    const result = await operations.updateCampaign(
      c.var.store,
      c.req.valid('param').slug,
      c.req.valid('json'),
    );
    return result.ok ? c.json(result.value, 200) : c.json(error(result.code), result.status);
  },
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/v1/campaigns/{slug}/archive',
    tags: ['Campaigns'],
    summary: 'Archive a Campaign; its links stop redirecting with UTMs',
    security,
    request: { params: SlugParam },
    responses: {
      200: json(CampaignSchema, 'The archived Campaign'),
      404: errorResponse('campaign-not-found'),
      ...authErrors,
    },
  }),
  async (c) => {
    const result = await operations.archiveCampaign(c.var.store, c.req.valid('param').slug);
    return result.ok ? c.json(result.value, 200) : c.json(error(result.code), result.status);
  },
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/v1/campaigns/{slug}/clicks',
    tags: ['Campaigns'],
    summary: 'Click totals of a Campaign and each of its links',
    security,
    request: { params: SlugParam },
    responses: {
      200: json(CampaignClicksSchema, 'Click totals'),
      404: errorResponse('campaign-not-found'),
      ...authErrors,
    },
  }),
  async (c) => {
    const result = await operations.campaignClicks(c.var.store, c.req.valid('param').slug);
    return result.ok ? c.json(result.value, 200) : c.json(error(result.code), result.status);
  },
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/v1/links',
    tags: ['Links'],
    summary: 'Create a Campaign Link',
    security,
    request: { body: { content: { 'application/json': { schema: LinkCreateSchema } } } },
    responses: {
      201: json(LinkSchema, 'The new Campaign Link'),
      400: errorResponse('Invalid request'),
      404: errorResponse('campaign-not-found'),
      409: errorResponse('link-slug-taken or campaign-archived'),
      ...authErrors,
    },
  }),
  async (c) => {
    const result = await operations.createLink(c.var.store, c.req.valid('json'));
    return result.ok ? c.json(result.value, 201) : c.json(error(result.code), result.status);
  },
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/v1/links',
    tags: ['Links'],
    summary: 'List Campaign Links, newest first',
    security,
    request: {
      query: z.object({
        campaign: z.string().optional().openapi({ description: 'Only links of this Campaign' }),
        includeArchived: IncludeArchived,
      }),
    },
    responses: { 200: json(z.object({ links: z.array(LinkSchema) }), 'Links'), ...authErrors },
  }),
  async (c) => {
    const query = c.req.valid('query');
    const links = await c.var.store.links(query.campaign, query.includeArchived === 'true');
    return c.json({ links: links.map(operations.presentLink) }, 200);
  },
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/v1/links/{slug}',
    tags: ['Links'],
    summary: 'Read a Campaign Link',
    security,
    request: { params: SlugParam },
    responses: {
      200: json(LinkSchema, 'The Campaign Link'),
      404: errorResponse('link-not-found'),
      ...authErrors,
    },
  }),
  async (c) => {
    const result = await operations.readLink(c.var.store, c.req.valid('param').slug);
    return result.ok ? c.json(result.value, 200) : c.json(error(result.code), result.status);
  },
);

app.openapi(
  createRoute({
    method: 'patch',
    path: '/v1/links/{slug}',
    tags: ['Links'],
    summary: 'Update a Campaign Link; its slug and Campaign are fixed',
    security,
    request: {
      params: SlugParam,
      body: { content: { 'application/json': { schema: LinkUpdateSchema } } },
    },
    responses: {
      200: json(LinkSchema, 'The updated Campaign Link'),
      400: errorResponse('Invalid request'),
      404: errorResponse('link-not-found'),
      ...authErrors,
    },
  }),
  async (c) => {
    const result = await operations.updateLink(
      c.var.store,
      c.req.valid('param').slug,
      c.req.valid('json'),
    );
    return result.ok ? c.json(result.value, 200) : c.json(error(result.code), result.status);
  },
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/v1/links/{slug}/archive',
    tags: ['Links'],
    summary: 'Archive a Campaign Link; it then redirects to the site root without UTMs',
    security,
    request: { params: SlugParam },
    responses: {
      200: json(LinkSchema, 'The archived Campaign Link'),
      404: errorResponse('link-not-found'),
      ...authErrors,
    },
  }),
  async (c) => {
    const result = await operations.archiveLink(c.var.store, c.req.valid('param').slug);
    return result.ok ? c.json(result.value, 200) : c.json(error(result.code), result.status);
  },
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/v1/links/{slug}/clicks',
    tags: ['Links'],
    summary: 'Click total and daily (UTC) counts of a Campaign Link',
    security,
    request: {
      params: SlugParam,
      query: z.object({
        days: z.coerce.number().int().min(1).max(366).default(30).openapi({ example: 30 }),
      }),
    },
    responses: {
      200: json(LinkClicksSchema, 'Click counts'),
      400: errorResponse('Invalid request'),
      404: errorResponse('link-not-found'),
      ...authErrors,
    },
  }),
  async (c) => {
    const result = await operations.linkClicks(
      c.var.store,
      c.req.valid('param').slug,
      c.req.valid('query').days,
    );
    return result.ok ? c.json(result.value, 200) : c.json(error(result.code), result.status);
  },
);

app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    title: 'BotHarness Campaign Links',
    version: '1.0.0',
    description:
      'Campaign short links on go.tobs.app (ADR-0132). GET /{slug} redirects to tobs.app with UTM parameters.',
  },
  servers: [{ url: 'https://go.tobs.app' }],
});

app.route('/admin', admin);

app.use('/mcp', tokenAuth(false));

app.all('/mcp', async (c) => {
  if (c.req.method !== 'POST') {
    return c.json(error('method-not-allowed'), 405, { allow: 'POST' });
  }
  const principal = c.var.principal;
  const server = createMcpServer(
    c.var.store,
    principal.kind === 'token' ? principal.scope : 'read',
  );
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

app.get('/', (c) => c.redirect(siteRoot(), 302));

app.openapi(
  createRoute({
    method: 'get',
    path: '/{slug}',
    tags: ['Redirect'],
    summary:
      'Redirect to the product site with utm_campaign, utm_source, utm_medium and utm_content; unknown or archived slugs go to the site root without UTMs',
    request: { params: SlugParam },
    responses: { 302: { description: 'Redirect to tobs.app' } },
  }),
  async (c) => {
    const slug = c.req.valid('param').slug;
    c.header('cache-control', 'no-store');
    const found = RESERVED_SLUGS.has(slug) ? null : await c.var.store.link(slug.toLowerCase());
    if (!found || found.archivedAt || found.campaignArchivedAt) {
      return c.redirect(siteRoot(), 302);
    }
    if (c.req.method === 'GET' && !isPreviewer(c.req.header('user-agent'))) {
      const at = now();
      c.executionCtx.waitUntil(
        Promise.all([
          c.var.store.recordClick(found.id, at).catch((err: unknown) => {
            console.error(
              JSON.stringify({ module: 'links-worker', phase: 'count', error: String(err) }),
            );
          }),
          sendLinkClicked({ host: c.env.POSTHOG_HOST, key: c.env.POSTHOG_KEY }, found, at),
        ]),
      );
    }
    return c.redirect(targetUrl(found), 302);
  },
);

export default app;
