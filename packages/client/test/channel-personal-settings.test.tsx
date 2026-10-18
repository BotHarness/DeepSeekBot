// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChannelNicknameSetting } from '../src/client/channel-personal-settings.js';
import { zhTranslate } from '../src/client/locale.js';
import type { BridgeActions } from '../src/client/actions.js';
import type { ChannelSummary } from '../src/client/store.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: 'button',
  Input: 'input',
  Switch: 'input',
}));
vi.mock('../src/client/bot-sidebar.js', () => ({ useClientState: vi.fn() }));
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const setHumanNickname = vi.fn<BridgeActions['setHumanNickname']>();
const actions = { setHumanNickname };
const channel: ChannelSummary = {
  id: 'group-a',
  type: 'group',
  name: 'Design',
  members: [],
  humanNickname: null,
  createdAt: '',
  updatedAt: '',
};
const render = async (value = channel) =>
  act(async () =>
    root.render(
      <ChannelNicknameSetting key={value.id} channel={value} actions={actions} t={zhTranslate} />,
    ),
  );
const input = () => host.querySelector('input')!;
async function type(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(), value);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const enter = () =>
  act(async () =>
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
  );
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  setHumanNickname.mockReset().mockResolvedValue(true);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
it('saves a trimmed nickname on Enter once, resets to the default and isolates Channels', async () => {
  await render();
  await type('  Reviewer  ');
  await enter();
  expect(setHumanNickname).toHaveBeenCalledWith('group-a', 'Reviewer');
  expect(input().value).toBe('Reviewer');
  await act(async () => input().dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(setHumanNickname).toHaveBeenCalledTimes(1);
  await act(async () => host.querySelector('button')!.click());
  expect(setHumanNickname).toHaveBeenLastCalledWith('group-a', null);
  expect(input().value).toBe('');
  await type('Unsubmitted');
  await render({ ...channel, id: 'group-b', humanNickname: 'Other' });
  expect(input().value).toBe('Other');
});
it('retains the draft after refusal or rejection and supports retry on blur', async () => {
  setHumanNickname.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('offline'));
  await render();
  await type('Reviewer');
  await enter();
  expect(input().value).toBe('Reviewer');
  expect(input().getAttribute('aria-invalid')).toBe('true');
  await enter();
  expect(input().value).toBe('Reviewer');
  await act(async () => input().dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(setHumanNickname).toHaveBeenCalledTimes(3);
  expect(input().getAttribute('aria-invalid')).toBeNull();
});
it('does not send invalid input or duplicate an in-flight save', async () => {
  let finish!: (value: boolean) => void;
  setHumanNickname.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await render();
  await type('bad\u0001name');
  await enter();
  expect(setHumanNickname).not.toHaveBeenCalled();
  await type('Reviewer');
  await enter();
  await enter();
  expect(setHumanNickname).toHaveBeenCalledTimes(1);
  await act(async () => finish(true));
});
