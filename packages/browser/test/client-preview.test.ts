// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentType, ReactNode } from 'react';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { createElement } = await import('react');
  const control = (p: Record<string, unknown>) => {
    const { children, variant: _variant, size: _size, ...rest } = p;
    return createElement('button', { type: 'button', ...rest }, children as ReactNode);
  };
  return {
    Button: control,
    Pill: control,
    Tag: (p: { children: ReactNode }) => createElement('span', null, p.children),
    StateDot: () => null,
    IconFullscreenOutlineRegular: () => null,
    Modal: (p: { children: ReactNode; title: string; onClose(): void }) =>
      createElement(
        'div',
        { role: 'dialog', 'aria-label': p.title },
        createElement('button', { onClick: p.onClose }, 'Close'),
        p.children,
      ),
    Switch: (p: { checked: boolean; label: string; onChange(v: boolean): void }) =>
      createElement('button', {
        role: 'switch',
        'aria-label': p.label,
        'aria-checked': p.checked,
        onClick: () => p.onChange(!p.checked),
      }),
  };
});
vi.mock('../src/client/profile-combobox.js', () => ({ ProfileCombobox: () => null }));
import { apply, type BrowserClientContext } from '../src/client/index.js';
import { en } from '../src/client/locale.js';

let root: Root;
let host: HTMLDivElement;
let Body: ComponentType<{ botSlug: string }> | undefined;
let current: string;
let target: 'local' | 'container';
let takeover: boolean;
let viewer: boolean;
let handoffPending: boolean;
const urls: string[] = [];
const tabs = [
  { targetId: 'home', title: 'Home', url: 'http://fixture/home' },
  { targetId: 'work', title: 'Work', url: 'http://fixture/work' },
];
function observation(url: string): object {
  const preview = new URL(url, 'http://host').searchParams.get('tab') ?? current;
  return {
    focused: preview,
    running: true,
    frame: `frame:${preview}`,
    takeover,
    handoffPending,
    target,
    viewerUrl: viewer ? '/viewer/qa/' : null,
    tabs: tabs.map((t) => ({ ...t, current: t.targetId === current })),
  };
}
async function poll(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
}
async function click(selector: string): Promise<void> {
  const interaction = selector.match(
    /^\[aria-label="(Enable interaction|Disable interaction)"\]$/,
  )?.[1];
  await act(async () => {
    const button =
      interaction === undefined
        ? host.querySelector<HTMLButtonElement>(selector)
        : [...host.querySelectorAll('button')].find((b) => b.textContent === interaction);
    expect(button).toBeDefined();
    button!.click();
  });
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(pointer: fine)',
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  current = 'work';
  target = 'local';
  takeover = false;
  viewer = false;
  handoffPending = false;
  urls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      urls.push(url);
      if (url === '/api/browser/takeover') takeover = JSON.parse(String(init?.body)).active;
      return { ok: true, json: async () => observation(url) };
    }),
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  Body = undefined;
  apply({
    locale: {
      bind: () => (key: string, params?: Record<string, string | number>) =>
        (en[key as keyof typeof en] ?? key).replace('{name}', String(params?.name ?? '')),
      register: () => () => {},
    },
    effect: (callback) => {
      callback();
    },
    inject: (names, callback) => {
      if (names.includes('configForms')) return;
      callback({
        channelSidebar: {
          register: (entry: { component: typeof Body }) => {
            Body = entry.component;
            return () => {};
          },
        },
        connection: {
          rpc: {
            call: async () => ({
              ok: true,
              value: { bots: [{ slug: 'qa', browserAccess: true }] },
            }),
          },
        },
      } as unknown as BrowserClientContext);
    },
  });
  await act(async () => root.render(createElement(Body!, { botSlug: 'qa' })));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Browser current work versus Human preview', () => {
  it.each(['local', 'container', 'daily-control', 'profile-control', 'extension'])(
    '%s keeps Stop usable until cleanup recovery succeeds',
    async (failedTarget) => {
      let failed = true;
      let failStop = true;
      vi.mocked(fetch).mockImplementation(async (url, init) => {
        if (url === '/api/browser/stop') {
          expect(JSON.parse(String(init?.body))).toEqual({ slug: 'qa' });
          if (failStop) {
            failStop = false;
            return {
              ok: false,
              json: async () => ({ error: 'Docker still unavailable' }),
            } as Response;
          }
          failed = false;
          return { ok: true, json: async () => ({ ok: true }) } as Response;
        }
        return {
          ok: true,
          json: async () =>
            failed
              ? {
                  target: failedTarget,
                  cleanupRequired: true,
                  running: false,
                  frame: null,
                  tabs: [],
                }
              : observation(String(url)),
        } as Response;
      });
      await poll();
      expect(host.querySelector('[role="alert"]')?.textContent).toBe(
        'Browser cleanup failed. Click Stop to retry.',
      );
      const buttons = [...host.querySelectorAll('button')];
      expect(buttons.find((b) => b.textContent === 'Stop')?.disabled).toBe(false);
      expect(buttons.find((b) => b.textContent === 'Open Bot Browser')?.disabled).toBe(true);
      expect(buttons.find((b) => b.textContent === 'Pause Bot')?.disabled).toBe(true);
      await act(async () => buttons.find((b) => b.textContent === 'Stop')!.click());
      expect(host.querySelector('[role="alert"]')?.textContent).toBe(
        'Browser cleanup failed. Click Stop to retry.',
      );
      await act(async () => buttons.find((b) => b.textContent === 'Stop')!.click());
      expect(host.querySelector('[role="alert"]')).toBeNull();
      expect(host.querySelector('img')?.getAttribute('src')).toBe('frame:work');
      expect(host.textContent).toContain('Work');
    },
  );

  it('pins the current Bot tab first and shows title and URL without hovering', () => {
    const rows = host.querySelectorAll('button[title]');
    expect(rows[0]?.textContent).toContain('Work');
    expect(rows[0]?.textContent).toContain('http://fixture/work');
    expect(rows[1]?.textContent).toContain('http://fixture/home');
    expect(host.querySelectorAll('.bh-browser-tabs .bh-card-row')).toHaveLength(rows.length);
    expect(host.querySelector('.bh-browser-cards .bh-card-title')?.textContent).toBe(
      'Local Browser',
    );
  });
  it('locks the visible tab when Follow is turned off and resumes current work when re-enabled', async () => {
    await click('[role="switch"]');
    current = 'home';
    await poll();
    expect(host.querySelector('img')?.getAttribute('src')).toBe('frame:work');
    expect(urls.at(-1)).toContain('tab=work');
    await click('[role="switch"]');
    expect(host.querySelector('img')?.getAttribute('src')).toBe('frame:home');
    expect(urls.at(-1)).not.toContain('&tab=');
  });
  it('keeps Bot current pinned while a different tab is previewed without a command', async () => {
    await click('button[title="http://fixture/home"]');
    expect(host.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('false');
    expect(host.querySelector('img')?.getAttribute('src')).toBe('frame:home');
    expect(host.querySelector('button[title]')?.getAttribute('title')).toBe('http://fixture/work');
    expect(current).toBe('work');
    expect(urls.every((url) => url.startsWith('/api/browser/observation?'))).toBe(true);
  });
});

describe('Container Human viewer', () => {
  async function expand(): Promise<HTMLIFrameElement> {
    target = 'container';
    viewer = true;
    await poll();
    const frame = host.querySelector('iframe')!;
    expect(frame.style.pointerEvents).toBe('auto');
    expect(frame.tabIndex).toBe(0);
    await act(async () =>
      [...host.querySelectorAll('button')].find((b) => b.textContent === 'Fullscreen')!.click(),
    );
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(takeover).toBe(false);
    expect(host.querySelector('iframe')).toBe(frame);
    expect(frame.style.pointerEvents).toBe('auto');
    return frame;
  }
  async function takeOver(): Promise<void> {
    await act(async () =>
      [...host.querySelectorAll('button')].find((b) => b.textContent === 'Take over')!.click(),
    );
    expect(takeover).toBe(true);
    expect([...host.querySelectorAll('button')].some((b) => b.textContent === 'Release')).toBe(
      true,
    );
    expect(host.textContent).toContain('Taking over');
  }
  async function release(): Promise<void> {
    await act(async () =>
      [...host.querySelectorAll('button')].find((b) => b.textContent === 'Release')!.click(),
    );
  }
  it('watches without pausing, takes over explicitly, and resumes on release', async () => {
    const frame = await expand();
    await takeOver();
    expect(host.querySelector('iframe')).toBe(frame);
    await release();
    expect(takeover).toBe(false);
    expect([...host.querySelectorAll('button')].some((b) => b.textContent === 'Take over')).toBe(
      true,
    );
    await takeOver();
    await click('[aria-label="Leave fullscreen"]');
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.querySelector('iframe')).toBe(frame);
    expect(takeover).toBe(true);
    await act(async () =>
      [...host.querySelectorAll('button')].find((b) => b.textContent === 'Resume')!.click(),
    );
    expect(takeover).toBe(false);
  });
  it('keeps the takeover paused while a handoff link is pending', async () => {
    await expand();
    await takeOver();
    handoffPending = true;
    await poll();
    await release();
    expect(takeover).toBe(true);
    handoffPending = false;
    await poll();
    await takeOver();
    await release();
    expect(takeover).toBe(false);
  });
  it('keeps an already live static frame connected when toggling interaction', async () => {
    const frame = await expand();
    const frameDocument = frame.contentDocument!;
    frameDocument.open();
    frameDocument.write('<html><body></body></html>');
    frameDocument.close();
    const canvas = frameDocument.createElement('canvas');
    const pixels = new Uint8ClampedArray(1024);
    const context = vi
      .spyOn(Object.getPrototypeOf(canvas) as HTMLCanvasElement, 'getContext')
      .mockReturnValue({
        drawImage: vi.fn(),
        getImageData: () => ({ data: pixels }),
      } as unknown as CanvasRenderingContext2D);
    canvas.id = 'videoCanvas';
    canvas.width = 640;
    frameDocument.body.append(canvas);
    try {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      pixels[0] = 10;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      await act(async () =>
        [...host.querySelectorAll('button')].find((b) => b.textContent === 'Take over')!.click(),
      );
      expect(host.querySelector('iframe')).toBe(frame);
      expect(frame.style.pointerEvents).toBe('auto');
      await act(async () =>
        [...host.querySelectorAll('button')].find((b) => b.textContent === 'Release')!.click(),
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(host.querySelector('iframe')).toBe(frame);
      expect(frame.style.pointerEvents).toBe('auto');
      expect(frame.inert).toBe(false);
    } finally {
      context.mockRestore();
    }
  });
  it('waits for the Host acknowledgement and ignores it after fullscreen collapses', async () => {
    const frame = await expand();
    let resolve!: (value: Response) => void;
    vi.mocked(fetch).mockImplementation((url) =>
      url === '/api/browser/takeover'
        ? new Promise<Response>((done) => {
            resolve = done;
          })
        : Promise.resolve({
            ok: true,
            json: async () => observation(String(url)),
          } as Response),
    );
    await act(async () =>
      [...host.querySelectorAll('button')].find((b) => b.textContent === 'Take over')!.click(),
    );
    expect(frame.style.pointerEvents).toBe('auto');
    await click('[aria-label="Leave fullscreen"]');
    await act(async () => {
      takeover = true;
      resolve({ ok: true, json: async () => observation('/observation') } as Response);
    });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });
  it('shows a failed takeover in fullscreen and stays in watch mode', async () => {
    const frame = await expand();
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (url === '/api/browser/takeover') throw new Error('Pause failed');
      return { ok: true, json: async () => observation(String(url)) } as Response;
    });
    await act(async () =>
      [...host.querySelectorAll('button')].find((b) => b.textContent === 'Take over')!.click(),
    );
    expect(frame.style.pointerEvents).toBe('auto');
    expect(host.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain(
      'Pause failed',
    );
  });
  it('revokes interaction when the target switches away from a viewer target', async () => {
    await expand();
    viewer = false;
    await poll();
    expect(host.querySelector('iframe')).toBeNull();
    viewer = true;
    await poll();
    expect(host.querySelector('iframe')!.style.pointerEvents).toBe('auto');
  });
  it('hides the header takeover switch on touch devices', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(pointer: coarse)',
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true });
    const host2 = document.createElement('div');
    document.body.append(host2);
    const root2 = createRoot(host2);
    target = 'container';
    viewer = true;
    await act(async () => root2.render(createElement(Body!, { botSlug: 'qa' })));
    await poll();
    await act(async () =>
      [...host2.querySelectorAll('button')].find((b) => b.textContent === 'Fullscreen')!.click(),
    );
    expect(host2.querySelector('[role="dialog"]')).not.toBeNull();
    expect([...host2.querySelectorAll('button')].some((b) => b.textContent === 'Take over')).toBe(
      false,
    );
    expect(
      [...host2.querySelectorAll('button')].some(
        (b) => b.textContent === 'Trackpad' || b.textContent === 'Direct tap',
      ),
    ).toBe(false);
    await act(async () => root2.unmount());
    host2.remove();
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
  });
  it('toggles takeover from viewer messages and ignores foreign origins', async () => {
    const frame = await expand();
    const fakeSource = { postMessage: vi.fn() };
    Object.defineProperty(frame, 'contentWindow', { value: fakeSource, configurable: true });
    frame.setAttribute('src', '/botharness-browser/viewer/local/?slug=qa');
    const message = (origin: string): void => {
      const event = new Event('message');
      Object.defineProperties(event, {
        origin: { value: origin },
        data: { value: { type: 'bh-takeover-toggle' } },
        source: { value: fakeSource },
      });
      window.dispatchEvent(event);
    };
    message('https://evil.example');
    await act(async () => {});
    expect(takeover).toBe(false);
    message(window.location.origin);
    await act(async () => {});
    expect(takeover).toBe(true);
    expect(fakeSource.postMessage).toHaveBeenCalledWith(
      { type: 'bh-takeover-state', active: true },
      window.location.origin,
    );
  });
  it('opens the fullscreen viewer without another server round trip', async () => {
    target = 'container';
    viewer = true;
    await poll();
    const calls = vi.mocked(globalThis.fetch).mock.calls.length;
    await act(async () =>
      [...host.querySelectorAll('button')].find((b) => b.textContent === 'Fullscreen')!.click(),
    );
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(vi.mocked(globalThis.fetch).mock.calls.length).toBe(calls);
  });
  it('switches the viewer input mode from the fullscreen header', async () => {
    const frame = await expand();
    expect(frame.getAttribute('src')).toContain('mode=direct');
    await act(async () =>
      [...host.querySelectorAll('button')].find((b) => b.textContent === 'Trackpad')!.click(),
    );
    expect(host.querySelector('iframe')).toBe(frame);
    expect(frame.getAttribute('src')).toContain('mode=trackpad');
    expect(
      [...host.querySelectorAll('button')].some(
        (b) => b.textContent === 'Trackpad' || b.textContent === 'Direct tap',
      ),
    ).toBe(false);
  });
  it('coalesces slow observation polls while Human Open remains available', async () => {
    let resolve!: (response: object) => void;
    const delayed = new Promise<object>((done) => {
      resolve = done;
    });
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockImplementationOnce(() => delayed as Promise<Response>);
    await poll();
    const count = fetch.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(fetch.mock.calls.length).toBe(count);
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((b) => b.textContent === 'Open Bot Browser')!
        .click(),
    );
    expect(fetch.mock.calls.at(-1)?.[0]).toBe('/api/browser/open');
    await act(async () => resolve({ ok: true, json: async () => observation('/observation') }));
    expect(fetch.mock.calls.length).toBe(count + 2);
  });
});

describe('Local Human viewer', () => {
  it('renders the Host-served viewer for the local target', async () => {
    target = 'local';
    viewer = true;
    await poll();
    const frame = host.querySelector('iframe')!;
    expect(frame.getAttribute('src')).toBe('/viewer/qa/?mode=direct');
    expect(frame.style.pointerEvents).toBe('auto');
    expect(host.textContent).toContain("qa's Browser");
  });

  it('opens watch-only without pausing the bot', async () => {
    target = 'local';
    viewer = true;
    await poll();
    await act(async () =>
      [...host.querySelectorAll('button')].find((b) => b.textContent === 'Fullscreen')!.click(),
    );
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(takeover).toBe(false);
    expect(host.querySelector('iframe')!.style.pointerEvents).toBe('auto');
    expect(host.querySelector('iframe')!.getAttribute('src')).toContain('mode=direct');
  });
});
