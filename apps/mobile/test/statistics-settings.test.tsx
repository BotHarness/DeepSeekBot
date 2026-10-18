// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createMobileTelemetry, type MobileTelemetry } from '../src/telemetry/mobile-telemetry';
import type { Toggle } from '../src/ui/primitives/toggle';

const native = vi.hoisted(() => ({ telemetry: undefined as MobileTelemetry | undefined }));
vi.mock('../src/telemetry/native', () => ({
  get mobileTelemetry() {
    return native.telemetry;
  },
}));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-keyboard-controller', () => import('./keyboard-controller-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
let control: ComponentProps<typeof Toggle>;
vi.mock('../src/ui/primitives/toggle', () => ({
  Toggle: (props: ComponentProps<typeof Toggle>) => {
    control = props;
    return createElement('input', { type: 'checkbox', checked: props.value, readOnly: true });
  },
}));
import { StatisticsSettings } from '../src/ui/shell/statistics-settings';
import { t } from '../src/ui/strings';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  native.telemetry?.dispose();
  host?.remove();
});

async function render(read: () => Promise<unknown> = async () => undefined) {
  const write = vi.fn((_value: unknown) => {});
  let sequence = 0;
  const telemetry = createMobileTelemetry({
    collect: false,
    storage: { read, write },
    sender: async () => {},
    uuid: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    now: () => Date.parse('2026-10-17T00:00:00Z'),
    monotonic: () => 0,
    context: {
      platform: 'ios',
      app_version: '0.0.1',
      app_build: '1',
      environment: 'development',
      language: 'en',
    },
  });
  native.telemetry = telemetry;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(createElement(StatisticsSettings)));
  return { telemetry, write };
}

it('commits each loaded preference in the native switch event, without a stale controlled frame', async () => {
  const { telemetry, write } = await render();
  await act(async () => telemetry.dismissNotice());
  expect(control.value).toBe(true);
  for (const enabled of [false, true, false]) {
    act(() => control.onChange(enabled));
    expect(control.value).toBe(enabled);
    expect(write).toHaveBeenLastCalledWith(expect.objectContaining({ enabled }));
    expect(telemetry.getSnapshot().noticeOpen).toBe(false);
    await act(async () => {});
    expect(control.disabled).toBe(false);
  }
});

it('keeps a failed enable off and displays the storage error in the same event', async () => {
  const { write } = await render(async () => ({ version: 1, enabled: false, noticeSeen: true }));
  write.mockImplementationOnce(() => {
    throw new Error('storage unavailable');
  });
  act(() => control.onChange(true));
  expect(control.value).toBe(false);
  expect(host!.textContent).toContain(t.statisticsStorageError);
  await act(async () => {});
  expect(control.disabled).toBe(false);
  act(() => control.onChange(true));
  expect(control.value).toBe(true);
  expect(host!.textContent).not.toContain(t.statisticsStorageError);
  await act(async () => {});
});

it('disables the control until the initial preference read finishes', async () => {
  let finish!: (value: unknown) => void;
  await render(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  expect(control.disabled).toBe(true);
  await act(async () => finish({ version: 1, enabled: false, noticeSeen: true }));
  expect(control.disabled).toBe(false);
  expect(control.value).toBe(false);
});
