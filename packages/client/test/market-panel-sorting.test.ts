// @vitest-environment jsdom
import { button, click, withPanel } from './market-panel-fixtures.js';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CSS } from '../src/client/styles.js';

describe('Market panel', () => {
  it('defaults to stars and remembers each explicit sort after reopening', async () => {
    await withPanel(
      async () => ({ bots: [] }),
      async ({ host, list }) => {
        expect(list).toHaveBeenLastCalledWith({ sort: 'stars', lang: 'zh', includeUploads: true });
        expect(button(host, '最多 Star').getAttribute('aria-selected')).toBe('true');
        await click(host, '最新创建');
      },
    );
    await withPanel(
      async () => ({ bots: [] }),
      async ({ host, list }) => {
        expect(list).toHaveBeenLastCalledWith({
          sort: 'created',
          lang: 'zh',
          includeUploads: true,
        });
        await click(host, '最近更新');
      },
    );
    await withPanel(
      async () => ({ bots: [] }),
      async ({ host, list }) => {
        expect(list).toHaveBeenLastCalledWith({
          sort: 'updated',
          lang: 'zh',
          includeUploads: true,
        });
        await click(host, '最多 Star');
      },
    );
    await withPanel(
      async () => ({ bots: [] }),
      async ({ list }) => {
        expect(list).toHaveBeenLastCalledWith({ sort: 'stars', lang: 'zh', includeUploads: true });
      },
    );
  });

  it('keeps every sort reachable from a menu when the panel is too narrow for the tabs', async () => {
    expect(CSS).toMatch(
      /@container bh-market \(max-width: 380px\) \{\s*\.bh-market-sort > \[role='tablist'\] \{ display: none; \}\s*\.bh-market-sort-menu \{ display: flex; \}/u,
    );
    await withPanel(
      async () => ({ bots: [] }),
      async ({ host, list }) => {
        const menu = document.body.querySelector<HTMLButtonElement>(
          '.bh-market-sort-menu > button[aria-label="排序"]',
        )!;
        expect(menu.textContent).toBe('最多 Star');
        await act(async () => menu.click());
        const items = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
        expect(items.map((item) => item.textContent)).toEqual([
          '最新创建',
          '最近更新',
          '最多 Star',
        ]);
        expect(items[2]?.getAttribute('aria-checked')).toBe('true');
        await act(async () => items[1]!.click());
        expect(list).toHaveBeenLastCalledWith({
          sort: 'updated',
          lang: 'zh',
          includeUploads: true,
        });
        expect(menu.textContent).toBe('最近更新');
        expect(button(host, '最近更新').getAttribute('aria-selected')).toBe('true');
      },
    );
  });

  it('ignores invalid saved sorts and works when storage is unavailable', async () => {
    localStorage.setItem('botharness.marketplace.sort', 'obsolete');
    await withPanel(
      async () => ({ bots: [] }),
      async ({ list }) => {
        expect(list).toHaveBeenLastCalledWith({ sort: 'stars', lang: 'zh', includeUploads: true });
      },
    );
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    try {
      await withPanel(
        async () => ({ bots: [] }),
        async ({ host, list }) => {
          expect(list).toHaveBeenLastCalledWith({
            sort: 'stars',
            lang: 'zh',
            includeUploads: true,
          });
          await click(host, '最新创建');
          expect(list).toHaveBeenLastCalledWith({
            sort: 'created',
            lang: 'zh',
            includeUploads: true,
          });
        },
      );
    } finally {
      read.mockRestore();
      write.mockRestore();
    }
  });
});
