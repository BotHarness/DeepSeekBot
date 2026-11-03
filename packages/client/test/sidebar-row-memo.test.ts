import { expect, it, vi } from 'vitest';
import type { ChannelDragProps } from '../src/client/channel-drag.js';
import {
  liveRowCallbacks,
  sameSidebarRowProps,
  type RowCallbacks,
} from '../src/client/sidebar-row-memo.js';

const drag = (marker: ChannelDragProps['marker'] = null): ChannelDragProps => ({
  start: vi.fn(),
  active: false,
  source: false,
  marker,
  hover: vi.fn(),
  drop: vi.fn(),
  end: vi.fn(),
});

it('skips a sidebar row render when only its handlers were recreated', () => {
  const channel = { id: 'c1' };
  const t = (key: string) => key;
  const base = { channel, unread: 0, t, drag: drag(), onActivate: () => {}, onMenu: () => {} };
  expect(
    sameSidebarRowProps(base, { ...base, drag: drag(), onActivate: () => {}, onMenu: () => {} }),
  ).toBe(true);
  expect(sameSidebarRowProps(base, { ...base, unread: 1 })).toBe(false);
  expect(sameSidebarRowProps(base, { ...base, channel: { id: 'c1' } })).toBe(false);
  expect(sameSidebarRowProps(base, { ...base, drag: drag('before') })).toBe(false);
  expect(sameSidebarRowProps(base, { ...base, t: (key: string) => `${key}!` })).toBe(false);
});

it('routes a skipped row event to the handlers of the latest sidebar render', () => {
  const first = { onActivate: vi.fn(), onMenu: vi.fn(), drag: drag() };
  const latest = { current: new Map<string, RowCallbacks<string>>() };
  const row = liveRowCallbacks(first, latest, 'scope:c1');
  const next = { onActivate: vi.fn(), onMenu: vi.fn(), drag: drag() };
  latest.current.set('scope:c1', next);
  row.onActivate({} as never);
  row.onMenu('open');
  row.drag?.hover('after');
  expect(first.onActivate).not.toHaveBeenCalled();
  expect(next.onActivate).toHaveBeenCalledTimes(1);
  expect(next.onMenu).toHaveBeenCalledWith('open');
  expect(next.drag.hover).toHaveBeenCalledWith('after');
});
