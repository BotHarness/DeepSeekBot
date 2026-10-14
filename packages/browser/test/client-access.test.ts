// @vitest-environment jsdom
import { act, createElement, useState, type ComponentType, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronDownOutlineRegular: () => null,
  Tooltip: ({ children }: { children: ReactNode }) => children,
  Switch: () => null,
}));
import { ChannelSidebarEntrySection } from '../../client/src/client/channel-sidebar-view.js';
import { zhTranslate } from '../../client/src/client/locale.js';
import type { ChannelSidebarEntryProps } from '../../client/src/client/channel-sidebar.js';
import { apply, type BrowserClientContext } from '../src/client/index.js';
import { en, zh, type BrowserKey } from '../src/client/locale.js';
type Result = { ok: true; value: unknown } | { ok: false; error: { message?: string } };
type Call = (channel: string, method: string, payload: unknown) => Promise<Result>;
type Props = {
  botSlug?: string;
  setExpandable(next: boolean): void;
  setExpanded(next: boolean): void;
};
let root: Root | undefined;
let host: HTMLDivElement;
function mount(call: Call, language: 'zh' | 'en' = 'en') {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  let Header: ComponentType<Props> | undefined;
  const expanded: boolean[] = [];
  const expandable: boolean[] = [];
  apply({
    locale: {
      bind: () => (key) => (language === 'zh' ? zh : en)[key as BrowserKey],
      register: () => () => {},
    },
    effect: (cb) => {
      cb();
    },
    inject: (names, cb) =>
      names.includes('configForms')
        ? undefined
        : cb({
            channelSidebar: {
              register: (entry: { headerAction: typeof Header }) => {
                Header = entry.headerAction;
                return () => {};
              },
            },
            connection: { rpc: { call } },
          } as unknown as BrowserClientContext),
  });
  const render = async (botSlug: string | undefined = 'ada') =>
    act(async () =>
      root!.render(
        createElement(Header!, {
          botSlug,
          setExpandable: (next) => expandable.push(next),
          setExpanded: (next) => expanded.push(next),
        }),
      ),
    );
  return { render, expanded, expandable };
}
const button = () => host.querySelector<HTMLButtonElement>('.bh-browser-access-power')!;
const read = (enabled: boolean): Result => ({
  ok: true,
  value: { bots: [{ slug: 'ada', browserAccess: enabled }] },
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  host?.remove();
});
describe('Browser Access Power control', () => {
  it('treats an omitted legacy permission as confirmed off after the Host list resolves', async () => {
    const view = mount(async () => ({ ok: true, value: { bots: [{ slug: 'ada' }] } }));
    await view.render();
    expect(button().disabled).toBe(false);
    expect(button().getAttribute('aria-pressed')).toBe('false');
  });
  it.each(['zh', 'en'] as const)(
    'localizes permission actions and applies exact Host authorization (%s)',
    async (language) => {
      const call = vi.fn<Call>(async (_c, m) =>
        m === 'botharness/list'
          ? read(false)
          : { ok: true, value: { bot: { browserAccess: true } } },
      );
      const view = mount(call, language);
      await view.render();
      expect(button().getAttribute('aria-label')).toBe(
        language === 'zh' ? '启用 Browser Access' : 'Enable Browser Access',
      );
      expect(button().getAttribute('aria-pressed')).toBe('false');
      expect(button().querySelector('svg')).not.toBeNull();
      await act(async () => button().click());
      expect(call).toHaveBeenLastCalledWith('/api', 'botharness/browserAccessSet', {
        args: { slug: 'ada', enabled: true },
      });
      expect(button().getAttribute('aria-pressed')).toBe('true');
      expect(button().getAttribute('aria-label')).toBe(
        language === 'zh' ? '停用 Browser Access' : 'Disable Browser Access',
      );
      expect(view.expanded.at(-1)).toBe(true);
      expect(view.expandable.at(-1)).toBe(true);
    },
  );
  it('keeps the confirmed state while pending and guards duplicate writes', async () => {
    let resolve!: (r: Result) => void;
    const write = new Promise<Result>((r) => (resolve = r));
    const call = vi.fn<Call>(async (_c, m) => (m === 'botharness/list' ? read(false) : write));
    const view = mount(call);
    await view.render();
    await act(async () => {
      button().click();
      button().click();
    });
    expect(call.mock.calls.filter((c) => c[1].endsWith('AccessSet'))).toHaveLength(1);
    expect(button().disabled).toBe(true);
    expect(button().getAttribute('aria-busy')).toBe('true');
    expect(button().getAttribute('aria-pressed')).toBe('false');
    expect(view.expanded).toEqual([]);
    await act(async () => resolve({ ok: true, value: { bot: { browserAccess: true } } }));
    expect(button().disabled).toBe(false);
    expect(button().getAttribute('aria-pressed')).toBe('true');
  });
  it.each(['throw', 'refuse'] as const)(
    'preserves failed authorization and recovers through the same button (%s)',
    async (mode) => {
      let attempt = 0;
      const call = vi.fn<Call>(async (_c, m) => {
        if (m === 'botharness/list') return read(true);
        if (++attempt === 1) {
          if (mode === 'throw') throw Error('offline');
          return { ok: false, error: { message: 'denied' } };
        }
        return { ok: true, value: { bot: { browserAccess: false } } };
      });
      const view = mount(call);
      await view.render();
      await act(async () => button().click());
      expect(button().getAttribute('aria-pressed')).toBe('true');
      expect(host.querySelector('[role=alert]')?.getAttribute('title')).toContain(
        'Failed to switch Browser Access',
      );
      expect(view.expanded).toEqual([]);
      await act(async () => button().click());
      expect(button().getAttribute('aria-pressed')).toBe('false');
      expect(host.querySelector('[role=alert]')).toBeNull();
      expect(view.expanded.at(-1)).toBe(false);
      expect(view.expandable.at(-1)).toBe(true);
      expect(call.mock.calls.map((c) => c[1])).toEqual([
        'botharness/list',
        'botharness/browserAccessSet',
        'botharness/browserAccessSet',
      ]);
    },
  );
  it('uses the Host applied value even if it differs from the requested permission', async () => {
    const view = mount(async (_c, m) =>
      m === 'botharness/list'
        ? read(false)
        : { ok: true, value: { bot: { browserAccess: false } } },
    );
    await view.render();
    await act(async () => button().click());
    expect(button().getAttribute('aria-pressed')).toBe('false');
    expect(view.expandable.at(-1)).toBe(true);
    expect(view.expanded.at(-1)).toBe(false);
  });
  it('disables access until a selected Bot has a confirmed permission', async () => {
    const call = vi.fn<Call>(async () => ({ ok: true, value: { bots: [] } }));
    const view = mount(call);
    await view.render('missing');
    expect(button().disabled).toBe(true);
    await view.render(undefined);
    expect(button().disabled).toBe(true);
    expect(host.querySelector('[role=switch]')).toBeNull();
  });
  it('keeps real disclosure gating synchronized with the Host-confirmed permission', async () => {
    let authorization: (result: Result) => void = () => {};
    const write = () =>
      new Promise<Result>((resolve) => {
        authorization = resolve;
      });
    const call = vi.fn<Call>(async (_c, m) => (m === 'botharness/list' ? read(false) : write()));
    let Header: ComponentType<ChannelSidebarEntryProps> | undefined;
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    apply({
      locale: { bind: () => (key) => en[key as BrowserKey], register: () => () => {} },
      effect: (cb) => {
        cb();
      },
      inject: (names, cb) =>
        names.includes('configForms')
          ? undefined
          : cb({
              channelSidebar: {
                register: (entry: { headerAction: typeof Header }) => {
                  Header = entry.headerAction;
                  return () => {};
                },
              },
              connection: { rpc: { call } },
            } as unknown as BrowserClientContext),
    });
    function Surface() {
      const [expanded, setExpanded] = useState(false);
      return createElement(ChannelSidebarEntrySection, {
        entry: {
          id: 'browser',
          label: 'Browser',
          scope: 'personabot',
          component: () => createElement('div', null, 'Permission-gated content'),
          headerAction: Header!,
        },
        expanded,
        onToggle: () => setExpanded((v) => !v),
        entryProps: {
          scope: 'personabot',
          channelId: 'dm-ada',
          botSlug: 'ada',
          actions: {},
          t: zhTranslate,
        } as unknown as ChannelSidebarEntryProps,
      });
    }
    await act(async () => root!.render(createElement(Surface)));
    expect(host.textContent).not.toContain('Permission-gated content');
    await act(async () => button().click());
    expect(host.textContent).not.toContain('Permission-gated content');
    await act(async () => authorization({ ok: true, value: { bot: { browserAccess: true } } }));
    expect(host.textContent).toContain('Permission-gated content');
    await act(async () => button().click());
    expect(host.textContent).toContain('Permission-gated content');
    await act(async () => authorization({ ok: false, error: { message: 'refused' } }));
    expect(host.textContent).toContain('Permission-gated content');
    await act(async () => button().click());
    await act(async () => authorization({ ok: true, value: { bot: { browserAccess: false } } }));
    expect(host.textContent).not.toContain('Permission-gated content');
    expect(host.querySelector<HTMLButtonElement>('[data-panel-head]')?.disabled).toBe(false);
    expect(call.mock.calls.map((c) => c[1])).toEqual([
      'botharness/list',
      'botharness/browserAccessSet',
      'botharness/browserAccessSet',
      'botharness/browserAccessSet',
    ]);
  });
});
