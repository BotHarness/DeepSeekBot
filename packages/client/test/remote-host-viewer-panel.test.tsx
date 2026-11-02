import {
  createElement,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createHostClient } from '../../../apps/mobile/src/host/client.js';
import { en, zhTranslate } from '../src/client/locale.js';
import type { RemoteHostViewerState } from '../src/client/remote-host-viewer.js';
import { RemoteHostViewerPanel } from '../src/client/remote-host-viewer-panel.js';

let snapshot: RemoteHostViewerState;
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({
    variant: _variant,
    size: _size,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) =>
    createElement('button', props),
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => createElement('input', props),
  Tooltip: ({ children }: { children: ReactNode }) => children,
  StateDot: () => null,
}));
vi.mock('../src/client/remote-host-viewer.js', () => ({
  createRemoteHostViewer: () => ({
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    setControl: async () => {},
    send: async () => {},
  }),
}));

const client = createHostClient({
  routes: ['http://host.test'],
  credential: 'test.credential',
  carrier: {
    request: async () => {
      throw new Error('Rendering must not request the Host');
    },
    openSocket: () => {
      throw new Error('Rendering must not connect the Feed');
    },
  },
});

describe.each(['zh', 'en'] as const)('%s remote viewer error presentation', (language) => {
  it.each(['The Host answered 502.', 'ECONNRESET transport', 'Runtime driver unavailable'])(
    'localizes a live viewer failure while retaining diagnostic cause: %s',
    (notice) => {
      snapshot = {
        status: 'live',
        control: false,
        switching: false,
        frame: { seq: 7, uri: 'data:image/png;base64,AAAA', width: 100, height: 100 },
        notice,
      };
      const markup = renderToStaticMarkup(
        createElement(RemoteHostViewerPanel, {
          client,
          kind: 'browser',
          slug: 'ada',
          hostName: 'Studio',
          t: language === 'zh' ? zhTranslate : (key) => en[key as keyof typeof en] ?? key,
          onClose() {},
        }),
      );
      expect(markup).not.toContain(notice);
      expect(markup).toContain(
        language === 'zh' ? '未能确认操作结果' : 'Could not confirm the action',
      );
      expect(markup).toContain(language === 'zh' ? '重新连接' : 'Reconnect');
      expect(snapshot.notice).toBe(notice);
    },
  );

  it('uses the localized connection guidance instead of raw transport errors', () => {
    snapshot = {
      status: 'unreachable',
      control: false,
      switching: false,
      notice: 'Raw upstream transport failure',
    };
    const markup = renderToStaticMarkup(
      createElement(RemoteHostViewerPanel, {
        client,
        kind: 'computer',
        slug: 'ada',
        hostName: 'Studio',
        t: language === 'zh' ? zhTranslate : (key) => en[key as keyof typeof en] ?? key,
        onClose() {},
      }),
    );
    expect(markup).not.toContain(snapshot.notice);
    expect(markup).toContain(language === 'zh' ? '重新连接' : 'Reconnect');
    expect(markup).not.toContain('data-panel-empty-action');
    expect(snapshot.notice).toBe('Raw upstream transport failure');
  });
});
