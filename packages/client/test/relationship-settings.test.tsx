// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import { RelationshipSettings } from '../src/client/relationship-settings.js';
import { zhTranslate } from '../src/client/locale.js';
import { pairingLink } from '../../core/src/devices/http.js';

const source = vi.hoisted(() => {
  const snapshot = { hosts: [{ host: { hostId: 'peer' } }] };
  return {
    getSnapshot: vi.fn(() => snapshot),
    subscribe: vi.fn(() => () => {}),
    select: vi.fn(),
    enrollRelationship: vi.fn(),
    learnRelationshipRoutes: vi.fn(async () => {}),
  };
});
vi.mock('../src/client/remote-hosts.js', () => ({ remoteHosts: () => source }));
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: 'button',
  Input: 'input',
  Modal: ({ children, footer }: { children?: ReactNode; footer?: ReactNode }) => (
    <div role="dialog">
      {children}
      {footer}
    </div>
  ),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('retains private admission accepted before the link expires during recovery', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const now = Date.now();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
  const admission = { token: 'ab'.repeat(32), origin: 'https://peer.example' };
  const item = {
    id: 'r'.repeat(32),
    peer: {
      id: 'peer',
      name: 'Peer',
      publicKey: '11'.repeat(32),
      routes: ['https://peer.example'],
    },
    direction: 'outgoing',
    state: 'active',
    expiresAt: now + 60_000,
    peerRevocationPending: false,
  };
  const link = pairingLink({
    v: 1,
    host: { id: 'peer', name: 'Peer' },
    routes: ['https://peer.example'],
    offer: 'test',
    expiresAt: new Date(now + 1000).toISOString(),
    encryption: {
      protocol: 'connect-noise-xk-v1',
      publicKey: item.peer.publicKey,
      noise: 'Noise_XK_25519_ChaChaPoly_SHA256',
      required: true,
      fingerprint: 'test',
      privateRelay: admission,
    },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: unknown, input?: RequestInit) => {
      if (!input?.body) return Response.json({ relationships: [item] });
      clock.mockReturnValue(now + 2000);
      return Response.json({ relationship: item });
    }),
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const click = (label: string) => {
    const button = [...host.querySelectorAll('button')].find((node) => node.textContent === label);
    if (!button) throw new Error(`Missing button: ${label}`);
    button.click();
  };
  try {
    await act(async () =>
      root.render(<RelationshipSettings t={zhTranslate} onPrepareRoute={vi.fn()} />),
    );
    await act(async () => click(zhTranslate('relationships.recoverRoute')));
    const input = host.querySelector('input');
    if (!input) throw new Error('Missing peer link input');
    await act(async () => {
      input.value = link;
      Simulate.change(input);
    });
    await act(async () => click(zhTranslate('relationships.verifyRoute')));
    expect(source.learnRelationshipRoutes).toHaveBeenCalledWith(item.peer, admission);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    clock.mockRestore();
  }
});

it('opens the already-enrolled Host and shows a failed confirmation inside its dialog', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const item = {
    id: 'r'.repeat(32),
    peer: { id: 'peer', name: 'Peer', publicKey: '11'.repeat(32), routes: [] },
    direction: 'outgoing',
    state: 'active',
    expiresAt: Date.now() + 60_000,
    peerRevocationPending: false,
  };
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (init?.body) return Response.json({ error: 'refused' }, { status: 409 });
    return Response.json({ relationships: [item] });
  });
  vi.stubGlobal('fetch', fetcher);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const button = (label: string, within: ParentNode = host) => {
    const found = [...within.querySelectorAll('button')].find((node) => node.textContent === label);
    if (!found) throw new Error(`Missing button: ${label}`);
    return found;
  };
  try {
    await act(async () =>
      root.render(<RelationshipSettings t={zhTranslate} onPrepareRoute={vi.fn()} />),
    );
    await act(async () => button(zhTranslate('relationships.open')).click());
    expect(source.select).toHaveBeenCalledWith('peer');
    expect(source.enrollRelationship).not.toHaveBeenCalled();
    await act(async () => button(zhTranslate('relationships.disconnect')).click());
    const dialog = host.querySelector('[role="dialog"]');
    if (!dialog) throw new Error('Missing confirmation');
    await act(async () => button(zhTranslate('relationships.disconnect'), dialog).click());
    expect(dialog.querySelector('[role="alert"]')?.textContent).toBe(
      zhTranslate('relationships.failed'),
    );
    await act(async () => button(zhTranslate('common.cancel'), dialog).click());
    await act(async () => button(zhTranslate('relationships.disconnect')).click());
    expect(host.querySelector('[role="dialog"] [role="alert"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
