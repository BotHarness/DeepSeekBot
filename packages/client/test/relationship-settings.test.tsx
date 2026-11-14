// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { RelationshipSettings } from '../src/client/relationship-settings.js';
import { zhTranslate } from '../src/client/locale.js';

const source = vi.hoisted(() => ({
  getSnapshot: vi.fn(() => ({ hosts: [{ host: { hostId: 'peer' } }] })),
  select: vi.fn(),
  enrollRelationship: vi.fn(),
}));
vi.mock('../src/client/remote-hosts.js', () => ({ remoteHosts: () => source }));
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: 'button',
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
    await act(async () => root.render(<RelationshipSettings t={zhTranslate} />));
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
