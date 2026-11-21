// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
}));
const ownerSignIn = vi.hoisted(() => vi.fn());
vi.mock('../src/client/remote-hosts.js', () => ({ remoteHosts: () => ({ ownerSignIn }) }));
vi.mock('../src/client/this-host.js', () => ({
  getThisHost: () => ({ id: 'local', name: 'Desk' }),
}));

import { OwnerSignInDialog } from '../src/client/owner-sign-in-dialog.js';
import { zhTranslate } from '../src/client/locale.js';

function fill(input: HTMLInputElement | null, value: string) {
  if (!input) throw new Error('Missing input');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

it('signs in from one form, gives one invalid-credentials error, and clears the failed password', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  ownerSignIn.mockResolvedValueOnce({ ok: false, code: 'credentials-invalid' });
  ownerSignIn.mockResolvedValueOnce({ ok: true, value: { hostId: 'studio' } });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const onClose = vi.fn();
  try {
    await act(async () =>
      root.render(<OwnerSignInDialog inline onBack={vi.fn()} onClose={onClose} t={zhTranslate} />),
    );
    const password = container.querySelector<HTMLInputElement>('input[type="password"]');
    const submit = container.querySelector<HTMLButtonElement>('button[type="submit"]');
    await act(async () => {
      fill(container.querySelector('input[autocomplete="url"]'), 'studio.example');
      fill(container.querySelector('input[autocomplete="username"]'), 'alice');
      fill(password, 'wrong-password');
    });
    await act(async () => submit?.click());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      zhTranslate('teamSignIn.error.credentials-invalid'),
    );
    expect(ownerSignIn).toHaveBeenCalledWith(
      expect.objectContaining({
        route: 'https://studio.example',
        username: 'alice',
        password: 'wrong-password',
        localHostId: 'local',
      }),
    );
    expect(password?.value).toBe('');
    await act(async () => fill(password, 'new-password'));
    await act(async () => submit?.click());
    expect(onClose).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
