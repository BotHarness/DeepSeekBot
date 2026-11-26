// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/client/ds/tooltip.js', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
}));

import { DmCallControl } from '../src/client/dm-call.js';
import { mountSettingsSectionOpener } from '../src/client/environment-settings-source.js';
import { cleanup, desktopWindow, host, translate } from './support/desktop-call-world.js';

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
  vi.unstubAllGlobals();
});

describe('desktop call voice setup and computer sound', () => {
  it('opens Voice settings from the notice when speech-to-text is missing', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const { fetcher } = host({ asr: false });
    const mac = desktopWindow(fetcher, 'window-mac-0001');
    const opened: string[] = [];
    cleanup.push(mountSettingsSectionOpener((section) => opened.push(section)));
    const element = document.createElement('div');
    const root = createRoot(element);
    cleanup.push(() => act(() => root.unmount()));
    await act(async () =>
      root.render(<DmCallControl slug="mira" name="Mira" t={translate()} call={mac.call} />),
    );
    await act(async () =>
      element.querySelector<HTMLButtonElement>('button[aria-label="Call Mira"]')!.click(),
    );
    const notice = document.body.querySelector('.bh-call-notice[role="alert"]')!;
    const settings = [...notice.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Open Voice settings',
    )!;
    expect(settings).not.toBeUndefined();
    await act(async () => settings.click());
    expect(opened).toEqual(['voice']);
    expect(document.body.querySelector('.bh-call-notice')).toBeNull();
    expect(mac.media.started).toEqual([]);
  });

  it('lets the Bot hear computer sound from the call bar and follows the browser stopping it', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const { fetcher } = host();
    const mac = desktopWindow(fetcher, 'window-mac-0001');
    const element = document.createElement('div');
    const root = createRoot(element);
    cleanup.push(() => act(() => root.unmount()));
    await act(async () =>
      root.render(<DmCallControl slug="mira" name="Mira" t={translate()} call={mac.call} />),
    );
    await act(async () =>
      element.querySelector<HTMLButtonElement>('button[aria-label="Call Mira"]')!.click(),
    );
    await act(async () => {
      for (let index = 0; index < 20 && mac.call.snapshot().state.status !== 'live'; index += 1)
        await new Promise((resolve) => setTimeout(resolve, 5));
    });
    const share = 'button[aria-label="Share your computer’s sound with Mira"]';
    const unshare = 'button[aria-label="Stop sharing your computer’s sound with Mira"]';
    await act(async () => element.querySelector<HTMLButtonElement>(share)!.click());
    expect(element.querySelector(unshare)?.getAttribute('aria-pressed')).toBe('true');
    await act(async () => mac.media.endSound());
    expect(element.querySelector(share)?.getAttribute('aria-pressed')).toBe('false');

    mac.media.failSound(true);
    await act(async () => element.querySelector<HTMLButtonElement>(share)!.click());
    const notice = document.body.querySelector('.bh-call-notice[role="alert"]')!;
    expect(notice.textContent).toContain('No computer sound was shared.');
    mac.media.failSound(false);
    await act(async () =>
      [...notice.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === 'Share again')!
        .click(),
    );
    expect(document.body.querySelector('.bh-call-notice')).toBeNull();
    expect(element.querySelector(unshare)).not.toBeNull();
    expect(mac.media.sounds).toEqual([true, true, true]);
    expect(mac.call.snapshot().state.status).toBe('live');
    await act(async () =>
      element.querySelector<HTMLButtonElement>('button[aria-label="Hang up"]')!.click(),
    );
    expect(mac.call.snapshot().sound).toBe('off');
  });
  it('mutes only the microphone while sharing, so the Bot keeps hearing the shared sound', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const { fetcher } = host();
    const mac = desktopWindow(fetcher, 'window-mac-0001');
    const element = document.createElement('div');
    const root = createRoot(element);
    cleanup.push(() => act(() => root.unmount()));
    await act(async () =>
      root.render(<DmCallControl slug="mira" name="Mira" t={translate()} call={mac.call} />),
    );
    await act(async () =>
      element.querySelector<HTMLButtonElement>('button[aria-label="Call Mira"]')!.click(),
    );
    await act(async () => {
      for (let index = 0; index < 20 && mac.call.snapshot().state.status !== 'live'; index += 1)
        await new Promise((resolve) => setTimeout(resolve, 5));
    });
    const hostMuted = () => (mac.call.snapshot().state as { muted?: boolean }).muted;
    const click = (label: string) =>
      act(async () =>
        element.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click(),
      );

    await click('Mute');
    expect(hostMuted()).toBe(true);
    await click('Share your computer’s sound with Mira');
    expect(hostMuted()).toBe(false);
    expect(mac.media.muted.at(-1)).toBe(true);
    expect(element.querySelector('button[aria-label="Unmute"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );

    await click('Unmute');
    expect(mac.media.muted.at(-1)).toBe(false);
    await click('Mute');
    expect(mac.media.muted.at(-1)).toBe(true);
    expect(hostMuted()).toBe(false);

    await act(async () => mac.media.endSound());
    await act(async () => {
      for (let index = 0; index < 20 && hostMuted() !== true; index += 1)
        await new Promise((resolve) => setTimeout(resolve, 5));
    });
    expect(hostMuted()).toBe(true);
    expect(element.querySelector('button[aria-label="Unmute"]')).not.toBeNull();
  });
});
