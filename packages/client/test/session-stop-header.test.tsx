// @vitest-environment jsdom
import {
  act,
  createElement,
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({
    children,
    icon: _icon,
    ...props
  }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { icon?: unknown }>) =>
    createElement('button', props, children),
  FileTypeIcon: () => null,
  IconCloseOutlineRegular: () => null,
  IconChevronDownOutlineRegular: () => null,
  IconAgentPresetOutlineRegular: () => null,
  IconCodeOutlineRegular: () => null,
  IconBranchOutlineRegular: () => null,
  Tooltip: ({ children }: { children: ReactNode }) => children,
  IconPaperclipOutlineRegular: () => null,
  IconSendOutlineRegular: () => null,
  IconStopFillRegular: () => null,
  ImageLightbox: () => null,
  Tag: ({ children }: { children: ReactNode }) => createElement('span', null, children),
  MenuSurface: forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
    function MenuSurface(props, ref) {
      return createElement('div', { ...props, ref });
    },
  ),
  useAnchoredPosition: () => ({ left: 0, top: 0 }),
  fileSizeText: (size: number) => `${size} B`,
}));

vi.mock('../src/client/avatar.js', () => ({
  PersonaBotAvatar: ({ name }: { name: string }) => createElement('span', null, name[0]),
}));

const openPanel = vi.fn();
vi.mock('../src/client/channel-dock.js', () => ({ useDockPanelOpener: () => openPanel }));

import { createActions } from '../src/client/actions.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { ChannelComposer } from '../src/client/channel-composer.js';
import {
  ConversationSessionStop,
  HeaderSessionChip,
  HeaderSessionStop,
  type HeaderSessionStopController,
  type SessionStopGroup,
} from '../src/client/header-session-stop.js';
import { en, type BotHarnessTranslate } from '../src/client/locale.js';
import { SESSION_TARGET_KEY } from '../src/client/session-target.js';
import {
  runningSessionCount,
  runningSessionGroups,
  runningSessions,
} from '../src/client/session-stop-model.js';
import { createStore, type BotSummary, type ChannelSummary } from '../src/client/store.js';
import type { PersonaBotSessionActivity } from '../../core/src/state/tool-activity.js';

const enTranslate = ((key: string, params?: Record<string, unknown>) => {
  let text: string = (en as Record<string, string>)[key] ?? key;
  for (const [name, value] of Object.entries(params ?? {}))
    text = text.replace(`{${name}}`, String(value));
  return text;
}) as BotHarnessTranslate;

const session = (
  id: string,
  role: PersonaBotSessionActivity['role'],
  state: PersonaBotSessionActivity['state'],
  at: number,
  name?: string,
): PersonaBotSessionActivity => ({
  id,
  role,
  state,
  at,
  revision: 1,
  ...(name === undefined ? {} : { name }),
});

const bot = (slug: string, displayName: string, sessions: PersonaBotSessionActivity[] = []) =>
  ({
    slug,
    displayName,
    roles: [],
    aggregateState: sessions.length === 0 ? 'idle' : 'working',
    workspaces: [],
    createdAt: '2026-11-04T00:00:00.000Z',
    ...(sessions.length === 0 ? {} : { sessionActivity: sessions }),
  }) satisfies BotSummary as BotSummary;

describe('Composer', () => {
  it('never renders Stop, even while a Bot works', () => {
    const markup = renderToStaticMarkup(
      createElement(ChannelComposer, {
        value: '',
        placeholder: 'Message Ada',
        sending: false,
        t: enTranslate,
        onChange: () => undefined,
        onSubmit: () => undefined,
      }),
    );
    expect(markup).toContain('aria-label="Send"');
    expect(markup).not.toMatch(/Stop/u);
    expect(markup).not.toContain('bh-stop-btn');
  });
});

describe('running Session count', () => {
  it('counts running Orchestrator and Assignment Sessions only', () => {
    const sessions = [
      session('a-2', 'assignment', 'working', 30, 'Fix the tests'),
      session('sub', 'subagent', 'working', 10),
      session('ask', 'assignment', 'waiting', 15, 'Waiting on an Ask'),
      session('blocked', 'assignment', 'blocked', 16, 'Blocked'),
      session('orch', 'orchestrator', 'thinking', 40),
      session('a-1', 'assignment', 'thinking', 20, 'Write the plan'),
    ];
    expect(runningSessions(sessions).map((item) => item.id)).toEqual(['orch', 'a-1', 'a-2']);
    const groups = runningSessionGroups([
      bot('ada', 'Ada', sessions),
      bot('ben', 'Ben'),
      bot('cy', 'Cy', [session('cy-o', 'orchestrator', 'working', 1)]),
    ]);
    expect(groups.map((group) => group.bot.slug)).toEqual(['ada', 'cy']);
    expect(runningSessionCount(groups)).toBe(4);
    expect(runningSessionCount(runningSessionGroups([bot('ben', 'Ben')]))).toBe(0);
  });

  it('hides the chip at 0', () => {
    expect(
      renderToStaticMarkup(createElement(HeaderSessionChip, { count: 0, t: enTranslate })),
    ).toBe('');
    expect(
      renderToStaticMarkup(createElement(HeaderSessionChip, { count: 3, t: enTranslate })),
    ).toContain('Running Sessions: 3');
  });
});

describe('header stop popover', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    openPanel.mockReset();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  const controller = (open: boolean, setOpen = vi.fn()): HeaderSessionStopController => ({
    open,
    setOpen,
    toggle: () => setOpen(!open),
  });
  const groupsOf = (bots: BotSummary[]): SessionStopGroup[] => runningSessionGroups(bots);
  const ada = () =>
    bot('ada', 'Ada', [
      session('ada-o', 'orchestrator', 'thinking', 1),
      session('ada-a', 'assignment', 'working', 2, 'Fix the tests'),
    ]);
  const ben = () => bot('ben', 'Ben', [session('ben-a', 'assignment', 'working', 3, 'Ship it')]);

  it('renders nothing with no running Session and updates the chip live', async () => {
    const props = {
      controller: controller(false),
      t: enTranslate,
      onStopSession: vi.fn(),
      onStopBot: vi.fn(),
      onOpenSessions: vi.fn(),
    };
    await act(async () => root.render(<HeaderSessionStop {...props} groups={[]} />));
    expect(host.innerHTML).toBe('');
    await act(async () => root.render(<HeaderSessionStop {...props} groups={groupsOf([ada()])} />));
    expect(host.querySelector('[data-session-chip]')?.textContent).toContain('2');
    await act(async () =>
      root.render(<HeaderSessionStop {...props} groups={groupsOf([ada(), ben()])} />),
    );
    expect(host.querySelector('[data-session-chip]')?.textContent).toContain('3');
    await act(async () => root.render(<HeaderSessionStop {...props} groups={[]} />));
    expect(host.querySelector('[data-session-chip]')).toBeNull();
  });

  it('opens from the chip and groups rows by Bot without a stop for every Bot', async () => {
    const setOpen = vi.fn();
    const props = {
      t: enTranslate,
      groups: groupsOf([ada(), ben()]),
      onStopSession: vi.fn(),
      onStopBot: vi.fn(),
      onOpenSessions: vi.fn(),
    };
    await act(async () =>
      root.render(<HeaderSessionStop {...props} controller={controller(false, setOpen)} />),
    );
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-session-stop-trigger]')!.click(),
    );
    expect(setOpen).toHaveBeenCalledWith(true);
    await act(async () =>
      root.render(<HeaderSessionStop {...props} controller={controller(true, setOpen)} />),
    );
    const popover = document.querySelector('[data-session-stop-popover]')!;
    const bots = [...popover.querySelectorAll('[data-session-stop-bot]')];
    expect(bots.map((node) => node.getAttribute('data-session-stop-bot'))).toEqual(['ada', 'ben']);
    expect(
      [...bots[0]!.querySelectorAll('[data-session-stop-row]')].map((row) => row.textContent),
    ).toEqual(['OrchestratorThinking', 'Fix the testsWorking']);
    expect(popover.querySelectorAll('[data-session-stop-all]')).toHaveLength(2);
    expect(popover.textContent).not.toMatch(/all Bots/iu);
    expect(popover.querySelector('[data-session-stop-open-sessions]')?.textContent).toBe(
      'Open in Sessions',
    );
  });

  it('stops one Session in one click and shows Stopping…', async () => {
    let finish: () => void = () => undefined;
    const onStopSession = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () =>
      root.render(
        <HeaderSessionStop
          controller={controller(true)}
          t={enTranslate}
          groups={groupsOf([ada()])}
          onStopSession={onStopSession}
          onStopBot={vi.fn()}
          onOpenSessions={vi.fn()}
        />,
      ),
    );
    const row = () => document.querySelector('[data-session-stop-row="ada-a"]')!;
    const stop = () => row().querySelector<HTMLButtonElement>('[data-session-stop]')!;
    expect(stop().getAttribute('aria-label')).toBe('Stop “Fix the tests”');
    await act(async () => stop().click());
    expect(onStopSession).toHaveBeenCalledWith('ada', 'ada-a');
    expect(stop().disabled).toBe(true);
    expect(row().textContent).toContain('Stopping…');
    expect(
      document
        .querySelector('[data-session-stop-row="ada-o"]')!
        .querySelector<HTMLButtonElement>('[data-session-stop]')!.disabled,
    ).toBe(false);
    await act(async () => finish());
  });

  it('stops all of one Bot and reports a failure', async () => {
    const onStopBot = vi.fn(async () => {
      throw new Error('Host unavailable');
    });
    await act(async () =>
      root.render(
        <HeaderSessionStop
          controller={controller(true)}
          t={enTranslate}
          groups={groupsOf([ada(), ben()])}
          onStopSession={vi.fn()}
          onStopBot={onStopBot}
          onOpenSessions={vi.fn()}
        />,
      ),
    );
    const benGroup = document.querySelector('[data-session-stop-bot="ben"]')!;
    await act(async () =>
      benGroup.querySelector<HTMLButtonElement>('[data-session-stop-all]')!.click(),
    );
    expect(onStopBot).toHaveBeenCalledWith('ben');
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      'Couldn’t stop: Host unavailable',
    );
    expect(benGroup.querySelector<HTMLButtonElement>('[data-session-stop-all]')!.disabled).toBe(
      false,
    );
  });

  it('wires Session Stop, Bot Stop and Open in Sessions for a Group', async () => {
    window.localStorage.removeItem(SESSION_TARGET_KEY);
    const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
    const call: BridgeCall = async (endpoint, payload) => {
      calls.push({ endpoint, payload });
      return {
        ok: true,
        value: {
          stopped: [{ botSlug: payload['botSlug'], sessionId: 's', role: 'assignment' }],
          alreadyIdle: [],
        },
      };
    };
    const actions = createActions(call, createStore());
    const channel = {
      id: 'group-1',
      type: 'group',
      name: 'Launch',
      members: ['ada', 'ben'],
    } as unknown as ChannelSummary;
    let open = true;
    const render = () =>
      root.render(
        <ConversationSessionStop
          channel={channel}
          groups={groupsOf([ada()])}
          controller={{ open, setOpen: (next) => (open = next), toggle: () => (open = !open) }}
          actions={actions}
          t={enTranslate}
        />,
      );
    await act(async () => render());
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>('[data-session-stop-row="ada-a"] [data-session-stop]')!
        .click(),
    );
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[data-session-stop-all]')!.click(),
    );
    expect(
      calls
        .filter((item) => item.endpoint.endsWith('Stop'))
        .map((item) => [item.endpoint, item.payload]),
    ).toEqual([
      ['sessionStop', { botSlug: 'ada', activityId: 'ada-a', channelId: 'group-1' }],
      ['botStop', { botSlug: 'ada', channelId: 'group-1' }],
    ]);
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[data-session-stop-open-sessions]')!.click(),
    );
    expect(open).toBe(false);
    expect(openPanel).toHaveBeenCalledWith('sessions');
    expect(JSON.parse(window.localStorage.getItem(SESSION_TARGET_KEY) ?? '{}')).toEqual({
      'group-1': 'ada',
    });
  });
});

describe('Bot Stop action', () => {
  it('runs Bot Stop and reports a Bot with nothing running', async () => {
    const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
    let working = true;
    const call: BridgeCall = async (endpoint, payload) => {
      calls.push({ endpoint, payload });
      if (endpoint === 'botStop') {
        const stopped = working ? [{ botSlug: 'ada', sessionId: 's-1', role: 'orchestrator' }] : [];
        working = false;
        return {
          ok: true,
          value: {
            stopped,
            alreadyIdle: [],
            ...(stopped.length > 0 ? { messageId: 'turn-stopped-1' } : {}),
          },
        };
      }
      return { ok: false, error: { code: 'unavailable', message: endpoint, details: {} } };
    };
    const actions = createActions(call, createStore());

    await expect(actions.stopBot('dm-ada', 'ada')).resolves.toBe('stopped');
    await expect(actions.stopBot('dm-ada', 'ada')).resolves.toBe('not-working');
    expect(calls.filter((item) => item.endpoint === 'botStop')).toEqual([
      { endpoint: 'botStop', payload: { botSlug: 'ada', channelId: 'dm-ada' } },
      { endpoint: 'botStop', payload: { botSlug: 'ada', channelId: 'dm-ada' } },
    ]);
  });
});
