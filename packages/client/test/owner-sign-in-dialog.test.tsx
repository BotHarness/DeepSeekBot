// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
}));
const { passwordSignIn, discoverAddress, teamSignIn, pairStart } = vi.hoisted(() => ({
  passwordSignIn: vi.fn(),
  discoverAddress: vi.fn(),
  teamSignIn: vi.fn(),
  pairStart: vi.fn(),
}));
vi.mock('../src/client/remote-hosts.js', () => ({
  THIS_HOST: 'local',
  remoteHosts: () => ({ passwordSignIn, discoverAddress, teamSignIn }),
}));
vi.mock('../src/client/connection-control.js', () => ({
  createConnectionControl: () => ({
    subscribe: () => () => {},
    dispose: () => {},
    execute: pairStart,
  }),
}));
vi.mock('../src/client/this-host.js', () => ({
  getThisHost: () => ({ id: 'local', name: 'Desk' }),
}));

import { AddRemoteHostDialog } from '../src/client/host-tabs.js';
import { continueTeamSignIn } from '@botharness/host-client/team-sign-in';
import type { HostCarrier } from '@botharness/host-protocol/carrier';
import { zhTranslate } from '../src/client/locale.js';

function fill(input: HTMLInputElement | null, value: string) {
  if (!input) throw new Error('Missing input');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

const discovery = {
  route: 'https://studio.example',
  host: { id: 'studio', name: 'Studio', fingerprint: 'ab'.repeat(32) },
  publicKey: 'cd'.repeat(32),
  signIn: { password: true },
};
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const onClose = vi.fn();
const t = zhTranslate;

beforeEach(async () => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  discoverAddress.mockResolvedValue({ ok: true, value: discovery });
  await act(async () => root.render(<AddRemoteHostDialog inline onClose={onClose} t={t} />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const click = (label: string) =>
  act(async () => {
    const button = [...container.querySelectorAll('button')].find(
      (item) => item.getAttribute('aria-label') === label || item.textContent === label,
    );
    if (!button) throw new Error(label);
    button.click();
  });

const enter = async (value: string) => {
  await act(async () => fill(container.querySelector('input:not([type="file"])'), value));
  await click(t('remoteHosts.add.submit'));
};

const fillCredentials = (password: string) =>
  act(async () => {
    fill(container.querySelector('input[autocomplete="username"]'), 'alice');
    fill(container.querySelector('input[type="password"]'), password);
  });

it('sends a pairing link through the relationship controller', async () => {
  await enter('deepseekbot://pair?p=test');
  expect(pairStart).toHaveBeenCalledWith(
    expect.objectContaining({ action: 'start', link: 'deepseekbot://pair?p=test' }),
    expect.anything(),
  );
  expect(discoverAddress).not.toHaveBeenCalled();
});

it('routes a Team invitation to the existing flow', async () => {
  const payload = btoa(
    JSON.stringify({
      v: 1,
      host: discovery.host,
      routes: [discovery.route],
      username: 'alice',
      expiresAt: '2999-01-01T00:00:00.000Z',
    }),
  ).replace(/=+$/u, '');
  const link = 'deepseekbot://team?i=' + payload;
  teamSignIn.mockResolvedValue({ ok: false, code: 'unreachable' });
  await enter(link);
  expect(teamSignIn).toHaveBeenCalledWith(
    { kind: 'invitation', link },
    'local',
    expect.any(AbortSignal),
  );
  expect(discoverAddress).not.toHaveBeenCalled();
  expect(pairStart).not.toHaveBeenCalled();
});

it('discovers an address, offers both ways and saves the Owner sign-in', async () => {
  passwordSignIn.mockResolvedValueOnce({ ok: false, code: 'credentials-invalid' });
  passwordSignIn.mockResolvedValueOnce({
    ok: true,
    value: { role: 'owner', host: { hostId: 'studio' } },
  });
  await enter('studio.example');
  expect(discoverAddress).toHaveBeenCalledWith('studio.example', 'local', expect.any(AbortSignal));
  expect(container.textContent).toContain(t('remoteHosts.address.approve'));
  expect(container.textContent).not.toContain(discovery.host.fingerprint);
  expect(container.querySelector('input[type="password"]')).toBeNull();
  await click(t('remoteHosts.address.password'));
  await fillCredentials('wrong-password');
  await click(t('teamSignIn.signIn'));
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    t('remoteHosts.address.error.credentials'),
  );
  expect(container.querySelector<HTMLInputElement>('input[type="password"]')?.value).toBe('');
  await fillCredentials('valid-password');
  await click(t('teamSignIn.signIn'));
  expect(passwordSignIn).toHaveBeenLastCalledWith(
    expect.objectContaining({
      discovery,
      username: 'alice',
      password: 'valid-password',
      localHostId: 'local',
    }),
  );
  expect(onClose).toHaveBeenCalledOnce();
});

it.each([false, true])(
  'guides the reader to a pairing code without credentials (password enabled: %s)',
  async (password) => {
    discoverAddress.mockResolvedValue({ ok: true, value: { ...discovery, signIn: { password } } });
    await enter(discovery.route);
    if (password) await click(t('remoteHosts.address.approve'));
    expect(container.textContent).toContain(t('remoteHosts.address.pairingHint'));
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(passwordSignIn).not.toHaveBeenCalled();
    await enter('deepseekbot://pair?p=next');
    expect(pairStart).toHaveBeenCalledOnce();
  },
);

it('continues an issued member grant at the first-time password change', async () => {
  const carrier: HostCarrier = {
    request: vi.fn(async () => ({ status: 204, text: async () => '' })),
    openSocket: () => {
      throw new Error('unexpected socket');
    },
  };
  const commit = vi.fn();
  const flow = continueTeamSignIn(
    { carrier, previous: () => undefined, commit },
    {
      hostId: discovery.host.id,
      hostName: discovery.host.name,
      routes: [discovery.route],
      deviceId: 'device',
      credential: 'credential',
      member: {
        fingerprint: discovery.host.fingerprint,
        humanId: 'member',
        username: 'alice',
        displayName: 'Alice',
        mustChangePassword: true,
      },
    },
  );
  passwordSignIn.mockResolvedValue({ ok: true, value: { role: 'member', flow } });
  await enter(discovery.route);
  await click(t('remoteHosts.address.password'));
  await fillCredentials('first-password');
  await click(t('teamSignIn.signIn'));
  expect(container.querySelector('[data-team-sign-in="password-change"]')).not.toBeNull();
  expect(container.querySelectorAll('input[autocomplete="new-password"]')).toHaveLength(2);
  expect(passwordSignIn).toHaveBeenCalledOnce();
  expect(teamSignIn).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
});
