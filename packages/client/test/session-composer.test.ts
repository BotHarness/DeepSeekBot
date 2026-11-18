// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
  IconAgentPresetOutlineRegular: () => null,
  IconCodeOutlineRegular: () => null,
  IconBranchOutlineRegular: () => null,
  IconCheckOutlineRegular: () => null,
  Button: ({
    children,
    icon: _icon,
    ...props
  }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { icon?: unknown }>) =>
    createElement('button', props, children),
  FileTypeIcon: () => null,
  fileSizeText: (size: number) => `${size} B`,
  IconCloseOutlineRegular: () => null,
  IconPaperclipOutlineRegular: () => null,
  IconSendOutlineRegular: () => null,
  IconSkillOutlineRegular: () => null,
  ImageLightbox: () => null,
}));

import { ChannelComposer } from '../src/client/channel-composer.js';
import { rendersHumanMarkdown } from '../src/client/human-markdown.js';
import {
  readRichMentionDraft,
  renderRichMentionDraft,
  setRichSelection,
} from '../src/client/rich-mention-editor.js';
import {
  activeSessionQuery,
  composerSessionOptions,
  deleteSessionReference,
  rankSessionOptions,
  selectSession,
  sessionReferenceRuns,
  sessionReferenceText,
  type ComposerSessionOption,
} from '../src/client/session-refs.js';
import type { BotSummary, ChannelMessage, OwnedSessionSummary } from '../src/client/store.js';

const bot = (slug: string, displayName: string): BotSummary => ({
  slug,
  displayName,
  roles: [],
  aggregateState: 'idle',
  workspaces: [],
  createdAt: '2026-11-15T00:00:00.000Z',
});
const ada = bot('ada', 'Ada');
const ben = bot('ben', 'Ben');

const assignment = (
  sessionId: string,
  title: string,
  extra: Partial<OwnedSessionSummary> = {},
): OwnedSessionSummary => ({
  sessionId,
  role: 'assignment',
  createdAt: '2026-11-17T00:00:00.000Z',
  assignmentTitle: title,
  ...extra,
});

const byId = (id: string): ComposerSessionOption =>
  options.find((option) => option.sessionId === id)!;

const options: ComposerSessionOption[] = composerSessionOptions([
  {
    botSlug: 'ada',
    bot: ada,
    items: [
      { sessionId: 'orch-1', role: 'orchestrator', createdAt: '2026-11-17T00:00:00.000Z' },
      assignment('asg-slug', '改进 slug.js 的 slugify'),
      assignment('asg-old', '整理发布说明', { assignmentArchived: true }),
    ],
  },
  {
    botSlug: 'ben',
    bot: ben,
    items: [
      assignment('asg-shop', '重构 shop 后端'),
      assignment('asg-done', '给 calc.js 写测试', { assignmentArchived: true }),
    ],
  },
]);

describe('session references', () => {
  it('keeps only Assignment Sessions and marks archived ones done', () => {
    expect(options.map((option) => [option.sessionId, option.botSlug, option.done]).sort()).toEqual(
      [
        ['asg-done', 'ben', true],
        ['asg-old', 'ada', true],
        ['asg-shop', 'ben', false],
        ['asg-slug', 'ada', false],
      ],
    );
    expect(
      composerSessionOptions([
        {
          botSlug: 'ben',
          bot: ben,
          items: [assignment('asg-stopped', '已停止的任务', { assignmentActivity: 'stopped' })],
        },
      ]).map((option) => option.done),
    ).toEqual([false]);
  });

  it('lists live sessions for a bare / and searches every session once filtered', () => {
    expect(rankSessionOptions(options, '').map((option) => option.sessionId)).toEqual([
      'asg-slug',
      'asg-shop',
    ]);
    expect(rankSessionOptions(options, '整理').map((option) => option.sessionId)).toEqual([
      'asg-old',
    ]);
    expect(rankSessionOptions(options, '.js').map((option) => option.sessionId)).toEqual([
      'asg-slug',
      'asg-done',
    ]);
    expect(rankSessionOptions(options, 'ben').map((option) => option.sessionId)).toEqual([
      'asg-shop',
      'asg-done',
    ]);
    expect(rankSessionOptions(options, 'chonggou').map((option) => option.sessionId)).toEqual([
      'asg-shop',
    ]);
  });

  it('opens a / query on CJK text after whitespace only', () => {
    expect(activeSessionQuery('看 /改进', 5)).toEqual({ start: 2, end: 5, query: '改进' });
    expect(activeSessionQuery('a/b', 3)).toBeUndefined();
    expect(activeSessionQuery('/x y', 4)).toBeUndefined();
  });

  it('writes the same session: link Bots use and escapes brackets in titles', () => {
    expect(sessionReferenceText({ sessionId: 'asg-1', title: 'fix [a]\nb' })).toBe(
      '[fix \\[a\\] b](session:asg-1)',
    );
    expect(() => sessionReferenceText({ sessionId: 'bad id', title: 'x' })).toThrow();
    const picked = selectSession('看 /改进', { start: 2, end: 5, query: '改进' }, byId('asg-slug'));
    expect(picked.value).toBe('看 [改进 slug.js 的 slugify](session:asg-slug) ');
    expect(sessionReferenceRuns(picked.value)[1]?.session).toEqual({
      sessionId: 'asg-slug',
      title: '改进 slug.js 的 slugify',
    });
    expect(
      deleteSessionReference(picked.value, { start: picked.caret, end: picked.caret }, 'Backspace'),
    ).toEqual({ value: '看 ', caret: 2 });
  });

  it('renders a reference as one chip with the Bot avatar and reads the link back', () => {
    const editor = document.createElement('div');
    document.body.append(editor);
    const value = '看 [改进 slug.js 的 slugify](session:asg-slug) 呢';
    const mounts = renderRichMentionDraft(editor, value, [], [ada], [], [], [], options);
    expect(mounts).toMatchObject([{ botSlug: 'ada', name: 'Ada' }]);
    const chip = editor.querySelector<HTMLElement>('.bh-inline-session');
    expect(chip?.dataset['sessionId']).toBe('asg-slug');
    expect(chip?.textContent).toBe('改进 slug.js 的 slugify');
    expect(chip?.querySelector('svg')).not.toBeNull();
    expect(readRichMentionDraft(editor).value).toBe(value);
    setRichSelection(editor, value.length - 2);
    editor.remove();
  });

  it('renders a Human message with a session reference as Markdown', () => {
    const message = {
      id: 'm1',
      author: { kind: 'human' },
      body: '看看 [改进 slug.js](session:asg-slug)',
    } as unknown as ChannelMessage;
    expect(rendersHumanMarkdown(message)).toBe(true);
  });
});

describe('composer / sessions', () => {
  it('asks for sessions, lists them with their Bot and inserts the pick as a chip', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const onSessionMenu = vi.fn();
    const changes: string[] = [];
    const show = (value: string) =>
      act(async () => {
        root.render(
          createElement(ChannelComposer, {
            value,
            sessionOptions: options,
            onSessionMenu,
            placeholder: 'Message',
            sending: false,
            onChange: (next: string) => changes.push(next),
            onSubmit: () => undefined,
          }),
        );
      });
    try {
      await show('/');
      const input = container.querySelector<HTMLElement>('.bh-composer-rich-input')!;
      setRichSelection(input, 1);
      await act(async () => {
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(onSessionMenu).toHaveBeenCalledTimes(1);
      const rows = [...container.querySelectorAll<HTMLElement>('[data-session-option]')];
      expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
        '改进 slug.js 的 slugify · Ada',
        '重构 shop 后端 · Ben',
      ]);
      expect(container.querySelector('.bh-composer-menu-section')?.textContent).toBe('会话');
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      });
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
      expect(changes.at(-1)).toBe('[重构 shop 后端](session:asg-shop) ');
      await show(changes.at(-1)!);
      expect(container.querySelector<HTMLElement>('.bh-inline-session')?.dataset['sessionId']).toBe(
        'asg-shop',
      );
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it('asks for sessions from the plain textarea before any are loaded', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const onSessionMenu = vi.fn();
    try {
      await act(async () => {
        root.render(
          createElement(ChannelComposer, {
            value: '',
            sessionOptions: [],
            onSessionMenu,
            placeholder: 'Message',
            sending: false,
            onChange: () => undefined,
            onSubmit: () => undefined,
          }),
        );
      });
      const input = container.querySelector('textarea')!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
          input,
          '/',
        );
        input.setSelectionRange(1, 1);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(onSessionMenu).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it('shows a finished session once the person filters for it', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          createElement(ChannelComposer, {
            value: '/calc',
            sessionOptions: options,
            placeholder: 'Message',
            sending: false,
            onChange: () => undefined,
            onSubmit: () => undefined,
          }),
        );
      });
      const input = container.querySelector<HTMLElement>('.bh-composer-rich-input')!;
      setRichSelection(input, 5);
      await act(async () => {
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      const row = container.querySelector<HTMLElement>('[data-session-option="asg-done"]');
      expect(row?.textContent).toContain('Ben · 已结束');
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
