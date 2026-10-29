// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { dialogPrimitives } = await import('./primitive-mocks.js');
  return dialogPrimitives();
});

vi.mock('../src/client/group-avatar-crop.js', async () => {
  const { createElement: h } = await import('react');
  return {
    GroupAvatarCropModal: ({ onSave }: { onSave: (avatar: string) => Promise<boolean> }) =>
      h(
        'button',
        { type: 'button', 'data-crop-save': '', onClick: () => void onSave(AVATAR) },
        'crop',
      ),
  };
});

import type { MarketplaceAuthorAccount } from '../../core/src/marketplace/client.js';
import type { MarketplaceAccount } from '../../core/src/marketplace/uploaded-bots.js';
import {
  AccountProfileSettings,
  defaultAccountName,
  validAccountName,
} from '../src/client/account-profile-settings.js';
import { BridgeCallError } from '../src/client/bridge.js';
import { zhTranslate as t } from '../src/client/locale.js';
import { buttonNamed, typeInto } from './primitive-mocks.js';

const AVATAR = 'data:image/webp;base64,UklGRg==';
const AUTHOR: MarketplaceAuthorAccount = {
  id: 'k7m2pq',
  name: 'Vain',
  termsAcceptedAt: null,
  avatar: null,
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function actionsFor(account: MarketplaceAccount) {
  return {
    marketplaceAccount: vi.fn(async () => account),
    marketplaceAuthorSave: vi.fn(async (name: string) => ({ ...AUTHOR, name })),
    marketplaceAuthorAvatarSet: vi.fn(async (avatar: string | null) => ({
      ...AUTHOR,
      avatar: avatar === null ? null : 'https://market.example/v1/authors/k7m2pq/avatar/a.webp',
    })),
  };
}

const CODE = {
  userCode: 'NXKC-GQXZ',
  verificationUri: 'https://auth.example/device?user_code=NXKC-GQXZ',
};

async function render(
  actions: ReturnType<typeof actionsFor>,
  startSignIn = vi.fn(async () => CODE),
) {
  await act(async () => {
    root.render(createElement(AccountProfileSettings, { actions, startSignIn, t }));
  });
  await act(async () => {});
}

function nameInput(): HTMLInputElement {
  const input = host.querySelector<HTMLInputElement>('[data-account-name]');
  if (input === null) throw new Error('No account name input');
  return input;
}

it('signs a signed-out Human in from the profile and shows it once approved', async () => {
  vi.useFakeTimers();
  try {
    const startSignIn = vi.fn(async () => CODE);
    const actions = actionsFor({ signedIn: false, author: null });
    await render(actions, startSignIn);

    expect(host.querySelector('[data-account-profile="signed-out"]')).not.toBeNull();
    await act(async () => buttonNamed(t('accountProfile.signIn'), host).click());
    expect(startSignIn).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[data-account-profile="signing-in"]')).not.toBeNull();
    expect(host.querySelector('[data-account-sign-in-code]')?.textContent).toBe('NXKC-GQXZ');

    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await act(async () => buttonNamed(t('devices.connect.openPage'), host).click());
    expect(open).toHaveBeenCalledWith(CODE.verificationUri, '_blank', 'noopener');

    actions.marketplaceAccount.mockResolvedValue({
      signedIn: true,
      email: 'vain@example.com',
      author: AUTHOR,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(host.querySelector('[data-account-profile="ready"]')).not.toBeNull();
    expect(nameInput().value).toBe('Vain');
  } finally {
    vi.useRealTimers();
  }
});

it('explains when sign-in cannot start', async () => {
  await render(
    actionsFor({ signedIn: false, author: null }),
    vi.fn(async () => {
      throw new Error('relay-unavailable');
    }),
  );
  await act(async () => buttonNamed(t('accountProfile.signIn'), host).click());
  expect(host.textContent).toContain(t('accountProfile.signInFailed'));
  expect(host.querySelector('[data-account-profile="signed-out"]')).not.toBeNull();
});

it('says the Market refused a signed-in account instead of offering sign-in again', async () => {
  const actions = actionsFor({ signedIn: false, author: null });
  actions.marketplaceAccount.mockRejectedValue(
    new BridgeCallError('sign-in-rejected', 'market refused the token'),
  );
  await render(actions);

  expect(host.querySelector('[data-account-profile="error"]')).not.toBeNull();
  expect(host.textContent).toContain(t('market.error.signInRejected'));
  expect(() => buttonNamed(t('accountProfile.signIn'), host)).toThrow();
  expect(buttonNamed(t('accountProfile.retry'), host)).toBeDefined();
});

it('shows the profile and renames it once on Enter then blur', async () => {
  const actions = actionsFor({ signedIn: true, email: 'vain@example.com', author: AUTHOR });
  await render(actions);

  expect(nameInput().value).toBe('Vain');
  expect(host.querySelector('[data-account-id]')?.textContent).toBe('#k7m2pq');
  expect(host.querySelector('[data-account-email]')?.textContent).toBe('vain@example.com');
  expect(host.textContent).not.toContain(t('accountProfile.photoRemove'));

  await typeInto(nameInput(), ' 小维 ');
  await act(async () => {
    nameInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    nameInput().dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });

  expect(actions.marketplaceAuthorSave).toHaveBeenCalledTimes(1);
  expect(actions.marketplaceAuthorSave).toHaveBeenCalledWith('小维', false);
  expect(nameInput().value).toBe('小维');
});

it('creates the profile from the email before the first photo, then removes it', async () => {
  const actions = actionsFor({ signedIn: true, email: 'vain@example.com', author: null });
  await render(actions);

  const file = new File([new Uint8Array([1])], 'me.png', { type: 'image/png' });
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  await act(async () => host.querySelector<HTMLButtonElement>('[data-crop-save]')!.click());

  expect(actions.marketplaceAuthorSave).toHaveBeenCalledWith('vain', false);
  expect(actions.marketplaceAuthorAvatarSet).toHaveBeenCalledWith(AVATAR);
  expect(host.querySelector('[data-account-avatar] img')?.getAttribute('src')).toContain(
    '/avatar/a.webp',
  );

  await act(async () => buttonNamed(t('accountProfile.photoRemove'), host).click());
  expect(actions.marketplaceAuthorAvatarSet).toHaveBeenLastCalledWith(null);
  expect(host.querySelector('[data-account-avatar] img')).toBeNull();
});

it('reports a failed save without losing the profile', async () => {
  const actions = actionsFor({ signedIn: true, author: AUTHOR });
  actions.marketplaceAuthorSave.mockRejectedValueOnce(new Error('offline'));
  await render(actions);

  await typeInto(nameInput(), 'New');
  await act(async () => nameInput().dispatchEvent(new FocusEvent('focusout', { bubbles: true })));

  expect(host.querySelector('[data-account-profile-error]')).not.toBeNull();
  expect(host.querySelector('[data-account-profile="ready"]')).not.toBeNull();
});

it('validates names like the Market Worker and derives a default from the email', () => {
  expect(validAccountName('  ')).toBe(false);
  expect(validAccountName('a'.repeat(41))).toBe(false);
  expect(validAccountName('ok\u0007')).toBe(false);
  expect(validAccountName('维')).toBe(true);
  expect(defaultAccountName('someone@example.com')).toBe('someone');
  expect(defaultAccountName(undefined)).toBe('');
});
