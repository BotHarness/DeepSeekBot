// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('../src/client/market-upload.js', () => ({
  MarketUploadDialog: (props: { initialSlug?: string }) =>
    createElement('div', { 'data-upload-dialog': props.initialSlug }),
}));

import type { BridgeActions } from '../src/client/actions.js';
import { zhTranslate } from '../src/client/locale.js';
import { openShareFlow, ShareFlowHost, watchShareDraft } from '../src/client/share-flow.js';
import { store } from '../src/client/store.js';

it('opens the upload form on a draft once Tob marks it ready, and only in one host', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let state: 'reviewing' | 'ready' = 'reviewing';
  const get = vi.fn(async () => ({ state }));
  const actions = { shareDraftGet: get } as unknown as BridgeActions;
  try {
    await act(async () =>
      root.render(
        createElement('div', null, [
          createElement(ShareFlowHost, { key: 'a', actions, t: zhTranslate }),
          createElement(ShareFlowHost, { key: 'b', actions, t: zhTranslate }),
        ]),
      ),
    );
    watchShareDraft('writer');
    await act(async () => store.setQuery('first'));
    expect(get).toHaveBeenCalledTimes(1);
    await act(async () => store.setQuery('second'));
    expect(get).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[data-upload-dialog]')).toBeNull();

    state = 'ready';
    await act(async () =>
      store.setConversation({ messages: [{ id: 'm-2' } as never], channel: undefined }),
    );
    expect(get).toHaveBeenCalledTimes(2);
    expect(host.querySelectorAll('[data-upload-dialog="writer"]')).toHaveLength(1);

    await act(async () => openShareFlow('reader'));
    expect(host.querySelectorAll('[data-upload-dialog]')).toHaveLength(1);
    expect(host.querySelector('[data-upload-dialog]')?.getAttribute('data-upload-dialog')).toBe(
      'reader',
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
