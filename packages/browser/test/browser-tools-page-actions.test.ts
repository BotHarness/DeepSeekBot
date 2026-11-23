import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { execution, harness, screenshotDirs } from './support/browser-tools.js';

afterEach(() => {
  for (const dir of screenshotDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('per-PersonaBot registration, authorization, and tabs', () => {
  it('opens a URL, reuses the Bot tab, and observes it with refs', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    const opened = await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    expect(h.runtime.open).toHaveBeenCalledWith('https://example.com', undefined);
    expect(JSON.stringify(opened)).toContain('Opened https://example.com');
    const observed = await h.state.definitions
      .get('browser_observe')!
      .execute({}, execution('browser_observe'));
    expect(h.runtime.observe).toHaveBeenCalledWith('tab-1');
    const text = JSON.stringify(observed);
    expect(text).toContain('e1');
    expect(text).toContain('Hello world');
    expect(h.audits.map((event) => event.outcome)).toEqual(['ok', 'ok']);
    expect(h.audits[0]?.summary).toContain('example.com');
  });

  it('rejects a non-http URL and a missing tab readably', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await expect(
      h.state.definitions
        .get('browser_open')!
        .execute({ url: 'file:///etc/passwd' }, execution('browser_open')),
    ).rejects.toThrow(/absolute http\(s\) URL/);
    await expect(
      h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe')),
    ).rejects.toThrow(/call browser_open/);
  });

  it('audits upload size and redacts Host paths on failures without changing the tool error', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    const path = join(h.screenshotDir, 'upload.txt');
    writeFileSync(path, 'private contents');
    const call = (name: string, args = {}) =>
      h.state.definitions.get(name)!.execute(args, execution(name));
    await call('browser_open', { url: 'https://example.com' });
    await call('browser_observe');
    await call('browser_upload', { path, ref: 'e1' });
    expect(h.audits.at(-1)?.summary).toBe('file=upload.txt bytes=16 ref=e1');
    h.runtime.uploadFile = vi.fn(async () => {
      throw Error(`The file does not exist on the Host: ${path}`);
    });
    await expect(call('browser_upload', { path })).rejects.toThrow(path);
    expect(JSON.stringify(h.audits)).not.toContain(path);
    expect(JSON.stringify(h.audits)).not.toContain('private contents');
    expect(h.audits.at(-1)?.error).toBe('The file does not exist on the Host: upload.txt');
  });

  it('clicks observed refs, redacts typed text, and clamps scroll and wait', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    await h.state.definitions
      .get('browser_click')!
      .execute({ ref: 'e3' }, execution('browser_click'));
    expect(h.runtime.click).toHaveBeenCalledWith('tab-1', 'e3');
    expect(h.audits.at(-1)?.summary).toBe('ref=e3');

    await h.state.definitions
      .get('browser_type')!
      .execute({ ref: 'e2', text: 'hunter2' }, execution('browser_type'));
    expect(h.runtime.type).toHaveBeenCalledWith('tab-1', 'e2', 'hunter2');
    expect(h.audits.at(-1)?.summary).toContain('chars=7');
    expect(JSON.stringify(h.audits)).not.toContain('hunter2');

    await h.state.definitions
      .get('browser_scroll')!
      .execute({ direction: 'down' }, execution('browser_scroll'));
    expect(h.runtime.scroll).toHaveBeenCalledWith('tab-1', 'down', 600);

    const waited = await h.state.definitions
      .get('browser_wait')!
      .execute({ ms: 5 }, execution('browser_wait'));
    expect(JSON.stringify(waited)).toContain('waited 5ms');
  });

  it('clicks by coordinates when no ref is available', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    await h.state.definitions
      .get('browser_click')!
      .execute({ x: 120, y: 340 }, execution('browser_click'));
    expect(h.runtime.clickAt).toHaveBeenCalledWith('tab-1', 120, 340);
    expect(h.audits.at(-1)?.summary).toBe('x=120 y=340');
    await expect(
      h.state.definitions.get('browser_click')!.execute({}, execution('browser_click')),
    ).rejects.toThrow(/ref from browser_observe or x\/y/);
  });

  it('keeps the current tab on recoverable errors and drops it on dead targets', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    h.runtime.click = vi.fn(async () => {
      throw new Error(
        'The page has no file input; click the upload control first so the page creates one, then retry',
      );
    });
    await expect(
      h.state.definitions.get('browser_click')!.execute({ ref: 'e3' }, execution('browser_click')),
    ).rejects.toThrow(/no file input/);
    expect(h.provider.currentTab('bot-a')).toBe('tab-1');
    await h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe'));

    h.runtime.observe = vi.fn(async () => {
      throw new Error('Target closed');
    });
    await expect(
      h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe')),
    ).rejects.toThrow(/tab is gone/);
    expect(h.provider.currentTab('bot-a')).toBeUndefined();
  });

  it('audits unsupported key errors, retains current work and permits a native retry', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    const press = h.state.definitions.get('browser_press_key')!;
    vi.mocked(h.runtime.pressKey).mockRejectedValueOnce(
      new Error('Unsupported browser key; use Enter'),
    );
    await expect(
      press.execute({ key: 'Control+Enter' }, execution('browser_press_key')),
    ).rejects.toThrow(/Unsupported browser key/);
    expect(h.provider.currentTab('bot-a')).toBe('tab-1');
    expect(h.provider.tabCount('bot-a')).toBe(1);
    expect(h.audits.at(-1)).toMatchObject({
      tool: 'browser_press_key',
      outcome: 'error',
      botSlug: 'bot-a',
      sessionId: 'session-a',
      rootRole: 'orchestrator',
    });
    await h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe'));
    await press.execute({ key: 'Enter' }, execution('browser_press_key'));
    expect(h.runtime.pressKey).toHaveBeenLastCalledWith('tab-1', 'Enter');
    expect(h.audits.at(-1)).toMatchObject({ tool: 'browser_press_key', outcome: 'ok' });
  });

  it('surfaces a stale ref readably and audits the failure', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    h.runtime.click = vi.fn(async () => {
      throw new Error('The element ref is stale; call browser_observe again before acting');
    });
    await expect(
      h.state.definitions.get('browser_click')!.execute({ ref: 'e1' }, execution('browser_click')),
    ).rejects.toThrow(/stale/);
    expect(h.audits).toHaveLength(2);
    expect(h.audits.map((event) => event.outcome)).toEqual(['ok', 'error']);
  });

  it('manages multiple tabs: opens, lists the current, selects, and closes', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    const tabs = h.state.definitions.get('browser_tabs')!;
    const opened = await tabs.execute(
      { action: 'open', url: 'https://example.org' },
      execution('browser_tabs'),
    );
    expect(h.runtime.createTab).toHaveBeenCalledWith('https://example.org');
    expect(JSON.stringify(opened)).toContain('tab-2');
    expect(h.provider.currentTab('bot-a')).toBe('tab-2');
    expect(h.provider.tabCount('bot-a')).toBe(2);
    const listed = await tabs.execute({ action: 'list' }, execution('browser_tabs'));
    expect(JSON.stringify(listed)).toContain('* tab-2');
    const view = await h.provider.listTabs('bot-a');
    expect(view.map((tab) => `${tab.targetId}${tab.current ? '*' : ''}`)).toEqual([
      'tab-1',
      'tab-2*',
    ]);
    expect(h.provider.ownsTab('bot-a', 'tab-2')).toBe(true);
    expect(h.provider.ownsTab('bot-a', 'tab-9')).toBe(false);
    await tabs.execute({ action: 'select', targetId: 'tab-1' }, execution('browser_tabs'));
    expect(h.provider.currentTab('bot-a')).toBe('tab-1');
    await tabs.execute({ action: 'close', targetId: 'tab-1' }, execution('browser_tabs'));
    expect(h.runtime.closeTab).toHaveBeenCalledWith('tab-1');
    expect(h.provider.currentTab('bot-a')).toBeUndefined();
    expect(h.provider.tabCount('bot-a')).toBe(1);
  });

  it('keeps current work and records errors for failed reused and new-tab navigation', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    const open = h.state.definitions.get('browser_open')!;
    await open.execute({ url: 'https://example.com' }, execution('browser_open'));
    const failure = new Error(
      'Bot Browser navigation failed (net::ERR_EMPTY_RESPONSE); retry browser_open',
    );
    vi.mocked(h.runtime.open).mockRejectedValueOnce(failure);
    await expect(
      open.execute({ url: 'https://fail.test' }, execution('browser_open')),
    ).rejects.toThrow('ERR_EMPTY_RESPONSE');
    expect(h.provider.currentTab('bot-a')).toBe('tab-1');
    expect(h.audits.at(-1)).toMatchObject({ tool: 'browser_open', outcome: 'error' });
    vi.mocked(h.runtime.createTab).mockRejectedValueOnce(failure);
    await expect(
      h.state.definitions
        .get('browser_tabs')!
        .execute({ action: 'open', url: 'https://fail.test' }, execution('browser_tabs')),
    ).rejects.toThrow('ERR_EMPTY_RESPONSE');
    expect(h.provider.currentTab('bot-a')).toBe('tab-1');
    expect(h.provider.tabCount('bot-a')).toBe(1);
    expect(h.audits.at(-1)).toMatchObject({ tool: 'browser_tabs', outcome: 'error' });
    await open.execute({ url: 'https://example.com' }, execution('browser_open'));
    expect(h.runtime.open).toHaveBeenLastCalledWith('https://example.com', 'tab-1');
    await h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe'));
    expect(h.runtime.observe).toHaveBeenLastCalledWith('tab-1');
  });

  it('retains current work when selecting a Human-closed owned background tab', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    const tabs = h.state.definitions.get('browser_tabs')!;
    await tabs.execute({ action: 'open', url: 'https://example.org' }, execution('browser_tabs'));
    await tabs.execute({ action: 'select', targetId: 'tab-1' }, execution('browser_tabs'));
    vi.mocked(h.runtime.tabInfo).mockRejectedValueOnce(new Error('No target with given id found'));
    await expect(
      tabs.execute({ action: 'select', targetId: 'tab-2' }, execution('browser_tabs')),
    ).rejects.toThrow(/tab is gone.*browser_tabs action list.*browser_open/);
    expect(h.provider.currentTab('bot-a')).toBe('tab-1');
    expect(h.provider.ownsTab('bot-a', 'tab-1')).toBe(true);
    expect(h.provider.ownsTab('bot-a', 'tab-2')).toBe(false);
    await h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe'));
    expect(h.runtime.observe).toHaveBeenLastCalledWith('tab-1');
    await h.state.definitions
      .get('browser_click')!
      .execute({ ref: 'e1' }, execution('browser_click'));
    expect(h.runtime.click).toHaveBeenLastCalledWith('tab-1', 'e1');
    await expect(
      tabs.execute({ action: 'select', targetId: 'tab-2' }, execution('browser_tabs')),
    ).rejects.toThrow(/not owned/);
  });

  it('leaves selection and ownership intact on transient tab lookup failure and permits retry', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    const tabs = h.state.definitions.get('browser_tabs')!;
    await tabs.execute({ action: 'open', url: 'https://example.org' }, execution('browser_tabs'));
    await tabs.execute({ action: 'select', targetId: 'tab-1' }, execution('browser_tabs'));
    vi.mocked(h.runtime.tabInfo).mockRejectedValueOnce(new Error('Temporary lookup timeout'));
    await expect(
      tabs.execute({ action: 'select', targetId: 'tab-2' }, execution('browser_tabs')),
    ).rejects.toThrow('Temporary lookup timeout');
    expect(h.provider.currentTab('bot-a')).toBe('tab-1');
    expect(h.provider.tabCount('bot-a')).toBe(2);
    await tabs.execute({ action: 'select', targetId: 'tab-2' }, execution('browser_tabs'));
    expect(h.provider.currentTab('bot-a')).toBe('tab-2');
    expect(h.audits.at(-2)).toMatchObject({ tool: 'browser_tabs', outcome: 'error' });
    expect(h.audits.at(-1)).toMatchObject({ tool: 'browser_tabs', outcome: 'ok' });
  });

  it('clears only a confirmed dead current target during selection and keeps another owned tab recoverable', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    const tabs = h.state.definitions.get('browser_tabs')!;
    await tabs.execute({ action: 'open', url: 'https://example.org' }, execution('browser_tabs'));
    vi.mocked(h.runtime.tabInfo).mockRejectedValueOnce(new Error('No target with given id found'));
    await expect(
      tabs.execute({ action: 'select', targetId: 'tab-2' }, execution('browser_tabs')),
    ).rejects.toThrow(/tab is gone/);
    expect(h.provider.currentTab('bot-a')).toBeUndefined();
    expect(h.provider.tabCount('bot-a')).toBe(1);
    expect(h.provider.ownsTab('bot-a', 'tab-1')).toBe(true);
    await tabs.execute({ action: 'select', targetId: 'tab-1' }, execution('browser_tabs'));
    expect(h.provider.currentTab('bot-a')).toBe('tab-1');
  });

  it('uploads a Host file and audits only its basename', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    const uploaded = await h.state.definitions
      .get('browser_upload')!
      .execute({ ref: 'e3', path: '/Users/someone/secret/shot.jpg' }, execution('browser_upload'));
    expect(h.runtime.uploadFile).toHaveBeenCalledWith('tab-1', {
      ref: 'e3',
      path: '/Users/someone/secret/shot.jpg',
    });
    expect(JSON.stringify(uploaded)).toContain('shot.jpg');
    expect(h.audits.at(-1)?.summary).toContain('file=shot.jpg');
    expect(JSON.stringify(h.audits)).not.toContain('/Users/someone');
  });

  it('idle closes revoke the old registration and Session grant before any new browser operation', async () => {
    const h = harness({ access: true });
    h.created();
    h.provider.markAuthorized('session-a');
    const old = h.provider.executionSignal('session-a')!;
    const tool = h.state.definitions.get('browser_open')!;
    await tool.execute({ url: 'https://example.com' }, execution('browser_open'));
    await h.provider.closeIdleTabs(0);
    expect(old.aborted).toBe(true);
    expect(h.provider.executionSignal('session-a')).not.toBe(old);
    expect(h.provider.needsAuthorization('session-a')).toBe(true);
    await expect(
      tool.execute({ url: 'https://example.com' }, execution('browser_open')),
    ).rejects.toThrow();
    await expect(
      h.state.definitions
        .get('browser_open')!
        .execute({ url: 'https://example.com' }, execution('browser_open')),
    ).rejects.toThrow(/approval|authorized/);
    expect(h.runtime.open).toHaveBeenCalledOnce();
  });
  it('rejects foreign tabs and closes idle tabs without stopping the browser', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    const tabs = h.state.definitions.get('browser_tabs')!;
    await expect(
      tabs.execute({ action: 'select', targetId: 'tab-9' }, execution('browser_tabs')),
    ).rejects.toThrow(/not owned/);
    h.provider.touch('bot-a');
    await h.provider.closeIdleTabs(60_000);
    expect(h.provider.tabCount('bot-a')).toBe(1);
    await h.provider.closeIdleTabs(0);
    expect(h.runtime.closeTab).toHaveBeenCalledWith('tab-1');
    expect(h.provider.tabCount('bot-a')).toBe(0);
  });

  it('recovers from a human-closed current tab through tabs list and select', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    const tabs = h.state.definitions.get('browser_tabs')!;
    await tabs.execute({ action: 'open', url: 'https://example.org' }, execution('browser_tabs'));
    await tabs.execute({ action: 'select', targetId: 'tab-1' }, execution('browser_tabs'));
    const original = h.runtime.observe;
    h.runtime.observe = vi.fn(async (tabId: string) => {
      if (tabId === 'tab-1') throw new Error('target closed');
      return original(tabId);
    });
    await expect(
      h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe')),
    ).rejects.toThrow(/browser_tabs/);
    expect(h.provider.currentTab('bot-a')).toBeUndefined();
    expect(h.provider.tabCount('bot-a')).toBe(1);
    await tabs.execute({ action: 'select', targetId: 'tab-2' }, execution('browser_tabs'));
    expect(h.provider.currentTab('bot-a')).toBe('tab-2');
    await h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe'));
  });

  it.each(['target closed', 'Session with given id not found.'])(
    'drops a dead tab and recovers after %s',
    async (message) => {
      const h = harness({ access: true, auto: true });
      h.created();
      await h.state.definitions
        .get('browser_open')!
        .execute({ url: 'https://example.com' }, execution('browser_open'));
      h.runtime.observe = vi.fn(async () => {
        throw new Error(message);
      });
      await expect(
        h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe')),
      ).rejects.toThrow(/browser_tabs.*browser_open/);
      expect(h.audits.at(-1)?.outcome).toBe('error');
      expect(h.provider.currentTab('bot-a')).toBeUndefined();
      vi.mocked(h.runtime.open).mockResolvedValueOnce({
        tabId: 'tab-recovered',
        url: 'https://recover.test',
        title: 'Recovered',
      });
      await h.state.definitions
        .get('browser_open')!
        .execute({ url: 'https://recover.test' }, execution('browser_open'));
      expect(h.runtime.open).toHaveBeenLastCalledWith('https://recover.test', undefined);
      expect(h.provider.currentTab('bot-a')).toBe('tab-recovered');
      expect(h.audits.at(-1)?.outcome).toBe('ok');
    },
  );

  it('serializes one Bot’s actions while it is busy', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    let active = 0;
    let peak = 0;
    h.runtime.open = vi.fn(async (url: string) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { tabId: 'tab-1', url, title: '' };
    });
    const open = h.state.definitions.get('browser_open')!;
    await Promise.all([
      open.execute({ url: 'https://a.example' }, execution('browser_open')),
      open.execute({ url: 'https://b.example' }, execution('browser_open')),
      open.execute({ url: 'https://c.example' }, execution('browser_open')),
    ]);
    expect(peak).toBe(1);
  });
});
