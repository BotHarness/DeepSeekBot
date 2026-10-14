// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { dialogPrimitives } = await import('./primitive-mocks.js');
  return {
    ...dialogPrimitives(),
    IconPlusOutlineRegular: () => null,
    IconEllipsisOutlineRegular: () => null,
    Menu: () => null,
    Tag: ({ children }: PropsWithChildren) => createElement('span', null, children),
    Tooltip: ({ children }: PropsWithChildren) => children,
  };
});

import type { BridgeActions } from '../src/client/actions.js';
import { MembersHeaderAction } from '../src/client/group-member-controls.js';
import { zhTranslate as t } from '../src/client/locale.js';
import { store, type BotSummary, type ChannelSummary } from '../src/client/store.js';
import { buttonNamed, dialog, fieldNamed, typeInto } from './primitive-mocks.js';

const AT = '2026-10-08T00:00:00Z';

const GROUP: ChannelSummary = {
  id: 'g-qa',
  type: 'group',
  name: 'QA',
  members: ['ada'],
  createdAt: AT,
  updatedAt: AT,
  invitations: [
    {
      id: 'inv-1',
      targetBotSlug: 'cy',
      status: 'pending',
    },
  ] as never,
};

const bot = (slug: string, displayName: string, patch: Partial<BotSummary> = {}): BotSummary =>
  ({
    slug,
    displayName,
    roles: [],
    aggregateState: 'idle',
    workspaces: [],
    createdAt: AT,
    ...patch,
  }) as BotSummary;

let root: Root;
let host: HTMLDivElement;
let inviteGroupBot: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  store.setRoster(
    [
      bot('ada', 'Ada'),
      bot('bob', 'Bob'),
      bot('cy', 'Cy'),
      bot('dee', 'Dee', { paused: true }),
      bot('eve', 'Eve'),
    ],
    [GROUP],
  );
  store.setConversation({ channel: GROUP });
  inviteGroupBot = vi.fn(async () => true);
});

afterEach(async () => {
  await act(async () => root.unmount());
  store.setConversation({ channel: undefined });
  store.setRoster([], []);
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function openInvite(): Promise<void> {
  await act(async () =>
    root.render(
      createElement(MembersHeaderAction, {
        scope: 'channel',
        channelId: GROUP.id,
        botSlug: undefined,
        actions: { inviteGroupBot } as unknown as BridgeActions,
        t,
      }),
    ),
  );
  await act(async () => buttonNamed(t('group.invite'), host).click());
}

function options(): string[] {
  return [...dialog().querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].map(
    (button) => button.textContent ?? '',
  );
}

it('lists only Bots that can be invited, filters them and invites the chosen one', async () => {
  await openInvite();
  expect(dialog().getAttribute('aria-label')).toBe(t('group.invite'));
  expect(options()).toEqual(['Bob', 'Eve']);
  const submit = () =>
    [...dialog().querySelectorAll<HTMLButtonElement>('button[type="submit"]')].at(0)!;
  expect(submit().disabled).toBe(true);

  await typeInto(fieldNamed(t('group.inviteSearch')), 'ev');
  await act(async () => vi.advanceTimersByTime(250));
  expect(options()).toEqual(['Eve']);
  await typeInto(fieldNamed(t('group.inviteSearch')), 'zzz');
  await act(async () => vi.advanceTimersByTime(250));
  expect(dialog().textContent).toContain(t('group.inviteEmpty'));
  await typeInto(fieldNamed(t('group.inviteSearch')), '');
  await act(async () => vi.advanceTimersByTime(250));

  await act(async () => buttonNamed('Eve', dialog()).click());
  expect(buttonNamed('Eve', dialog()).getAttribute('aria-pressed')).toBe('true');
  expect(submit().disabled).toBe(false);
  await act(async () => submit().click());
  expect(inviteGroupBot).toHaveBeenCalledWith(GROUP.id, 'eve');
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it('keeps the dialog open with an error when the invitation fails', async () => {
  inviteGroupBot.mockResolvedValue(false);
  await openInvite();
  await act(async () => buttonNamed('Bob', dialog()).click());
  await act(async () => dialog().querySelector('form')!.requestSubmit());
  expect(inviteGroupBot).toHaveBeenCalledWith(GROUP.id, 'bob');
  expect(dialog().querySelector('[role="alert"]')?.textContent).toBe(t('members.error'));
  await act(async () => buttonNamed(t('common.cancel'), dialog()).click());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
