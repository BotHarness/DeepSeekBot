// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useMessageSearch } from '../src/host/message-search';
import type { HostClient } from '../src/host/client';
type FailedCall = (...args: Parameters<HostClient['call']>) => Promise<never>;
let root: Root | undefined;
let search: ReturnType<typeof useMessageSearch> | undefined;
function Probe() {
  search = useMessageSearch();
  return null;
}
function current() {
  if (!search) throw Error('Search not mounted');
  return search;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  root = createRoot(document.createElement('div'));
  act(() => root!.render(<Probe />));
});
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  search = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('sends only the settled query after rapid typing pauses for 150 ms', async () => {
  const call = vi.fn<FailedCall>().mockRejectedValue(new Error('fixture unavailable'));
  const hosts = [{ hostId: 'a', client: { call } }];
  act(() => current().schedule('n', hosts));
  await act(async () => vi.advanceTimersByTimeAsync(60));
  act(() => current().schedule('ne', hosts));
  await act(async () => vi.advanceTimersByTimeAsync(60));
  act(() => current().schedule('needle', hosts));
  await act(async () => vi.advanceTimersByTimeAsync(149));
  expect(call).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(call).toHaveBeenCalledExactlyOnceWith('messageSearch', { text: 'needle', limit: 20 });
  expect(current().state).toMatchObject({ query: 'needle', loading: false });
});
it('cancels a pending online query when Chats unmounts', async () => {
  const call = vi.fn<FailedCall>().mockRejectedValue(new Error('fixture unavailable'));
  act(() => current().schedule('needle', [{ hostId: 'a', client: { call } }]));
  act(() => root!.unmount());
  root = undefined;
  await vi.advanceTimersByTimeAsync(500);
  expect(call).not.toHaveBeenCalled();
});
