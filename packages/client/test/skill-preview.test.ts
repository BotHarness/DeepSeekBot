// @vitest-environment jsdom
import {
  act,
  createElement,
  type ButtonHTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconAgentPresetOutlineRegular: () => null,
  IconCodeOutlineRegular: () => null,
  IconBranchOutlineRegular: () => null,
  IconCheckOutlineRegular: () => null,
  IconFolderOpenOutlineRegular: () => null,
  IconDownloadOutlineRegular: () => null,
  IconPlayOutlineRegular: () => null,
  IconPauseOutlineRegular: () => null,
  IconRefreshOutlineRegular: () => null,
  IconEllipsisOutlineRegular: () => null,
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
  Tooltip: ({ children }: { children: ReactNode }) => children,
  MarkdownText: () => null,
  Modal: ({
    open,
    title,
    description,
    children,
  }: {
    open: boolean;
    title: string;
    description?: string;
    children?: ReactNode;
  }) =>
    open
      ? createElement('div', { role: 'dialog', 'aria-label': title }, description, children)
      : null,
}));

vi.mock('../src/client/memory-markdown-view.js', () => ({
  MarkdownDocument: ({ body }: { body: string }) =>
    createElement('pre', { 'data-markdown': true }, body),
  MarkdownImageLabel: () => null,
}));

import { ChannelComposer, type ComposerSkillOption } from '../src/client/channel-composer.js';
import { ChannelMessageBody } from '../src/client/channel-message-body.js';
import { en, type BotHarnessTranslate } from '../src/client/locale.js';
import type { ChannelMessage } from '../src/client/store.js';
import { chipSkill, skillPeekPosition, skillSummary } from '../src/client/skill-preview.js';

const t: BotHarnessTranslate = (key, params) =>
  Object.entries(params ?? {}).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, String(value)),
    (en as Record<string, string>)[key] ?? key,
  );

const ada = {
  slug: 'ada',
  displayName: 'Ada',
  roles: [],
  aggregateState: 'idle' as const,
  workspaces: [],
  createdAt: '2026-11-15T00:00:00.000Z',
};

const options: ComposerSkillOption[] = [
  {
    name: 'summarize-pr',
    description: 'Summarize a pull request in three bullets',
    owner: { kind: 'bot', botSlug: 'ada' },
    bot: ada,
  },
  {
    name: 'notes',
    description: 'Project notes',
    owner: { kind: 'workspace', workspaceId: 'ws-1', name: 'notes-project' },
  },
];

let root: Root | undefined;
let container: HTMLElement | undefined;

function mount(): { root: Root; container: HTMLElement } {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  return { root, container };
}

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

function hover(target: Element): void {
  target.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
}

function leave(target: Element): void {
  target.dispatchEvent(
    new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body }),
  );
}

describe('Skill preview helpers', () => {
  it('summarizes the first paragraph of a Skill body without frontmatter or markers', () => {
    expect(
      skillSummary('---\nname: x\ndescription: y\n---\n\n# Title\n\nFirst line\n- second'),
    ).toBe('Title');
    expect(skillSummary('Read the PR.\nThen reply.\n\nMore')).toBe('Read the PR. Then reply.');
    expect(skillSummary('x'.repeat(400))).toHaveLength(280);
  });

  it('places the card above an anchor in the lower half and keeps it inside the viewport', () => {
    expect(
      skillPeekPosition({ left: 900, top: 700, bottom: 720 }, { width: 1000, height: 800 }),
    ).toEqual({ left: 628, width: 360, bottom: 108 });
    expect(
      skillPeekPosition({ left: 4, top: 100, bottom: 120 }, { width: 300, height: 800 }),
    ).toEqual({ left: 12, width: 276, top: 128 });
  });

  it('reads a chip back to its catalog entry and falls back to the owner key', () => {
    const chip = document.createElement('span');
    chip.dataset['skillOwner'] = 'workspace:ws-1';
    chip.dataset['mentionLabel'] = 'notes';
    const inner = chip.appendChild(document.createElement('span'));
    expect(chipSkill(inner, options, t)).toEqual({
      element: chip,
      ownerKey: 'workspace:ws-1',
      peek: { name: 'notes', owner: 'notes-project', description: 'Project notes' },
    });
    chip.dataset['mentionLabel'] = 'gone';
    expect(chipSkill(inner, options, t)?.peek).toEqual({
      name: 'gone',
      owner: 'ws-1',
      description: '',
    });
    expect(chipSkill(document.body, options, t)).toBeUndefined();
  });
});

describe('Skill chip preview', () => {
  it('shows the Skill on hover in the composer and opens its live content on click', async () => {
    const { root, container } = mount();
    const readSkill = vi.fn(async () => ({
      description: 'Summarize a pull request in three bullets',
      content: '---\nname: summarize-pr\n---\nRead the diff, then write three bullets.',
    }));
    await act(async () => {
      root.render(
        createElement(ChannelComposer, {
          value: '/summarize-pr ',
          skills: [
            { name: 'summarize-pr', owner: { kind: 'bot', botSlug: 'ada' }, start: 0, end: 13 },
          ],
          skillOptions: options,
          readSkill,
          t,
          placeholder: 'Message',
          sending: false,
          onChange: () => undefined,
          onSubmit: () => undefined,
        }),
      );
    });
    const chip = container.querySelector<HTMLElement>('.bh-inline-skill')!;
    await act(async () => hover(chip));
    const card = document.querySelector<HTMLElement>('.bh-skill-peek')!;
    expect(card.getAttribute('role')).toBe('tooltip');
    expect(card.textContent).toBe('/summarize-pr · AdaSummarize a pull request in three bullets');
    await act(async () => leave(chip));
    expect(document.querySelector('.bh-skill-peek')).toBeNull();
    await act(async () => chip.click());
    expect(readSkill).toHaveBeenCalledWith('summarize-pr', 'bot:ada');
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-label')).toBe('/summarize-pr');
    expect(dialog.querySelector('[data-markdown]')?.textContent).toBe(
      'Read the diff, then write three bullets.',
    );
  });

  it('previews the sent snapshot from a message bubble chip', async () => {
    const { root, container } = mount();
    const message = {
      id: 'm1',
      channelId: 'g1',
      seq: 1,
      author: { kind: 'human' },
      body: '/notes please',
      createdAt: '2026-11-17T00:00:00.000Z',
      format: 'text',
      skillInvocations: [
        {
          name: 'notes',
          owner: { kind: 'workspace', workspaceId: 'ws-1', name: 'notes-project' },
          start: 0,
          end: 6,
          content: 'Keep notes short.\n\nSecond paragraph.',
        },
      ],
    } as unknown as ChannelMessage;
    await act(async () => {
      root.render(createElement(ChannelMessageBody, { message, t }));
    });
    const chip = container.querySelector<HTMLButtonElement>('button.bh-inline-skill')!;
    expect(chip.getAttribute('aria-label')).toBe('/notes · notes-project');
    expect(chip.hasAttribute('title')).toBe(false);
    await act(async () => hover(chip));
    expect(document.querySelector('.bh-skill-peek')?.textContent).toBe(
      '/notes · notes-projectKeep notes short.',
    );
    await act(async () => chip.click());
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.textContent).toContain('notes-project · as sent');
    expect(dialog.querySelector('[data-markdown]')?.textContent).toBe(
      'Keep notes short.\n\nSecond paragraph.',
    );
  });
});
