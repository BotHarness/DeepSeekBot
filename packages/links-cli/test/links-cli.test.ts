import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { app } from '../../links/src/worker.js';
import { createHarness, ORIGIN } from '../../links/test/links-harness.js';
import { run } from '../src/cli.js';
import { createClient, LinksApiError } from '../src/client.js';
import { configPath, DEFAULT_URL, resolveConfig } from '../src/config.js';
import { formatLinks, table } from '../src/format.js';

const homes: string[] = [];

async function home() {
  const directory = await mkdtemp(join(tmpdir(), 'bh-links-'));
  homes.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(homes.splice(0).map((directory) => rm(directory, { recursive: true })));
});

async function setup() {
  const harness = createHarness();
  const { token } = await harness.createToken('write');
  const pending: Promise<unknown>[] = [];
  const executionCtx = {
    waitUntil: (promise: Promise<unknown>) => void pending.push(promise),
    passThroughOnException: () => {},
    props: {},
  };
  const workerFetch: typeof fetch = async (input, init) => {
    const response = await app.request(
      new Request(input, init),
      undefined,
      harness.env,
      executionCtx,
    );
    await Promise.all(pending.splice(0));
    return response;
  };
  const directory = await home();
  const cli = async (args: string[], env: Record<string, string> = {}) => {
    const out: string[] = [];
    const err: string[] = [];
    const code = await run(args, {
      env: { HOME: directory, BH_LINKS_URL: ORIGIN, BH_LINKS_TOKEN: token, ...env },
      stdout: (text) => out.push(text),
      stderr: (text) => err.push(text),
      fetch: workerFetch,
    });
    return { code, stdout: out.join('\n'), stderr: err.join('\n') };
  };
  return { harness, token, workerFetch, cli, directory };
}

describe('links client', () => {
  it('calls the worker API with the PAT and returns typed results', async () => {
    const { token, workerFetch, harness } = await setup();
    const client = createClient({ url: `${ORIGIN}/`, token, fetch: workerFetch });
    await client.createCampaign({ slug: 'ph-launch', name: 'Product Hunt launch' });
    const link = await client.createLink({
      slug: 'ph-x-post',
      campaign: 'ph-launch',
      platform: 'x',
      media: 'post',
    });
    expect(link.shortUrl).toBe('https://go.tobs.app/ph-x-post');
    await harness.request('/ph-x-post');
    expect((await client.links({ campaign: 'ph-launch' }))[0]?.clicks).toBe(1);
    expect((await client.linkClicks('ph-x-post', 7)).total).toBe(1);
    expect((await client.campaignClicks('ph-launch')).total).toBe(1);

    const failure = await client.link('missing').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(LinksApiError);
    expect(failure).toMatchObject({ status: 404, code: 'link-not-found' });
    const invalid = await client
      .createLink({ slug: 'Bad', campaign: 'ph-launch', platform: 'x', media: 'post' })
      .catch((error: unknown) => error as LinksApiError);
    expect(invalid).toMatchObject({ status: 400, code: 'invalid-request' });
    expect((invalid as LinksApiError).issues[0]?.path).toBe('slug');
  });

  it('only calls routes the OpenAPI document publishes', async () => {
    const { harness, token } = await setup();
    const document = (await (await harness.request('/openapi.json')).json()) as {
      paths: Record<string, Record<string, unknown>>;
    };
    const calls: string[] = [];
    const recording: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      const route = url.pathname.replace(/^\/v1\/(campaigns|links)\/[^/]+/, '/v1/$1/{slug}');
      calls.push(`${(init?.method ?? 'GET').toLowerCase()} ${route}`);
      return Response.json({});
    };
    const client = createClient({ url: ORIGIN, token, fetch: recording });
    await client.campaigns(true);
    await client.campaign('c');
    await client.createCampaign({ slug: 'c', name: 'C' });
    await client.updateCampaign('c', { name: 'D' });
    await client.archiveCampaign('c');
    await client.campaignClicks('c');
    await client.links({ campaign: 'c', includeArchived: true });
    await client.link('l');
    await client.createLink({ slug: 'l', campaign: 'c', platform: 'x', media: 'post' });
    await client.updateLink('l', { note: null });
    await client.archiveLink('l');
    await client.linkClicks('l', 3);
    for (const call of calls) {
      const [method, path] = call.split(' ') as [string, string];
      expect(document.paths[path]?.[method], call).toBeDefined();
    }
    expect(calls).toHaveLength(12);
  });
});

describe('bh-links', () => {
  it('creates a campaign and a link and lists the link with its clicks', async () => {
    const { cli, harness } = await setup();
    expect(
      (await cli(['campaigns', 'create', 'ph-launch', '--name', 'Product Hunt launch'])).code,
    ).toBe(0);
    const created = await cli([
      'links',
      'create',
      'ph-x-post',
      '--campaign',
      'ph-launch',
      '--platform',
      'x',
      '--media',
      'post',
      '--path',
      '/docs/overview/',
      '--language',
      'en',
    ]);
    expect(created.code).toBe(0);
    expect(created.stdout).toContain('short URL:  https://go.tobs.app/ph-x-post');
    expect(created.stdout).toContain(
      'target:     https://tobs.app/en/docs/overview/?utm_campaign=ph-launch&utm_source=x&utm_medium=post&utm_content=ph-x-post',
    );

    await harness.request('/ph-x-post');
    await harness.request('/ph-x-post');
    const listed = await cli(['list']);
    expect(listed).toMatchObject({ code: 0, stderr: '' });
    expect(listed.stdout.split('\n')).toEqual([
      'SLUG       SHORT URL                      CAMPAIGN   PLATFORM  MEDIA  CLICKS',
      'ph-x-post  https://go.tobs.app/ph-x-post  ph-launch  x         post   2',
    ]);

    const json = await cli(['links', 'list', '--campaign', 'ph-launch', '--json']);
    expect(JSON.parse(json.stdout)).toMatchObject({ links: [{ slug: 'ph-x-post', clicks: 2 }] });

    const clicks = await cli(['clicks', 'ph-x-post']);
    expect(clicks.stdout).toMatch(/^ph-x-post: 2 clicks, last \d{4}-/);
    expect(clicks.stdout).toMatch(/DAY \(UTC\)\s+CLICKS\n\d{4}-\d{2}-\d{2}\s+2$/);

    expect((await cli(['links', 'update', 'ph-x-post', '--note', 'tweet'])).stdout).toContain(
      'note:       tweet',
    );
    expect((await cli(['links', 'update', 'ph-x-post', '--note', ''])).stdout).not.toContain(
      'note:',
    );
    expect((await cli(['campaigns', 'clicks', 'ph-launch'])).stdout).toContain(
      'ph-launch: 2 clicks',
    );
    expect((await cli(['links', 'archive', 'ph-x-post'])).stdout).toContain('archived:');
    expect((await cli(['list'])).stdout).toBe('No links.');
    expect((await cli(['list', '--all'])).stdout).toContain('ph-x-post (archived)');
    expect((await cli(['campaigns', 'archive', 'ph-launch'])).code).toBe(0);
    expect((await cli(['campaigns', 'list'])).stdout).toBe('No campaigns.');
  });

  it('reports API and usage errors without printing the token', async () => {
    const { cli, token } = await setup();
    const missing = await cli(['links', 'get', 'missing']);
    expect(missing).toMatchObject({ code: 1, stderr: 'bh-links: link-not-found (HTTP 404)' });
    const usage = await cli(['links', 'create', 'x1', '--campaign', 'c1']);
    expect(usage.code).toBe(2);
    expect(usage.stderr).toContain('missing --platform');
    expect((await cli(['links', '--bogus'])).code).toBe(2);
    expect((await cli(['nope'])).code).toBe(2);
    const unauthorized = await cli(['list'], { BH_LINKS_TOKEN: `bhl_${'a'.repeat(43)}` });
    expect(unauthorized).toMatchObject({ code: 1, stderr: 'bh-links: unauthorized (HTTP 401)' });
    const config = await cli(['config']);
    expect(config.stdout).toContain(`${token.slice(0, 12)}… (BH_LINKS_TOKEN)`);
    for (const result of [missing, usage, unauthorized, config]) {
      expect(result.stdout + result.stderr).not.toContain(token);
    }
    expect((await cli(['list'], { BH_LINKS_TOKEN: '' })).stderr).toContain('no token');
  });

  it('logs in by verifying the token and saving it with mode 0600', async () => {
    const { cli, token, directory } = await setup();
    const refused = await cli(['login', '--token', 'nope'], { BH_LINKS_TOKEN: '' });
    expect(refused.code).toBe(2);
    const saved = await cli(['login', '--token', token, '--url', ORIGIN], {
      BH_LINKS_TOKEN: '',
      BH_LINKS_URL: '',
    });
    expect(saved).toMatchObject({ code: 0 });
    expect(saved.stdout).not.toContain(token);
    const file = configPath({ HOME: directory });
    if (process.platform !== 'win32') expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ token, url: ORIGIN });
    const listed = await cli(['list'], { BH_LINKS_TOKEN: '', BH_LINKS_URL: '' });
    expect(listed).toMatchObject({ code: 0, stdout: 'No links.' });
  });
});

describe('configuration', () => {
  it('prefers the environment over the config file over the default', async () => {
    const directory = await home();
    const env = { HOME: directory };
    expect(await resolveConfig(env)).toMatchObject({
      url: DEFAULT_URL,
      token: undefined,
      tokenSource: undefined,
    });
    const file = configPath(env);
    expect(file).toBe(join(directory, '.config', 'botharness', 'links.json'));
    await mkdir(join(directory, '.config', 'botharness'), { recursive: true });
    await writeFile(file, JSON.stringify({ token: 'bhl_file', url: 'http://127.0.0.1:8787' }));
    expect(await resolveConfig(env)).toMatchObject({
      url: 'http://127.0.0.1:8787',
      token: 'bhl_file',
      tokenSource: 'file',
    });
    expect(
      await resolveConfig({ ...env, BH_LINKS_TOKEN: 'bhl_env', BH_LINKS_URL: 'https://x.test' }),
    ).toMatchObject({ url: 'https://x.test', token: 'bhl_env', tokenSource: 'env' });
    expect(configPath({ HOME: directory, XDG_CONFIG_HOME: '/xdg' })).toBe(
      join('/xdg', 'botharness', 'links.json'),
    );
  });
});

describe('formatting', () => {
  it('aligns columns without trailing spaces', () => {
    expect(table(['A', 'LONG'], [['wide-cell', 'x']])).toBe('A          LONG\nwide-cell  x');
    expect(formatLinks([])).toBe('No links.');
  });
});
