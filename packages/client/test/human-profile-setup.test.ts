// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { dialogPrimitives } = await import('./primitive-mocks.js');
  return { ...(await import('./primitive-mocks.js')).shellPrimitives(), ...dialogPrimitives() };
});
vi.mock('../src/client/group-avatar-crop.js', () => ({ GroupAvatarCropModal: () => null }));
import type { BridgeCall } from '../src/client/bridge.js';
import { HumanProfileSetup } from '../src/client/human-profile-setup.js';
import { zhTranslate } from '../src/client/locale.js';

const cache = {
  subscribe: () => () => {},
  getSnapshot: () => 0,
  want: () => {},
  get: () => undefined,
  put: () => {},
};

async function render(profileSetup?: 'pending') {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const calls: Array<[string, unknown]> = [];
  const identity = {
    humanId: 'mia',
    defaultDisplayName: null,
    displayName: 'Mia',
    ...(profileSetup ? { profileSetup } : {}),
  };
  const call = (async (method: string, payload: unknown) => {
    calls.push([method, payload]);
    return { ok: true, value: { ...identity, profileSetup: undefined } };
  }) as unknown as BridgeCall;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      createElement(HumanProfileSetup, {
        call,
        actions: {
          humanIdentity: async () => identity,
          humanAvatarSet: async () => identity,
          humanAvatars: cache as never,
        },
        t: zhTranslate,
      }),
    ),
  );
  return {
    calls,
    async cleanup() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

const button = (text: string) =>
  [...document.body.querySelectorAll('button')].find((item) => item.textContent === text);

afterEach(() => {
  document.body.innerHTML = '';
});

describe('First sign-in profile prompt', () => {
  it('stays hidden when the Host does not ask for a profile', async () => {
    const view = await render();
    expect(document.body.querySelector('[data-profile-setup]')).toBeNull();
    await view.cleanup();
  });

  it('saves a changed name, then tells the Host the prompt is finished', async () => {
    const view = await render('pending');
    const input = document.body.querySelector<HTMLInputElement>(
      '[data-profile-setup-name] input, input[data-profile-setup-name]',
    );
    expect(input?.value).toBe('Mia');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'Mia Chen');
      input?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      document.body.querySelector<HTMLButtonElement>('[data-profile-setup-done]')?.click();
    });
    expect(view.calls).toEqual([
      ['humanNameSet', { displayName: 'Mia Chen' }],
      ['humanProfileSetupFinish', {}],
    ]);
    expect(document.body.querySelector('[data-profile-setup]')).toBeNull();
    await view.cleanup();
  });

  it('records Later without changing the name', async () => {
    const view = await render('pending');
    await act(async () => button(zhTranslate('profileSetup.later'))?.click());
    expect(view.calls).toEqual([['humanProfileSetupFinish', {}]]);
    expect(document.body.querySelector('[data-profile-setup]')).toBeNull();
    await view.cleanup();
  });
});
