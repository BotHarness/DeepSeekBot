// @vitest-environment jsdom
import { type ComputerSettings } from '../src/settings.js';
import { type ComputerKey } from '../src/client/locale.js';
import { act, createElement } from 'react';

import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { shellPrimitives } from '../../client/test/primitive-mocks.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => shellPrimitives());

import {
  ComputerSettingsPrefs,
  ComputerSettingsRows,
  createComputerSettingsFace,
} from '../src/client/settings-rows.js';
import type { ObserveResource } from '../../core/src/channels/resource-events.js';
import { observeResource } from '../../client/src/client/messaging-defaults-live.js';
import { resourceEvents } from '../../client/test/resource-events-fixture.js';
import { en, type ComputerTranslate } from '../src/client/locale.js';

const t = ((key: ComputerKey, params?: Record<string, unknown>) => {
  let text = en[key];
  for (const [name, value] of Object.entries(params ?? {}))
    text = text.replace(`{${name}}`, String(value));
  return text;
}) as ComputerTranslate;
const disposers: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose();
  vi.unstubAllGlobals();
});

async function mount(
  pickDirectory?: () => Promise<string | null>,
  target?: 'local' | 'container',
  options?: {
    observe?: ObserveResource;
    respond(url: string): Promise<Response>;
    save?(field: string, value: unknown): Promise<void>;
  },
) {
  let value: ComputerSettings = {
    exportDir: '/old',
    idleStopMinutes: 30,
    autoAllowActions: false,
    ...(target === undefined ? {} : { target }),
  };
  let listener = () => {};
  const writes: unknown[] = [];
  const prefs = new ComputerSettingsPrefs();
  prefs.attach({
    getSnapshot: () => ({ status: 'ready', writable: true, value }),
    subscribe: (notify) => {
      listener = notify;
      return () => {};
    },
    set: async (field, next) => {
      writes.push({ field, value: next });
      await options?.save?.(field, next);
      value = { ...value, [field]: next };
      listener();
    },
  });
  const requests: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    requests.push(url);
    if (options) return options.respond(url);
    return Response.json({ archive: `${value.exportDir}/computer.tar` });
  });
  const face = createComputerSettingsFace({
    prefs,
    pickDirectory,
    observeResource: options?.observe,
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      createElement(ComputerSettingsRows, {
        ...face,
        t,
      } as Parameters<typeof ComputerSettingsRows>[0]),
    ),
  );
  disposers.push(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  const click = async (label: string, scope: HTMLElement = container) => {
    const button = [...scope.querySelectorAll<HTMLElement>('button, [role="menuitem"]')].find(
      (node) => node.textContent?.trim() === label,
    );
    expect(button, label).toBeDefined();
    await act(async () => button?.click());
  };
  return { container, click, writes, requests, prefs };
}

describe('Computer Settings transfer interaction', () => {
  it('hides container-only controls in local mode and changes them when the accepted target changes', async () => {
    const view = await mount(undefined, 'local');
    expect(view.container.textContent).toContain('Check permissions');
    expect(view.container.textContent).not.toContain('Computer export directory');
    expect(view.container.textContent).not.toContain('Idle stop');
    expect(view.container.textContent).not.toContain('Restore the Computer from an archive');
    await act(async () => view.prefs.setTarget('container'));
    expect(view.container.textContent).toContain('Computer export directory');
    expect(view.container.textContent).toContain('Idle stop');
    expect(view.container.textContent).not.toContain('Check permissions');
    expect(view.writes).toEqual([{ field: 'target', value: 'container' }]);
  });

  it('does not write or export until the chosen target is explicitly authorized', async () => {
    const view = await mount(async () => '/picked');
    const mountRequests = view.requests.slice();
    await view.click('Export to…');
    expect(view.container.textContent).toContain('Export to: /picked');
    expect(view.writes).toEqual([]);
    expect(view.requests).toEqual(mountRequests);
    await view.click('Cancel');
    expect(view.prefs.getSnapshot().exportDir).toBe('/old');
    expect(view.writes).toEqual([]);
    expect(view.requests).toEqual(mountRequests);
    await view.click('Export to…');
    await view.click('Authorize and export');
    expect(view.writes).toEqual([{ field: 'exportDir', value: '/picked' }]);
    expect(view.requests).toContain('./api/computer/export');
    expect(view.container.textContent).toContain('Current: /picked');
  });

  it('leaves configuration unchanged when the picker is cancelled', async () => {
    const view = await mount(async () => null);
    const mountRequests = view.requests.slice();
    await view.click('Export to…');
    expect(view.container.textContent).not.toContain('Authorize and export');
    expect(view.writes).toEqual([]);
    expect(view.requests).toEqual(mountRequests);
  });

  it('keeps manual directory entry usable when the native picker fails', async () => {
    const view = await mount(async () => {
      throw new Error('picker unavailable');
    });
    await view.click('Export to…');
    await view.click('Cancel');
    await view.click('Type a path');
    const input = view.container.querySelector<HTMLInputElement>('input[aria-label="Type a path"]');
    expect(input).not.toBeNull();
    expect(input?.value).toBe('/old');
    expect(view.container.textContent).toContain('type a path or use the current directory');
  });

  it.each([400, 1280])(
    'keeps Computer controls named and announces results at %i px',
    async (width) => {
      vi.stubGlobal('innerWidth', width);
      const view = await mount(async () => '/picked');
      const groups = [...view.container.querySelectorAll<HTMLElement>('[role="group"]')].map(
        (group) => labelOf(group),
      );
      expect(groups).toEqual(
        expect.arrayContaining([
          'Computer Target',
          'Auto-allow Computer actions',
          'Computer export directory',
          'Idle stop',
        ]),
      );
      const target = view.container.querySelector<HTMLButtonElement>(
        'button[aria-label="Computer Target"]',
      );
      expect(target?.textContent).toBe('Docker Computer');
      expect(target?.getAttribute('aria-haspopup')).toBe('menu');
      const idle = [...view.container.querySelectorAll<HTMLButtonElement>('button')].find(
        (button) => button.textContent === '30 min',
      );
      expect(idle?.getAttribute('aria-expanded')).toBe('false');
      expect(view.container.querySelector('[role="alert"]')).toBeNull();
      await view.click('Export to…');
      const status = view.container.querySelector('[role="status"]');
      expect(status?.textContent).toBe('Export to: /picked');
      expect(view.container.querySelector('[class*="bh-settings-"]')).toBeNull();
    },
  );
});

describe('Computer settings current desktop', () => {
  it.each([() => Response.json({ platform: 42 }), () => new Response(null, { status: 503 })])(
    'offers the Linux desktop after the Host status read recovers',
    async (failedStatus) => {
      vi.useFakeTimers();
      const events = resourceEvents();
      let recovered = false;
      try {
        const view = await mount(undefined, 'container', {
          observe: (resource, refresh) => observeResource(resource, refresh, 10_000, 60_000, true),
          respond: async () => (recovered ? Response.json({ platform: 'linux' }) : failedStatus()),
        });
        await view.click(en['rows.target.container']);
        const menuText = () => document.querySelector('[role="menu"]')?.textContent;
        expect(menuText()).toBeDefined();
        expect(menuText()).not.toContain(en['rows.target.current-desktop']);
        recovered = true;
        await act(async () => {
          events.emit('computer');
          await vi.advanceTimersByTimeAsync(30);
        });
        expect(menuText()).toContain(en['rows.target.current-desktop']);
      } finally {
        events.dispose();
        vi.useRealTimers();
      }
    },
  );

  it('disables Check desktop during Enable and reports when only the start failed', async () => {
    let finishStart = (_response: Response): void => {};
    const start = new Promise<Response>((resolve) => {
      finishStart = resolve;
    });
    const view = await mount(undefined, 'container', {
      respond: async (url) =>
        url.endsWith('/start') ? start : Response.json({ platform: 'linux' }),
    });
    await view.click(en['rows.target.container']);
    await view.click(en['rows.target.current-desktop'], document.body);
    await view.click(en['rows.target.enable'], document.body);
    expect(view.prefs.getSnapshot().target).toBe('current-desktop');
    const buttons = () => [...view.container.querySelectorAll('button')];
    expect(buttons().find((button) => button.textContent === en['local.checking'])?.disabled).toBe(
      true,
    );
    expect(view.requests.filter((url) => url.endsWith('/start'))).toHaveLength(1);
    await act(async () => finishStart(new Response(null, { status: 503 })));
    expect(view.container.textContent).toContain(en['rows.target.startFailed']);
    expect(
      buttons().find((button) => button.textContent === en['local.desktop.check'])?.disabled,
    ).toBe(false);
  });

  it('reports a target save failure without requesting a desktop start', async () => {
    const view = await mount(undefined, 'container', {
      respond: async () => Response.json({ platform: 'linux' }),
      save: async () => {
        throw new Error('target save refused');
      },
    });
    await view.click(en['rows.target.container']);
    await view.click(en['rows.target.local'], document.body);
    expect(view.prefs.getSnapshot().target).toBe('container');
    expect(view.container.textContent).toContain(en['rows.target.failed']);
    expect(view.container.textContent).not.toContain(en['rows.target.startFailed']);
    expect(view.requests.filter((url) => url.endsWith('/start'))).toHaveLength(0);
  });
});

function labelOf(element: HTMLElement): string {
  const id = element.getAttribute('aria-labelledby');
  return id === null ? '' : (element.ownerDocument.getElementById(id)?.textContent ?? '');
}

it('shows the operation phase on a Host event and advances the stopwatch without polling', async () => {
  vi.useFakeTimers();
  const events = resourceEvents();
  let completeExport: ((response: Response) => void) | undefined;
  const exportRequest = new Promise<Response>((resolve) => {
    completeExport = resolve;
  });
  let phase = 'idle';
  const view = await mount(async () => '/picked', 'container', {
    observe: (resource, refresh) => observeResource(resource, refresh, 10_000, 60_000, true),
    respond: async (url) =>
      url.endsWith('/export') ? exportRequest : Response.json({ status: { phase } }),
  });
  const requestCountOnMount = view.requests.length;
  const operationStatusReads = () =>
    view.requests.slice(requestCountOnMount).filter((url) => url.endsWith('/status'));
  try {
    await view.click('Export to…');
    await view.click('Authorize and export');
    expect(operationStatusReads()).toHaveLength(1);
    phase = 'exporting';
    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    expect(operationStatusReads()).toHaveLength(1);
    expect(view.container.textContent).not.toMatch(/Exporting ·/);
    await act(async () => {
      events.emit('computer');
      await vi.advanceTimersByTimeAsync(30);
    });
    expect(view.container.textContent).toContain('Exporting ·');
    expect(view.container.textContent).toContain('2s');
  } finally {
    await act(async () => completeExport?.(Response.json({ archive: '/picked/computer.tar' })));
    events.dispose();
    vi.useRealTimers();
  }
});
