// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
type Item = { id: string; type?: string; label?: ReactNode; text?: string };
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: () => null,
  Input: () => null,
  IconEllipsisOutlineRegular: () => null,
  Menu: ({
    open,
    anchor,
    items,
    selectedIds = [],
    onSelect,
  }: {
    open: boolean;
    anchor: ReactNode;
    items: readonly Item[];
    selectedIds?: readonly string[];
    onSelect(id: string): void;
  }) => {
    const row = (item: Item): ReactNode =>
      item.type !== undefined
        ? createElement('span', { key: item.id }, item.text)
        : createElement(
            'button',
            {
              key: item.id,
              role: 'menuitem',
              'aria-checked': selectedIds.includes(item.id),
              onClick: () => onSelect(item.id),
            },
            item.label,
          );
    return createElement('div', null, anchor, open ? items.map(row) : null);
  },
}));
vi.mock('../src/client/modal.js', () => ({ Modal: () => null }));
import { HumanChannelNameMenu } from '../src/client/human-channel-name.js';
import { hiddenDmActionsSnapshot } from '../src/client/dm-actions.js';
import type { ChannelSummary } from '../src/client/store.js';
import type { BridgeActions } from '../src/client/actions.js';

let root: Root;
let host: HTMLDivElement;
const dm = {
  id: 'dm-qa',
  type: 'dm',
  name: 'QA',
  botSlug: 'header-qa',
  members: ['header-qa'],
  createdAt: '',
  updatedAt: '',
  humanNickname: null,
} as unknown as ChannelSummary;
function render(channel: ChannelSummary, onOpenSettings?: () => void) {
  act(() =>
    root.render(
      createElement(HumanChannelNameMenu, {
        channel,
        actions: {} as BridgeActions,
        t: (key: string) => key,
        onOpenSettings,
      }),
    ),
  );
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="humanNickname.menu"]')!.click());
}
function item(label: string) {
  return [...host.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(
    (node) => node.textContent === label,
  );
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  localStorage.clear();
});
describe('channel header menu', () => {
  it('opens Channel settings from the header menu', () => {
    const open = vi.fn();
    render(dm, open);
    act(() => item('channelSettings.open')!.click());
    expect(open).toHaveBeenCalledOnce();
  });
  it('shows a red dot on the menu and its settings row while a section needs attention', () => {
    act(() =>
      root.render(
        createElement(HumanChannelNameMenu, {
          channel: dm,
          actions: {} as BridgeActions,
          t: (key: string) => key,
          onOpenSettings: vi.fn(),
          settingsAttention: true,
        }),
      ),
    );
    const trigger = host.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;
    expect(trigger.getAttribute('aria-label')).toBe(
      'humanNickname.menu · channelSettings.needsAttention',
    );
    expect(trigger.querySelector('.bh-channel-settings-attention-dot')).not.toBeNull();
    act(() => trigger.click());
    expect(
      item('channelSettings.open')
        ?.querySelector('.bh-channel-settings-attention-dot')
        ?.getAttribute('aria-label'),
    ).toBe('channelSettings.needsAttention');
  });
  it('toggles which of the Bot actions elsewhere its DM shows, per Bot', () => {
    render(dm);
    expect(host.textContent).toContain('dmTrace.menu');
    expect(item('dmTrace.kind.posts')?.getAttribute('aria-checked')).toBe('true');
    act(() => item('dmTrace.kind.posts')!.click());
    expect(hiddenDmActionsSnapshot('header-qa')).toEqual(['posts']);
    expect(hiddenDmActionsSnapshot('header-other')).toEqual([]);
    expect(item('dmTrace.kind.posts')?.getAttribute('aria-checked')).toBe('false');
    expect(item('dmTrace.kind.memory')?.getAttribute('aria-checked')).toBe('true');
    act(() => item('dmTrace.kind.posts')!.click());
    expect(hiddenDmActionsSnapshot('header-qa')).toEqual([]);
  });
  it('leaves Bot actions out of group Channels', () => {
    render({ ...dm, type: 'group', botSlug: undefined } as unknown as ChannelSummary);
    expect(host.textContent).not.toContain('dmTrace.menu');
    expect(item('humanNickname.title')).toBeDefined();
  });
});
