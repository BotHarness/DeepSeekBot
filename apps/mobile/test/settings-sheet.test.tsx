// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));

import { humanNameOf } from '../src/host/human';
import { SettingsView, type SettingsActions } from '../src/ui/settings-view';
import { HumanAvatarButton } from '../src/ui/shell/human-avatar';
import { t } from '../src/ui/strings';

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
    onClose: vi.fn(),
    onOpenFullClient: vi.fn(),
    onComputers: vi.fn(),
    onNotifications: vi.fn(),
    onUnpair: vi.fn(async () => undefined),
    ...overrides,
  };
}

const button = (view: HTMLElement, label: string) =>
  view.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

const dangerNotices = (view: HTMLElement) =>
  [...view.querySelectorAll('[data-testid="notice-danger"]')].map((node) => node.textContent);

describe('Settings sheet', () => {
  it('holds every row the Me tab had, and each opens its screen', async () => {
    const handlers = actions();
    const view = await render(
      <SettingsView
        hostName="studio"
        connection={{ status: 'connected', route: 'https://studio.tail.ts.net' }}
        actions={handlers}
      />,
    );
    expect(view.textContent).toContain(t.settings);
    expect(view.textContent).toContain(t.connections);
    expect(view.textContent).toContain('studio');
    expect(view.textContent).toContain(`${t.connected} · https://studio.tail.ts.net`);

    const rows: [string, keyof SettingsActions][] = [
      [`${t.computers}, ${t.computersHint}`, 'onComputers'],
      [t.notifications, 'onNotifications'],
      [t.openFullClient, 'onOpenFullClient'],
      [t.done, 'onClose'],
    ];
    for (const [label, action] of rows) {
      await act(async () => button(view, label)!.click());
      expect(handlers[action]).toHaveBeenCalledTimes(1);
    }
    expect(button(view, t.unpair)).not.toBeNull();
  });

  it('reports an unpair failure and clears it on the next try', async () => {
    const onUnpair = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('cannot reach your computer.'))
      .mockResolvedValueOnce(undefined);
    const view = await render(
      <SettingsView
        hostName="studio"
        connection={{ status: 'connecting', route: '' }}
        actions={actions({ onUnpair })}
      />,
    );
    await act(async () => button(view, t.unpair)!.click());
    expect(dangerNotices(view)).toEqual([`${t.unpairFailed} cannot reach your computer.`]);

    await act(async () => button(view, t.unpair)!.click());
    expect(onUnpair).toHaveBeenCalledTimes(2);
    expect(dangerNotices(view)).toEqual([]);
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
    expect(humanNameOf({ humanId: 'h1', defaultDisplayName: null, displayName: 'Vain' })).toBe(
      'Vain',
    );
    expect(humanNameOf({ displayName: '  ' })).toBeUndefined();
    expect(humanNameOf(null)).toBeUndefined();
  });
});
