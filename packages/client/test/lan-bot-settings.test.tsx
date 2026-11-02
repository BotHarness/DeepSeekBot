// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { LanBotSettings } from '../src/client/lan-bot-settings.js';
import { zhTranslate } from '../src/client/locale.js';
import type { LanBotSnapshot } from '../../core/src/devices/bot-lan-control.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: 'button',
  Modal: ({ children, footer }: { children?: ReactNode; footer?: ReactNode }) => (
    <div role="dialog">
      {children}
      {footer}
    </div>
  ),
}));

it('shows full identity before approval and refuses a changed candidate without sending a mutation', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const fingerprint = 'abcd '.repeat(15) + '1234';
  let snapshot: LanBotSnapshot = {
    state: 'listening',
    host: { hostId: 'local', name: 'Local', publicKey: '11'.repeat(32), fingerprint },
    peers: [
      {
        hostId: 'studio',
        name: 'Studio',
        publicKey: '22'.repeat(32),
        fingerprint,
        discovered: true,
        admitted: false,
        approval: null,
        identityChanged: false,
      },
    ],
  };
  const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => Response.json(snapshot));
  vi.stubGlobal('fetch', fetcher);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const changed = vi.fn();
  const render = () =>
    act(async () =>
      root.render(<LanBotSettings t={zhTranslate} snapshot={snapshot} fresh onChanged={changed} />),
    );
  const button = (label: string) =>
    [...document.querySelectorAll('button')].find((node) => node.textContent === label)!;
  try {
    await render();
    await act(async () => button('核对并允许').click());
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain(fingerprint);
    expect(dialog.textContent).toContain('studio');
    expect(fetcher).not.toHaveBeenCalled();
    snapshot = {
      ...snapshot,
      peers: [{ ...snapshot.peers[0]!, publicKey: '33'.repeat(32), fingerprint: 'changed' }],
    };
    await render();
    expect(button('指纹一致，允许协作').disabled).toBe(true);
    await act(async () => button('指纹一致，允许协作').click());
    expect(fetcher).not.toHaveBeenCalled();
    await act(async () => button('取消').click());
    await act(async () => button('核对并允许').click());
    await act(async () => button('指纹一致，允许协作').click());
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual({
      action: 'admit',
      hostId: 'studio',
      publicKey: '33'.repeat(32),
      confirm: true,
    });
    expect(changed).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('lets the Human revoke the previously approved identity when a different key is advertised', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const oldIdentity = {
    hostId: 'studio',
    name: 'Studio',
    publicKey: '22'.repeat(32),
    fingerprint: 'old full fingerprint',
  };
  const snapshot: LanBotSnapshot = {
    state: 'listening',
    host: { ...oldIdentity, hostId: 'local' },
    peers: [
      {
        ...oldIdentity,
        publicKey: '33'.repeat(32),
        fingerprint: 'new fingerprint',
        discovered: true,
        admitted: false,
        identityChanged: true,
        approval: oldIdentity,
      },
    ],
  };
  const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({}));
  vi.stubGlobal('fetch', fetcher);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const button = (label: string) =>
    [...document.querySelectorAll('button')].find((node) => node.textContent === label)!;
  try {
    await act(async () =>
      root.render(
        <LanBotSettings t={zhTranslate} snapshot={snapshot} fresh onChanged={() => {}} />,
      ),
    );
    expect(button('撤销允许')).toBeDefined();
    await act(async () => button('撤销允许').click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      'old full fingerprint',
    );
    await act(async () => button('确认撤销').click());
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual({
      action: 'revoke',
      hostId: 'studio',
      confirm: true,
    });
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
