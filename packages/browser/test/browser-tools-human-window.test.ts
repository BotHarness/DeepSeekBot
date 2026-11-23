import { rmSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { execution, harness, screenshotDirs, type Harness } from './support/browser-tools.js';

afterEach(() => {
  for (const dir of screenshotDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('Human Browser window reveal', () => {
  async function ownedTabs(h: Harness) {
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    await h.state.definitions
      .get('browser_tabs')!
      .execute({ action: 'open', url: 'https://example.org' }, execution('browser_tabs'));
    vi.mocked(h.runtime.openWindow).mockImplementation(async (tabId) => ({
      tabId: tabId ?? 'tab-9',
      url: 'about:blank',
      title: '',
    }));
  }

  it('keeps owned work tabs through Access revocation and resumes on the same current page', async () => {
    const h = harness({ access: true, auto: true });
    await ownedTabs(h);
    const capturedClick = h.state.definitions.get('browser_click')!;
    h.setAccess(false);
    await h.provider.reconcileBot('bot-a');
    expect(h.state.registered()).toEqual([]);
    await expect(capturedClick.execute({ ref: 'e1' }, execution('browser_click'))).rejects.toThrow(
      'Browser Access is off',
    );
    expect(h.runtime.click).not.toHaveBeenCalled();
    expect(h.provider.currentTab('bot-a')).toBe('tab-2');
    expect(h.provider.tabCount('bot-a')).toBe(2);
    expect(h.provider.ownsTab('bot-a', 'tab-1')).toBe(true);
    expect(h.provider.ownsTab('bot-a', 'foreign')).toBe(false);
    h.setAccess(true);
    await h.provider.reconcileBot('bot-a');
    expect(h.state.registered()).toContain('browser_observe');
    await h.provider.openForHuman('bot-a');
    expect(h.runtime.openWindow).toHaveBeenCalledWith('tab-2');
    await h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe'));
    expect(h.runtime.observe).toHaveBeenCalledWith('tab-2');
    await h.state.definitions
      .get('browser_click')!
      .execute({ ref: 'e1' }, execution('browser_click'));
    expect(h.runtime.click).toHaveBeenCalledWith('tab-2', 'e1');
  });

  it('retains closed-tab recovery after an Access cycle and still clears ownership on reset', async () => {
    const h = harness({ access: true, auto: true });
    await ownedTabs(h);
    h.setAccess(false);
    await h.provider.reconcileBot('bot-a');
    h.setAccess(true);
    await h.provider.reconcileBot('bot-a');
    vi.mocked(h.runtime.listTabs).mockResolvedValue([
      { targetId: 'tab-1', url: 'https://example.com/', title: 'Example' },
      { targetId: 'foreign', url: 'https://example.net/', title: 'Foreign' },
    ]);
    await h.provider.openForHuman('bot-a');
    expect(h.runtime.openWindow).toHaveBeenCalledWith('tab-1');
    expect(h.provider.currentTab('bot-a')).toBe('tab-1');
    expect(h.provider.tabCount('bot-a')).toBe(1);
    expect(h.provider.ownsTab('bot-a', 'foreign')).toBe(false);
    h.provider.resetBot('bot-a');
    expect(h.provider.currentTab('bot-a')).toBeUndefined();
    expect(h.provider.tabCount('bot-a')).toBe(0);
  });

  it('reveals the manually previewed owned tab without changing the Bot pointer', async () => {
    const h = harness({ access: true, auto: true });
    await ownedTabs(h);
    h.provider.setTakeover('bot-a', true);
    await expect(h.provider.openForHuman('bot-a', 'tab-1')).resolves.toMatchObject({
      tabId: 'tab-1',
    });
    expect(h.provider.currentTab('bot-a')).toBe('tab-2');
    expect(h.runtime.openWindow).toHaveBeenCalledWith('tab-1');
    expect(h.provider.isTakeover('bot-a')).toBe(true);
  });

  it('ignores a foreign requested target and reveals the current owned tab', async () => {
    const h = harness({ access: true, auto: true });
    await ownedTabs(h);
    await h.provider.openForHuman('bot-a', 'foreign');
    expect(h.runtime.openWindow).toHaveBeenCalledWith('tab-2');
    expect(h.provider.ownsTab('bot-a', 'foreign')).toBe(false);
  });

  it('prunes closed tabs and reuses a live owned fallback', async () => {
    const h = harness({ access: true, auto: true });
    await ownedTabs(h);
    vi.mocked(h.runtime.listTabs).mockResolvedValue([
      { targetId: 'foreign', url: 'https://example.net/', title: 'Foreign' },
      { targetId: 'tab-1', url: 'https://example.com/', title: 'Example' },
    ]);
    await h.provider.openForHuman('bot-a', 'tab-2');
    expect(h.runtime.openWindow).toHaveBeenCalledWith('tab-1');
    expect(h.provider.currentTab('bot-a')).toBe('tab-1');
    expect(h.provider.tabCount('bot-a')).toBe(1);
    expect(h.provider.ownsTab('bot-a', 'foreign')).toBe(false);
  });

  it('adopts a single blank target and reuses it across concurrent Human opens with Access off', async () => {
    const h = harness({ access: false });
    vi.mocked(h.runtime.listTabs).mockImplementation(async () =>
      h.provider.ownsTab('bot-a', 'tab-9')
        ? [{ targetId: 'tab-9', url: 'about:blank', title: '' }]
        : [],
    );
    vi.mocked(h.runtime.openWindow).mockImplementation(async (tabId) => ({
      tabId: tabId ?? 'tab-9',
      url: 'about:blank',
      title: '',
    }));
    const opened = await Promise.all(
      Array.from({ length: 3 }, () => h.provider.openForHuman('bot-a')),
    );
    expect(opened.map((tab) => tab.tabId)).toEqual(['tab-9', 'tab-9', 'tab-9']);
    expect(vi.mocked(h.runtime.openWindow).mock.calls).toEqual([[undefined], ['tab-9'], ['tab-9']]);
    expect(h.provider.currentTab('bot-a')).toBe('tab-9');
    expect(h.provider.tabCount('bot-a')).toBe(1);
  });

  it('replaces the last closed owned tab without adopting a live foreign target', async () => {
    const h = harness({ access: true, auto: true });
    await ownedTabs(h);
    vi.mocked(h.runtime.listTabs).mockResolvedValue([
      { targetId: 'foreign', url: 'https://example.net/', title: 'Foreign' },
    ]);
    await h.provider.openForHuman('bot-a');
    expect(h.runtime.openWindow).toHaveBeenCalledWith(undefined);
    expect(h.provider.currentTab('bot-a')).toBe('tab-9');
    expect(h.provider.tabCount('bot-a')).toBe(1);
  });

  it('leaves ownership unchanged when the runtime cannot list tabs', async () => {
    const h = harness({ access: true, auto: true });
    await ownedTabs(h);
    vi.mocked(h.runtime.listTabs).mockRejectedValue(new Error('CDP unavailable'));
    await expect(h.provider.openForHuman('bot-a')).rejects.toThrow('CDP unavailable');
    expect(h.provider.currentTab('bot-a')).toBe('tab-2');
    expect(h.provider.tabCount('bot-a')).toBe(2);
    expect(h.runtime.openWindow).not.toHaveBeenCalled();
  });
});
