// @vitest-environment jsdom
import { act, createElement, createRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronDownOutlineRegular: () => null,
  Modal: ({ children, title }: { children: ReactNode; title: string }) =>
    createElement('section', { role: 'dialog', 'aria-label': title }, children),
  Tooltip: ({ children }: { children: ReactNode }) => children,
}));

import type {
  ChannelSidebarEntry,
  ChannelSidebarEntryProps,
} from '../src/client/channel-sidebar.js';
import { ChannelSidebarEntrySection } from '../src/client/channel-sidebar-view.js';
import { ComposerContextBar } from '../src/client/composer-context-bar.js';
import { ChipButton } from '../src/client/ds/chip-button.js';
import { GroupHeading } from '../src/client/ds/group-heading.js';
import { IconButton } from '../src/client/ds/icon-button.js';
import { PanelHeader } from '../src/client/ds/panel-header.js';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(node: ReactNode): void {
  act(() => root.render(node));
}

function button(name: string): HTMLButtonElement {
  const match = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) =>
      (candidate.getAttribute('aria-label') ?? candidate.textContent?.trim() ?? '') === name,
  );
  if (match === undefined) throw new Error(`No button named ${name}`);
  return match;
}

describe('design-system surfaces', () => {
  it('names an icon button and forwards its ref and state', () => {
    const ref = createRef<HTMLButtonElement>();
    const onClick = vi.fn();
    render(
      createElement(
        IconButton,
        { ref, 'aria-label': 'Add', 'aria-expanded': true, onClick, size: 'row' },
        '+',
      ),
    );
    const add = button('Add');
    expect(add.type).toBe('button');
    expect(add.getAttribute('aria-expanded')).toBe('true');
    expect(ref.current).toBe(add);
    act(() => add.click());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders a disclosure header as one button named by its label', () => {
    const onToggle = vi.fn();
    render(
      createElement(PanelHeader, {
        label: 'Sessions',
        badge: createElement('span', null, '3'),
        action: createElement(IconButton, { 'aria-label': 'Settings' }, '⚙'),
        disclosure: {
          expanded: false,
          controls: 'body',
          disabled: false,
          chevron: true,
          onToggle,
        },
      }),
    );
    const head = button('Sessions3');
    expect(head.getAttribute('aria-expanded')).toBe('false');
    expect(head.getAttribute('aria-controls')).toBe('body');
    act(() => head.click());
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(button('Settings')).toBeDefined();
  });

  it('keeps channel identity and actions outside the close/drag title handle', () => {
    const onHide = vi.fn();
    const onAction = vi.fn();
    render(
      createElement(PanelHeader, {
        label: 'Messages',
        hideLabel: 'Close Messages',
        onHide,
        context: createElement('span', null, 'Ada'),
        badge: createElement('span', null, '3'),
        action: createElement('button', { onClick: onAction }, 'Settings'),
      }),
    );
    const title = button('Close Messages');
    expect(title.textContent).toBe('Messages');
    expect(title.draggable).toBe(true);
    act(() => host.querySelector<HTMLElement>('[data-panel-context]')!.click());
    act(() => host.querySelector<HTMLElement>('[data-panel-badge]')!.click());
    act(() => button('Settings').click());
    expect(onAction).toHaveBeenCalledOnce();
    expect(onHide).not.toHaveBeenCalled();
    act(() => title.click());
    expect(onHide).toHaveBeenCalledOnce();
  });

  it('keeps tab and settings clicks separate from a closable Panel title', () => {
    const onHide = vi.fn();
    const onTab = vi.fn();
    const onSettings = vi.fn();
    render(
      createElement(PanelHeader, {
        label: 'Memory',
        hideLabel: 'Close Memory',
        onHide,
        tabs: createElement('button', { role: 'tab', onClick: onTab }, 'Versions'),
        action: createElement('button', { onClick: onSettings }, 'Settings'),
      }),
    );
    act(() => button('Versions').click());
    act(() => button('Settings').click());
    expect(onTab).toHaveBeenCalledOnce();
    expect(onSettings).toHaveBeenCalledOnce();
    expect(onHide).not.toHaveBeenCalled();
    act(() => button('Close Memory').click());
    expect(onHide).toHaveBeenCalledOnce();
  });

  it('renders a static header without a toggle', () => {
    render(createElement(PanelHeader, { label: 'Members' }));
    expect(host.querySelectorAll('button')).toHaveLength(0);
    expect(host.querySelector('[data-panel-label]')?.textContent).toBe('Members');
  });

  it('expands a Channel sidebar entry from its header', () => {
    const entry: ChannelSidebarEntry = {
      id: 'sessions',
      label: 'Sessions',
      scope: 'personabot',
      component: () => createElement('p', null, 'session list'),
      headerAction: () => createElement(IconButton, { 'aria-label': 'New session' }, '+'),
    };
    const entryProps = {
      scope: 'personabot',
      channelId: 'dm-ada',
      botSlug: 'ada',
      actions: {},
      t: (key: string) => key,
    } as unknown as ChannelSidebarEntryProps;
    let expanded = false;
    const draw = () =>
      render(
        createElement(ChannelSidebarEntrySection, {
          entry,
          expanded,
          entryProps,
          onToggle: () => {
            expanded = !expanded;
            draw();
          },
        }),
      );
    draw();
    const head = button('Sessions');
    expect(head.getAttribute('aria-expanded')).toBe('false');
    expect(host.textContent).not.toContain('session list');
    act(() => head.click());
    expect(button('Sessions').getAttribute('aria-expanded')).toBe('true');
    const body = document.getElementById(button('Sessions').getAttribute('aria-controls')!);
    expect(body?.textContent).toBe('session list');
    expect(button('New session')).toBeDefined();
  });

  it('groups composer context chips under one named group', () => {
    const onModel = vi.fn();
    render(
      createElement(ComposerContextBar, {
        label: 'Conversation context',
        trailing: createElement(ChipButton, {
          label: '1.3M tokens',
          'aria-label': 'Usage',
          'aria-expanded': false,
        }),
        children: createElement(ChipButton, {
          label: 'DeepSeek',
          wrap: true,
          'aria-label': 'Model · DeepSeek',
          onClick: onModel,
        }),
      }),
    );
    const group = host.querySelector('[role="group"]')!;
    expect(group.getAttribute('aria-label')).toBe('Conversation context');
    expect(group.hasAttribute('hidden')).toBe(false);
    act(() => button('Model · DeepSeek').click());
    expect(onModel).toHaveBeenCalledTimes(1);
    expect(button('Usage').textContent).toBe('1.3M tokens');
  });

  it('hides the composer context group on request', () => {
    render(
      createElement(ComposerContextBar, {
        label: 'Conversation context',
        hidden: true,
        children: createElement(ChipButton, { label: '1 workspace', 'aria-label': 'Workspaces' }),
      }),
    );
    expect(host.querySelector<HTMLElement>('[role="group"]')!.hidden).toBe(true);
  });

  it('toggles a list group from its heading button', () => {
    const onToggle = vi.fn();
    render(
      createElement(GroupHeading, {
        label: 'Working',
        count: '1 / 8',
        countLabel: '1 running of 8',
        expanded: true,
        onToggle,
      }),
    );
    const heading = button('Working1 / 8');
    expect(heading.getAttribute('aria-expanded')).toBe('true');
    expect(heading.querySelector('[title="1 running of 8"]')?.textContent).toBe('1 / 8');
    act(() => heading.click());
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('renders a static list group heading without a button', () => {
    render(createElement(GroupHeading, { label: 'Waiting', count: 2 }));
    expect(host.querySelectorAll('button')).toHaveLength(0);
    expect(host.textContent).toBe('Waiting2');
  });

  it('uses the heading as the summary of a disclosure group', () => {
    render(
      createElement(
        'details',
        { open: true },
        createElement(GroupHeading, { summary: true, quiet: true, label: 'Snoozed', count: 3 }),
        createElement('p', null, 'items'),
      ),
    );
    const summary = host.querySelector('details > summary')!;
    expect(summary.textContent).toBe('Snoozed3');
  });
});
