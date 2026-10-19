// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native-keyboard-controller', async () => import('./keyboard-controller-shim'));
const alert = vi.fn();
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Alert: { alert: (...args: unknown[]) => alert(...args) },
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

import { createHostLooks, parseHostLook, rebaseLookImages } from '../src/host/host-look';
import {
  BANNER_COLORS,
  BANNER_GRADIENTS,
  bannerHex,
  DEFAULT_HOST_LOOK,
  hostBand,
  shownHostName,
  type HostLook,
} from '../src/ui/design/host-look';
import { contrast, resolveTheme } from '../src/ui/design/resolve-theme';
import { HostLookEditor, type HostLookActions } from '../src/ui/shell/host-look-editor';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('Host look model', () => {
  it('reads hex colours loosely and rejects anything else', () => {
    expect(bannerHex('3461C1')).toBe('#3461c1');
    expect(bannerHex(' #abc ')).toBe('#aabbcc');
    expect(bannerHex('#12345')).toBeUndefined();
    expect(bannerHex('red')).toBeUndefined();
  });

  it('falls back to the default for stored values it does not understand', () => {
    expect(parseHostLook(undefined)).toEqual(DEFAULT_HOST_LOOK);
    expect(
      parseHostLook({
        avatar: { kind: 'preset', id: 'not-a-preset' },
        banner: { kind: 'gradient', from: '#ffffff', to: 'blue' },
      }),
    ).toEqual(DEFAULT_HOST_LOOK);
    expect(
      parseHostLook({
        avatar: { kind: 'image', uri: 'file:///a.png' },
        banner: { kind: 'color', color: '#E8613C' },
      }),
    ).toEqual({
      avatar: { kind: 'image', uri: 'file:///a.png' },
      banner: { kind: 'color', color: '#e8613c' },
    });
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
      read: async () => ({ studio: { banner: { kind: 'color', color: '#2e9e4f' } } }),
      write,
    });
    await Promise.resolve();
    expect(looks.look('studio').banner).toEqual({ kind: 'color', color: '#2e9e4f' });
    expect(looks.look('laptop')).toEqual(DEFAULT_HOST_LOOK);

    const next: HostLook = { avatar: { kind: 'preset', id: 'sora' }, banner: { kind: 'accent' } };
    looks.set('laptop', next);
    expect(looks.look('laptop')).toEqual(next);
    expect(write).toHaveBeenLastCalledWith({
      studio: { avatar: { kind: 'initial' }, banner: { kind: 'color', color: '#2e9e4f' } },
      laptop: next,
    });
  });

  it('finds picked pictures again after the app moves to a new folder', () => {
    const old = 'file:///var/mobile/Containers/Data/Application/OLD/Documents/host-looks';
    const now = 'file:///var/mobile/Containers/Data/Application/NEW/Documents/host-looks/';
    const looks = rebaseLookImages(
      {
        studio: {
          avatar: { kind: 'image', uri: `${old}/studio-avatar-1.jpg` },
          banner: { kind: 'image', uri: 'https://example.com/banner.jpg' },
        },
        laptop: { avatar: { kind: 'initial' }, banner: { kind: 'accent' } },
      },
      now,
    );
    expect(parseHostLook((looks as Record<string, unknown>)['studio'])).toEqual({
      avatar: { kind: 'image', uri: `${now}studio-avatar-1.jpg` },
      banner: { kind: 'image', uri: 'https://example.com/banner.jpg' },
    });
    expect(parseHostLook((looks as Record<string, unknown>)['laptop'])).toEqual(DEFAULT_HOST_LOOK);
  });

  it('keeps the Host name readable on every preset band in both schemes', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const { color } = resolveTheme(scheme);
      const banners = [
        { kind: 'accent' as const },
        ...BANNER_COLORS.map((hex) => ({ kind: 'color' as const, color: hex })),
        ...BANNER_GRADIENTS.map((stops) => ({ kind: 'gradient' as const, ...stops })),
      ];
      for (const banner of banners) {
        const band = hostBand(scheme, color, banner);
        for (const stop of [band.top, band.bottom])
          expect(contrast(stop, band.ink), `${scheme} ${JSON.stringify(banner)}`).toBeGreaterThan(
            3,
          );
      }
    }
  });

  it('lays a scrim over a banner picture and writes on it in white', () => {
    const band = hostBand('light', resolveTheme('light').color, {
      kind: 'image',
      uri: 'file:///banner.png',
    });
    expect(band).toMatchObject({ image: 'file:///banner.png', ink: '#ffffff', lightInk: true });
    expect(band.fill).toMatchObject({ from: '#000000', direction: 'vertical' });
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
  return {
    onChange: vi.fn(),
    onPickImage: vi.fn(async () => undefined),
    onClose: vi.fn(),
    ...overrides,
  };
}

const button = (view: HTMLElement, label: string) =>
  view.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

describe('Customize computer sheet', () => {
  it('picks a preset avatar and a solid banner colour', async () => {
    const handlers = actions();
    const view = await render(
      <HostLookEditor hostName="vm" look={DEFAULT_HOST_LOOK} actions={handlers} />,
    );
    expect(view.textContent).toContain(t.hostLook);

    await act(async () => button(view, t.hostAvatarPreset(1))!.click());
    expect(handlers.onChange).toHaveBeenLastCalledWith({
      avatar: { kind: 'preset', id: 'sora' },
      banner: { kind: 'accent' },
    });

    await act(async () => button(view, t.bannerSolid)!.click());
    expect(handlers.onChange).toHaveBeenLastCalledWith({
      avatar: { kind: 'initial' },
      banner: { kind: 'color', color: BANNER_COLORS[0] },
    });
    await act(async () => button(view, t.bannerSwatch(BANNER_COLORS[5].toUpperCase()))!.click());
    expect(handlers.onChange).toHaveBeenLastCalledWith({
      avatar: { kind: 'initial' },
      banner: { kind: 'color', color: BANNER_COLORS[5] },
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
    const saved = {
      name: 'Studio',
      avatar: DEFAULT_HOST_LOOK.avatar,
      banner: { kind: 'color', color: BANNER_COLORS[2] },
    } as const;
    await act(async () =>
      root!.render(<HostLookEditor hostName="vm" look={saved} actions={handlers} />),
    );
    const field = view.querySelector<HTMLTextAreaElement>(
      `textarea[aria-label="${t.hostLookName}"]`,
    )!;
    expect(field.value).toBe('Studio');
    expect(button(view, t.bannerSwatch(BANNER_COLORS[2].toUpperCase()))).not.toBeNull();
  });

  it('applies a typed colour once it is a full hex value', async () => {
    const handlers = actions();
    const view = await render(
      <HostLookEditor
        hostName="vm"
        look={{ avatar: { kind: 'initial' }, banner: { kind: 'color', color: '#3461c1' } }}
        actions={handlers}
      />,
    );
    const field = view.querySelector<HTMLTextAreaElement>(
      `textarea[aria-label="${t.bannerCustom}"]`,
    )!;
    const type = async (text: string) =>
      act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          'value',
        )!.set!;
        setter.call(field, text);
        field.dispatchEvent(new Event('input', { bubbles: true }));
      });
    await type('#ff66');
    expect(handlers.onChange).not.toHaveBeenCalled();
    await type('#ff6600');
    expect(handlers.onChange).toHaveBeenLastCalledWith({
      avatar: { kind: 'initial' },
      banner: { kind: 'color', color: '#ff6600' },
    });
  });

  it('builds a gradient and uses a picked picture for the banner and avatar', async () => {
    const onPickImage = vi.fn(async (slot: 'avatar' | 'banner') => `file:///${slot}.png`);
    const handlers = actions({ onPickImage });
    const view = await render(
      <HostLookEditor hostName="vm" look={DEFAULT_HOST_LOOK} actions={handlers} />,
    );
    await act(async () => button(view, t.bannerGradient)!.click());
    expect(handlers.onChange).toHaveBeenLastCalledWith({
      avatar: { kind: 'initial' },
      banner: { kind: 'gradient', ...BANNER_GRADIENTS[0] },
    });

    await act(async () => button(view, t.bannerImage)!.click());
    await act(async () => button(view, t.bannerChoosePicture)!.click());
    expect(onPickImage).toHaveBeenCalledWith('banner');
    expect(handlers.onChange).toHaveBeenLastCalledWith({
      avatar: { kind: 'initial' },
      banner: { kind: 'image', uri: 'file:///banner.png' },
    });

    await act(async () => button(view, t.hostAvatarPhoto)!.click());
    expect(handlers.onChange).toHaveBeenLastCalledWith({
      avatar: { kind: 'image', uri: 'file:///avatar.png' },
      banner: { kind: 'accent' },
    });

    await act(async () => button(view, t.hostLookReset)!.click());
    expect(alert.mock.calls.at(-1)![0]).toBe(t.confirmAction(t.hostLookReset));
    const buttons = alert.mock.calls.at(-1)![2] as {
      text: string;
      onPress?: () => void;
    }[];
    expect(buttons.map((entry) => entry.text)).toEqual([t.cancel, t.hostLookReset]);
    await act(async () => buttons[1]!.onPress!());
    expect(handlers.onChange).toHaveBeenLastCalledWith(DEFAULT_HOST_LOOK);
    await act(async () => button(view, t.done)!.click());
    expect(handlers.onClose).toHaveBeenCalled();
  });

  it('says so when the photo library cannot open', async () => {
    const view = await render(
      <HostLookEditor
        hostName="vm"
        look={DEFAULT_HOST_LOOK}
        actions={actions({ onPickImage: async () => Promise.reject(new Error('denied')) })}
      />,
    );
    await act(async () => button(view, t.hostAvatarPhoto)!.click());
    expect(view.textContent).toContain(t.hostLookPickFailed);
  });
});
