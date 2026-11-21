// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { dialogPrimitives, shellPrimitives } = await import('./primitive-mocks.js');
  return { ...shellPrimitives(), ...dialogPrimitives() };
});

import type { GroupMemberPickerResult } from '@botharness/host-protocol/group-members';
import type { BridgeActions } from '../src/client/actions.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { MembersHeaderAction } from '../src/client/group-member-controls.js';
import { zhTranslate as t } from '../src/client/locale.js';
import { CreateChannelModal } from '../src/client/section-management.js';
import { store, type ChannelSummary } from '../src/client/store.js';
import { buttonNamed, dialog, fieldNamed, typeInto } from './primitive-mocks.js';

const AT = '2026-10-08T00:00:00Z';
const GROUP: ChannelSummary = {
  id: 'g-qa',
  type: 'group',
  name: 'QA',
  members: [],
  createdAt: AT,
  updatedAt: AT,
};
const choices: GroupMemberPickerResult = {
  canAddPeople: true,
  canAddBots: true,
  people: [{ id: 'bob', displayName: 'Bob' }],
  bots: [
    { id: 'bob-bot', displayName: 'Bob Bot', requiresOwner: true, requiredHumanId: 'bob' },
    { id: 'eve', displayName: 'Eve' },
  ],
};

let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  store.setConversation({ channel: GROUP });
});

afterEach(async () => {
  await act(async () => root.unmount());
  store.setConversation({ channel: undefined });
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function check(name: string): HTMLInputElement {
  const row = [...dialog().querySelectorAll('label')].find(
    (label) => label.textContent?.startsWith(name) && label.querySelector('input[type=checkbox]'),
  );
  const input = row?.querySelector<HTMLInputElement>('input');
  if (!input) throw new Error('Missing choice ' + name);
  return input;
}

async function openExisting(call: BridgeCall): Promise<void> {
  const actions = {
    teamCall: call,
    openChannel: vi.fn(async () => undefined),
  } as unknown as BridgeActions;
  await act(async () =>
    root.render(
      createElement(MembersHeaderAction, {
        scope: 'channel',
        channelId: GROUP.id,
        botSlug: undefined,
        actions,
        t,
      }),
    ),
  );
  await act(async () => buttonNamed(t('groupMembers.add'), document.body).click());
}

const ok = (value: unknown) => ({ ok: true as const, value });
const submit = async () => act(async () => dialog().querySelector('form')!.requestSubmit());

it('keeps selections across search and retries failed targets after a mixed result', async () => {
  const calls = vi
    .fn()
    .mockResolvedValueOnce(
      ok({
        results: [
          { kind: 'human', id: 'bob', status: 'joined' },
          { kind: 'bot', id: 'bob-bot', status: 'pending' },
          { kind: 'bot', id: 'eve', status: 'failed', code: 'bot-not-found' },
        ],
      }),
    )
    .mockResolvedValueOnce(ok({ results: [{ kind: 'bot', id: 'eve', status: 'joined' }] }));
  const call: BridgeCall = async (method, input) => {
    if (method === 'channelGroupMembersAdd') return calls(input);
    if (input?.query === 'Eve') return ok({ ...choices, people: [], bots: choices.bots.slice(1) });
    return ok(choices);
  };
  await openExisting(call);
  expect(check('Bob Bot').disabled).toBe(true);
  const bob = check('Bob');
  await act(async () => {
    bob.focus();
    bob.click();
  });
  expect(document.activeElement).toBe(bob);
  expect(check('Bob Bot').disabled).toBe(false);
  await act(async () => check('Bob Bot').click());
  await typeInto(fieldNamed(t('groupMembers.search')), 'Eve');
  await act(async () => void vi.advanceTimersByTime(250));
  expect(check('Bob Bot').checked).toBe(true);
  await act(async () => check('Eve').click());
  expect(dialog().textContent).toContain(t('groupMembers.history'));
  await submit();

  expect(dialog().textContent).toContain('Bob · ' + t('groupMembers.joined'));
  expect(dialog().textContent).toContain('Bob Bot · ' + t('members.pending'));
  expect(dialog().textContent).toContain('Eve · ' + t('groupMembers.unavailable'));
  await submit();
  expect(calls).toHaveBeenLastCalledWith({
    channelId: GROUP.id,
    targets: [{ kind: 'bot', id: 'eve', operationKey: expect.any(String) }],
  });
  expect(dialog().textContent).toContain('Eve · ' + t('groupMembers.joined'));
});

it('keeps the same creation and invitation keys after ambiguous responses', async () => {
  const add = vi
    .fn()
    .mockRejectedValueOnce(new Error('interrupted'))
    .mockResolvedValueOnce(ok({ results: [{ kind: 'bot', id: 'eve', status: 'joined' }] }));
  const call: BridgeCall = async (method, input) =>
    method === 'channelGroupMembersAdd' ? add(input) : ok(choices);
  const create = vi
    .fn()
    .mockRejectedValueOnce(new Error('create response lost'))
    .mockResolvedValueOnce(GROUP);
  await act(async () =>
    root.render(
      createElement(CreateChannelModal, {
        t,
        onCreate: create,
        onCancel: vi.fn(),
        members: { call, scope: 'local' },
      }),
    ),
  );
  await typeInto(fieldNamed(t('channel.name.label')), 'QA');
  await act(async () => check('Eve').click());
  await submit();
  expect(add).not.toHaveBeenCalled();
  await submit();
  expect(create.mock.calls).toEqual([create.mock.calls[0], create.mock.calls[0]]);
  expect(dialog().textContent).toContain(t('groupMembers.unconfirmed'));
  await submit();
  expect(create).toHaveBeenCalledTimes(2);
  expect(add.mock.calls).toEqual([add.mock.calls[0], add.mock.calls[0]]);
  expect(dialog().textContent).toContain('Eve · ' + t('groupMembers.joined'));
});

it('clears the Host-scoped selection when the creation target changes', async () => {
  const create = vi.fn(async () => GROUP);
  const call: BridgeCall = async (method) => {
    if (method !== 'channelGroupMemberPicker') throw new Error('Unexpected member operation');
    return ok(choices);
  };
  const render = (scope: string) =>
    act(async () =>
      root.render(
        createElement(CreateChannelModal, {
          t,
          onCreate: create,
          onCancel: vi.fn(),
          members: { call, scope },
        }),
      ),
    );
  await render('local');
  await typeInto(fieldNamed(t('channel.name.label')), 'QA');
  await act(async () => check('Eve').click());
  await render('other');
  await render('local');
  expect(check('Eve').checked).toBe(false);
  expect(fieldNamed(t('channel.name.label')).value).toBe('QA');
  await submit();
  expect(create).toHaveBeenCalledTimes(1);
});
