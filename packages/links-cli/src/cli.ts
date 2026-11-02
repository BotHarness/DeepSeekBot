import { parseArgs } from 'node:util';
import { TOKEN_PATTERN } from '../../links/src/tokens.js';
import { createClient, LinksApiError, type LinksClient } from './client.js';
import {
  configPath,
  maskToken,
  readStoredConfig,
  resolveConfig,
  writeStoredConfig,
} from './config.js';
import {
  formatCampaign,
  formatCampaignClicks,
  formatCampaigns,
  formatLink,
  formatLinkClicks,
  formatLinks,
} from './format.js';

export interface CliIo {
  env: NodeJS.ProcessEnv;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  readStdin?: () => Promise<string>;
  fetch?: typeof fetch;
}

export const HELP = `bh-links: manage go.tobs.app Campaign short links

Usage:
  bh-links list [--campaign <slug>] [--all]          alias of links list
  bh-links links list [--campaign <slug>] [--all]
  bh-links links get <slug>
  bh-links links create [<slug>] --campaign <slug> --platform <label> --media <label>
                        [--path /docs/] [--language zh|en] [--note <text>]
  bh-links links update <slug> [--platform] [--media] [--path] [--language] [--note]
  bh-links links archive <slug>
  bh-links clicks <link> [--days 30]
  bh-links campaigns list [--all]
  bh-links campaigns get <slug>
  bh-links campaigns create <slug> --name <name> [--description <text>]
  bh-links campaigns update <slug> [--name <name>] [--description <text>]
  bh-links campaigns archive <slug>
  bh-links campaigns clicks <slug>
  bh-links login [--token <bhl_…>] [--url <url>]    token from stdin, or a hidden prompt, when --token is omitted
  bh-links config

Options:
  --json   print the API response as JSON
  --all    include archived entries

Configuration: BH_LINKS_TOKEN and BH_LINKS_URL (default https://go.tobs.app) override
~/.config/botharness/links.json, which bh-links login writes with mode 0600.
An empty --note or --description clears it.
`;

const OPTIONS = {
  json: { type: 'boolean' },
  all: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  campaign: { type: 'string' },
  platform: { type: 'string' },
  media: { type: 'string' },
  path: { type: 'string' },
  language: { type: 'string' },
  note: { type: 'string' },
  name: { type: 'string' },
  description: { type: 'string' },
  days: { type: 'string' },
  token: { type: 'string' },
  url: { type: 'string' },
} as const;

type Values = ReturnType<
  typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>
>['values'];

class UsageError extends Error {}

function required(value: string | undefined, name: string): string {
  if (value === undefined || value === '') throw new UsageError(`missing ${name}`);
  return value;
}

function language(value: string | undefined): 'zh' | 'en' | undefined {
  if (value === undefined) return undefined;
  if (value !== 'zh' && value !== 'en') throw new UsageError('--language must be zh or en');
  return value;
}

function days(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new UsageError('--days must be a whole number');
  return parsed;
}

const clearable = (value: string | undefined) =>
  value === undefined ? {} : { value: value === '' ? null : value };

function defined<T extends Record<string, unknown>>(values: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

async function linksCommand(
  client: LinksClient,
  action: string | undefined,
  slug: string | undefined,
  values: Values,
): Promise<{ data: unknown; text: string }> {
  switch (action ?? 'list') {
    case 'list': {
      const links = await client.links({ campaign: values.campaign, includeArchived: values.all });
      return { data: { links }, text: formatLinks(links) };
    }
    case 'get': {
      const link = await client.link(required(slug, '<slug>'));
      return { data: link, text: formatLink(link) };
    }
    case 'create': {
      const link = await client.createLink(
        defined({
          slug,
          campaign: required(values.campaign, '--campaign'),
          platform: required(values.platform, '--platform'),
          media: required(values.media, '--media'),
          path: values.path,
          language: language(values.language),
          note: values.note || undefined,
        }) as Parameters<LinksClient['createLink']>[0],
      );
      return { data: link, text: formatLink(link) };
    }
    case 'update': {
      const note = clearable(values.note);
      const link = await client.updateLink(required(slug, '<slug>'), {
        ...defined({
          platform: values.platform,
          media: values.media,
          path: values.path,
          language: language(values.language),
        }),
        ...('value' in note ? { note: note.value } : {}),
      });
      return { data: link, text: formatLink(link) };
    }
    case 'archive': {
      const link = await client.archiveLink(required(slug, '<slug>'));
      return { data: link, text: formatLink(link) };
    }
    default:
      throw new UsageError(`unknown links command: ${action}`);
  }
}

async function campaignsCommand(
  client: LinksClient,
  action: string | undefined,
  slug: string | undefined,
  values: Values,
): Promise<{ data: unknown; text: string }> {
  switch (action ?? 'list') {
    case 'list': {
      const campaigns = await client.campaigns(values.all);
      return { data: { campaigns }, text: formatCampaigns(campaigns) };
    }
    case 'get': {
      const campaign = await client.campaign(required(slug, '<slug>'));
      return { data: campaign, text: formatCampaign(campaign) };
    }
    case 'create': {
      const campaign = await client.createCampaign({
        slug: required(slug, '<slug>'),
        name: required(values.name, '--name'),
        ...(values.description ? { description: values.description } : {}),
      });
      return { data: campaign, text: formatCampaign(campaign) };
    }
    case 'update': {
      const description = clearable(values.description);
      const campaign = await client.updateCampaign(required(slug, '<slug>'), {
        ...(values.name === undefined ? {} : { name: values.name }),
        ...('value' in description ? { description: description.value } : {}),
      });
      return { data: campaign, text: formatCampaign(campaign) };
    }
    case 'archive': {
      const campaign = await client.archiveCampaign(required(slug, '<slug>'));
      return { data: campaign, text: formatCampaign(campaign) };
    }
    case 'clicks': {
      const clicks = await client.campaignClicks(required(slug, '<slug>'));
      return { data: clicks, text: formatCampaignClicks(clicks) };
    }
    default:
      throw new UsageError(`unknown campaigns command: ${action}`);
  }
}

async function login(values: Values, io: CliIo): Promise<string> {
  const token = (values.token ?? (io.readStdin ? await io.readStdin() : '')).trim();
  if (!TOKEN_PATTERN.test(token)) {
    throw new UsageError('give a Personal Access Token (bhl_…) with --token or on stdin');
  }
  const file = configPath(io.env);
  const stored = await readStoredConfig(file);
  const url = values.url ?? stored.url;
  await createClient({
    url: url ?? (await resolveConfig(io.env, file)).url,
    token,
    ...(io.fetch ? { fetch: io.fetch } : {}),
  }).campaigns();
  await writeStoredConfig(file, { ...stored, token, ...(url ? { url } : {}) });
  return `Saved ${maskToken(token)} to ${file}`;
}

export async function run(argv: string[], io: CliIo): Promise<number> {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      options: OPTIONS,
      allowPositionals: true,
      strict: true,
    });
    const [command, action, slug] = positionals;
    if (values.help || command === undefined || command === 'help') {
      io.stdout(HELP);
      return 0;
    }
    if (command === 'login') {
      io.stdout(await login(values, io));
      return 0;
    }
    const config = await resolveConfig(io.env);
    if (command === 'config') {
      const token = config.token
        ? `${maskToken(config.token)} (${config.tokenSource === 'env' ? 'BH_LINKS_TOKEN' : config.file})`
        : 'not set';
      io.stdout(`url:    ${config.url}\ntoken:  ${token}`);
      return 0;
    }
    if (!config.token) {
      throw new UsageError('no token: set BH_LINKS_TOKEN or run bh-links login');
    }
    const client = createClient({
      url: config.url,
      token: config.token,
      ...(io.fetch ? { fetch: io.fetch } : {}),
    });
    let result: { data: unknown; text: string };
    if (command === 'list') result = await linksCommand(client, 'list', undefined, values);
    else if (command === 'links') result = await linksCommand(client, action, slug, values);
    else if (command === 'campaigns') result = await campaignsCommand(client, action, slug, values);
    else if (command === 'clicks') {
      const clicks = await client.linkClicks(required(action, '<link>'), days(values.days));
      result = { data: clicks, text: formatLinkClicks(clicks) };
    } else throw new UsageError(`unknown command: ${command}`);
    io.stdout(values.json ? JSON.stringify(result.data, null, 2) : result.text);
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      io.stderr(`bh-links: ${error.message}\nRun bh-links --help for usage.`);
      return 2;
    }
    if (error instanceof LinksApiError) {
      io.stderr(`bh-links: ${error.message}`);
      return 1;
    }
    if (
      error instanceof TypeError &&
      'code' in error &&
      String(error.code).startsWith('ERR_PARSE_ARGS')
    ) {
      io.stderr(`bh-links: ${error.message}\nRun bh-links --help for usage.`);
      return 2;
    }
    io.stderr(`bh-links: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
