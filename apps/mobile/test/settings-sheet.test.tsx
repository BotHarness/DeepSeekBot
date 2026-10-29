// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));

vi.mock('../src/ui/primitives/row-icon', () => ({ RowIcon: () => null }));
vi.mock('react-native-keyboard-controller', async () => import('./keyboard-controller-shim'));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('expo-router', () => ({ useRouter: () => ({ back() {} }) }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));

import { humanNameOf } from '../src/host/human';
import { appBuildLabel } from '../src/ui/app-build';
import { SettingsView, type SettingsActions } from '../src/ui/settings-view';
import { HumanAvatarButton } from '../src/ui/shell/human-avatar';
import { t } from '../src/ui/strings';
import { StatisticsSettings } from '../src/ui/shell/statistics-settings';
vi.mock('react-native-gesture-handler', () => import('./gesture-handler-shim'));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-worklets', () => ({
  scheduleOnRN: <A extends unknown[]>(callback: (...args: A) => void, ...args: A) =>
    callback(...args),
}));
vi.mock('../src/ui/haptics', () => ({ haptic: vi.fn() }));

vi.mock('../src/account/native-account-profile', () => ({
  accountProfile: { getSnapshot: () => ({ status: 'signed-out' }), refresh: vi.fn() },
  useAccountProfile: () => ({ status: 'signed-out' }),
}));
vi.mock('expo-image', () => ({ Image: () => null }));
vi.mock('../src/telemetry/native', () => ({
  mobileTelemetry: {
    subscribe: () => () => {},
    getSnapshot: () => statisticsSnapshot,
    setEnabled: vi.fn(async () => true),
  },
}));
const statisticsSnapshot = { loaded: true, enabled: true, storageError: false };

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

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

function actions(overrides: Partial<SettingsActions> = {}): SettingsActions {
  return {
    onUsage: vi.fn(),
    onAppIcon: vi.fn(),
    onNotifications: vi.fn(),
    onStorage: vi.fn(),
    onModels: vi.fn(),
    onCopyVersion: vi.fn(),
    ...overrides,
  };
}

const button = (view: HTMLElement, label: string) =>
  view.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

describe('Settings sheet', () => {
  it("opens each row's screen and leaves computers and unpairing to the environment drawer", async () => {
    const handlers = actions();
    const view = await render(<SettingsView version="0.0.1 · 1c8d179" actions={handlers} />);
    expect(button(view, t.done)).toBeNull();
    expect(view.textContent).not.toContain(t.computers);
    expect(view.textContent).not.toContain(t.connected);

    const rows: [string, keyof SettingsActions][] = [
      [t.appIcon, 'onAppIcon'],
      [t.notifications, 'onNotifications'],
      [`${t.storage.title}, ${t.storage.hint}`, 'onStorage'],
      [`${t.modelSettings.title}, ${t.modelSettings.global}`, 'onModels'],
    ];
    for (const [label, action] of rows) {
      await act(async () => button(view, label)!.click());
      expect(handlers[action]).toHaveBeenCalledTimes(1);
    }
    expect(button(view, t.unpair)).toBeNull();
  });
});

describe('App version', () => {
  it('shows the build in About and copies it on tap', async () => {
    const handlers = actions();
    const view = await render(<SettingsView version="0.0.1 · 1c8d179 · main" actions={handlers} />);
    expect(view.textContent).toContain(t.about);
    expect(view.textContent).toContain('0.0.1 · 1c8d179 · main');
    await act(async () =>
      button(view, `${t.appVersion}, 0.0.1 · 1c8d179 · main, ${t.copy}`)!.click(),
    );
    expect(handlers.onCopyVersion).toHaveBeenCalledWith('0.0.1 · 1c8d179 · main');
    expect(view.textContent).toContain(`0.0.1 · 1c8d179 · main · ${t.copied}`);
  });

  it('says the version is unknown when nothing was recorded', async () => {
    const view = await render(<SettingsView version="" actions={actions()} />);
    expect(view.textContent).toContain(t.appVersionUnknown);
  });

  it('joins version, build number, commit, local build time and branch', () => {
    const time = new Date(2026, 9, 15, 18, 5).toISOString();
    expect(
      appBuildLabel({
        version: '0.0.1',
        buildNumber: '7',
        commit: '1c8d179ab-dirty',
        time,
        branch: 'qa/batch-3',
      }),
    ).toBe('0.0.1 (7) · 1c8d179ab-dirty · 2026-10-15 18:05 · qa/batch-3');
    expect(
      appBuildLabel({
        version: '0.0.1',
        buildNumber: undefined,
        commit: '1c8d179ab',
        time: 'not a date',
        branch: undefined,
      }),
    ).toBe('0.0.1 · 1c8d179ab');
    expect(
      appBuildLabel({
        version: undefined,
        buildNumber: undefined,
        commit: undefined,
        time: undefined,
        branch: undefined,
      }),
    ).toBe('');
  });
});

describe('Human avatar', () => {
  it("shows the Human's initial and opens Settings", async () => {
    const onPress = vi.fn();
    const view = await render(
      <HumanAvatarButton
        loadName={async () => humanNameOf({ displayName: '  vain' })}
        onPress={onPress}
      />,
    );
    await act(async () => undefined);
    expect(view.textContent).toBe('V');
    await act(async () => button(view, t.settings)!.click());
    expect(onPress).toHaveBeenCalled();
  });

  it('reads the display name from the Host identity', () => {
    expect(
      humanNameOf({
        humanId: 'h1',
        defaultDisplayName: null,
        displayName: 'Vain',
      }),
    ).toBe('Vain');
    expect(humanNameOf({ displayName: '  ' })).toBeUndefined();
    expect(humanNameOf(null)).toBeUndefined();
  });
});

it('keeps statistics last and details collapsed until requested', async () => {
  const view = await render(
    <SettingsView version="2.0.0" actions={actions()} statistics={<StatisticsSettings />} />,
  );
  const text = view.textContent!;
  expect(text.lastIndexOf(t.statisticsTitle)).toBeGreaterThan(text.lastIndexOf(t.appVersion));
  expect(text).not.toContain(t.statisticsNotice);
  await act(async () => button(view, t.statisticsDetails)!.click());
  expect(view.textContent).toContain(t.statisticsNotice);
  await act(async () => button(view, t.statisticsHideDetails)!.click());
  expect(view.textContent).not.toContain(t.statisticsNotice);
});
