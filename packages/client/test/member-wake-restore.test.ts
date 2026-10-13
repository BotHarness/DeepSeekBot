// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { dialogPrimitives } = await import('./primitive-mocks.js');
  return dialogPrimitives();
});

import { MemberWakePolicyModal } from '../src/client/group-member-controls.js';
import { zhTranslate as t } from '../src/client/locale.js';
import type { ChannelSummary } from '../src/client/store.js';
import { buttonNamed, dialog, fieldNamed, typeInto } from './primitive-mocks.js';

const GROUP: ChannelSummary = {
  id: 'team',
  type: 'group',
  name: 'Team',
  createdAt: '2026-10-03T00:00:00Z',
  updatedAt: '2026-10-03T00:00:00Z',
  members: ['ada'],
  wakePolicies: { ada: { mode: 'digest', count: 2, intervalSeconds: 120, revision: 1 } },
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

async function render(node: ReactElement): Promise<void> {
  await act(async () => root.render(node));
}

async function open(setGroupWakePolicy = vi.fn(async () => true)) {
  const onClose = vi.fn();
  await render(
    createElement(MemberWakePolicyModal, {
      group: GROUP,
      slug: 'ada',
      name: 'Ada',
      t,
      actions: { setGroupWakePolicy },
      onClose,
    }),
  );
  return { setGroupWakePolicy, onClose };
}

it('restores saved inheritance even when the current threshold draft is invalid', async () => {
  const { setGroupWakePolicy, onClose } = await open();
  expect(dialog().getAttribute('aria-label')).toBe(t('members.policy.title', { bot: 'Ada' }));
  await typeInto(fieldNamed(t('members.wake.count')), '0');
  expect(buttonNamed(t('members.wake.save')).disabled).toBe(true);
  await act(async () => buttonNamed(t('defaults.restore')).click());
  expect(setGroupWakePolicy).toHaveBeenCalledWith('team', 'ada', {
    mode: 'digest',
    count: 2,
    intervalSeconds: 120,
    inherit: true,
  });
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('saves the chosen mode and digest thresholds on Enter', async () => {
  const { setGroupWakePolicy, onClose } = await open();
  expect(fieldNamed(t('members.wake.count')).value).toBe('2');
  expect(fieldNamed(t('members.wake.seconds')).value).toBe('120');
  await typeInto(fieldNamed(t('members.wake.count')), '7');
  await typeInto(fieldNamed(t('members.wake.seconds')), '45');
  await act(async () => dialog().querySelector('form')!.requestSubmit());
  expect(setGroupWakePolicy).toHaveBeenCalledWith('team', 'ada', {
    mode: 'digest',
    count: 7,
    intervalSeconds: 45,
  });
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('hides digest thresholds for other modes and reports a failed save', async () => {
  const { setGroupWakePolicy, onClose } = await open(vi.fn(async () => false));
  const mentions = buttonNamed(t('members.wake.mentions'));
  await act(async () => mentions.click());
  expect(mentions.getAttribute('aria-pressed')).toBe('true');
  expect(buttonNamed(t('members.wake.digest')).getAttribute('aria-pressed')).toBe('false');
  expect(() => fieldNamed(t('members.wake.count'))).toThrow();
  await act(async () => buttonNamed(t('members.wake.save')).click());
  expect(setGroupWakePolicy).toHaveBeenCalledWith('team', 'ada', {
    mode: 'mentions',
    count: 2,
    intervalSeconds: 120,
  });
  expect(onClose).not.toHaveBeenCalled();
  expect(dialog().querySelector('[role="alert"]')?.textContent).toBe(t('members.error'));
  await act(async () => buttonNamed(t('common.cancel')).click());
  expect(onClose).toHaveBeenCalledTimes(1);
});
