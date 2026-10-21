// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native-keyboard-controller', async () => import('./keyboard-controller-shim'));
const alert = vi.fn();
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Alert: { alert: (...args: unknown[]) => alert(...args) },
}));
vi.mock('expo-symbols', () => ({
  SymbolView: ({ name }: { name: { android: string } }) =>
    createElement('i', { 'data-symbol': name.android }),
}));
vi.mock('react-native-svg', () => ({
  default: () => null,
  Path: () => null,
  SvgXml: () => null,
  Defs: () => null,
  LinearGradient: () => null,
  Rect: () => null,
  Stop: () => null,
}));

import { createHostLooks, parseHostLook } from '../src/host/host-look';
import {
  DEFAULT_HOST_LOOK,
  HOST_COLOR_IDS,
  hostColorInk,
  nearestHostColor,
  shownHostName,
  type HostLook,
} from '../src/ui/design/host-look';
import { contrast, resolveTheme } from '../src/ui/design/resolve-theme';
import { HostLookEditor, type HostLookActions } from '../src/ui/shell/host-look-editor';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('Host look model', () => {
  it('falls back to the default for stored values it does not understand', () => {
    expect(parseHostLook(undefined)).toEqual(DEFAULT_HOST_LOOK);
    expect(
      parseHostLook({ icon: { kind: 'symbol', id: 'not-a-symbol' }, color: 'chartreuse' }),
    ).toEqual(DEFAULT_HOST_LOOK);
    expect(parseHostLook({ icon: { kind: 'emoji', emoji: 'not an emoji' } })).toEqual(
      DEFAULT_HOST_LOOK,
    );
    expect(parseHostLook({ icon: { kind: 'emoji', emoji: '🚀' }, color: 'teal' })).toEqual({
      icon: { kind: 'emoji', emoji: '🚀' },
      color: 'teal',
    });
  });

  it('carries an old banner colour over as the nearest preset and drops avatars', () => {
    expect(
      parseHostLook({
        name: 'Studio',
        avatar: { kind: 'image', uri: 'file:///a.png' },
        banner: { kind: 'color', color: '#E8613C' },
      }),
    ).toEqual({ name: 'Studio', icon: DEFAULT_HOST_LOOK.icon, color: 'red' });
    expect(
      parseHostLook({
        avatar: { kind: 'preset', id: 'sora' },
        banner: { kind: 'gradient', from: '#2e9e4f', to: '#0f8a7e' },
      }),
    ).toEqual({ icon: DEFAULT_HOST_LOOK.icon, color: 'green' });
    expect(
      parseHostLook({ avatar: { kind: 'initial' }, banner: { kind: 'image', uri: 'x' } }),
    ).toEqual(DEFAULT_HOST_LOOK);
    expect(parseHostLook({ banner: { kind: 'accent' } })).toEqual(DEFAULT_HOST_LOOK);
    expect(nearestHostColor('#2f80ed')).toBe('blue');
  });

  it('keeps a trimmed local name and drops a blank one', () => {
    expect(parseHostLook({ name: '  Studio Mac  ' }).name).toBe('Studio Mac');
    expect(parseHostLook({ name: '   ' })).toEqual(DEFAULT_HOST_LOOK);
    expect(shownHostName(parseHostLook({ name: 'Home' }), 'vm')).toBe('Home');
    expect(shownHostName(DEFAULT_HOST_LOOK, 'vm')).toBe('vm');
  });

  it('keeps one look per Host and saves every change', async () => {
    const write = vi.fn();
    const looks = createHostLooks({
      read: async () => ({ studio: { icon: { kind: 'symbol', id: 'laptop' }, color: 'green' } }),
      write,
    });
    await Promise.resolve();
    expect(looks.look('studio')).toEqual({
      icon: { kind: 'symbol', id: 'laptop' },
      color: 'green',
    });
    expect(looks.look('laptop')).toEqual(DEFAULT_HOST_LOOK);
    expect(write).not.toHaveBeenCalled();

    const next: HostLook = { icon: { kind: 'emoji', emoji: '🏠' }, color: 'orange' };
    looks.set('laptop', next);
    expect(looks.look('laptop')).toEqual(next);
    expect(write).toHaveBeenLastCalledWith({
      studio: { icon: { kind: 'symbol', id: 'laptop' }, color: 'green' },
      laptop: next,
    });
  });

  it('rewrites old looks once and forgets their pictures', async () => {
    const write = vi.fn();
    const forgetLegacyImages = vi.fn();
    const looks = createHostLooks({
      read: async () => ({
        studio: {
          name: 'Studio',
          avatar: { kind: 'image', uri: 'file:///host-looks/a.jpg' },
          banner: { kind: 'color', color: '#8e44ec' },
        },
      }),
      write,
      forgetLegacyImages,
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(looks.look('studio')).toEqual({
      name: 'Studio',
      icon: DEFAULT_HOST_LOOK.icon,
      color: 'purple',
    });
    expect(write).toHaveBeenCalledWith({
      studio: { name: 'Studio', icon: DEFAULT_HOST_LOOK.icon, color: 'purple' },
    });
    expect(forgetLegacyImages).toHaveBeenCalledOnce();
  });

  it('keeps every preset colour visible against the screen in both schemes', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const { color } = resolveTheme(scheme);
      for (const id of [undefined, ...HOST_COLOR_IDS])
        expect(
          contrast(hostColorInk(scheme, color, id), color.base),
          `${scheme} ${id ?? 'theme'}`,
        ).toBeGreaterThanOrEqual(3);
    }
  });
});

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
});

async function render(element: ReactElement): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
  return host;
}

function actions(overrides: Partial<HostLookActions> = {}): HostLookActions {
  return { onChange: vi.fn(), onClose: vi.fn(), ...overrides };
}

const button = (view: HTMLElement, label: string) =>
  view.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

describe('Customize computer sheet', () => {
  it('picks a preset symbol, an emoji and an accent colour', async () => {
    const handlers = actions();
    const view = await render(
      <HostLookEditor hostName="vm" look={DEFAULT_HOST_LOOK} actions={handlers} />,
    );
    expect(view.textContent).toContain(t.hostLook);

    await act(async () => button(view, t.hostSymbol.server)!.click());
    expect(handlers.onChange).toHaveBeenLastCalledWith({ icon: { kind: 'symbol', id: 'server' } });

    await act(async () => button(view, t.hostColorName.orange)!.click());
    expect(handlers.onChange).toHaveBeenLastCalledWith({ ...DEFAULT_HOST_LOOK, color: 'orange' });

    await act(async () => button(view, t.hostIconEmoji)!.click());
    expect(button(view, t.hostSymbol.server)).toBeNull();
    await act(async () => button(view, '🚀')!.click());
    expect(handlers.onChange).toHaveBeenLastCalledWith({ icon: { kind: 'emoji', emoji: '🚀' } });
  });

  it('goes back to the theme colour', async () => {
    const handlers = actions();
    const view = await render(
      <HostLookEditor
        hostName="vm"
        look={{ name: 'Studio', icon: { kind: 'symbol', id: 'lab' }, color: 'pink' }}
        actions={handlers}
      />,
    );
    expect(button(view, t.hostColorName.pink)!.getAttribute('aria-selected')).toBe('true');
    await act(async () => button(view, t.hostColorDefault)!.click());
    expect(handlers.onChange).toHaveBeenLastCalledWith({
      name: 'Studio',
      icon: { kind: 'symbol', id: 'lab' },
    });
  });

  it('renames the computer on the phone and falls back to its own name when cleared', async () => {
    const handlers = actions();
    const view = await render(
      <HostLookEditor hostName="vm" look={DEFAULT_HOST_LOOK} actions={handlers} />,
    );
    const field = view.querySelector<HTMLTextAreaElement>(
      `textarea[aria-label="${t.hostLookName}"]`,
    )!;
    expect(field.placeholder).toBe('vm');
    const type = async (text: string) =>
      act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          'value',
        )!.set!;
        setter.call(field, text);
        field.dispatchEvent(new Event('input', { bubbles: true }));
      });
    await type('Studio ');
    expect(handlers.onChange).toHaveBeenLastCalledWith({ ...DEFAULT_HOST_LOOK, name: 'Studio' });
    await type('');
    expect(handlers.onChange).toHaveBeenLastCalledWith(DEFAULT_HOST_LOOK);
  });

  it('shows a saved look that arrives after the sheet opens', async () => {
    const handlers = actions();
    const view = await render(
      <HostLookEditor hostName="vm" look={DEFAULT_HOST_LOOK} actions={handlers} />,
    );
    const saved: HostLook = { name: 'Studio', icon: { kind: 'emoji', emoji: '🦊' }, color: 'teal' };
    await act(async () =>
      root!.render(<HostLookEditor hostName="vm" look={saved} actions={handlers} />),
    );
    const field = view.querySelector<HTMLTextAreaElement>(
      `textarea[aria-label="${t.hostLookName}"]`,
    )!;
    expect(field.value).toBe('Studio');
    expect(button(view, '🦊')!.getAttribute('aria-selected')).toBe('true');
  });

  it('resets after confirming and closes', async () => {
    const handlers = actions();
    const view = await render(
      <HostLookEditor
        hostName="vm"
        look={{ icon: { kind: 'symbol', id: 'game' }, color: 'red' }}
        actions={handlers}
      />,
    );
    await act(async () => button(view, t.hostLookReset)!.click());
    expect(alert.mock.calls.at(-1)![0]).toBe(t.confirmAction(t.hostLookReset));
    const buttons = alert.mock.calls.at(-1)![2] as { text: string; onPress?: () => void }[];
    expect(buttons.map((entry) => entry.text)).toEqual([t.cancel, t.hostLookReset]);
    await act(async () => buttons[1]!.onPress!());
    expect(handlers.onChange).toHaveBeenLastCalledWith(DEFAULT_HOST_LOOK);
    await act(async () => button(view, t.close)!.click());
    expect(handlers.onClose).toHaveBeenCalled();
  });
});
