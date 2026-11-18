// @vitest-environment jsdom
import {
  act,
  createElement,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { TeamSignInState } from '@botharness/host-client/team-sign-in';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
  ...(await import('./primitive-mocks.js')).comboboxPrimitives(),
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => createElement('input', props),
  Button: ({
    size: _size,
    variant: _variant,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { size?: string; variant?: string }) =>
    createElement('button', props),
}));

const fake = vi.hoisted(() => ({ teamSignIn: vi.fn() }));
vi.mock('../src/client/remote-hosts.js', () => ({
  remoteHosts: () => ({
    teamSignIn: fake.teamSignIn,
    getSnapshot: () => ({
      hosts: [
        {
          host: { hostId: 'h-team', member: { displayName: 'Bob', fingerprint: 'AAAA BBBB CCCC' } },
        },
      ],
    }),
  }),
}));
vi.mock('../src/client/this-host.js', () => ({
  getThisHost: () => ({ id: 'local', name: 'Studio' }),
}));

import { TeamSignInDialog } from '../src/client/team-sign-in-dialog.js';
import { teamInvitationLink } from '../src/client/host-tabs.js';
import { zhTranslate } from '../src/client/locale.js';

const host = { id: 'h-team', name: 'Acme', fingerprint: 'AAAA BBBB CCCC' };
const member = {
  humanId: 'h-alice',
  displayName: 'Alice',
  username: 'alice',
  fingerprint: host.fingerprint,
  mustChangePassword: true,
};

function fakeFlow() {
  let state: TeamSignInState = { kind: 'fingerprint', host, username: 'alice' };
  const listeners = new Set<() => void>();
  const set = (next: TeamSignInState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  let switchAsked = false;
  const flow = {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    confirmFingerprint: vi.fn((fingerprint: string) => {
      expect(fingerprint).toBe(host.fingerprint);
      set({ kind: 'sign-in', host, username: 'alice' });
      return { ok: true as const, value: state };
    }),
    signIn: vi.fn(async ({ password }: { password: string; deviceName: string }) => {
      if (password !== 'one-time-pw')
        return { ok: false as const, code: 'credentials-invalid' as const };
      set({ kind: 'password-change', member });
      return { ok: true as const, value: state };
    }),
    changePassword: vi.fn(async () => {
      set({ kind: 'identity-confirmation', member: { ...member, mustChangePassword: false } });
      return { ok: true as const, value: state };
    }),
    complete: vi.fn(async (confirm?: boolean) => {
      if (!confirm && !switchAsked) {
        switchAsked = true;
        return { ok: false as const, code: 'identity-switch-required' as const };
      }
      set({ kind: 'complete', member });
      return { ok: true as const, value: { hostId: host.id, hostName: host.name } };
    }),
    cancel: vi.fn(async () => set({ kind: 'cancelled' })),
  };
  return flow;
}

const settle = async (): Promise<void> => {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
};

function type(input: HTMLInputElement | null, value: string): void {
  if (input === null) throw new Error('missing input');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('Team sign-in dialog', () => {
  it('walks fingerprint, sign-in, password change and account switch before saving the Host', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const flow = fakeFlow();
    fake.teamSignIn.mockResolvedValue({ ok: true, value: flow });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const onDone = vi.fn();
    const submit = (): HTMLButtonElement =>
      document.querySelector<HTMLButtonElement>('[data-team-sign-in-submit]')!;
    const target = { kind: 'invitation' as const, link: 'deepseekbot://team?i=x' };
    try {
      await act(async () =>
        root.render(
          createElement(TeamSignInDialog, { target, onDone, onClose: vi.fn(), t: zhTranslate }),
        ),
      );
      await settle();
      expect(fake.teamSignIn).toHaveBeenCalledWith(target, 'local', expect.any(AbortSignal));
      expect(document.body.querySelector('[data-team-fingerprint]')?.textContent).toBe(
        host.fingerprint,
      );
      expect(flow.signIn).not.toHaveBeenCalled();

      await act(async () => submit().click());
      expect(
        document.body.querySelector('[data-team-sign-in]')?.getAttribute('data-team-sign-in'),
      ).toBe('sign-in');
      expect(submit().disabled).toBe(true);
      await act(async () => type(document.body.querySelector('input[name="password"]'), 'wrong'));
      await act(async () => submit().click());
      await settle();
      expect(document.body.textContent).toContain(
        zhTranslate('teamSignIn.error.credentials-invalid'),
      );

      await act(async () =>
        type(document.body.querySelector('input[name="password"]'), 'one-time-pw'),
      );
      await act(async () => submit().click());
      await settle();
      expect(flow.signIn).toHaveBeenLastCalledWith({
        password: 'one-time-pw',
        deviceName: zhTranslate('remoteHosts.deviceName', { name: 'Studio' }),
      });
      expect(document.body.querySelector('input[name="current"]')).toBeNull();

      await act(async () =>
        type(document.body.querySelector('input[name="next"]'), 'a-new-password'),
      );
      await act(async () =>
        type(document.body.querySelector('input[name="confirm"]'), 'different-one'),
      );
      await act(async () => submit().click());
      expect(document.body.textContent).toContain(zhTranslate('teamSignIn.error.mismatch'));
      expect(flow.changePassword).not.toHaveBeenCalled();
      await act(async () =>
        type(document.body.querySelector('input[name="confirm"]'), 'a-new-password'),
      );
      await act(async () => submit().click());
      await settle();
      expect(flow.changePassword).toHaveBeenCalledWith({
        current: 'one-time-pw',
        next: 'a-new-password',
      });

      await act(async () => submit().click());
      await settle();
      expect(document.body.textContent).toContain(
        zhTranslate('teamSignIn.switchBodyNamed', { name: 'Alice', current: 'Bob' }),
      );
      expect(flow.cancel).not.toHaveBeenCalled();
      expect(onDone).not.toHaveBeenCalled();
      await act(async () => submit().click());
      await settle();
      expect(flow.complete).toHaveBeenLastCalledWith(true);
      expect(onDone).toHaveBeenCalledWith(host.id, host.name);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
    expect(flow.cancel).not.toHaveBeenCalled();
  });

  it('cancels an unfinished sign-in when closed and shows a start refusal in plain words', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const flow = fakeFlow();
    fake.teamSignIn.mockResolvedValueOnce({ ok: true, value: flow });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const target = { kind: 'address' as const, route: 'https://acme.example', username: 'alice' };
    await act(async () =>
      root.render(
        createElement(TeamSignInDialog, {
          target,
          onDone: vi.fn(),
          onClose: vi.fn(),
          t: zhTranslate,
        }),
      ),
    );
    await settle();
    await act(async () => root.unmount());
    expect(flow.cancel).toHaveBeenCalled();

    fake.teamSignIn.mockResolvedValueOnce({ ok: false, code: 'invitation-expired' });
    const again = createRoot(container);
    await act(async () =>
      again.render(
        createElement(TeamSignInDialog, {
          target: { kind: 'invitation', link: 'x' },
          onDone: vi.fn(),
          onClose: vi.fn(),
          t: zhTranslate,
        }),
      ),
    );
    await settle();
    expect(document.body.textContent).toContain(zhTranslate('teamSignIn.error.invitation-expired'));
    await act(async () => again.unmount());
    container.remove();
  });

  it('recognises Team invitations before the pairing path sees them', () => {
    const payload = Buffer.from(
      JSON.stringify({
        v: 1,
        host: {
          id: 'h-team',
          name: 'Acme',
          fingerprint:
            '1c46 d94c f1d1 4ffe 7838 53c4 99a8 3f95 e570 d6cd dad3 8d54 19d3 c97f b4ed a407',
        },
        routes: [],
        username: 'alice',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    ).toString('base64url');
    expect(teamInvitationLink(`deepseekbot://team?i=${payload}`)?.ok).toBe(true);
    expect(teamInvitationLink('deepseekbot://team?i=***')).toEqual({
      ok: false,
      code: 'invitation-invalid',
    });
    expect(teamInvitationLink('deepseekbot://pair?p=abc')).toBeUndefined();
    expect(teamInvitationLink('not a link')).toBeUndefined();
  });
});
