// @vitest-environment jsdom
import { bot, click, entry, withPanel } from './market-panel-fixtures.js';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CHANNEL_BODY_PANEL } from '../src/client/channel-dock-layout.js';

describe('Uploaded Bots in the Market panel', () => {
  const author = { name: 'Alice', id: 'k3x9q2', termsAcceptedAt: '2026-10-27T00:00:00Z' };
  const uploaded = entry('helper', {
    id: 'U_helper',
    owner: 'Alice',
    displayName: 'Helper',
    fullName: 'Alice/Helper',
    htmlUrl: 'https://market.botharness.ai/v1/bots/U_helper',
    cloneUrl: '',
    stars: 0,
    source: 'upload',
    author: {
      name: 'Alice',
      id: 'k3x9q2',
      avatar: 'https://market.botharness.ai/v1/authors/k3x9q2/avatar/a.webp',
    },
  });

  it('shows the author and folder tree, and installs an Uploaded Bot through the Host', async () => {
    const install = vi.fn(async () => bot('helper-copy'));
    await withPanel(
      async () => ({ bots: [uploaded] }),
      async ({ host, actions, registry }) => {
        const tile = document.body.querySelector('[data-market-bot="Alice/Helper"]')!;
        expect(tile.textContent).toContain('Alice #k3x9q2');
        expect(tile.querySelector('[data-market-author-avatar]')?.getAttribute('src')).toBe(
          'https://market.botharness.ai/v1/authors/k3x9q2/avatar/a.webp',
        );
        expect(tile.textContent).not.toContain('★');
        await click(host, '查看 Alice/Helper 详情');
        const files = document.body.querySelector('[data-market-files]')!;
        expect(files.getAttribute('data-market-files')).toBe('3');
        expect(files.querySelector('[data-market-folder="tools"]')?.textContent).toContain(
          'run.sh',
        );
        expect(files.textContent).toContain('脚本');
        expect(document.body.querySelector('.bh-market-github')).toBeNull();
        await click(host, '安装');
        expect(document.body.querySelector('[data-market-author]')?.textContent).toBe(
          'Alice #k3x9q2',
        );
        expect(document.body.querySelector('[data-market-author] img')).not.toBeNull();
        expect(document.body.textContent).toContain('Tob 没发现风险');
        await click(host, '确认安装');
        expect(install).toHaveBeenCalledWith('U_helper', 'review-2', undefined, 'list');
        expect(actions['createBot']).not.toHaveBeenCalled();
        expect(registry.open).toHaveBeenCalledWith(CHANNEL_BODY_PANEL);
      },
      {
        marketplaceInstall: install,
        marketplaceInstallReview: vi.fn(async () => ({
          reviewId: 'review-2',
          listing: uploaded,
          review: { status: 'reviewed', findings: [], files: 3, read: 2, partial: false },
        })),
        marketplaceDetail: vi.fn(async () => ({
          bot: uploaded,
          readme: null,
          readmeLanguage: null,
          commitSha: null,
          files: [
            { path: 'SOUL.md', size: 20, kind: 'text' },
            { path: 'tools/run.sh', size: 8, kind: 'script' },
            { path: '.botharness/avatar.png', size: 2048, kind: 'image' },
          ],
        })),
      },
    );
  });

  it('opens a Bot detail in the panel body and steps back to the list it left', async () => {
    await withPanel(
      async () => ({ bots: [uploaded] }),
      async ({ host, actions }) => {
        const home = document.body.querySelector<HTMLElement>('.bh-market-page')!;
        await click(host, '查看 Alice/Helper 详情');
        expect(actions['telemetryEvent']).toHaveBeenCalledWith('marketplace:bot_open', {
          entry: 'list',
          step: 'detail',
        });
        const page = document.body.querySelector('[data-market-page="bot"]')!;
        expect(page.getAttribute('aria-label')).toBe('Helper');
        expect(home.hidden).toBe(true);
        expect(document.body.querySelector('[role="dialog"]')).toBeNull();
        await click(host, '安装');
        expect(document.body.querySelector('[data-market-install]')).not.toBeNull();
        const backs = [
          ...document.body.querySelectorAll<HTMLElement>('button, [role="menuitem"]'),
        ].filter((item) => item.textContent === '返回');
        await act(async () => backs.at(-1)!.click());
        expect(document.body.querySelector('[data-market-install]')).toBeNull();
        expect(document.body.querySelector('[data-market-page="bot"]')).toBe(page);
        await click(host, '返回');
        expect(document.body.querySelector('[data-market-page="bot"]')).toBeNull();
        expect(home.hidden).toBe(false);
        expect(document.body.querySelector('.bh-market-page')).toBe(home);
      },
      {
        marketplaceInstallReview: vi.fn(async () => ({
          reviewId: 'review-2',
          listing: uploaded,
          review: {
            status: 'reviewed',
            findings: [],
            files: 3,
            read: 2,
            partial: false,
          },
        })),
        marketplaceDetail: vi.fn(async () => ({
          bot: uploaded,
          readme: null,
          readmeLanguage: null,
          commitSha: null,
          files: [],
        })),
      },
    );
  });

  it('shows the file breakdown and reads text files, scripts never as Markdown', async () => {
    const file = vi.fn(async (_id: string, path: string) =>
      path === 'SOUL.md'
        ? { path, size: 20, type: 'markdown', text: '# Soul\n\nI help.' }
        : { path, size: 8, type: 'script', text: '# echo\n**not bold**' },
    );
    await withPanel(
      async () => ({ bots: [uploaded] }),
      async ({ host }) => {
        await click(host, '查看 Alice/Helper 详情');
        const breakdown = document.body.querySelector('[data-market-breakdown]')!;
        expect(
          [...breakdown.querySelectorAll('[data-market-type]')].map((item) => item.textContent),
        ).toEqual(['图片12.0 KB', 'Markdown120 B', '脚本18 B']);
        expect(
          document.body.querySelector('[data-market-scripts]')?.getAttribute('data-market-scripts'),
        ).toBe('1');
        expect(
          document.body.querySelector('[aria-label="查看 .botharness/avatar.png"]'),
        ).toBeNull();

        await click(host, '查看 tools/run.sh');
        await act(async () => {});
        expect(file).toHaveBeenCalledWith('U_helper', 'tools/run.sh');
        const script = document.body.querySelector('[data-market-reader-body="script"]')!;
        expect(script.tagName).toBe('PRE');
        expect(script.textContent).toBe('# echo\n**not bold**');
        expect(document.body.querySelector('[data-market-files]')).toBeNull();

        await click(host, '返回文件列表');
        await click(host, '查看 SOUL.md');
        await act(async () => {});
        const markdown = document.body.querySelector('[data-market-reader-body="markdown"]')!;
        expect(markdown.tagName).toBe('DIV');
        expect(markdown.querySelector('.bh-memory-markdown h1')?.textContent).toBe('Soul');
        expect(markdown.querySelector('.bh-memory-markdown p')?.textContent).toBe('I help.');
      },
      {
        marketplaceFile: file,
        marketplaceDetail: vi.fn(async () => ({
          bot: uploaded,
          readme: null,
          readmeLanguage: null,
          commitSha: null,
          files: [
            { path: 'SOUL.md', size: 20, kind: 'text' },
            { path: 'tools/run.sh', size: 8, kind: 'script' },
            { path: '.botharness/avatar.png', size: 2048, kind: 'image' },
          ],
          fileSummary: {
            count: 3,
            size: 2076,
            types: [
              { type: 'image', count: 1, size: 2048 },
              { type: 'markdown', count: 1, size: 20 },
              { type: 'script', count: 1, size: 8 },
            ],
          },
        })),
      },
    );
  });

  it('lists the package Skills with their descriptions and opens SKILL.md', async () => {
    let notesFailures = 1;
    const file = vi.fn(async (_id: string, path: string) => {
      if (path === '.agents/skills/notes.md' && notesFailures-- > 0) throw new Error('offline');
      return {
        path,
        size: 60,
        type: 'markdown',
        text:
          path === '.dsh/skills/review/SKILL.md'
            ? '---\nname: review\ndescription: Review a pull request\n---\nCheck tests.'
            : '---\nname: notes\ndescription: Keep notes\n---\nWrite notes.',
      };
    });
    await withPanel(
      async () => ({ bots: [uploaded] }),
      async ({ host }) => {
        await click(host, '查看 Alice/Helper 详情');
        await act(async () => {});
        const block = document.body.querySelector('[data-market-skills]')!;
        expect(block.getAttribute('data-market-skills')).toBe('2');
        expect(
          [...block.querySelectorAll('[data-skill-row]')].map((row) => row.textContent),
        ).toEqual(['/notes', '/reviewReview a pull request']);
        await act(async () => {
          block.querySelector<HTMLElement>('[data-skill-row="review"]')!.click();
        });
        await act(async () => {});
        expect(file).toHaveBeenCalledWith('U_helper', '.dsh/skills/review/SKILL.md');
        expect(
          document.body.querySelector('[data-market-reader]')?.getAttribute('data-market-reader'),
        ).toBe('.dsh/skills/review/SKILL.md');
        const body = document.body.querySelector(
          '[data-market-reader-body="markdown"]',
        )!.textContent;
        expect(body).toContain('Check tests.');
        expect(body).not.toContain('description:');

        await click(host, '返回文件列表');
        await act(async () => {});
        expect(
          [...document.body.querySelectorAll('[data-market-skills] [data-skill-row]')].map(
            (row) => row.textContent,
          ),
        ).toEqual(['/notesKeep notes', '/reviewReview a pull request']);
      },
      {
        marketplaceFile: file,
        marketplaceDetail: vi.fn(async () => ({
          bot: uploaded,
          readme: null,
          readmeLanguage: null,
          commitSha: null,
          files: [
            { path: 'SOUL.md', size: 20, kind: 'text' },
            { path: '.agents/skills/review/SKILL.md', size: 60, kind: 'text' },
            { path: '.dsh/skills/review/SKILL.md', size: 60, kind: 'text' },
            { path: '.agents/skills/notes.md', size: 60, kind: 'text' },
          ],
        })),
      },
    );
  });
});
