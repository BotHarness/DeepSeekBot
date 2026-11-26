// @vitest-environment jsdom
import { type PropsWithChildren } from 'react';
import { type ReactNode } from 'react';
import { type PairingRequest } from '../../core/src/messaging/pairing.js';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
}));
vi.mock('../src/client/messaging-help.js', () => ({
  MessagingHelp: ({ title }: { title: string }) =>
    createElement('button', { 'aria-label': `Info: ${title}` }, 'ⓘ'),
}));
vi.mock('../src/client/modal.js', () => ({
  Modal: ({
    open,
    title,
    children,
    footer,
    onClose,
  }: PropsWithChildren<{ open: boolean; title: string; footer: ReactNode; onClose(): void }>) =>
    open
      ? createElement(
          'div',
          { role: 'dialog', 'aria-label': title },
          children,
          createElement('button', { onClick: onClose }, 'Close'),
          footer,
        )
      : null,
}));
vi.mock('../src/client/combobox.js', () => ({
  Combobox: ({
    label,
    value,
    options,
    onSelect,
  }: {
    label: string;
    value: string;
    options: { value: string; label: string }[];
    onSelect(value: string): void;
  }) =>
    createElement(
      'select',
      {
        'aria-label': label,
        value,
        onChange: (event: { target: { value: string } }) => onSelect(event.target.value),
      },
      options.map((option) =>
        createElement('option', { key: option.value, value: option.value }, option.label),
      ),
    ),
}));
import type { SenderBlock } from '../../core/src/messaging/permissions/client.js';
import { PairingSettings } from '../src/client/pairing-settings.js';
import { zhTranslate } from '../src/client/locale.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const request: PairingRequest = {
  id: 'qa-request',
  reference: 'PAIRTEST',
  botSlug: 'ada',
  bindingId: 'lark-qa',
  accountName: 'QA Lark',
  actorId: 'ou_demo',
  actorName: 'Alice QA',
  conversationId: 'oc_demo',
  status: 'pending',
  capabilities: [],
  createdAt: '2026-10-06T00:00:00.000Z',
  expiresAt: '2026-10-06T00:10:00.000Z',
  revision: 1,
  attempts: 1,
};

const block: SenderBlock = {
  botSlug: 'ada',
  bindingId: 'lark-qa',
  fingerprint: 'lark:qa',
  actorId: 'ou_demo',
  actorName: 'Alice QA',
  revision: 3,
  blockedAt: '2026-10-06T00:05:00.000Z',
  blockedBy: 'authenticated-web',
};

it('a sender can be blocked from their details and unblocked from the blocked list', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  let root = createRoot(host);
  const senderAccess = vi.fn(async () => {});
  const button = (label: string) =>
    Array.from(host.querySelectorAll('button')).find((item) => item.textContent === label)!;
  try {
    await act(async () =>
      root.render(
        createElement(PairingSettings, {
          requests: [request],
          senderAccess,
          busy: false,
          refresh: async () => {},
          review: async () => {},
          t: zhTranslate,
        }),
      ),
    );
    await act(async () => button(zhTranslate('pairing.block')).click());
    expect(senderAccess).toHaveBeenCalledExactlyOnceWith({
      kind: 'block-sender',
      bindingId: 'lark-qa',
      actorId: 'ou_demo',
      actorName: 'Alice QA',
    });
    await act(async () => root.unmount());
    root = createRoot(host);
    senderAccess.mockClear();
    await act(async () =>
      root.render(
        createElement(PairingSettings, {
          requests: [request],
          blocks: [block],
          senderAccess,
          busy: false,
          refresh: async () => {},
          review: async () => {},
          t: zhTranslate,
        }),
      ),
    );
    expect(host.querySelector('.bh-pairing-detail')!.textContent).toContain(
      zhTranslate('pairing.blocked'),
    );
    await act(async () =>
      Array.from(host.querySelectorAll<HTMLButtonElement>('[role=tab]'))
        .find((item) => item.textContent?.startsWith(zhTranslate('pairing.blocked')))!
        .click(),
    );
    const panel = host.querySelector('[role=tabpanel]')!;
    expect(panel.textContent).toContain('Alice QA');
    expect(panel.textContent).toContain('QA Lark');
    expect(panel.textContent).not.toContain(zhTranslate('pairing.createRole'));
    await act(async () => button(zhTranslate('pairing.unblock')).click());
    expect(senderAccess).toHaveBeenCalledExactlyOnceWith({
      kind: 'unblock-sender',
      bindingId: 'lark-qa',
      actorId: 'ou_demo',
      expectedRevision: 3,
    });
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it('a request from an earlier Binding of the same App shows its block', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        createElement(PairingSettings, {
          requests: [request],
          blocks: [{ ...block, bindingId: 'lark-new', bindingIds: ['lark-qa', 'lark-new'] }],
          senderAccess: async () => {},
          busy: false,
          refresh: async () => {},
          review: async () => {},
          t: zhTranslate,
        }),
      ),
    );
    const detail = host.querySelector('.bh-pairing-detail')!;
    expect(
      Array.from(detail.querySelectorAll('button')).some(
        (button) => button.textContent === zhTranslate('pairing.unblock'),
      ),
    ).toBe(true);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
