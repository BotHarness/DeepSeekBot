// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { MobileAppsEntry, TESTFLIGHT_URL } from '../src/client/mobile-apps.js';
import { COMMUNITY } from '../src/client/community-links.js';
import { zhTranslate as t } from '../src/client/locale.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({
    children,
    icon,
    variant: _variant,
    size: _size,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    icon?: ReactNode;
    variant?: string;
    size?: string;
  }) => createElement('button', props, icon, children),
  IconCloseOutlineRegular: () => createElement('svg'),
}));
vi.mock('../src/client/ds/tooltip.js', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
}));

afterEach(() => {
  localStorage.clear();
  document.body.replaceChildren();
});

async function render() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<MobileAppsEntry t={t} />));
  const entry = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${t('mobileApps.open')}"]`,
  )!;
  return { root, entry };
}

const hint = () => document.querySelector('.bh-mobile-apps-hint');
const panel = () => document.querySelector<HTMLElement>('.bh-mobile-apps-popover');

it('hints at the mobile apps until the entry is opened once, then stays quiet', async () => {
  const first = await render();
  expect(hint()?.textContent).toContain(t('mobileApps.hintTitle'));
  expect(panel()).toBeNull();

  await act(async () => first.entry.click());
  expect(hint()).toBeNull();
  expect(first.entry.getAttribute('aria-expanded')).toBe('true');
  const links = [...panel()!.querySelectorAll('a')].map((a) => a.href);
  expect(links).toEqual([TESTFLIGHT_URL, `${COMMUNITY.discord}`]);
  expect(panel()!.textContent).toContain(COMMUNITY.qqGroup);

  await act(async () =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  );
  expect(panel()).toBeNull();
  await act(async () => first.root.unmount());

  const again = await render();
  expect(hint()).toBeNull();
  await act(async () => again.root.unmount());
});

it('dismissing the hint remembers it without opening the panel', async () => {
  const { root } = await render();
  const dismiss = hint()!.querySelector<HTMLButtonElement>(
    `button[aria-label="${t('mobileApps.dismiss')}"]`,
  )!;
  await act(async () => dismiss.click());
  expect(hint()).toBeNull();
  expect(panel()).toBeNull();
  expect(localStorage.getItem('botharness/mobile-apps/seen')).toBe('1');
  expect(document.activeElement?.getAttribute('aria-label')).toBe(t('mobileApps.open'));
  await act(async () => root.unmount());
});

it('the hint action opens the ways to get each app', async () => {
  const { root } = await render();
  const action = [...hint()!.querySelectorAll('button')].find(
    (button) => button.textContent === t('mobileApps.hintAction'),
  )!;
  await act(async () => action.click());
  expect(panel()?.querySelector('[data-platform="ios"]')?.textContent).toContain('TestFlight');
  expect(panel()?.querySelector('[data-platform="android"]')?.textContent).toContain('Discord');
  await act(async () => root.unmount());
});
