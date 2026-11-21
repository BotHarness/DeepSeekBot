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

function memberRow(name: string): HTMLButtonElement {
  const row = [...dialog().querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find(
    (button) => button.getAttribute('aria-label')?.startsWith(name + ' · '),
  );
  if (!row) throw new Error('Missing choice ' + name);
  return row;
}

async function renderExisting(call: BridgeCall): Promise<void> {
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
}

async function openExisting(call: BridgeCall): Promise<void> {
  await renderExisting(call);
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
  expect(memberRow('Bob Bot').disabled).toBe(true);
  const bob = memberRow('Bob');
  await act(async () => {
    bob.focus();
    bob.click();
  });
  expect(document.activeElement).toBe(bob);
  expect(memberRow('Bob Bot').disabled).toBe(false);
  await act(async () => memberRow('Bob Bot').click());
  await typeInto(fieldNamed(t('groupMembers.search')), 'Eve');
  await act(async () => void vi.advanceTimersByTime(250));
  expect(memberRow('Bob Bot').getAttribute('aria-pressed')).toBe('true');
  await act(async () => memberRow('Eve').click());
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

it('mixes avatar rows and filters by type, name, or handle while keeping selected rows', async () => {
  const onePhoto = 'data:image/png;base64,AA==';
  const people = [
    { id: 'bob', displayName: 'Bob', username: 'bob' },
    { id: 'zoe', displayName: 'Zoe' },
  ];
  const call: BridgeCall = async (method, input) => {
    if (method === 'humanAvatars')
      return ok({ avatars: [{ humanId: 'bob', version: 'a'.repeat(16), avatar: onePhoto }] });
    if (input.query === 'Eve') return ok({ ...choices, people: [], bots: choices.bots.slice(1) });
    if (input.query === 'bob')
      return ok({ ...choices, people: people.slice(0, 1), bots: choices.bots.slice(0, 1) });
    return ok({ ...choices, people });
  };
  await openExisting(call);
  const rows = () => [...dialog().querySelectorAll('button[aria-pressed]')];
  expect(rows().map((row) => row.getAttribute('aria-label')?.split(' · ')[0])).toEqual([
    'Bob',
    'Bob Bot',
    'Eve',
    'Zoe',
  ]);
  expect(dialog().querySelector('input[type="checkbox"]')).toBeNull();
  expect(memberRow('Bob').querySelector('img')?.getAttribute('src')).toBe(onePhoto);
  expect(memberRow('Eve').querySelector('[data-media="seeded"]')).not.toBeNull();
  expect(memberRow('Bob').getAttribute('aria-label')).toContain(t('groupMembers.typeHuman'));
  expect(memberRow('Eve').getAttribute('aria-label')).toContain(t('groupMembers.typeBot'));

  await act(async () => memberRow('Bob').click());
  const search = fieldNamed(t('groupMembers.search'));
  await typeInto(search, 'Bot: Eve');
  await act(async () => void vi.advanceTimersByTime(250));
  expect(rows()).toEqual([memberRow('Bob'), memberRow('Eve')]);
  expect(memberRow('Bob').getAttribute('aria-pressed')).toBe('true');
  await act(async () => memberRow('Bob').click());
  expect(rows()).toEqual([memberRow('Eve')]);

  await typeInto(search, '@bob');
  await act(async () => void vi.advanceTimersByTime(250));
  expect(rows()).toEqual([memberRow('Bob'), memberRow('Bob Bot')]);
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
        onCreate: (name, key, onDispatch) => {
          onDispatch();
          return create(name, key);
        },
        onCancel: vi.fn(),
        members: { call, scope: 'local' },
      }),
    ),
  );
  await typeInto(fieldNamed(t('channel.name.label')), 'QA');
  await act(async () => memberRow('Eve').click());
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

it('offers capability retry for malformed responses and hides the action on confirmed denial', async () => {
  const result = vi
    .fn()
    .mockResolvedValueOnce(ok({ ...choices, people: null }))
    .mockResolvedValueOnce(
      ok({ ...choices, canAddPeople: false, canAddBots: false, people: [], bots: [] }),
    );
  await renderExisting(result);
  const retry = buttonNamed(t('groupMembers.retryLoad'), document.body);
  await act(async () => retry.click());
  expect(result).toHaveBeenCalledTimes(2);
  expect(document.querySelector('[aria-label="' + t('groupMembers.retryLoad') + '"]')).toBeNull();
  expect(document.querySelector('[aria-label="' + t('groupMembers.add') + '"]')).toBeNull();
});

it('keeps search Enter in the picker and blocks an orphaned Bot until its Human is restored', async () => {
  const add = vi.fn(async (_method: string, _args: Record<string, unknown>) =>
    ok({
      results: [
        { kind: 'human', id: 'bob', status: 'joined' },
        { kind: 'bot', id: 'bob-bot', status: 'pending' },
      ],
    }),
  );
  await openExisting(async (method, args) =>
    method === 'channelGroupMembersAdd' ? add(method, args) : ok(choices),
  );
  await act(async () => memberRow('Bob').click());
  await act(async () => memberRow('Bob Bot').click());
  const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  await act(async () => void fieldNamed(t('groupMembers.search')).dispatchEvent(enter));
  expect(enter.defaultPrevented).toBe(true);
  expect(add).not.toHaveBeenCalled();

  await act(async () => memberRow('Bob').click());
  expect(memberRow('Bob Bot').getAttribute('aria-pressed')).toBe('true');
  expect(buttonNamed(t('groupMembers.submit'), dialog()).disabled).toBe(true);
  await submit();
  expect(add).not.toHaveBeenCalled();
  await act(async () => memberRow('Bob').click());
  await submit();
  expect(add).toHaveBeenCalledTimes(1);
});

it('keeps the creation target editable after rejection before dispatch', async () => {
  const call: BridgeCall = async () => ok(choices);
  const close = vi.fn();
  const create = vi.fn();
  const render = (scope: string) =>
    act(async () =>
      root.render(
        createElement(CreateChannelModal, {
          t,
          members: { call, scope },
          onCancel: close,
          onCreate: async (name, key, onDispatch) => {
            if (scope === 'offline') throw new Error('Host not ready');
            onDispatch();
            create(name, key);
            return GROUP;
          },
        }),
      ),
    );
  await render('offline');
  await typeInto(fieldNamed(t('channel.name.label')), 'QA');
  await submit();
  await render('online');
  expect(fieldNamed(t('channel.name.label')).disabled).toBe(false);
  await submit();
  expect(create).toHaveBeenCalledExactlyOnceWith('QA', expect.any(String));
  expect(close).toHaveBeenCalledTimes(1);
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
  await act(async () => memberRow('Eve').click());
  await render('other');
  await render('local');
  expect(memberRow('Eve').getAttribute('aria-pressed')).toBe('false');
  expect(fieldNamed(t('channel.name.label')).value).toBe('QA');
  await submit();
  expect(create).toHaveBeenCalledTimes(1);
});
