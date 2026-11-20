// @vitest-environment jsdom
import { type BridgeCall } from '../src/client/bridge.js';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { createStore } from '../src/client/store.js';

const writes: Record<string, unknown>[] = [];
const call: BridgeCall = async (endpoint, payload) => {
  if (endpoint === 'settings/describe')
    return {
      ok: true,
      value: {
        namespaces: [
          {
            ns: 'botharness-client',
            revision: 1,
            value: { autoAcceptGroupInvites: true, botHopLimit: 40 },
          },
        ],
      },
    };
  if (endpoint === 'settings/update') {
    writes.push(payload);
    return {
      ok: true,
      value: { ns: 'botharness-client', revision: 2, value: { autoAcceptGroupInvites: false } },
    };
  }
  return { ok: false, error: { code: 'unsupported', message: endpoint, details: {} } };
};

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
}));

vi.mock('../src/client/remote-host-actions.js', () => ({
  remoteHostSettings: () => ({ call, store: createStore(), actions: {} }),
}));

import { zhTranslate as t } from '../src/client/locale.js';
import { RemoteMessagingSettings } from '../src/client/remote-messaging-settings.js';

afterEach(() => {
  document.body.replaceChildren();
});

it('shows the remote Host messaging page and writes Bot collaboration to that Host', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<RemoteMessagingSettings client={{} as never} t={t} />));
  await act(async () => undefined);
  const text = host.textContent ?? '';
  expect(text).toContain(t('messaging.section.me'));
  expect(text).toContain(t('messaging.section.bots'));
  expect(text).toContain(t('groupAutoAccept.row.title'));
  expect(text).toContain(t('humanName.title'));
  expect(text).not.toContain(t('sendKey.row.title'));
  const toggle = host.querySelector<HTMLElement>(
    `[role="switch"][aria-label="${t('groupAutoAccept.row.title')}"]`,
  );
  expect(toggle?.getAttribute('aria-checked')).toBe('true');
  await act(async () => toggle?.click());
  expect(writes[0]).toMatchObject({
    ns: 'botharness-client',
    expectedRevision: 1,
    patch: { autoAcceptGroupInvites: false },
  });
  act(() => root.unmount());
});
