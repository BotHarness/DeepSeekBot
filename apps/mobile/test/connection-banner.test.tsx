// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ConnectionState } from '../src/host/client';

vi.mock('react-native', () => ({
  View: ({ children, accessibilityRole }: { children: ReactNode; accessibilityRole: string }) => (
    <div role={accessibilityRole}>{children}</div>
  ),
  Pressable: ({ children, onPress }: { children: ReactNode; onPress(): void }) => (
    <button type="button" onClick={onPress}>
      {children}
    </button>
  ),
}));
vi.mock('../src/ui/primitives/system-text', () => ({
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock('../src/ui/theme', () => ({ useTheme: () => ({}) }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  vi.restoreAllMocks();
});

const refusals = [
  {
    code: 'device-revoked',
    en: 'This phone was removed from the paired devices on your computer.',
    zh: '电脑已将这台手机从配对设备中移除。',
  },
  {
    code: 'device-unknown',
    en: 'Your computer no longer knows this phone.',
    zh: '电脑已不再识别这台手机。',
  },
  {
    code: 'device-credential-missing',
    en: 'This phone has no pairing for your computer.',
    zh: '这台手机尚未与你的电脑配对。',
  },
] satisfies Array<{
  code: Extract<ConnectionState, { status: 'refused' }>['code'];
  en: string;
  zh: string;
}>;

async function render(connection: ConnectionState, locale: string) {
  vi.resetModules();
  const options = Intl.DateTimeFormat().resolvedOptions();
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
    ...options,
    locale,
  });
  const { ConnectionBanner } = await import('../src/ui/connection-banner');
  const pairAgain = vi.fn();
  const retry = vi.fn();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <ConnectionBanner connection={connection} onPairAgain={pairAgain} onRetry={retry} />,
    ),
  );
  return { view: container, pairAgain, retry };
}

describe.each([
  { locale: 'zh-CN', language: 'zh', title: '你的电脑拒绝了这个应用', action: '重新配对' },
  {
    locale: 'en-US',
    language: 'en',
    title: 'Your computer refused this app',
    action: 'Pair again',
  },
] satisfies Array<{ locale: string; language: 'en' | 'zh'; title: string; action: string }>)(
  'connection refusal in $locale',
  ({ locale, language, title, action }) => {
    it.each(refusals)('localizes $code and keeps the pairing action', async (refusal) => {
      const { view, pairAgain, retry } = await render(
        {
          status: 'refused',
          route: 'https://example.test',
          code: refusal.code,
          reason: refusal.en,
        },
        locale,
      );
      expect(view.querySelector('[role="alert"]')?.textContent).toBe(
        title + refusal[language] + action,
      );
      const button = view.querySelector('button');
      expect(button?.textContent).toBe(action);
      await act(async () => button?.click());
      expect(pairAgain).toHaveBeenCalledOnce();
      expect(retry).not.toHaveBeenCalled();
    });
  },
);

it('keeps the tried route and offers readable recovery instead of a raw network error', async () => {
  const { view, pairAgain, retry } = await render(
    {
      status: 'unreachable',
      route: 'https://example.test',
      attempt: 1,
      reason: 'Network unavailable',
    },
    'zh-CN',
  );
  expect(view.textContent).toContain('请检查手机网络');
  expect(view.textContent).not.toContain('Network unavailable');
  expect(view.textContent).toContain('https://example.test');
  const button = view.querySelector('button');
  expect(button?.textContent).toBe('重试');
  await act(async () => button?.click());
  expect(retry).toHaveBeenCalledOnce();
  expect(pairAgain).not.toHaveBeenCalled();
});

it.each([
  { locale: 'zh-CN', route: 'https://studio.tailnet.ts.net', detail: 'Tailscale 已连接到同一网络' },
  {
    locale: 'en-US',
    route: 'https://studio.tailnet.ts.net',
    detail: 'Tailscale is connected on both devices',
  },
  {
    locale: 'zh-CN',
    route: 'https://studio.deepseekbot.dev',
    detail: '托布 Connect 已登录且连接正常',
  },
  {
    locale: 'en-US',
    route: 'https://studio.deepseekbot.dev',
    detail: 'Tobs Connect is signed in and connected',
  },
])('offers route-specific recovery for $route in $locale', async ({ locale, route, detail }) => {
  const { view, retry, pairAgain } = await render(
    { status: 'unreachable', route, attempt: 2, reason: 'network failed' },
    locale,
  );
  expect(view.textContent).toContain(detail);
  expect(view.textContent).toContain(
    locale === 'zh-CN' ? '设置 → 连接 → 管理' : 'Settings → Connections → Manage',
  );
  await act(async () => view.querySelector('button')?.click());
  expect(retry).toHaveBeenCalledOnce();
  expect(pairAgain).not.toHaveBeenCalled();
});

it.each([
  {
    locale: 'zh-CN',
    check: '请把手机连到电脑所在的 Wi-Fi',
    devices: '设置 → 连接 → 管理',
    action: '重试',
  },
  {
    locale: 'en-US',
    check: 'Connect this phone to your computer’s Wi-Fi',
    devices: 'Settings → Connections → Manage',
    action: 'Retry',
  },
])(
  'offers LAN checks and a working retry in $locale',
  async ({ locale, check, devices, action }) => {
    const { view, retry, pairAgain } = await render(
      {
        status: 'unreachable',
        route: 'http://192.168.1.2:4321',
        attempt: 1,
        reason: 'lan-unreachable',
      },
      locale,
    );
    expect(view.textContent).toContain(check);
    expect(view.textContent).toContain(devices);
    expect(view.textContent).not.toContain('lan-unreachable');
    expect(view.textContent).not.toContain('tailnet');
    const button = view.querySelector('button');
    expect(button?.textContent).toBe(action);
    await act(async () => button?.click());
    expect(retry).toHaveBeenCalledOnce();
    expect(pairAgain).not.toHaveBeenCalled();
  },
);
