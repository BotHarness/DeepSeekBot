// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconAgentPresetOutlineRegular: () => null,
  IconCodeOutlineRegular: () => null,
  IconBranchOutlineRegular: () => null,
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
  ImageLightbox: () => null,
}));

import { botNameColor } from '../src/client/bot-primary-color.js';
import { ChannelComposer } from '../src/client/channel-composer.js';
import { attachmentReferenceText } from '../src/client/attachment-refs.js';
import { deleteSelectedMention } from '../src/client/mentions.js';
import {
  deleteSelectedChannelRef,
  referenceRuns,
  selectChannelRef,
} from '../src/client/channel-refs.js';
import {
  insertRichPlainText,
  readRichMentionDraft,
  renderRichMentionDraft,
  richSelectionOffsets,
  setRichSelection,
} from '../src/client/rich-mention-editor.js';

describe('rich mention editor', () => {
  it('keeps a trailing line editable after an attachment and repeated line breaks', () => {
    const editor = document.createElement('div');
    document.body.append(editor);
    const attachment = {
      id: 'report',
      file: new File(['hello'], 'report.txt'),
      status: 'uploading' as const,
    };
    const reference = attachmentReferenceText(attachment);
    renderRichMentionDraft(editor, `${reference} `, [], [], [], [attachment]);
    setRichSelection(editor, reference.length + 1);
    insertRichPlainText(editor, '\n');
    expect(editor.querySelectorAll('br')).toHaveLength(2);
    expect(readRichMentionDraft(editor).value).toBe(`${reference} \n`);
    expect(richSelectionOffsets(editor)?.end).toBe(reference.length + 2);
    insertRichPlainText(editor, '\n');
    expect(editor.querySelectorAll('br')).toHaveLength(3);
    insertRichPlainText(editor, 'next line');
    expect(readRichMentionDraft(editor).value).toBe(`${reference} \n\nnext line`);
    renderRichMentionDraft(editor, `${reference} \n`, [], [], [], [attachment]);
    expect(editor.querySelectorAll('br')).toHaveLength(2);
    setRichSelection(editor, reference.length + 2);
    insertRichPlainText(editor, 'after render');
    expect(readRichMentionDraft(editor).value).toBe(`${reference} \nafter render`);
    editor.remove();
  });
  it('round-trips attachment identity and caret offsets beside mentions', () => {
    const editor = document.createElement('div');
    document.body.append(editor);
    const attachment = {
      id: 'report',
      file: new File(['hello'], 'report.txt'),
      status: 'uploading' as const,
    };
    const text = attachmentReferenceText(attachment);
    const value = `@Ada use ${text} please`;
    const mentions = [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }];
    renderRichMentionDraft(editor, value, mentions, [], [], [attachment]);
    const chip = editor.querySelector<HTMLElement>('[data-attachment-id="report"]')!;
    expect(chip.contentEditable).toBe('false');
    expect(chip.textContent).toBe('1report.txt5 B');
    expect(readRichMentionDraft(editor)).toEqual({ value, mentions, channelRefs: [] });
    setRichSelection(editor, 9 + text.length);
    expect(richSelectionOffsets(editor)).toEqual({ start: 9 + text.length, end: 9 + text.length });
    insertRichPlainText(editor, ' next');
    expect(readRichMentionDraft(editor).value).toBe(`@Ada use ${text} next please`);
    editor.remove();
  });
  it('numbers repeated references by attachment order and renumbers after removal', () => {
    const editor = document.createElement('div');
    const first = { id: 'first', file: new File(['a'], 'same.txt'), status: 'ready' as const };
    const second = { id: 'second', file: new File(['b'], 'same.txt'), status: 'ready' as const };
    const text = attachmentReferenceText(second);
    const value = `${text} again ${text}`;
    renderRichMentionDraft(editor, value, [], [], [], [first, second]);
    expect(
      Array.from(editor.querySelectorAll('.bh-attachment-ordinal'), (node) => node.textContent),
    ).toEqual(['2', '2']);
    renderRichMentionDraft(editor, value, [], [], [], [second]);
    expect(
      Array.from(editor.querySelectorAll('.bh-attachment-ordinal'), (node) => node.textContent),
    ).toEqual(['1', '1']);
    expect(readRichMentionDraft(editor).value).toBe(value);
  });

  it('keeps the All Bots preview through editing and shows its count without a synthetic Bot ID', () => {
    const editor = document.createElement('div');
    const preview = {
      revision: 'snapshot',
      recipients: [
        { botSlug: 'ada', label: 'Ada' },
        { botSlug: 'bea', label: 'Bea' },
      ],
    };
    renderRichMentionDraft(
      editor,
      '@All Bots check',
      [{ kind: 'all-bots', preview, label: 'All Bots', start: 0, end: 9 }],
      [],
    );
    expect(editor.querySelector('[data-all-bot-preview]')?.textContent).toBe('@All Bots · 2');
    expect(editor.querySelector('[data-bot-id]')).toBeNull();
    expect(readRichMentionDraft(editor)).toEqual({
      value: '@All Bots check',
      mentions: [{ kind: 'all-bots', preview, label: 'All Bots', start: 0, end: 9 }],
      channelRefs: [],
    });
    expect(
      deleteSelectedMention(
        '@All Bots check',
        [{ kind: 'all-bots', preview, label: 'All Bots', start: 0, end: 9 }],
        9,
        9,
        'Backspace',
      ),
    ).toMatchObject({ value: 'check', mentions: [] });
  });
  it('renders the same avatar badge inside the live Group composer', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          createElement(ChannelComposer, {
            value: '@Ada hello',
            mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
            mentionCandidates: [
              {
                slug: 'ada',
                displayName: 'Ada',
                avatar: '/avatars/ada.png',
                roles: [],
                aggregateState: 'idle',
                workspaces: [],
                createdAt: '2026-09-25T00:00:00.000Z',
              },
            ],
            placeholder: 'Message',
            sending: false,
            onChange: () => undefined,
            onSubmit: () => undefined,
          }),
        );
      });
      const editor = container.querySelector<HTMLElement>('.bh-composer-rich-input');
      const badge = editor?.querySelector<HTMLElement>('.bh-composer-inline-mention');
      expect(editor?.textContent).toBe('Ada hello');
      expect(badge?.textContent).toBe('Ada');
      expect(badge?.querySelector('img')?.getAttribute('src')).toBe('/avatars/ada.png');
      expect(editor?.querySelector('textarea')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it('colors composer Bot tokens and candidate names from the saved Bot Primary Color', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const candidate = (slug: string, color?: string) => ({
      slug,
      displayName: 'Ada',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '2026-10-12T00:00:00.000Z',
      ...(color === undefined ? {} : { primaryColor: { mode: 'custom' as const, color } }),
    });
    const changes: Array<[string, unknown]> = [];
    const show = (value: string, ada: ReturnType<typeof candidate>) =>
      act(async () => {
        root.render(
          createElement(ChannelComposer, {
            value,
            mentions:
              value === '@'
                ? []
                : [
                    { botSlug: 'ada', label: 'Ada', start: 0, end: 4 },
                    { botSlug: 'bea', label: 'Ada', start: 5, end: 9 },
                  ],
            mentionCandidates: [ada, candidate('bea', '#000000')],
            placeholder: 'Message',
            sending: false,
            onChange: (next: string, mentions: unknown) => changes.push([next, mentions]),
            onSubmit: () => undefined,
          }),
        );
      });
    const token = (slug: string) =>
      container.querySelector<HTMLElement>(
        `.bh-composer-inline-mention[data-bot-id="${slug}"] > span:last-child`,
      )!;
    try {
      await show('@Ada @Ada hi #Team', candidate('ada', '#ffffff'));
      expect(token('ada').dataset['botNameColor']).toBe(botNameColor('#ffffff', '#ffffff'));
      expect(token('ada').dataset['botNameColor']).not.toBe('#ffffff');
      expect(token('bea').dataset['botNameColor']).toBe('#000000');
      expect(token('bea').style.color).not.toBe('');

      document.body.setAttribute('data-ds-dark-theme', '');
      await act(async () => new Promise((done) => setTimeout(done, 0)));
      expect(token('ada').dataset['botNameColor']).toBe('#ffffff');
      expect(token('bea').dataset['botNameColor']).not.toBe('#000000');
      document.body.removeAttribute('data-ds-dark-theme');
      await act(async () => new Promise((done) => setTimeout(done, 0)));

      await show('@Ada @Ada hi #Team', candidate('ada', '#d9475a'));
      expect(token('ada').dataset['botNameColor']).toBe(botNameColor('#d9475a', '#ffffff'));
      const editor = container.querySelector<HTMLElement>('.bh-composer-rich-input')!;
      expect(readRichMentionDraft(editor).mentions.map((mention) => mention.botSlug)).toEqual([
        'ada',
        'bea',
      ]);

      await show('@', candidate('ada', '#d9475a'));
      const input = container.querySelector<HTMLElement>('.bh-composer-rich-input')!;
      setRichSelection(input, 1);
      await act(async () => {
        input.dispatchEvent(new Event('input', { bubbles: true }));
        document.dispatchEvent(new Event('selectionchange'));
      });
      const names = [
        ...container.querySelectorAll<HTMLElement>(
          '.bh-mention-option-copy strong[data-bot-name-color]',
        ),
      ];
      expect(names.map((name) => name.dataset['botNameColor'])).toEqual([
        botNameColor('#d9475a', '#ffffff'),
        '#000000',
      ]);
    } finally {
      document.body.removeAttribute('data-ds-dark-theme');
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it('shows names without @ while round-tripping stable IDs and raw offsets', () => {
    const editor = document.createElement('div');
    document.body.append(editor);
    const value = '@Ada hi @Bea';
    const mentions = [
      { botSlug: 'ada', label: 'Ada', start: 0, end: 4 },
      { botSlug: 'bea', label: 'Bea', start: 8, end: 12 },
    ];
    const mounts = renderRichMentionDraft(editor, value, mentions, []);
    expect(editor.textContent).toBe('Ada hi Bea');
    expect(mounts.map((item) => item.botSlug)).toEqual(['ada', 'bea']);
    expect(readRichMentionDraft(editor)).toEqual({ value, mentions, channelRefs: [] });

    setRichSelection(editor, 4);
    expect(richSelectionOffsets(editor)).toEqual({ start: 4, end: 4 });
    insertRichPlainText(editor, ' there');
    expect(readRichMentionDraft(editor)).toEqual({
      value: '@Ada there hi @Bea',
      mentions: [mentions[0], { botSlug: 'bea', label: 'Bea', start: 14, end: 18 }],
      channelRefs: [],
    });
    editor.remove();
  });

  it('keeps pasted @text plain and removes a selected token as one unit', () => {
    const editor = document.createElement('div');
    document.body.append(editor);
    const mention = { botSlug: 'ada', label: 'Ada', start: 0, end: 4 };
    renderRichMentionDraft(editor, '@Ada hello', [mention], []);
    setRichSelection(editor, 10);
    insertRichPlainText(editor, ' @NotSelected');
    const draft = readRichMentionDraft(editor);
    expect(draft.value).toBe('@Ada hello @NotSelected');
    expect(draft.mentions).toEqual([mention]);
    expect(deleteSelectedMention(draft.value, draft.mentions, 5, 5, 'Backspace')).toEqual({
      value: 'hello @NotSelected',
      mentions: [],
      caret: 0,
    });
    editor.remove();
  });
  it('round-trips a selected Group reference beside a Bot mention and deletes it atomically', () => {
    const editor = document.createElement('div');
    document.body.append(editor);
    const value = '@Ada please use #Planning';
    const mentions = [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }];
    const refs = [{ channelId: 'group-planning', label: 'Planning', start: 16, end: 25 }];
    renderRichMentionDraft(editor, value, mentions, [], refs);
    expect(editor.querySelector('[data-channel-id="group-planning"]')?.textContent).toBe(
      '#Planning',
    );
    expect(readRichMentionDraft(editor)).toEqual({ value, mentions, channelRefs: refs });
    expect(referenceRuns(value, mentions, refs).map((run) => run.text)).toEqual([
      '@Ada',
      ' please use ',
      '#Planning',
    ]);
    expect(deleteSelectedChannelRef(value, refs, 25, 25, 'Backspace')).toEqual({
      value: '@Ada please use ',
      refs: [],
      caret: 16,
    });
    editor.remove();
  });

  it('keeps a typed #name inert until chosen from the Group picker', () => {
    const value = 'Please use #Planning';
    expect(referenceRuns(value, [], [])).toEqual([{ text: value }]);
    const selected = selectChannelRef(
      value,
      [],
      { start: 11, end: 20, query: 'Planning' },
      'group-planning',
      'Planning',
    );
    expect(selected.refs).toEqual([
      { channelId: 'group-planning', label: 'Planning', start: 11, end: 20 },
    ]);
  });
});
