// @vitest-environment jsdom
import { act, createElement, type InputHTMLAttributes, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { DEFAULT_HOST_LOOK, type HostLook } from '../../../apps/mobile/src/ui/design/host-look.js';

let look: HostLook = { ...DEFAULT_HOST_LOOK, name: 'Old alias' };
const update = vi.fn(async (_hostId: string, transform: (value: HostLook) => HostLook) => {
  look = transform(look);
});
vi.mock('../src/client/host-looks.js', () => ({
  useHostLook: () => look,
  useHostLookError: () => undefined,
  useHostInk: () => 'currentColor',
  hostLooks: () => ({ update, refresh: async () => {} }),
}));
vi.mock('../src/client/bot-color-scheme.js', () => ({ useBotColorScheme: () => 'light' }));
vi.mock('../src/client/host-glyph.js', () => ({ HostGlyph: () => null }));
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => createElement('input', props),
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) =>
    createElement('button', { onClick }, children),
}));
import { HostLookSettings } from '../src/client/host-look-settings.js';
import { hostSettingsDrafts } from '../src/client/host-settings-drafts.js';
import type { HostDraftChoice } from '../src/client/host-settings-drafts.js';
import { en } from '../src/client/locale.js';

it('follows external alias reset while pristine, keeps a real draft, and cannot save the reset alias back on blur', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const render = () =>
    root.render(
      createElement(HostLookSettings, {
        hostId: 'b',
        name: 'Host B',
        t: (key) => Object.entries(en).find(([name]) => name === key)?.[1] ?? key,
      }),
    );
  try {
    await act(render);
    const input = container.querySelector('input');
    if (!input) throw new Error('name input missing');
    expect(input.value).toBe('Old alias');
    look = DEFAULT_HOST_LOOK;
    await act(render);
    expect(input.value).toBe('');
    await act(async () => {
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(update).not.toHaveBeenCalled();
    await act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (!setter) throw new Error('input setter missing');
      setter.call(input, 'My draft');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    look = { ...DEFAULT_HOST_LOOK, name: 'Other tab' };
    await act(render);
    expect(input.value).toBe('My draft');
    expect(await hostSettingsDrafts.prepare('b')).toBe(false);
    await act(async () => {
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(update).not.toHaveBeenCalled();
    let choice: HostDraftChoice = 'cancel';
    const release = hostSettingsDrafts.prompt('b', async () => choice);
    try {
      expect(await hostSettingsDrafts.prepare('b')).toBe(false);
      expect(input.value).toBe('My draft');
      expect(update).not.toHaveBeenCalled();
      choice = 'discard';
      await act(async () => {
        expect(await hostSettingsDrafts.prepare('b')).toBe(true);
      });
      expect(input.value).toBe('Other tab');
      expect(update).not.toHaveBeenCalled();
      await act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
          input,
          'Saved draft',
        );
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      choice = 'save';
      await act(async () => {
        expect(await hostSettingsDrafts.prepare('b')).toBe(true);
      });
      expect(look.name).toBe('Saved draft');
      expect(update).toHaveBeenCalledTimes(1);
    } finally {
      release();
    }
  } finally {
    await act(() => root.unmount());
    container.remove();
  }
});
