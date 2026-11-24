// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, expect, it } from 'vitest';
import { interfacePreferences } from '../src/ui/interface-preferences';
import {
  navigation,
  place,
  dialog,
  open,
  press,
  unmount,
  buttons,
  approval,
  question,
} from './session-detail-fixture';

afterEach(unmount);

it('answers a native approval with Allow once, then drops the card', async () => {
  const { view, call } = await open({ role: 'native', running: true, pendingInput: [approval] });
  expect(view.querySelector('[data-testid="session-pending-input"]')).not.toBeNull();
  expect(buttons(view)).toEqual(expect.arrayContaining(['Allow once', 'Reject']));
  expect(buttons(view)).not.toContain('Always allow');
  await press(view, 'Allow once');
  expect(call).toHaveBeenCalledWith('sessionAnswerApproval', {
    sessionId: 'chosen',
    requestId: 'req-1',
    decision: 'allowed-once',
  });
  expect(view.querySelector('[data-testid="session-pending-input"]')).toBeNull();
});

it('shows a request that arrives on the live read before the next transcript read', async () => {
  const { view } = await open({
    role: 'native',
    running: true,
    pendingInput: [],
    livePendingInput: [approval],
  });
  expect(view.querySelector('[data-testid="session-pending-input"]')).not.toBeNull();
});

it('answers a native question from its option', async () => {
  const { view, call } = await open({ role: 'native', running: true, pendingInput: [question] });
  expect(view.textContent).toContain('Which file?');
  await act(async () =>
    view.querySelector<HTMLElement>('[data-testid="question-option-1"]')!.click(),
  );
  expect(call).toHaveBeenCalledWith('sessionAnswerQuestion', {
    sessionId: 'chosen',
    requestId: 'q-1',
    answer: { answers: [{ id: 'pick', selected: ['b.md'] }] },
  });
  expect(view.querySelector('[data-testid="session-pending-input"]')).toBeNull();
});

it('stops a running native Session from the options menu', async () => {
  const { view, call } = await open({ role: 'native', running: true });
  await press(view, 'Review the release');
  const menu = view.querySelector<HTMLElement>('[role="menu"]')!;
  expect(menu.querySelector('[data-testid="session-archive"]')).toBeNull();
  await press(menu, 'Stop');
  expect(call).toHaveBeenCalledWith('sessionNativeStop', { sessionId: 'chosen' });
});

it('archives an idle native Session after confirmation and leaves it', async () => {
  navigation.back.mockClear();
  dialog.confirm.mockClear();
  const { view, call } = await open({ role: 'native' });
  await press(view, 'Review the release');
  const menu = view.querySelector<HTMLElement>('[role="menu"]')!;
  expect(menu.querySelector('[data-testid="session-stop"]')).toBeNull();
  await press(menu, 'Archive');
  expect(dialog.confirm).toHaveBeenCalledWith(
    'Archive this Session?',
    expect.any(String),
    'Archive',
  );
  expect(call).toHaveBeenCalledWith('sessionNativeArchive', { sessionId: 'chosen' });
  expect(navigation.back).toHaveBeenCalled();
});

it('lands on the Sessions root after archiving from the Sessions tab, never another tab', async () => {
  place.segments = ['(tabs)', '(sessions)', 'session', '[id]'];
  place.index = 0;
  place.replace.mockClear();
  navigation.back.mockClear();
  try {
    const drawer = await open({ role: 'native' });
    await press(drawer.view, 'Review the release');
    await press(drawer.view.querySelector<HTMLElement>('[role="menu"]')!, 'Archive');
    expect(place.replace).toHaveBeenCalledExactlyOnceWith('/sessions');
    await unmount();

    interfacePreferences.setSessionNavigation('stacked');
    place.index = 1;
    navigation.dismissTo.mockClear();
    const stacked = await open({ role: 'native' });
    await press(stacked.view, 'Review the release');
    await press(stacked.view.querySelector<HTMLElement>('[role="menu"]')!, 'Archive');
    expect(navigation.dismissTo).toHaveBeenCalledExactlyOnceWith('/sessions');
    expect(navigation.back).not.toHaveBeenCalled();
  } finally {
    interfacePreferences.setSessionNavigation('drawer');
    place.segments = ['(tabs)', '(home)', 'session', '[id]'];
    place.index = 1;
  }
});

it('keeps a native Session when Archive is cancelled', async () => {
  dialog.confirm.mockResolvedValueOnce(false);
  const { view, call } = await open({ role: 'native' });
  await press(view, 'Review the release');
  await press(view.querySelector<HTMLElement>('[role="menu"]')!, 'Archive');
  expect(call.mock.calls.some(([method]) => method === 'sessionNativeArchive')).toBe(false);
});

it('never shows native answers, Stop or Archive to a Team member', async () => {
  place.hostId = 'member-host';
  place.member.add('member-host');
  try {
    for (const running of [true, false]) {
      const { view } = await open({ role: 'native', running, pendingInput: [approval, question] });
      expect(view.querySelector('[data-testid="session-pending-input"]')).toBeNull();
      await press(view, 'Review the release');
      const menu = view.querySelector<HTMLElement>('[role="menu"]')!;
      expect(menu.querySelector('[data-testid="session-stop"]')).toBeNull();
      expect(menu.querySelector('[data-testid="session-archive"]')).toBeNull();
      expect(buttons(view)).not.toContain('Stop');
      await unmount();
    }
  } finally {
    place.hostId = undefined;
    place.member.delete('member-host');
  }
});
