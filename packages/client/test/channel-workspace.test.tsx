// @vitest-environment jsdom
import { act, createElement, Component, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { ChannelWorkspace } from '../src/client/channel-workspace.js';
import {
  legacyChannelSplit,
  moveChannelSplit,
  parseChannelSplit,
  resizeChannelSplit,
  splitPanels,
} from '../src/client/channel-split-layout.js';
import { DEFAULT_CHANNEL_WORKSPACE } from '../src/client/channel-dock-layout.js';

describe('nested Channel workspace', () => {
  it('starts a child-panel drag only from its title handle', () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const setData = vi.fn();
    const transfer = { setData, effectAllowed: '' };
    try {
      act(() =>
        root.render(
          createElement(ChannelWorkspace, {
            channelId: 'dm-ada',
            tree: legacyChannelSplit({}),
            setTree: vi.fn(),
            panels: {
              messages: { label: 'Messages', content: 'Chat' },
              sessions: {
                label: 'Sessions',
                content: 'Sessions',
                header: createElement(
                  'button',
                  {
                    'data-panel-hide': '',
                    draggable: true,
                  },
                  'Sessions',
                ),
              },
            },
          }),
        ),
      );
      const header = host.querySelector('.bh-channel-session-header')!;
      const drag = (target: Element) => {
        const event = new Event('dragstart', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'dataTransfer', { value: transfer });
        act(() => target.dispatchEvent(event));
        return event;
      };
      expect(drag(header).defaultPrevented).toBe(true);
      expect(setData).not.toHaveBeenCalled();
      expect(drag(header.querySelector('button')!).defaultPrevented).toBe(false);
      expect(setData).toHaveBeenCalledWith(expect.any(String), 'sessions');
      expect(transfer.effectAllowed).toBe('move');
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });

  it('splits a right column into rows and validates stored topology', () => {
    const legacy = legacyChannelSplit({ 'memory-files': DEFAULT_CHANNEL_WORKSPACE });
    const tree = moveChannelSplit(legacy, 'memory-evolution', 'memory-files', 'below');
    expect(splitPanels(tree).sort()).toEqual(splitPanels(legacy).sort());
    const find = (node: typeof tree): boolean =>
      'panel' in node
        ? false
        : (node.axis === 'vertical' &&
            'panel' in node.first &&
            node.first.panel === 'memory-files' &&
            'panel' in node.second &&
            node.second.panel === 'memory-evolution') ||
          find(node.first) ||
          find(node.second);
    expect(find(tree)).toBe(true);
    expect(parseChannelSplit(JSON.parse(JSON.stringify(tree)))).toEqual(tree);
    expect(
      parseChannelSplit({
        axis: 'vertical',
        ratio: 0.5,
        first: { panel: 'messages' },
        second: { panel: 'messages' },
      }),
    ).toBeUndefined();
    expect(parseChannelSplit({ panel: 'alien' })).toBeUndefined();
    expect(moveChannelSplit(tree, 'memory-files', 'memory-files', 'below')).toBe(tree);
    expect(resizeChannelSplit(tree, '', 0.65)).toMatchObject({ ratio: 0.65 });
  });

  it('keeps content mounted during arbitrary reparenting, resize and sibling visibility changes', () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const mounts = vi.fn(),
      unmounts = vi.fn();
    class Content extends Component {
      override componentDidMount() {
        mounts();
      }
      override componentWillUnmount() {
        unmounts();
      }
      override render() {
        return createElement('input', { defaultValue: 'draft' });
      }
    }

    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const panels = {
      messages: { label: 'Messages', content: createElement(Content) },
      'memory-files': { label: 'Files', content: 'Files' },
      'memory-evolution': { label: 'Evolution', content: 'Evolution' },
    };
    let tree = legacyChannelSplit({});
    const render = (shown: ComponentProps<typeof ChannelWorkspace>['panels'] = panels) =>
      act(() =>
        root.render(
          createElement(ChannelWorkspace, {
            channelId: 'dm-ada',
            tree,
            setTree: vi.fn(),
            panels: shown,
          }),
        ),
      );
    try {
      render();
      const input = host.querySelector('input')!;
      input.value = 'unsent draft';
      tree = moveChannelSplit(tree, 'memory-evolution', 'memory-files', 'below');
      render();
      tree = resizeChannelSplit(tree, '', 0.7);
      render();
      render({ messages: panels.messages, 'memory-evolution': panels['memory-evolution'] });
      render();
      expect(host.querySelector('input')).toBe(input);
      expect(input.value).toBe('unsent draft');
      expect(mounts).toHaveBeenCalledTimes(1);
      expect(unmounts).not.toHaveBeenCalled();
      expect(host.querySelectorAll('[data-channel-subpanel]').length).toBe(2);
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });
});
