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

it('a management approval can let the person grant the selected capabilities to others', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  let root = createRoot(host);
  const review = vi.fn(async () => {});
  try {
    await act(async () =>
      root.render(
        createElement(PairingSettings, {
          requests: [request],
          busy: false,
          refresh: async () => {},
          review,
          t: zhTranslate,
        }),
      ),
    );
    const inputs = () => host.querySelectorAll<HTMLInputElement>('.bh-pairing-detail input');
    await act(async () => inputs()[0]!.click());
    const delegate = Array.from(host.querySelectorAll('label')).find((label) =>
      label.textContent?.includes(zhTranslate('pairing.delegateApproved')),
    )!;
    await act(async () => delegate.querySelector('input')!.click());
    await act(async () =>
      Array.from(host.querySelectorAll('button'))
        .find((button) => button.textContent === zhTranslate('pairing.approve'))!
        .click(),
    );
    expect(review).toHaveBeenCalledExactlyOnceWith({
      kind: 'approve',
      id: request.id,
      expectedRevision: request.revision,
      capabilities: ['approve'],
      delegable: true,
    });
    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () =>
      root.render(
        createElement(PairingSettings, {
          requests: [
            {
              ...request,
              status: 'approved',
              capabilities: ['approve'],
              delegableCapabilities: ['approve'],
            },
          ],
          busy: false,
          refresh: async () => {},
          review,
          t: zhTranslate,
        }),
      ),
    );
    expect(host.querySelector('.bh-pairing-detail')!.textContent).toContain(
      zhTranslate('pairing.delegable'),
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
