// @vitest-environment jsdom
import { bot, click, draftView, entry, withPanel } from './market-panel-fixtures.js';
import { describe, expect, it, vi } from 'vitest';
import { CHANNEL_BODY_PANEL } from '../src/client/channel-dock-layout.js';
import { store } from '../src/client/store.js';

describe('Market panel', () => {
  it('shows what Tob found before installing, and installs only after the Human continues', async () => {
    const review = vi.fn(async () => ({
      reviewId: 'review-1',
      listing: entry('helper'),
      review: {
        status: 'reviewed',
        findings: [
          {
            kind: 'exfiltration',
            path: 'SOUL.md',
            note: '让 Bot 把 ~/.ssh 发到外部邮箱。',
          },
          { kind: 'script', path: 'tools/run.sh' },
        ],
        files: 3,
        read: 2,
        partial: false,
      },
    }));
    const install = vi.fn(async () => bot('helper'));
    await withPanel(
      async () => ({ bots: [entry('helper')] }),
      async ({ host, actions, registry }) => {
        await click(host, '导入');
        expect(document.body.querySelector('[role="dialog"] h2')?.textContent).toBe('安装 helper');
        expect(review).toHaveBeenCalledWith('R_helper', 'zh');
        expect(document.body.textContent).toContain('Tob 发现 2 处需要留意');
        const findings = [...document.body.querySelectorAll('[data-market-finding]')];
        expect(findings.map((item) => item.getAttribute('data-market-finding'))).toEqual([
          'exfiltration',
          'script',
        ]);
        expect(findings[0]!.textContent).toContain(
          '外发数据SOUL.md让 Bot 把 ~/.ssh 发到外部邮箱。',
        );

        await click(host, '仍然安装');

        expect(install).toHaveBeenCalledWith('R_helper', 'review-1', undefined, 'list');
        expect(actions['telemetryEvent']).toHaveBeenCalledWith('marketplace:bot_open', {
          entry: 'list',
          step: 'install',
        });
        expect(actions['createBot']).not.toHaveBeenCalled();
        expect(registry.open).toHaveBeenCalledWith(CHANNEL_BODY_PANEL);
        expect(document.body.querySelector('[role="dialog"] h2')).toBeNull();
        expect(document.body.querySelector('[data-market-panel]')).not.toBeNull();
      },
      { marketplaceInstallReview: review, marketplaceInstall: install },
    );
  });

  it('leaves no Bot behind when the Human goes back from the review', async () => {
    const install = vi.fn(async () => bot('helper'));
    await withPanel(
      async () => ({ bots: [entry('helper')] }),
      async ({ host }) => {
        await click(host, '导入');
        await click(host, '返回');
        expect(install).not.toHaveBeenCalled();
        expect(document.body.querySelector('[data-market-panel]')).not.toBeNull();
      },
      {
        marketplaceInstallReview: vi.fn(async () => ({
          reviewId: 'review-1',
          listing: entry('helper'),
          review: {
            status: 'reviewed',
            findings: [{ kind: 'prompt-injection', path: 'SOUL.md' }],
            files: 1,
            read: 1,
            partial: false,
          },
        })),
        marketplaceInstall: install,
      },
    );
  });

  it('says when Tob could not review and lets the Human install anyway', async () => {
    const install = vi.fn(async () => bot('helper'));
    await withPanel(
      async () => ({ bots: [entry('helper')] }),
      async ({ host }) => {
        await click(host, '导入');
        expect(
          document.body.querySelector('[data-market-review]')?.getAttribute('data-market-review'),
        ).toBe('unavailable');
        expect(document.body.textContent).toContain('Tob 没能检查这个 Bot');
        await click(host, '不检查直接安装');
        expect(install).toHaveBeenCalledWith('R_helper', 'review-3', undefined, 'list');
      },
      {
        marketplaceInstallReview: vi.fn(async () => ({
          reviewId: 'review-3',
          listing: entry('helper'),
          review: { status: 'unavailable', reason: 'no-model', findings: [], files: 1 },
        })),
        marketplaceInstall: install,
      },
    );
  });

  it('hands the Share Draft check to Tob in its DM', async () => {
    store.setRoster(
      [
        bot('writer', { displayName: 'Writer' }),
        bot('tob', { tob: { defaultName: true, defaultAvatar: true } }),
        bot('gone', { deleted: true }),
      ],
      [],
    );
    const start = vi.fn(async () => draftView('reviewing'));
    const sendHome = vi.fn(async () => undefined);
    await withPanel(
      async () => ({ bots: [] }),
      async ({ host, registry }) => {
        await click(host, '上传 Bot');
        await click(host, '分享 Bot');
        const choices = [
          ...document.body.querySelectorAll('[data-market-direct="bot"] [role="listitem"] button'),
        ];
        expect(choices.map((choice) => choice.getAttribute('aria-label'))).toEqual(['Writer']);
        await click(host, 'Writer');
        expect(document.body.querySelector('[data-market-draft-meta]')?.textContent).toBe(
          'Tob 会逐个文件问你，原文件不会改动。',
        );
        await click(host, '让 Tob 检查');
        expect(start).toHaveBeenCalledWith('writer');
        expect(sendHome).toHaveBeenCalledWith(
          'tob-dm',
          expect.stringContaining('（Bot ID：writer）'),
          expect.stringMatching(/^human-/u),
        );
        expect(registry.open).toHaveBeenCalledWith(CHANNEL_BODY_PANEL);
        expect(document.body.querySelector('[data-market-upload]')).toBeNull();
      },
      {
        shareDraftGet: vi.fn(async () => undefined),
        shareDraftStart: start,
        tobHome: vi.fn(async () => ({ botSlug: 'tob', channelId: 'tob-dm' })),
        sendHome,
      },
    );
  });
});
