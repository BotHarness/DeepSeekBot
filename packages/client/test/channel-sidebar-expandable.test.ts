// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronDownOutlineRegular: () => null,
}));

import type {
  ChannelSidebarEntry,
  ChannelSidebarEntryProps,
} from '../src/client/channel-sidebar.js';
import { ChannelSidebarEntrySection } from '../src/client/channel-sidebar-view.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const entryProps = {
  scope: 'personabot',
  channelId: 'dm-ada',
  botSlug: 'ada',
  actions: {},
  t: (key: string) => key,
} as unknown as ChannelSidebarEntryProps;

const mounted: { root: Root; container: HTMLDivElement }[] = [];

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

function mount(
  entry: ChannelSidebarEntry,
  expanded: boolean,
  onToggle: () => void,
): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      createElement(ChannelSidebarEntrySection, { entry, expanded, onToggle, entryProps }),
    );
  });
  mounted.push({ root, container });
  return container;
}

function gatedEntry(): {
  entry: ChannelSidebarEntry;
  setExpandable: (expandable: boolean) => void;
  expand: () => void;
} {
  let expandableReport: ((expandable: boolean) => void) | undefined;
  let expand: (() => void) | undefined;
  const entry: ChannelSidebarEntry = {
    id: 'gated',
    label: 'Gated',
    scope: 'personabot',
    component: () => createElement('div', null, 'gated body'),
    headerAction: (props: ChannelSidebarEntryProps) => {
      expandableReport = props.setExpandable;
      expand = () => props.setExpanded?.(true);
      return createElement('span', { 'data-test': 'gated-action' }, 'action');
    },
  };
  return {
    entry,
    setExpandable: (expandable) => {
      act(() => expandableReport?.(expandable));
    },
    expand: () => {
      act(() => expand?.());
    },
  };
}

describe('Channel sidebar expandable contract', () => {
  it('disables the chevron and refuses expansion once an entry reports not expandable', () => {
    const gated = gatedEntry();
    const onToggle = vi.fn();
    const container = mount(gated.entry, false, onToggle);
    const head = container.querySelector('[data-panel-head]');
    expect(head).not.toBeNull();
    expect(head?.hasAttribute('disabled')).toBe(false);
    gated.setExpandable(false);
    expect(head?.hasAttribute('disabled')).toBe(true);
    expect(head?.getAttribute('aria-disabled')).toBe('true');
    act(() => {
      (head as HTMLButtonElement).click();
    });
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('collapses a gated open section and lets it expand again when re-enabled', () => {
    const gated = gatedEntry();
    const onToggle = vi.fn();
    mount(gated.entry, true, onToggle);
    gated.setExpandable(false);
    expect(onToggle).toHaveBeenCalledTimes(1);
    gated.setExpandable(true);
    gated.expand();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('lets a header enable and expand a locked section in the same click', () => {
    let setExpandable: ((value: boolean) => void) | undefined;
    const entry: ChannelSidebarEntry = {
      ...gatedEntry().entry,
      headerAction: (props) => {
        setExpandable = props.setExpandable;
        return createElement(
          'button',
          {
            onClick: () => {
              props.setExpandable?.(true);
              props.setExpanded?.(true);
            },
          },
          'enable',
        );
      },
    };
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    mounted.push({ root, container });
    function Wrapper(): ReturnType<typeof createElement> {
      const [expanded, setExpanded] = useState(false);
      return createElement(ChannelSidebarEntrySection, {
        entry,
        expanded,
        onToggle: () => setExpanded((v) => !v),
        entryProps,
      });
    }
    act(() => root.render(createElement(Wrapper)));
    act(() => setExpandable?.(false));
    expect(container.querySelector('[data-panel-head]')?.hasAttribute('disabled')).toBe(true);
    act(() =>
      [...container.querySelectorAll('button')]
        .find((button) => button.textContent === 'enable')!
        .click(),
    );
    expect(container.querySelector('[data-panel-head]')?.getAttribute('aria-expanded')).toBe(
      'true',
    );
    expect(container.textContent).toContain('gated body');
  });

  it('expands an expandable section on request', () => {
    const gated = gatedEntry();
    const onToggle = vi.fn();
    mount(gated.entry, false, onToggle);
    gated.expand();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
