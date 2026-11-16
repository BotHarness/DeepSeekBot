// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
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

import { ChannelComposer, type ComposerSkillOption } from '../src/client/channel-composer.js';
import { ComposerDraftStore } from '../src/client/composer-draft-store.js';
import {
  readRichMentionDraft,
  renderRichMentionDraft,
  setRichSelection,
} from '../src/client/rich-mention-editor.js';
import {
  activeSkillQuery,
  rebaseSkills,
  selectSkill,
  type SelectedSkill,
} from '../src/client/skill-refs.js';

const ada = {
  slug: 'ada',
  displayName: 'Ada',
  roles: [],
  aggregateState: 'idle' as const,
  workspaces: [],
  createdAt: '2026-11-15T00:00:00.000Z',
};

function storage() {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

describe('Skill tokens', () => {
  it('finds a /query after whitespace and picks a Skill as one token', () => {
    expect(activeSkillQuery('hi /su', 6, [])).toEqual({ start: 3, end: 6, query: 'su' });
    expect(activeSkillQuery('a/su', 4, [])).toBeUndefined();
    expect(activeSkillQuery('/su now', 7, [])).toBeUndefined();
    const picked = selectSkill(
      'hi /su',
      [],
      { start: 3, end: 6, query: 'su' },
      {
        name: 'summarize-pr',
        owner: { kind: 'bot', botSlug: 'ada' },
      },
    );
    expect(picked.value).toBe('hi /summarize-pr ');
    expect(picked.skills).toEqual([
      { name: 'summarize-pr', owner: { kind: 'bot', botSlug: 'ada' }, start: 3, end: 16 },
    ]);
    expect(rebaseSkills(picked.value, 'oh ' + picked.value, picked.skills)[0]?.start).toBe(6);
    expect(rebaseSkills(picked.value, 'hi /summarize', picked.skills)).toEqual([]);
  });

  it('renders Bot and Host Skill chips and reads their owners back', () => {
    const editor = document.createElement('div');
    document.body.append(editor);
    const value = '/pdf and /review';
    const skills: SelectedSkill[] = [
      { name: 'pdf', owner: { kind: 'host' }, start: 0, end: 4 },
      { name: 'review', owner: { kind: 'bot', botSlug: 'ada' }, start: 9, end: 16 },
    ];
    const mounts = renderRichMentionDraft(editor, value, [], [ada], [], [], skills);
    expect(
      mounts.map((mount) => (mount.kind === 'workspace' ? mount.workspaceId : mount.botSlug)),
    ).toEqual(['ada']);
    expect(
      [...editor.querySelectorAll<HTMLElement>('.bh-inline-skill')].map(
        (chip) => chip.dataset['skillOwner'],
      ),
    ).toEqual(['host', 'bot:ada']);
    expect(readRichMentionDraft(editor)).toMatchObject({ value, skills });
    editor.remove();
  });

  it('renders a Workspace Skill chip with a folder mount and its stable owner key', () => {
    const editor = document.createElement('div');
    document.body.append(editor);
    const value = '/deploy now';
    const skills: SelectedSkill[] = [
      {
        name: 'deploy',
        owner: { kind: 'workspace', workspaceId: 'grant-1', name: 'Shop' },
        start: 0,
        end: 7,
      },
    ];
    const mounts = renderRichMentionDraft(editor, value, [], [ada], [], [], skills);
    expect(mounts).toMatchObject([{ kind: 'workspace', workspaceId: 'grant-1', name: 'Shop' }]);
    const chip = editor.querySelector<HTMLElement>('.bh-inline-skill');
    expect(chip?.dataset['skillOwner']).toBe('workspace:grant-1');
    expect(chip?.title).toBe('Shop');
    expect(readRichMentionDraft(editor).skills[0]?.owner).toMatchObject({
      kind: 'workspace',
      workspaceId: 'grant-1',
    });
    editor.remove();
  });

  it('keeps Skill chips in a saved draft and rebases them when only text changes', () => {
    const local = storage();
    const first = new ComposerDraftStore(local, 'first');
    first.update('channel', {
      text: '/pdf now',
      skills: [{ name: 'pdf', owner: { kind: 'host' }, start: 0, end: 4 }],
    });
    first.update('channel', { text: 'go /pdf now' });
    expect(first.read('channel').draft.skills).toEqual([
      { name: 'pdf', owner: { kind: 'host' }, start: 3, end: 7 },
    ]);
    const second = new ComposerDraftStore(local, 'second');
    expect(second.read('channel').draft.skills).toEqual([
      { name: 'pdf', owner: { kind: 'host' }, start: 3, end: 7 },
    ]);
  });
});

describe('composer / menu', () => {
  it('lists commands before ranked Skills and inserts the picked Skill as a chip', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const options: ComposerSkillOption[] = [
      { name: 'pdf', description: 'Read PDFs', owner: { kind: 'host' } },
      {
        name: 'summarize-pr',
        description: 'Summarize a pull request in three bullets and nothing else at all',
        owner: { kind: 'bot', botSlug: 'ada' },
        bot: ada,
      },
    ];
    const changes: Array<{ value: string; skills: SelectedSkill[] | undefined }> = [];
    const show = (value: string, skills: SelectedSkill[] = []) =>
      act(async () => {
        root.render(
          createElement(ChannelComposer, {
            value,
            skills,
            skillOptions: options,
            context: {
              target: 'dm',
              content: null,
              shortcuts: [{ id: 'sessions', label: 'Sessions', run: () => undefined }],
            },
            placeholder: 'Message',
            sending: false,
            onChange: (next: string, _m: unknown, _c: unknown, skills?: SelectedSkill[]) =>
              changes.push({ value: next, skills }),
            onSubmit: () => undefined,
          }),
        );
      });
    try {
      await show('/s');
      const input = container.querySelector<HTMLElement>('.bh-composer-rich-input')!;
      setRichSelection(input, 2);
      await act(async () => {
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      const rows = [...container.querySelectorAll<HTMLElement>('.bh-composer-shortcuts button')];
      expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
        'Sessions',
        '/summarize-pr · Ada',
        '/pdf · 本机',
      ]);
      expect(container.querySelector('.bh-composer-menu-section')).not.toBeNull();
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      });
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
      expect(changes.at(-1)).toEqual({
        value: '/summarize-pr ',
        skills: [
          { name: 'summarize-pr', owner: { kind: 'bot', botSlug: 'ada' }, start: 0, end: 13 },
        ],
      });
      await show('/summarize-pr ', changes.at(-1)!.skills);
      expect(container.querySelector<HTMLElement>('.bh-inline-skill')?.dataset['skillOwner']).toBe(
        'bot:ada',
      );
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
  it('keeps a selected Skill chip out of command argument parsing', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const run = vi.fn();
    try {
      await act(async () => {
        root.render(
          createElement(ChannelComposer, {
            value: '/model fast',
            skills: [{ name: 'model', owner: { kind: 'host' }, start: 0, end: 6 }],
            skillOptions: [{ name: 'model', description: 'Pick a model', owner: { kind: 'host' } }],
            context: {
              target: 'dm',
              content: null,
              shortcuts: [
                {
                  id: 'model',
                  label: 'Model',
                  run: () => undefined,
                  choices: () => [{ id: 'model' as const, label: 'fast', run }],
                },
              ],
            },
            placeholder: 'Message',
            sending: false,
            onChange: () => undefined,
            onSubmit: () => undefined,
          }),
        );
      });
      const input = container.querySelector<HTMLElement>('.bh-composer-rich-input')!;
      setRichSelection(input, '/model fast'.length);
      await act(async () => {
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(container.querySelectorAll('.bh-composer-shortcuts button')).toHaveLength(0);
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
      expect(run).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
  it('gives the bare name to a command and keeps the same-named Skill selectable', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const run = vi.fn();
    const changes: Array<SelectedSkill[] | undefined> = [];
    const show = () =>
      act(async () => {
        root.render(
          createElement(ChannelComposer, {
            value: '/sessions',
            skillOptions: [
              {
                name: 'sessions',
                description: 'Summarize Sessions',
                owner: { kind: 'bot', botSlug: 'ada' },
                bot: ada,
              },
            ],
            context: {
              target: 'group',
              content: null,
              shortcuts: [{ id: 'sessions', label: 'Sessions', run }],
            },
            placeholder: 'Message',
            sending: false,
            onChange: (_v: string, _m: unknown, _c: unknown, skills?: SelectedSkill[]) =>
              changes.push(skills),
            onSubmit: () => undefined,
          }),
        );
      });
    try {
      await show();
      const input = container.querySelector<HTMLElement>('.bh-composer-rich-input')!;
      setRichSelection(input, '/sessions'.length);
      await act(async () => {
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(
        [...container.querySelectorAll<HTMLElement>('.bh-composer-shortcuts button')].map((row) =>
          row.getAttribute('aria-label'),
        ),
      ).toEqual(['Sessions', '/sessions · Ada']);
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
      expect(run).toHaveBeenCalledTimes(1);
      await show();
      setRichSelection(input, '/sessions'.length);
      await act(async () => {
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      });
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
      expect(changes.at(-1)).toEqual([
        { name: 'sessions', owner: { kind: 'bot', botSlug: 'ada' }, start: 0, end: 9 },
      ]);
      expect(run).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
  it('ranks a Group menu by owning Bot name between name and description matches', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const alice = { ...ada, slug: 'alice', displayName: 'Alice' };
    const bob = { ...ada, slug: 'bob', displayName: 'Bob' };
    try {
      await act(async () => {
        root.render(
          createElement(ChannelComposer, {
            value: '/alice',
            skillOptions: [
              { name: 'notes', description: 'Ask alice first', owner: { kind: 'host' } },
              {
                name: 'triage',
                description: 'Sort bugs',
                owner: { kind: 'bot', botSlug: 'alice' },
                bot: alice,
              },
              {
                name: 'review',
                description: 'Review code',
                owner: { kind: 'bot', botSlug: 'bob' },
                bot: bob,
              },
              {
                name: 'alice-intro',
                description: 'Introduce',
                owner: { kind: 'bot', botSlug: 'bob' },
                bot: bob,
              },
            ],
            placeholder: 'Message',
            sending: false,
            onChange: () => undefined,
            onSubmit: () => undefined,
          }),
        );
      });
      const input = container.querySelector<HTMLElement>('.bh-composer-rich-input')!;
      setRichSelection(input, '/alice'.length);
      await act(async () => {
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(
        [...container.querySelectorAll<HTMLElement>('.bh-composer-shortcuts button')].map((row) =>
          row.getAttribute('aria-label'),
        ),
      ).toEqual(['/alice-intro · Bob', '/triage · Alice', '/notes · 本机']);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
