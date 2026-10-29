// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createStore, type ClientState } from '../src/client/store.js';
import { keepClientState, sameFields, useStoreSlice } from '../src/client/use-client-store.js';

const loose = sameFields(['channels']);
const strict = sameFields(['channels', 'humanInbox']);

describe('useStoreSlice', () => {
  beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
  afterAll(() => vi.unstubAllGlobals());

  it('re-reads the store when the equality switches to one that watches more fields', async () => {
    const store = createStore();
    let seen: ClientState | undefined;
    const Probe = ({ watchInbox }: { watchInbox: boolean }) => {
      seen = useStoreSlice(store, keepClientState, watchInbox ? strict : loose);
      return null;
    };
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => root.render(createElement(Probe, { watchInbox: false })));
    await act(async () => store.setHumanInbox({ unreadCount: 7 }));
    expect(seen!.humanInbox.unreadCount).not.toBe(7);
    await act(async () => root.render(createElement(Probe, { watchInbox: true })));
    expect(seen!.humanInbox.unreadCount).toBe(7);
    await act(async () => root.unmount());
  });
});
