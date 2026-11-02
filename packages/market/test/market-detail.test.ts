import { describe, expect, it } from 'vitest';
import { prepareReadme, rewriteUrl } from '../src/readme.js';
import { createMarket, fakeRepository, submit } from './market-harness.js';

const source = { owner: 'alice', name: 'helper-bot', ref: 'abc123' };
const raw = 'https://raw.githubusercontent.com/alice/helper-bot/abc123';
const blob = 'https://github.com/alice/helper-bot/blob/abc123';

describe('README preparation', () => {
  it('rewrites relative images and links against the commit', () => {
    const markdown = [
      '![logo](./docs/logo.png "Logo")',
      'See [setup](docs/setup.md#install) and [root](/LICENSE).',
      '[up](../outside.md)',
      '[ref]: assets/shot.png',
      '[anchor](#usage) [site](https://example.com) [mail](mailto:a@example.com)',
      '![remote](https://img.shields.io/badge/x.svg)',
    ].join('\n');

    expect(prepareReadme(markdown, source).split('\n')).toEqual([
      `![logo](<${raw}/docs/logo.png> "Logo")`,
      `See [setup](<${blob}/docs/setup.md#install>) and [root](<${blob}/LICENSE>).`,
      `[up](<${blob}/outside.md>)`,
      `[ref]: <${blob}/assets/shot.png>`,
      `[anchor](<https://github.com/alice/helper-bot#usage>) [site](<https://example.com>) [mail](<mailto:a@example.com>)`,
      '![remote](<https://img.shields.io/badge/x.svg>)',
    ]);
  });

  it('turns common README HTML into Markdown and drops the rest', () => {
    const markdown = [
      '<p align="center"><img src="assets/banner.png" alt="Banner" width="300"></p>',
      '<a href="docs/guide.md"><b>Guide</b></a><br>Next line',
      '<details><summary>More</summary>Hidden text</details>',
      'Docs at <https://docs.example.com> or <team@example.com>.',
    ].join('\n');

    expect(prepareReadme(markdown, source).split('\n')).toEqual([
      `![Banner](<${raw}/assets/banner.png>)`,
      `[Guide](<${blob}/docs/guide.md>)`,
      'Next line',
      'MoreHidden text',
      'Docs at <https://docs.example.com> or <team@example.com>.',
    ]);
  });

  it('removes scripts, event handlers and unsafe URLs', () => {
    const markdown = [
      '<script>alert(1)</script>Safe',
      '<img src="x.png" onerror="alert(1)">',
      '<img src="javascript:alert(1)">',
      '<a href="javascript:alert(1)">click</a>',
      '[bad](javascript:alert(1)) ![bad](data:image/svg+xml;base64,PHN2Zz4=)',
      '[ref]: vbscript:msgbox',
      '<iframe src="https://evil.example"></iframe><style>body{}</style>',
      '<div onclick="steal()">text</div>',
    ].join('\n');

    const prepared = prepareReadme(markdown, source);

    expect(prepared).not.toMatch(/script|onerror|onclick|data:|iframe|style|<div/iu);
    expect(prepared.split('\n')).toEqual([
      'Safe',
      `![](<${raw}/x.png>)`,
      '',
      'click',
      'bad ',
      '',
      'text',
    ]);
  });

  it('leaves code untouched', () => {
    const markdown = [
      '```html',
      '<img src="local.png">',
      '[x](relative.md)',
      '```',
      'Use `[x](relative.md)` literally and [y](y.md).',
      '| [`@scope/pkg`](packages/pkg) | Table cell |',
    ].join('\n');

    expect(prepareReadme(markdown, source).split('\n')).toEqual([
      '```html',
      '<img src="local.png">',
      '[x](relative.md)',
      '```',
      `Use \`[x](relative.md)\` literally and [y](<${blob}/y.md>).`,
      `| [\`@scope/pkg\`](<${blob}/packages/pkg>) | Table cell |`,
    ]);
  });

  it('refuses unsafe schemes and keeps safe ones', () => {
    expect(rewriteUrl('JavaScript:alert(1)', source, 'link')).toBeUndefined();
    expect(rewriteUrl('file:///etc/passwd', source, 'image')).toBeUndefined();
    expect(rewriteUrl('//cdn.example/x.png', source, 'image')).toBe('https://cdn.example/x.png');
    expect(rewriteUrl('img/a b.png?raw=1', source, 'image')).toBe(`${raw}/img/a b.png`);
  });
});

describe('Marketplace Worker detail', () => {
  it('returns metadata, prepared README and the commit used for rewriting', async () => {
    const market = createMarket();
    const repository = fakeRepository({ readme: '# Helper\n\n![shot](docs/shot.png)' });
    market.publish(repository);
    await submit(market, repository.htmlUrl);

    const response = await market.request(`/v1/bots/${encodeURIComponent(repository.nodeId)}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      bot: expect.objectContaining({ fullName: 'alice/helper-bot' }),
      readme: `# Helper\n\n![shot](<https://raw.githubusercontent.com/alice/helper-bot/${repository.head?.sha}/docs/shot.png>)`,
      readmeLanguage: null,
      readmeLanguages: [],
      commitSha: repository.head?.sha,
    });
  });

  it('falls back to the default branch without a head commit and to null without a README', async () => {
    const market = createMarket();
    const repository = fakeRepository({ readme: null });
    market.publish(repository);
    await submit(market, repository.htmlUrl);
    market.sqlite
      .prepare('UPDATE indexed_repositories SET head_sha = NULL, readme = ? WHERE node_id = ?')
      .run('![a](a.png)', repository.nodeId);

    const detail = (await (await market.request(`/v1/bots/${repository.nodeId}`)).json()) as {
      readme: string;
      commitSha: string | null;
    };

    expect(detail).toMatchObject({
      readme: '![a](<https://raw.githubusercontent.com/alice/helper-bot/main/a.png>)',
      commitSha: null,
    });

    market.sqlite
      .prepare('UPDATE indexed_repositories SET readme = NULL WHERE node_id = ?')
      .run(repository.nodeId);
    expect(await (await market.request(`/v1/bots/${repository.nodeId}`)).json()).toMatchObject({
      readme: null,
    });
  });

  it('does not serve hidden or unknown entries', async () => {
    const market = createMarket();
    const repository = fakeRepository();
    market.publish(repository);
    await submit(market, repository.htmlUrl);
    market.publish({ ...repository, archived: true });
    await submit(market, repository.htmlUrl);

    expect((await market.request(`/v1/bots/${repository.nodeId}`)).status).toBe(404);
    expect((await market.request('/v1/bots/R_unknown')).status).toBe(404);
    expect((await market.request('/v1/bots/%E0%A4%A')).status).toBe(404);
    expect((await market.request(`/v1/bots/${repository.nodeId}`, { method: 'POST' })).status).toBe(
      405,
    );
  });
});
