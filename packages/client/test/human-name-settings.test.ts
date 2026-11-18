// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { createStore } from '../src/client/store.js';
import { HumanNameSettings } from '../src/client/human-name-settings.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import { describe, expect, it, vi } from 'vitest';
import { installBotNavIcon } from '../src/client/bot-icon-nav.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
  Button: 'button',
  Input: 'input',
}));

describe('Human name settings navigation', () => {
  it('uses the existing roster stream in Bot mode and owns only one while native mode is open', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    let opened = 0;
    let closed = 0;
    vi.stubGlobal(
      'EventSource',
      class {
        onopen = undefined;
        constructor() {
          opened += 1;
        }
        addEventListener() {}
        close() {
          closed += 1;
        }
      },
    );
    const store = createStore();
    store.setMode('bot');
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          createElement(HumanNameSettings, {
            store,
            t: zhTranslate,
            call: async (): ReturnType<BridgeCall> => ({
              ok: true,
              value: { humanId: 'local-human', defaultDisplayName: null, displayName: 'Human' },
            }),
            onSaved: async () => {},
          }),
        ),
      );
      expect(opened).toBe(0);
      await act(async () => store.setMode('dsh'));
      expect(opened).toBe(1);
      await act(async () => store.setMode('bot'));
      expect(closed).toBe(1);
    } finally {
      await act(async () => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    }
  });
  it('keeps the same icon DOM when the navigation observer reapplies unchanged markup', () => {
    vi.stubGlobal('MutationObserver', undefined);
    const button = document.createElement('button');
    button.innerHTML = '<svg></svg><span>Bot 设置</span>';
    document.body.append(button);
    let refresh: (() => void) | undefined;
    const dispose = installBotNavIcon({
      root: document,
      labels: () => ['Bot 设置'],
      markup: () => '<svg></svg>',
      subscribe(listener) {
        refresh = listener;
        return () => {};
      },
    });
    const original = button.querySelector('.bh-bot-nav-icon')?.firstElementChild;
    return Promise.resolve()
      .then(() => {
        refresh?.();
        return Promise.resolve();
      })
      .then(() => {
        expect(button.querySelector('.bh-bot-nav-icon')?.firstElementChild).toBe(original);
      })
      .finally(() => {
        dispose();
        button.remove();
        vi.unstubAllGlobals();
      });
  });
});
