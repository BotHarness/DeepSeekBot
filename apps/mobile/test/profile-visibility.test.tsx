// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const route = vi.hoisted(() => ({ focused: true }));
vi.mock('expo-router', () => ({ useIsFocused: () => route.focused }));

import { ProfileVisibility, useProfileFocusEffect } from '../src/ui/chat/profile-visibility';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('retains the scene while hiding pauses work and reopening refreshes it', async () => {
  const stop = vi.fn();
  const refresh = vi.fn(() => stop);
  let mounts = 0;
  function Profile() {
    const [identity] = useState(() => ++mounts);
    useProfileFocusEffect(refresh);
    return <span>{identity}</span>;
  }
  const host = document.createElement('div');
  const root = createRoot(host);
  const show = (visible: boolean) =>
    act(async () => {
      root.render(
        <ProfileVisibility value={visible}>
          <Profile />
        </ProfileVisibility>,
      );
    });
  try {
    await show(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    await show(false);
    expect(stop).toHaveBeenCalledTimes(1);
    await show(false);
    expect(refresh).toHaveBeenCalledTimes(1);
    await show(true);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(mounts).toBe(1);
    expect(host.textContent).toBe('1');

    route.focused = false;
    await show(true);
    expect(stop).toHaveBeenCalledTimes(2);
    route.focused = true;
    await show(true);
    expect(refresh).toHaveBeenCalledTimes(3);
    expect(mounts).toBe(1);
  } finally {
    await act(async () => root.unmount());
    route.focused = true;
  }
  expect(stop).toHaveBeenCalledTimes(3);
});
