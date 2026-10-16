// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../src/telemetry/native', () => ({ mobileTelemetry: {} }));

import { Linking } from 'react-native';
import { StatisticsNoticeView } from '../src/ui/shell/statistics-notice-view';
import { t } from '../src/ui/strings';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.restoreAllMocks();
});
async function render(element: ReactElement) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
  return host;
}
function button(view: HTMLElement, label: string) {
  return view.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
}
it('follows the Web notice actions with collapsed phone-specific details', async () => {
  const onClose = vi.fn();
  const onSettings = vi.fn();
  const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  const view = await render(
    <StatisticsNoticeView visible onClose={onClose} onSettings={onSettings} />,
  );
  expect(view.textContent).toContain(t.statisticsNoticeSummary);
  expect(view.textContent).not.toContain(t.statisticsNotice);
  await act(async () => button(view, t.statisticsDetails).click());
  expect(view.textContent).toContain(t.statisticsNotice);
  await act(async () => button(view, t.statisticsPrivacy).click());
  expect(open).toHaveBeenCalledWith(t.statisticsPrivacyUrl);
  await act(async () => button(view, t.statisticsSource).click());
  expect(open).toHaveBeenCalledWith(
    'https://github.com/BotHarness/DeepSeekBot/tree/main/apps/mobile',
  );
  await act(async () => button(view, t.statisticsOpenSettings).click());
  expect(onSettings).toHaveBeenCalledTimes(1);
  await act(async () => button(view, t.statisticsGotIt).click());
  expect(onClose).toHaveBeenCalledTimes(1);
});
it('keeps the notice usable when a privacy link cannot open', async () => {
  vi.spyOn(Linking, 'openURL').mockRejectedValue(new Error('unavailable'));
  const onClose = vi.fn();
  const view = await render(
    <StatisticsNoticeView visible onClose={onClose} onSettings={vi.fn()} />,
  );
  await act(async () => button(view, t.statisticsPrivacy).click());
  expect(view.textContent).toContain(t.statisticsLinkError);
  await act(async () => button(view, t.statisticsGotIt).click());
  expect(onClose).toHaveBeenCalledTimes(1);
});
