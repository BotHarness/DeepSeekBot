// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const hoverCards = vi.hoisted(() => [] as Record<string, unknown>[]);

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { createElement: h } = await import('react');
  return {
    IconNewChatOutlineRegular: () => null,
    IconUserOutlineRegular: () => null,
    HoverCard: (props: { anchor: never; content: never }) => {
      hoverCards.push(props);
      return h('span', { 'data-hover-card': 'true' }, props.anchor, props.content);
    },
  };
});

import { PersonaBotAvatar } from '../src/client/avatar.js';
import { en, zhTranslate, type BotHarnessTranslate } from '../src/client/locale.js';
import {
  MESSAGE_AUTHOR_CARD_DELAY_MS,
  MessageAuthorCardContent,
  MessageAuthorHoverCard,
  messageAuthorCardModel,
} from '../src/client/message-author-card.js';
import type { BotSummary } from '../src/client/store.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const enTranslate: BotHarnessTranslate = ((key: string, params?: Record<string, unknown>) => {
  let text: string = (en as Record<string, string>)[key] ?? key;
  for (const [name, value] of Object.entries(params ?? {}))
    text = text.replace(`{${name}}`, String(value));
  return text;
}) as BotHarnessTranslate;

const ADA: BotSummary = {
  slug: 'ada',
  displayName: 'Ada',
  roles: ['Researcher', 'Reviewer'],
  description: 'Reads papers and reviews drafts.',
  aggregateState: 'working',
  activity: {
    effect: 'searching',
    toolKind: 'search',
    toolName: 'web_search',
    startedAt: 0,
    activeToolCount: 1,
  },
  workspaces: [],
  createdAt: '2026-09-21T00:00:00.000Z',
};

const { activity: _activity, ...IDLE_ADA } = ADA;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('messageAuthorCardModel', () => {
  it('shows a PersonaBot with roles, description and the sidebar activity summary', () => {
    const model = messageAuthorCardModel({ kind: 'bot', bot: ADA }, undefined, zhTranslate);
    expect(model).toMatchObject({
      kind: 'bot',
      slug: 'ada',
      name: 'Ada',
      roles: 'Researcher · Reviewer',
      description: 'Reads papers and reviews drafts.',
      state: 'working',
      canMessage: true,
      canProfile: true,
    });
    expect(model.kind === 'bot' && model.status).toContain('web_search');
  });

  it('hides the DM entry inside that Bot DM and both entries for a deleted Bot', () => {
    const inDm = messageAuthorCardModel({ kind: 'bot', bot: ADA }, 'ada', zhTranslate);
    expect(inDm).toMatchObject({ canMessage: false, canProfile: true });
    const deleted = messageAuthorCardModel(
      { kind: 'bot', bot: { ...ADA, deleted: true, roles: [], description: ' ' } },
      undefined,
      zhTranslate,
    );
    expect(deleted).toMatchObject({
      canMessage: false,
      canProfile: false,
      roles: undefined,
      description: undefined,
    });
  });

  it('normalizes an unknown Host state to idle', () => {
    const model = messageAuthorCardModel(
      { kind: 'bot', bot: { ...IDLE_ADA, aggregateState: 'mystery' } },
      undefined,
      enTranslate,
    );
    expect(model).toMatchObject({ state: 'idle' });
  });

  it('keeps a Human author to the name only', () => {
    expect(messageAuthorCardModel({ kind: 'human', name: 'Lin' }, 'ada', zhTranslate)).toEqual({
      kind: 'human',
      name: 'Lin',
    });
  });
});

describe('MessageAuthorCardContent', () => {
  it('renders the Bot card with status and localized Message/Profile buttons', () => {
    const model = messageAuthorCardModel({ kind: 'bot', bot: ADA }, undefined, enTranslate);
    const markup = renderToStaticMarkup(
      createElement(MessageAuthorCardContent, {
        model,
        bot: ADA,
        onMessage: () => undefined,
        onProfile: () => undefined,
        t: enTranslate,
      }),
    );
    expect(markup).toContain('data-author-kind="bot"');
    expect(markup).toContain('data-state="working"');
    expect(markup).toContain('Researcher · Reviewer');
    expect(markup).toContain('Reads papers and reviews drafts.');
    expect(markup).toContain('>Status<');
    expect(markup).toContain('>Message<');
    expect(markup).toContain('>Profile<');
    expect(markup).toContain('aria-label="Open DM with Ada"');
    expect(markup).not.toContain('title=');
  });

  it('renders Chinese button labels and omits the DM entry in the current DM', () => {
    const model = messageAuthorCardModel({ kind: 'bot', bot: ADA }, 'ada', zhTranslate);
    const markup = renderToStaticMarkup(
      createElement(MessageAuthorCardContent, {
        model,
        bot: ADA,
        onMessage: () => undefined,
        onProfile: () => undefined,
        t: zhTranslate,
      }),
    );
    expect(markup).not.toContain('>私聊<');
    expect(markup).toContain('>资料<');
  });

  it('renders only the name for a Human author', () => {
    const markup = renderToStaticMarkup(
      createElement(MessageAuthorCardContent, {
        model: { kind: 'human', name: 'Lin' },
        t: zhTranslate,
      }),
    );
    expect(markup).toBe(
      '<div class="bh-author-card" data-author-kind="human"><span class="bh-author-card-name">Lin</span></div>',
    );
  });
});

describe('MessageAuthorHoverCard', () => {
  it('opens inline on hover or focus after a short delay and routes Message and Profile', async () => {
    hoverCards.length = 0;
    const openBot = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const model = messageAuthorCardModel({ kind: 'bot', bot: ADA }, undefined, enTranslate);
    await act(async () => {
      root.render(
        createElement(MessageAuthorHoverCard, {
          anchor: createElement('button', { type: 'button', className: 'anchor' }, 'Ada'),
          model,
          bot: ADA,
          onMessage: () => openBot('ada'),
          onProfile: () => openBot('ada', 'profile'),
          t: enTranslate,
        }),
      );
    });
    expect(hoverCards.at(-1)).toMatchObject({
      inline: true,
      openDelayMs: MESSAGE_AUTHOR_CARD_DELAY_MS,
    });
    expect(MESSAGE_AUTHOR_CARD_DELAY_MS).toBeLessThan(500);
    expect(host.querySelector('.anchor')).not.toBeNull();
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('.bh-author-card button')];
    expect(buttons.map((button) => button.textContent)).toEqual(['Message', 'Profile']);
    await act(async () => {
      buttons[0]!.click();
      buttons[1]!.click();
    });
    expect(openBot.mock.calls).toEqual([['ada'], ['ada', 'profile']]);
    await act(async () => root.unmount());
  });
});

describe('PersonaBotAvatar nativeTitle', () => {
  it('drops the native tooltip when a hover card explains the avatar', () => {
    const titled = renderToStaticMarkup(
      createElement(PersonaBotAvatar, { personaBotId: 'ada', name: 'Ada', size: 28 }),
    );
    const untitled = renderToStaticMarkup(
      createElement(PersonaBotAvatar, {
        personaBotId: 'ada',
        name: 'Ada',
        size: 28,
        nativeTitle: false,
      }),
    );
    expect(titled).toContain('title="Ada · ');
    expect(untitled).not.toContain('title=');
    expect(untitled).toContain('aria-label=');
  });
});
