// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));
vi.mock('expo-image', () => ({
  Image: ({ source }: { source: { uri: string } }) => <img alt="" src={source.uri} />,
}));
vi.mock('../src/ui/primitives/row-icon', () => ({ RowIcon: () => null }));
vi.mock('react-native-keyboard-controller', async () => import('./keyboard-controller-shim'));
vi.mock('react-native', async () => import('./react-native-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('react-native-gesture-handler', () => import('./gesture-handler-shim'));
vi.mock('../src/ui/haptics', () => ({ haptic: vi.fn() }));

import type { AccountProfileState } from '../src/account/account-profile';
import { AccountNameEditor } from '../src/ui/shell/account-name-editor';
import { AccountProfileView } from '../src/ui/shell/account-profile-view';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
});

async function render(element: ReactElement): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
  return host;
}

const editor = { busy: false, error: undefined, choose: vi.fn(), remove: vi.fn() };
const actions = () => ({
  onBack: vi.fn(),
  onSignIn: vi.fn(),
  onEditName: vi.fn(),
  onRetry: vi.fn(),
});
const byTestId = (view: HTMLElement, id: string) =>
  view.querySelector<HTMLElement>(`[data-testid="${id}"]`);

describe('Account Profile screen', () => {
  it('asks to sign in when signed out', async () => {
    const on = actions();
    const view = await render(
      <AccountProfileView state={{ status: 'signed-out' }} avatar={editor} actions={on} />,
    );
    expect(view.textContent).toContain(t.accountProfile.signInHint);
    await act(async () => byTestId(view, 'account-profile-sign-in')!.click());
    expect(on.onSignIn).toHaveBeenCalled();
  });

  it('shows the photo, name, ID and email, and opens the name editor', async () => {
    const on = actions();
    const state: AccountProfileState = {
      status: 'ready',
      email: 'vain@example.com',
      profile: {
        id: 'k3x9q2',
        name: 'Vain',
        avatar: 'https://market.test/v1/authors/k3x9q2/avatar/a.png',
        termsAcceptedAt: null,
      },
    };
    const view = await render(<AccountProfileView state={state} avatar={editor} actions={on} />);
    expect(view.querySelector('img')?.getAttribute('src')).toBe(
      'https://market.test/v1/authors/k3x9q2/avatar/a.png',
    );
    expect(view.textContent).toContain('#k3x9q2');
    expect(view.textContent).toContain('vain@example.com');
    expect(byTestId(view, 'account-avatar-remove')).not.toBeNull();
    await act(async () => byTestId(view, 'account-profile-name')!.click());
    expect(on.onEditName).toHaveBeenCalled();
  });

  it('shows the initial and no remove row without a photo', async () => {
    const view = await render(
      <AccountProfileView
        state={{
          status: 'ready',
          email: 'vain@example.com',
          profile: { id: 'k3x9q2', name: 'vain', avatar: null, termsAcceptedAt: null },
        }}
        avatar={editor}
        actions={actions()}
      />,
    );
    expect(view.querySelector('img')).toBeNull();
    expect(view.textContent).toContain('V');
    expect(byTestId(view, 'account-avatar-remove')).toBeNull();
  });

  it('saves a trimmed valid name only', async () => {
    const onSave = vi.fn(async () => undefined);
    const onClose = vi.fn();
    const view = await render(<AccountNameEditor name="" onSave={onSave} onClose={onClose} />);
    const save = byTestId(view, 'account-name-save') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    const field = view.querySelector('textarea')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(field, '  爱丽丝 ');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => save.click());
    expect(onSave).toHaveBeenCalledWith('爱丽丝');
    expect(onClose).toHaveBeenCalled();
  });
});
