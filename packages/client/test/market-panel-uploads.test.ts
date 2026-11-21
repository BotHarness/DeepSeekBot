// @vitest-environment jsdom
import { bot, button, click, draftView, entry, withPanel } from './market-panel-fixtures.js';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { BridgeActions } from '../src/client/actions.js';
import type { DockPanelRegistry } from '../src/client/dock-panels.js';
import { BridgeCallError } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import { MyUploadsSettingsRow } from '../src/client/market-mine.js';
import { MarketUploadDialog } from '../src/client/market-upload.js';
import { store } from '../src/client/store.js';
import { resourceEvents } from './resource-events-fixture.js';

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

  it('uploads a checked draft after the author signs up', async () => {
    store.setRoster(
      [bot('writer', { displayName: 'Writer', description: 'Writes', roles: ['writing'] })],
      [],
    );
    const account = vi.fn(async () => ({ signedIn: true, email: 'a@example.com', author: null }));
    const save = vi.fn(async () => ({ ...author, name: '爱丽丝' }));
    const plan = vi.fn(async () => ({
      files: [{ path: 'SOUL.md', size: 10, kind: 'text' }],
      skipped: [{ path: 'tool.exe', reason: 'file-type-refused' }],
      totalBytes: 10,
    }));
    const upload = vi.fn(async () => ({ bot: uploaded, skipped: [] }));
    await withPanel(
      async () => ({ bots: [] }),
      async ({ host }) => {
        await click(host, '上传 Bot');
        await click(host, '分享 Bot');
        await click(host, 'Writer');
        expect(document.body.querySelector('[data-market-draft-meta]')?.textContent).toBe(
          '保留 2 · 改写 1 · 删除 1',
        );
        await click(host, '下一步');
        expect(document.body.querySelector('[aria-current="step"]')?.textContent).toBe('3去向');
        await click(host, 'Tobs 市场');
        const nameInput = document.body.querySelector<HTMLInputElement>(
          '[data-market-direct="account"] input',
        )!;
        await act(async () => {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
          setter.call(nameInput, '爱丽丝');
          nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        });
        expect(button(host, '继续').disabled).toBe(true);
        await act(async () =>
          document.body
            .querySelector<HTMLElement>('[data-market-direct="account"] input[type="checkbox"]')!
            .click(),
        );
        await click(host, '继续');
        expect(save).toHaveBeenCalledWith('爱丽丝', true);
        const form = document.body.querySelector('[data-market-direct="details"]')!;
        const values = [
          ...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'),
        ].map((field) => field.value);
        expect(values).toEqual(['Writer', 'Writes', 'writing']);
        await click(host, '下一步');
        const review = document.body.querySelector('[data-market-direct="review"]')!;
        expect(review.textContent).toContain('爱丽丝 #k3x9q2 · 1 个文件，10 B');
        expect(review.textContent).toContain('不会上传：tool.exe');
        await click(host, '上传');
        expect(upload).toHaveBeenCalledWith('writer', {
          displayName: 'Writer',
          bio: 'Writes',
          tags: ['writing'],
        });
        expect(document.body.querySelector('[data-market-upload]')).toBeNull();
        expect(
          document.body.querySelector('[data-market-bot="Alice/Helper"]')?.textContent,
        ).toContain('Alice #k3x9q2');
      },
      {
        shareDraftGet: vi.fn(async () => draftView('ready')),
        marketplaceAccount: account,
        marketplaceAuthorSave: save,
        marketplaceUploadPlan: plan,
        marketplaceUpload: upload,
      },
    );
  });

  it('opens on the check step for a preselected Bot', async () => {
    store.setRoster([bot('writer', { displayName: 'Writer' })], []);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const get = vi.fn(async () => draftView('reviewing'));
    const actions = {
      marketplaceAccount: vi.fn(async () => ({ signedIn: true, author })),
      shareDraftGet: get,
    };
    try {
      await act(async () =>
        root.render(
          createElement(MarketUploadDialog, {
            actions: actions as unknown as BridgeActions,
            registry: { open: vi.fn() } as unknown as DockPanelRegistry,
            t: zhTranslate,
            onListed: vi.fn(),
            onClose: vi.fn(),
            initialSlug: 'writer',
          }),
        ),
      );
      expect(
        document.body.querySelector('[data-market-direct]')?.getAttribute('data-market-direct'),
      ).toBe('draft');
      expect(document.body.querySelector('[aria-current="step"]')?.textContent).toBe('2检查');
      expect(get).toHaveBeenCalledWith('writer');
      expect(document.body.querySelector('[data-market-draft-meta]')?.textContent).toBe(
        '已检查 3/4',
      );
      expect(button(host, '回到 Tob')).toBeDefined();
      await click(host, '返回');
      expect(document.body.querySelector('[data-market-direct]')).toBeNull();
      expect(button(host, '分享 Bot')).toBeDefined();
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });

  it('lists my uploads, updates one through the upload steps and deletes another after a confirm', async () => {
    store.setRoster([bot('writer', { displayName: 'Writer' })], []);
    const other = entry('notes', { ...uploaded, id: 'U_notes', displayName: 'Notes' });
    const mine = vi.fn(async () => [
      { bot: uploaded, files: 3, bytes: 2048, blocked: false },
      { bot: other, files: 1, bytes: 10, blocked: true },
    ]);
    const plan = vi.fn(async () => ({
      files: [{ path: 'SOUL.md', size: 10, kind: 'text' }],
      skipped: [],
      totalBytes: 10,
    }));
    const replaced = { ...uploaded, displayName: 'Helper', pushedAt: '2026-10-27T09:00:00Z' };
    const upload = vi.fn(async () => ({ bot: replaced, skipped: [] }));
    const remove = vi.fn(async () => undefined);
    await withPanel(
      async () => ({ bots: [uploaded, other] }),
      async ({ host }) => {
        await click(host, '我上传的');
        const rows = [...document.body.querySelectorAll('[data-market-mine-bot]')];
        expect(rows.map((row) => row.getAttribute('data-market-mine-bot'))).toEqual([
          'U_helper',
          'U_notes',
        ]);
        expect(rows[0]?.textContent).toContain('3 个文件 · 2.0 KB · 2026-10-01');
        expect(rows[1]?.textContent).toContain('已下架');

        await click(host, '更新 Helper');
        expect(document.body.textContent).toContain('更新 Helper');
        expect(document.body.querySelector('[aria-current="step"]')?.textContent).toBe('1选择 Bot');
        expect(document.body.querySelectorAll('[aria-label="上传步骤"] li')).toHaveLength(5);
        expect(
          document.body.querySelector('[data-market-replace-hint="missing"]')?.textContent,
        ).toContain('这台电脑上没有当初上传「Helper」的 Bot');
        await click(host, 'Writer');
        expect(document.body.querySelector('[data-market-direct="draft"]')).not.toBeNull();
        await click(host, '下一步');
        expect(plan).toHaveBeenCalledWith('writer');
        const values = [
          ...document.body
            .querySelector('[data-market-direct="details"]')!
            .querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'),
        ].map((field) => field.value);
        expect(values).toEqual(['Helper', 'helper description', '']);
        await click(host, '下一步');
        const review = document.body.querySelector('[data-market-direct="review"]')!;
        expect(review.textContent).toContain('1 个文件，10 B');
        expect(review.querySelector('[data-market-replace-summary]')?.textContent).toContain(
          '用「Writer」替换市场上的「Helper」',
        );
        expect(review.querySelector('[data-market-replace-warning]')?.textContent).toContain(
          '无法确认「Writer」就是当初上传的 Bot',
        );
        await click(host, '替换全部文件');
        expect(upload).toHaveBeenCalledWith('writer', {
          displayName: 'Helper',
          bio: 'helper description',
          tags: [],
          replaces: 'U_helper',
        });
        expect(document.body.querySelector('[data-market-upload]')).toBeNull();
        expect(document.body.querySelector('[data-market-mine="list"]')).not.toBeNull();

        await click(host, '删除 Notes');
        expect(document.body.textContent).toContain('已安装的副本不受影响');
        await act(async () => document.body.querySelector('form')!.requestSubmit());
        expect(remove).toHaveBeenCalledWith('U_notes');
        expect(document.body.querySelector('[data-market-mine-bot="U_notes"]')).toBeNull();
        expect(document.body.querySelector('[data-market-bot="Alice/Notes"]')).toBeNull();
      },
      {
        marketplaceAccount: vi.fn(async () => ({ signedIn: true, author })),
        marketplaceMine: mine,
        shareDraftGet: vi.fn(async () => draftView('ready')),
        marketplaceUploadPlan: plan,
        marketplaceUpload: upload,
        marketplaceDelete: remove,
      },
    );
  });

  it('starts an update from the Bot uploaded as the listing and warns before replacing it with another', async () => {
    store.setRoster(
      [
        bot('writer', { displayName: 'Writer' }),
        bot('helper', { displayName: 'Helper Local', uploadedListing: 'U_helper' }),
      ],
      [],
    );
    const plan = vi.fn(async () => ({
      files: [{ path: 'SOUL.md', size: 10, kind: 'text' }],
      skipped: [],
      totalBytes: 10,
    }));
    await withPanel(
      async () => ({ bots: [uploaded] }),
      async ({ host }) => {
        await click(host, '我上传的');
        await click(host, '更新 Helper');
        expect(document.body.querySelector('[data-market-direct="draft"]')?.textContent).toContain(
          'Helper Local',
        );
        await click(host, '下一步');
        await click(host, '下一步');
        let review = document.body.querySelector('[data-market-direct="review"]')!;
        expect(review.querySelector('[data-market-replace-summary]')?.textContent).toContain(
          '用「Helper Local」替换市场上的「Helper」',
        );
        expect(review.querySelector('[data-market-replace-warning]')).toBeNull();

        await click(host, '返回');
        await click(host, '返回');
        await click(host, '返回');
        expect(document.body.querySelector('[data-market-replace-hint="found"]')).not.toBeNull();
        const choices = [
          ...document.body.querySelectorAll('[data-market-direct="bot"] [role="listitem"] button'),
        ];
        expect(choices.map((choice) => choice.getAttribute('aria-label'))).toEqual([
          'Helper Local',
          'Writer',
        ]);
        expect(choices[0]?.textContent).toContain('当初上传的 Bot');
        await click(host, 'Writer');
        await click(host, '下一步');
        await click(host, '下一步');
        review = document.body.querySelector('[data-market-direct="review"]')!;
        expect(review.querySelector('[data-market-replace-warning]')?.textContent).toContain(
          '「Writer」不是当初上传的「Helper Local」',
        );
      },
      {
        marketplaceAccount: vi.fn(async () => ({ signedIn: true, author })),
        marketplaceMine: vi.fn(async () => [
          { bot: uploaded, files: 3, bytes: 2048, blocked: false },
        ]),
        shareDraftGet: vi.fn(async () => draftView('ready')),
        marketplaceUploadPlan: plan,
      },
    );
  });

  it('opens my uploads from settings and drops a deleted Bot from the open Market panel', async () => {
    const other = entry('notes', { ...uploaded, id: 'U_notes', displayName: 'Notes' });
    const remove = vi.fn(async () => undefined);
    await withPanel(
      async () => ({ bots: [uploaded, other] }),
      async ({ host, actions }) => {
        const tiles = () =>
          [...document.body.querySelectorAll('[data-market-bot]')].map((tile) => tile.textContent);
        expect(tiles().some((text) => text?.includes('Notes'))).toBe(true);
        const settings = document.createElement('div');
        document.body.append(settings);
        const root = createRoot(settings);
        try {
          await act(async () =>
            root.render(
              createElement(MyUploadsSettingsRow, {
                actions: actions as unknown as BridgeActions,
                t: zhTranslate,
              }),
            ),
          );
          expect(settings.textContent).toContain('我上传的 Bot');
          await click(settings, '管理');
          expect(
            [...document.body.querySelectorAll('[data-market-mine-bot]')].map((row) =>
              row.getAttribute('data-market-mine-bot'),
            ),
          ).toEqual(['U_helper', 'U_notes']);
          await click(settings, '删除 Notes');
          await act(async () => document.body.querySelector('form')!.requestSubmit());
          expect(remove).toHaveBeenCalledWith('U_notes');
          expect(document.body.querySelector('[data-market-mine-bot="U_notes"]')).toBeNull();
          expect(tiles().some((text) => text?.includes('Notes'))).toBe(false);
          expect(tiles().some((text) => text?.includes('Helper'))).toBe(true);
        } finally {
          await act(async () => root.unmount());
          settings.remove();
        }
      },
      {
        marketplaceMine: vi.fn(async () => [
          { bot: uploaded, files: 3, bytes: 2048, blocked: false },
          { bot: other, files: 1, bytes: 10, blocked: false },
        ]),
        marketplaceDelete: remove,
      },
    );
  });

  it('marks an installed Uploaded Bot whose author updated it', async () => {
    await withPanel(
      async () => ({
        bots: [{ ...uploaded, installed: { bots: ['helper-copy'], authorUpdated: true } }],
      }),
      async ({ host }) => {
        const tile = document.body.querySelector('[data-market-bot="Alice/Helper"]')!;
        expect(tile.querySelector('[data-market-author-updated]')?.textContent).toBe('作者已更新');
      },
    );
  });

  it('updates the Market upload account step on the Host account event', async () => {
    store.setRoster([bot('writer', { displayName: 'Writer' })], []);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    vi.useFakeTimers();
    const events = resourceEvents();
    const fetcher = vi.fn(async () =>
      Response.json({
        userCode: 'ABCD-EFGH',
        verificationUri: 'https://example.com/device',
      }),
    );
    vi.stubGlobal('fetch', fetcher);
    const actions = {
      marketplaceAccount: vi.fn(
        async (): Promise<{ signedIn: boolean; author: typeof author | null }> => ({
          signedIn: false,
          author: null,
        }),
      ),
      marketplaceUploadPlan: vi.fn(async () => ({ files: [], skipped: [], totalBytes: 0 })),
      shareDraftGet: vi.fn(async () => draftView('ready')),
    };
    try {
      await act(async () =>
        root.render(
          createElement(MarketUploadDialog, {
            actions: actions as unknown as BridgeActions,
            registry: { open: vi.fn() } as unknown as DockPanelRegistry,
            t: zhTranslate,
            onListed: vi.fn(),
            onClose: vi.fn(),
            initialSlug: 'writer',
          }),
        ),
      );
      await click(host, '下一步');
      await click(host, 'Tobs 市场');
      expect(
        document.body.querySelector('[data-market-direct]')?.getAttribute('data-market-direct'),
      ).toBe('account');
      await click(host, zhTranslate('market.direct.signIn'));
      expect(document.querySelector('[data-market-sign-in]')?.textContent).toContain('ABCD-EFGH');
      actions.marketplaceAccount.mockResolvedValue({
        signedIn: true,
        author,
      });
      await act(async () => {
        events.emit('account');
        await vi.advanceTimersByTimeAsync(30);
      });
      expect(document.querySelector('[data-market-sign-in]')).toBeNull();
      expect(document.querySelector('[data-market-direct="details"]')).not.toBeNull();
    } finally {
      await act(async () => root.unmount());
      host.remove();
      events.dispose();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it('retries the account when the Market refuses a signed-in user', async () => {
    store.setRoster([bot('writer', { displayName: 'Writer' })], []);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const account = vi
      .fn()
      .mockRejectedValueOnce(new BridgeCallError('sign-in-rejected', 'refused'))
      .mockResolvedValue({ signedIn: false, author: null });
    const actions = {
      marketplaceAccount: account,
      marketplaceUploadPlan: vi.fn(async () => ({ files: [], skipped: [], totalBytes: 0 })),
      shareDraftGet: vi.fn(async () => draftView('ready')),
    };
    try {
      await act(async () =>
        root.render(
          createElement(MarketUploadDialog, {
            actions: actions as unknown as BridgeActions,
            registry: { open: vi.fn() } as unknown as DockPanelRegistry,
            t: zhTranslate,
            onListed: vi.fn(),
            onClose: vi.fn(),
            initialSlug: 'writer',
          }),
        ),
      );
      await click(host, '下一步');
      await click(host, 'Tobs 市场');
      expect(document.body.textContent).toContain(zhTranslate('market.error.signInRejected'));
      await click(host, zhTranslate('market.retry'));
      expect(account).toHaveBeenCalledTimes(2);
      expect(document.body.textContent).toContain(zhTranslate('market.direct.signInHint'));
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });

  it('hands a ready draft to Tob for a GitHub push', async () => {
    store.setRoster([bot('writer', { displayName: 'Writer' })], []);
    const exported = vi.fn(async () => ({ path: '/tob/share-exports/writer', files: 3 }));
    const sendHome = vi.fn(async () => undefined);
    await withPanel(
      async () => ({ bots: [] }),
      async ({ host }) => {
        await click(host, '上传 Bot');
        await click(host, '分享 Bot');
        await click(host, 'Writer');
        await click(host, '下一步');
        await click(host, '我的 GitHub');
        expect(document.body.querySelector('[aria-current="step"]')?.textContent).toBe('4GitHub');
        await click(host, '让 Tob 推送');
        expect(exported).toHaveBeenCalledWith('writer');
        expect(sendHome).toHaveBeenCalledWith(
          'tob-dm',
          expect.stringContaining('/tob/share-exports/writer'),
          expect.stringMatching(/^human-/u),
        );
        expect(document.body.querySelector('[data-market-upload]')).toBeNull();
      },
      {
        shareDraftGet: vi.fn(async () => draftView('ready')),
        shareDraftExport: exported,
        tobHome: vi.fn(async () => ({ botSlug: 'tob', channelId: 'tob-dm' })),
        sendHome,
      },
    );
  });
});
