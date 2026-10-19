// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));

import type { PushSettings } from '../src/host/push';
import {
  ChannelNotifications,
  type ChannelNotificationsPort,
} from '../src/ui/channel-notifications';
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
  await act(async () => undefined);
  return host;
}

const settled: PushSettings = {
  registered: true,
  enabled: true,
  preferences: { approval: true, question: true, 'private-input': true, reply: true },
  quietChannelIds: [],
};

function port(base: PushSettings = settled) {
  return {
    load: vi.fn(async () => base),
    setQuiet: vi.fn(async (quiet: boolean) => ({
      ...base,
      quietChannelIds: quiet ? ['g1'] : [],
    })),
    setHostMuted: vi.fn(async (_muted: boolean) => undefined),
  } satisfies ChannelNotificationsPort;
}

const control = (view: HTMLElement, label: string) =>
  view.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;

describe('Channel notifications', () => {
  it('turns Do Not Disturb on for this phone only, and mutes on the computer separately', async () => {
    const channel = port();
    const view = await render(
      <ChannelNotifications
        status={{ status: 'on', failed: [] }}
        channelId="g1"
        hostMuted={false}
        port={channel}
      />,
    );
    const quiet = () => control(view, t.channelNotifications.quietHere);
    const mute = () => control(view, t.channelNotifications.muteHost);
    expect(quiet().checked).toBe(false);
    expect(quiet().disabled).toBe(false);
    await act(async () => quiet().click());
    await act(async () => undefined);
    expect(channel.setQuiet).toHaveBeenCalledWith(true);
    expect(quiet().checked).toBe(true);
    expect(channel.setHostMuted).not.toHaveBeenCalled();

    await act(async () => mute().click());
    await act(async () => undefined);
    expect(channel.setHostMuted).toHaveBeenCalledWith(true);
  });

  it('shows the phone row on and locked while the computer mutes the Channel', async () => {
    const view = await render(
      <ChannelNotifications
        status={{ status: 'on', failed: [] }}
        channelId="g1"
        hostMuted
        port={port()}
      />,
    );
    const quiet = control(view, t.channelNotifications.quietHere);
    expect(quiet.checked).toBe(true);
    expect(quiet.disabled).toBe(true);
    expect(control(view, t.channelNotifications.muteHost).checked).toBe(true);
    expect(view.textContent).toContain(t.channelNotifications.quietByHost);
  });

  it('locks the phone row while this phone does not allow notifications from the computer', async () => {
    const view = await render(
      <ChannelNotifications
        status={{ status: 'on', failed: [] }}
        channelId="g1"
        hostMuted={false}
        port={port({ ...settled, enabled: false, quietChannelIds: ['g1'] })}
      />,
    );
    const quiet = control(view, t.channelNotifications.quietHere);
    expect(quiet.checked).toBe(true);
    expect(quiet.disabled).toBe(true);
    expect(view.textContent).toContain(t.channelNotifications.allOff);
    expect(control(view, t.channelNotifications.muteHost).disabled).toBe(false);
  });
});
