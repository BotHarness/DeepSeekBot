// @vitest-environment jsdom
import {
  act,
  createElement,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type PropsWithChildren,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ApprovalMessagingSnapshot } from '../../core/src/messaging/approval-messaging.js';
import type { FailureAlertSnapshot } from '../../core/src/messaging/failure-alerts.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).comboboxPrimitives(),
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => createElement('input', props),
  Button: ({
    size: _size,
    variant: _variant,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { size?: string; variant?: string }) =>
    createElement('button', props),
  Tag: ({ children }: PropsWithChildren) => createElement('span', null, children),
  Checkbox: ({
    label,
    checked,
    disabled,
    onChange,
  }: {
    label: string;
    checked: boolean;
    disabled?: boolean;
    onChange(value: boolean): void;
  }) =>
    createElement('input', {
      type: 'checkbox',
      'aria-label': label,
      checked,
      disabled,
      onChange: (event: { target: { checked: boolean } }) => onChange(event.target.checked),
    }),
  SegmentedTabs: ({
    items,
    value,
    onChange,
  }: {
    items: { value: string; label: string; id: string; panelId: string }[];
    value: string;
    onChange(value: string): void;
  }) =>
    createElement(
      'div',
      { role: 'tablist' },
      items.map((item) =>
        createElement(
          'button',
          {
            key: item.value,
            role: 'tab',
            id: item.id,
            'aria-controls': item.panelId,
            'aria-selected': item.value === value,
            onClick: () => onChange(item.value),
          },
          item.label,
        ),
      ),
    ),
}));
vi.mock('../src/client/messaging-help.js', () => ({ MessagingHelp: () => null }));

import { ApprovalSettings } from '../src/client/approval-settings.js';
import { zhTranslate as t } from '../src/client/locale.js';

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
const route = {
  botSlug: 'bot',
  pairingId: 'person',
  pairingRevision: 3,
  bindingId: 'binding',
  revision: 7,
};
const approval: ApprovalMessagingSnapshot = {
  route,
  routeRevision: 7,
  destinations: [
    {
      pairingId: 'person',
      name: 'Reviewer',
      reference: 'PAIR',
      accountName: 'QA Lark',
      ready: true,
    },
  ],
  deliveries: [
    {
      id: 'approval-record',
      botSlug: 'bot',
      sessionId: 'approval-session',
      route,
      createdAt: '2026-10-12T10:00:00Z',
      delivery: 'failed',
      attempts: 1,
      status: 'pending',
      update: 'none',
    },
  ],
};
const failures: FailureAlertSnapshot = {
  enabled: true,
  revision: 13,
  available: true,
  deliveries: [
    {
      id: 'unknown-failure',
      botSlug: 'bot',
      sessionId: 'failure-session',
      createdAt: '2026-10-12T11:00:00Z',
      settingsRevision: 13,
      state: 'unknown-outcome',
      attempts: 1,
    },
    {
      id: 'unsent-failure',
      botSlug: 'bot',
      sessionId: 'other-session',
      createdAt: '2026-10-12T12:00:00Z',
      settingsRevision: 13,
      state: 'failed',
      attempts: 1,
    },
  ],
};
function props() {
  return {
    snapshot: approval,
    busy: false,
    failed: false,
    save: vi.fn(async () => {}),
    test: vi.fn(async () => {}),
    retry: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
    openSession: vi.fn(),
    failureAlerts: {
      snapshot: failures,
      save: vi.fn(async () => {}),
      test: vi.fn(async () => {}),
      retry: vi.fn(async () => {}),
    },
    t,
  };
}
function button(label: string) {
  const found = [...host.querySelectorAll('button')].find((b) => b.textContent === label);
  if (!found) throw Error(`Missing button ${label}`);
  return found;
}

it('keeps failure and approval test/retry/session actions with their owning record', async () => {
  const p = props();
  await act(async () => root.render(createElement(ApprovalSettings, p)));
  await act(async () => button(t('failureAlerts.test')).click());
  expect(p.failureAlerts.test).toHaveBeenCalledOnce();
  expect(p.test).not.toHaveBeenCalled();
  await act(async () => button(t('failureAlerts.openSession')).click());
  expect(p.openSession).toHaveBeenLastCalledWith('failure-session');
  await act(async () => button(`${t('approvalIm.approvalHistory')} (1)`).click());
  await act(async () => button(t('approvalIm.retry')).click());
  expect(p.retry).toHaveBeenCalledWith('approval-record');
  expect(p.failureAlerts.retry).not.toHaveBeenCalled();
  await act(async () => button(t('approvalIm.openSession')).click());
  expect(p.openSession).toHaveBeenLastCalledWith('approval-session');
  await act(async () => button(t('approvalIm.test')).click());
  expect(p.test).toHaveBeenCalledOnce();
});

it('offers retry only for the selected known-unsent failure and refuses unavailable targets', async () => {
  const p = props();
  await act(async () => root.render(createElement(ApprovalSettings, p)));
  expect(host.textContent).toContain(t('failureAlerts.unknown'));
  expect(
    [...host.querySelectorAll('button')].some((b) => b.textContent === t('approvalIm.retry')),
  ).toBe(false);
  const name = t('pairing.selectEntry', { name: `${t('failureAlerts.event')} unsent-failure` });
  const choice = host.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`);
  if (!choice) throw Error('Missing delivery choice');
  await act(async () => choice.click());
  await act(async () => button(t('approvalIm.retry')).click());
  expect(p.failureAlerts.retry).toHaveBeenCalledWith('unsent-failure');
  await act(async () =>
    root.render(
      createElement(ApprovalSettings, {
        ...p,
        snapshot: { ...approval, destinations: [{ ...approval.destinations[0]!, ready: false }] },
        failureAlerts: { ...p.failureAlerts, snapshot: { ...failures, available: false } },
      }),
    ),
  );
  expect(button(t('approvalIm.test')).disabled).toBe(true);
  expect(button(t('failureAlerts.test')).disabled).toBe(true);
  expect(
    [...host.querySelectorAll('button')].some((b) => b.textContent === t('approvalIm.retry')),
  ).toBe(false);
});

it('saves only the failure event setting using its current revision and preserves the route', async () => {
  const p = props();
  await act(async () => root.render(createElement(ApprovalSettings, p)));
  const toggle = host.querySelector<HTMLInputElement>(
    `input[aria-label="${t('failureAlerts.title')}"]`,
  );
  if (!toggle) throw Error('Missing event toggle');
  await act(async () => toggle.click());
  expect(p.failureAlerts.save).toHaveBeenCalledWith(false, 13);
  expect(p.save).not.toHaveBeenCalled();
});
