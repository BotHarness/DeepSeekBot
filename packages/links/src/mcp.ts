import { z } from '@hono/zod-openapi';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as operations from './operations.js';
import {
  CampaignCreateSchema,
  CampaignUpdateSchema,
  LinkCreateSchema,
  LinkUpdateSchema,
  type Scope,
} from './schemas.js';
import type { Store } from './store.js';

const SlugInput = z.string().min(1).describe('The slug of an existing entry');
const IncludeArchivedInput = z.boolean().optional().describe('Also list archived entries');
const SlugOnly = z.object({ slug: SlugInput });

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const CHANGE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const ARCHIVE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const text = (value: unknown, isError = false): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

const failure = (status: number, code: string) => text({ status, error: { code } }, true);

const toResult = <T>(result: operations.Result<T, number>): CallToolResult =>
  result.ok ? text(result.value) : failure(result.status, result.code);

export function createMcpServer(store: Store, scope: Scope): McpServer {
  const server = new McpServer(
    { name: 'botharness-links', version: '1.0.0' },
    {
      instructions:
        'Campaign short links on go.tobs.app. A Campaign owns Campaign Links; each link has a short URL https://go.tobs.app/<slug> that redirects to tobs.app with utm_campaign, utm_source (platform), utm_medium (media) and utm_content (link slug). Create the Campaign first, then one link per post.',
    },
  );
  const write =
    <A>(handler: (input: A) => Promise<CallToolResult>) =>
    (input: A): Promise<CallToolResult> =>
      scope === 'write' ? handler(input) : Promise.resolve(failure(403, 'insufficient-scope'));

  server.registerTool(
    'campaigns_list',
    {
      description: 'List Campaigns, newest first',
      inputSchema: z.object({ includeArchived: IncludeArchivedInput }),
      annotations: READ,
    },
    async ({ includeArchived }) =>
      text({ campaigns: await store.campaigns(includeArchived === true) }),
  );

  server.registerTool(
    'campaign_create',
    {
      description: 'Create a Campaign; its slug becomes utm_campaign and cannot change',
      inputSchema: CampaignCreateSchema,
      annotations: CHANGE,
    },
    write(async (input) => toResult(await operations.createCampaign(store, input))),
  );

  server.registerTool(
    'campaign_update',
    {
      description: 'Update the name or description of a Campaign',
      inputSchema: CampaignUpdateSchema.extend({ slug: SlugInput }),
      annotations: { ...CHANGE, idempotentHint: true },
    },
    write(async ({ slug, ...changes }) =>
      toResult(await operations.updateCampaign(store, slug, changes)),
    ),
  );

  server.registerTool(
    'campaign_archive',
    {
      description:
        'Archive a Campaign; its links keep redirecting to the site root but without UTMs. Cannot be undone.',
      inputSchema: SlugOnly,
      annotations: ARCHIVE,
    },
    write(async ({ slug }) => toResult(await operations.archiveCampaign(store, slug))),
  );

  server.registerTool(
    'campaign_clicks',
    {
      description: 'Click total of a Campaign and of each of its links',
      inputSchema: SlugOnly,
      annotations: READ,
    },
    async ({ slug }) => toResult(await operations.campaignClicks(store, slug)),
  );

  server.registerTool(
    'links_list',
    {
      description:
        'List Campaign Links with their short URL, target URL with UTMs and click count, newest first',
      inputSchema: z.object({
        campaign: z.string().optional().describe('Only links of this Campaign slug'),
        includeArchived: IncludeArchivedInput,
      }),
      annotations: READ,
    },
    async ({ campaign, includeArchived }) =>
      text({
        links: (await store.links(campaign, includeArchived === true)).map(operations.presentLink),
      }),
  );

  server.registerTool(
    'link_create',
    {
      description:
        'Create a Campaign Link for one post. Returns shortUrl (https://go.tobs.app/<slug>) to put in the post and target, the site URL with UTMs it redirects to. path is the Chinese site path; set language en for the English site.',
      inputSchema: LinkCreateSchema,
      annotations: CHANGE,
    },
    write(async (input) => toResult(await operations.createLink(store, input))),
  );

  server.registerTool(
    'link_update',
    {
      description: 'Update the platform, media, path, language or note of a Campaign Link',
      inputSchema: LinkUpdateSchema.extend({ slug: SlugInput }),
      annotations: { ...CHANGE, idempotentHint: true },
    },
    write(async ({ slug, ...changes }) =>
      toResult(await operations.updateLink(store, slug, changes)),
    ),
  );

  server.registerTool(
    'link_archive',
    {
      description:
        'Archive a Campaign Link; it then redirects to the site root without UTMs. Cannot be undone.',
      inputSchema: SlugOnly,
      annotations: ARCHIVE,
    },
    write(async ({ slug }) => toResult(await operations.archiveLink(store, slug))),
  );

  server.registerTool(
    'link_clicks',
    {
      description: 'Click total and daily (UTC) click counts of a Campaign Link',
      inputSchema: z.object({
        slug: SlugInput,
        days: z.number().int().min(1).max(366).optional().describe('Days to include, default 30'),
      }),
      annotations: READ,
    },
    async ({ slug, days }) => toResult(await operations.linkClicks(store, slug, days ?? 30)),
  );

  return server;
}
