// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
}));
const dshTour = vi.hoisted(() =>
  vi.fn((..._args: unknown[]) => () => {}),
);
vi.mock('../src/client/internal-tour.js', () => ({ startInternalTour: dshTour }));
vi.mock('../src/client/bot-icon.js', () => ({
  BotIcon: () => createElement('span', { 'data-icon': 'bot' }),
}));

import type { SessionBotOwner } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import {
  SessionOwnerLeading,
  SessionReturnAction,
  SessionReturnMenuItem,
} from '../src/client/session-return-action.js';

const OWNER: SessionBotOwner = {
  botSlug: 'qa-bot',
  displayName: 'QA Bot',
  role: 'assignment',
};

function setup(
  resolveOwner: (sessionId: string, signal: AbortSignal) => Promise<SessionBotOwner | undefined>,
  returnToBot: (slug: string) => Promise<void> = vi.fn(async (_slug: string) => undefined),
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const setMenuOpen = vi.fn();
  const props = {
    sessionId: 'assignment-1',
    displayTitle: 'Assignment',
    useMenuOpenState: () => [true, setMenuOpen] as const,
    resolveOwner,
    returnToBot,
    t: zhTranslate,
  };
  return {
    host,
    root,
    props,
    returnToBot,
    setMenuOpen,
    async render() {
      await act(async () => root.render(createElement(SessionReturnMenuItem, props as never)));
    },
    async dispose() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

describe('native Session menu return to PersonaBot', () => {
  it('shows no entry for an unowned or Subagent Session', async () => {
    const view = setup(vi.fn(async () => undefined));
    try {
      await view.render();
      expect(view.host.querySelector('button')).toBeNull();
    } finally {
      await view.dispose();
    }
  });

  it('shows the Bot icon and returns the owned Assignment to its DM', async () => {
    const resolver = vi.fn(async () => OWNER);
    const view = setup(resolver);
    try {
      await view.render();
      const button = view.host.querySelector('button');
      expect(button?.textContent).toContain('返回 Bot 私聊');
      expect(button?.querySelector('[data-icon="bot"]')).not.toBeNull();
      await act(async () => button?.click());
      expect(resolver).toHaveBeenCalledWith('assignment-1', expect.any(AbortSignal));
      expect(view.returnToBot).toHaveBeenCalledExactlyOnceWith('qa-bot');
      expect(view.setMenuOpen).toHaveBeenCalledExactlyOnceWith(false);
    } finally {
      await view.dispose();
    }
  });

  it('does not show a previous Session owner while a new lookup is pending', async () => {
    let resolveNext: ((owner: SessionBotOwner | undefined) => void) | undefined;
    const resolver = vi.fn((sessionId: string) =>
      sessionId === 'assignment-1'
        ? Promise.resolve(OWNER)
        : new Promise<SessionBotOwner | undefined>((resolve) => {
            resolveNext = resolve;
          }),
    );
    const view = setup(resolver);
    try {
      await view.render();
      expect(view.host.querySelector('button')).not.toBeNull();
      await act(async () => {
        view.root.render(
          createElement(SessionReturnMenuItem, {
            ...view.props,
            sessionId: 'native-2',
          } as never),
        );
      });
      expect(view.host.querySelector('button')).toBeNull();
      await act(async () => resolveNext?.(undefined));
      expect(view.host.querySelector('button')).toBeNull();
    } finally {
      await view.dispose();
    }
  });
  it('ignores an earlier Session return failure after the row changes Session', async () => {
    let rejectPrevious: ((reason: Error) => void) | undefined;
    const returnToBot = vi.fn(
      (_slug: string) =>
        new Promise<void>((_resolve, reject) => {
          rejectPrevious = reject;
        }),
    );
    const view = setup(
      vi.fn(async () => OWNER),
      returnToBot,
    );
    try {
      await view.render();
      await act(async () => view.host.querySelector('button')?.click());
      expect(view.host.querySelector<HTMLButtonElement>('button')?.disabled).toBe(true);
      await act(async () =>
        view.root.render(
          createElement(SessionReturnMenuItem, {
            ...view.props,
            sessionId: 'assignment-2',
          } as never),
        ),
      );
      expect(view.host.querySelector<HTMLButtonElement>('button')?.disabled).toBe(false);
      await act(async () => rejectPrevious?.(new Error('old Session failed')));
      expect(view.host.querySelector('button')?.textContent).toContain('返回 Bot 私聊');
      expect(view.setMenuOpen).not.toHaveBeenCalled();
    } finally {
      await view.dispose();
    }
  });

  it('does not apply an old return failure after an A-B-A Session switch', async () => {
    let rejectPrevious: ((reason: Error) => void) | undefined;
    const returnToBot = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectPrevious = reject;
        }),
    );
    const view = setup(
      vi.fn(async () => OWNER),
      returnToBot,
    );
    try {
      await view.render();
      await act(async () => view.host.querySelector('button')?.click());
      expect(view.host.querySelector<HTMLButtonElement>('button')?.disabled).toBe(true);
      await act(async () =>
        view.root.render(
          createElement(SessionReturnMenuItem, {
            ...view.props,
            sessionId: 'assignment-2',
          } as never),
        ),
      );
      await view.render();
      expect(view.host.querySelector<HTMLButtonElement>('button')?.disabled).toBe(false);
      await act(async () => rejectPrevious?.(new Error('old Session failed')));
      expect(view.host.querySelector('button')?.textContent).toContain('返回 Bot 私聊');
      expect(view.setMenuOpen).not.toHaveBeenCalled();
    } finally {
      await view.dispose();
    }
  });

  it('keeps the menu open and shows a localized retry message when navigation fails', async () => {
    const returnToBot = vi.fn(async () => {
      throw new Error('navigation failed');
    });
    const view = setup(
      vi.fn(async () => OWNER),
      returnToBot,
    );
    try {
      await view.render();
      await act(async () => view.host.querySelector('button')?.click());
      expect(view.setMenuOpen).not.toHaveBeenCalled();
      expect(view.host.querySelector('button')?.textContent).toContain('打开私聊失败，请重试');
    } finally {
      await view.dispose();
    }
  });
});

describe('native Session row PersonaBot avatar', () => {
  it('shows the owning Bot avatar only for an owned Session', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const resolver = vi.fn(async (sessionId: string) =>
      sessionId === 'assignment-1' ? OWNER : undefined,
    );
    try {
      await act(async () =>
        root.render(
          createElement(SessionOwnerLeading, {
            sessionId: 'assignment-1',
            resolveOwner: resolver,
            t: zhTranslate,
          } as never),
        ),
      );
      const avatar = host.querySelector('.bh-native-session-owner');
      expect(avatar?.getAttribute('role')).toBe('img');
      expect(avatar?.getAttribute('aria-label')).toContain('QA Bot');
      expect(avatar?.getAttribute('data-state')).toBe('idle');
      await act(async () =>
        root.render(
          createElement(SessionOwnerLeading, {
            sessionId: 'unowned-session',
            resolveOwner: resolver,
            t: zhTranslate,
          } as never),
        ),
      );
      expect(host.querySelector('.bh-native-session-owner')).toBeNull();
      expect(
        host
          .querySelector('[data-bh-native-session-owner="unowned"]')
          ?.getAttribute('data-session-id'),
      ).toBe('unowned-session');
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});

describe('SessionReturnAction onboarding', () => {
  it('continues the sessions walkthrough only after a jump from Bot mode', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    localStorage.clear();
    sessionStorage.setItem('botharness/onboarding/sessions-tour', `${Date.now()}:2`);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const returnToBot = vi.fn(async (_slug: string) => undefined);
    const props = {
      sessionId: 'orchestrator-1',
      resolveOwner: async () => OWNER,
      returnToBot,
      t: zhTranslate,
    };
    await act(async () => root.render(createElement(SessionReturnAction, props as never)));
    expect(localStorage.getItem('botharness/onboarding/sessions-seen')).toBe('1');
    expect(sessionStorage.getItem('botharness/onboarding/sessions-tour')).toBeNull();
    expect(dshTour).toHaveBeenCalledOnce();
    const specs = dshTour.mock.calls[0]![0] as { selector: string; fallback?: string }[];
    expect(specs).toMatchObject([
      {
        selector: '[role="tree"] [data-row-key="session:orchestrator-1"]',
        fallback: '[role="tree"]',
      },
      { selector: '.bh-session-return-action' },
    ]);
    const options = dshTour.mock.calls[0]![1] as { skipLabel?: string; onFinished(): void };
    expect(options.skipLabel).toBeUndefined();
    expect(options).toMatchObject({ progress: { offset: 2 } });
    await act(async () => options.onFinished());
    expect(returnToBot).toHaveBeenCalledWith('qa-bot');
    expect(sessionStorage.getItem('botharness/onboarding/sessions-return')).toBe('1');
    await act(async () =>
      root.render(createElement(SessionReturnAction, { ...props, sessionId: 'other' } as never)),
    );
    expect(dshTour).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
    host.remove();
  });
});
