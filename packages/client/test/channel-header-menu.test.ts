// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
type Item = {
  id: string;
  type?: string;
  label?: ReactNode;
  text?: string;
  icon?: ReactNode;
  submenu?: readonly Item[];
};
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: () => null,
  Input: () => null,
  IconCheckOutlineRegular: () => createElement('i', { 'data-check': '' }),
  IconSettingsOutlineRegular: () => null,
  IconTrashOutlineRegular: () => null,
  IconUserOutlineRegular: () => null,
  Menu: ({
    open,
    anchor,
    items,
    onSelect,
  }: {
    open: boolean;
    anchor: ReactNode;
    items: readonly Item[];
    onSelect(id: string): void;
  }) => {
    const row = (item: Item): ReactNode =>
      item.type !== undefined
        ? createElement('span', { key: item.id }, item.text)
        : createElement(
            'div',
            { key: item.id },
            createElement(
              'button',
              { role: 'menuitem', 'data-id': item.id, onClick: () => onSelect(item.id) },
              item.icon,
              item.label,
            ),
            item.submenu?.map(row),
          );
    return createElement('div', null, anchor, open ? items.map(row) : null);
  },
}));
vi.mock('../src/client/modal.js', () => ({ Modal: () => null }));
vi.mock('../src/client/personabot-deletion.js', () => ({
  PersonaBotDeletionView: ({ slug }: { slug: string }) =>
    createElement('div', { 'data-deleting': slug }),
}));
import { ChannelHeaderMenu } from '../src/client/human-channel-name.js';
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
type Props = Partial<Parameters<typeof ChannelHeaderMenu>[0]>;
function render(channel: ChannelSummary, props: Props = {}): void {
  act(() =>
    root.render(
      createElement(ChannelHeaderMenu, {
        channel,
        actions: {} as BridgeActions,
        t: (key: string) => key,
        anchor: ({ open, attention, toggle }) =>
          createElement(
            'button',
            {
              'data-chip': '',
              'aria-expanded': open,
              'data-attention': attention ? 'true' : undefined,
              onClick: toggle,
            },
            'QA',
          ),
        ...props,
      }),
    ),
  );
  act(() => chip().click());
}
const chip = () => host.querySelector<HTMLButtonElement>('[data-chip]')!;
const item = (id: string) => host.querySelector<HTMLButtonElement>(`[data-id="${id}"]`);
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
describe('channel header chip menu', () => {
  it('opens from the chip and leads with the chip primary action', () => {
    const profile = vi.fn();
    render(dm, { primaryAction: { label: 'profile.label', icon: null, run: profile } });
    expect(chip().getAttribute('aria-expanded')).toBe('true');
    const ids = [...host.querySelectorAll('[role=menuitem]')].map((node) =>
      node.getAttribute('data-id'),
    );
    expect(ids[0]).toBe('primary');
    act(() => item('primary')!.click());
    expect(profile).toHaveBeenCalledOnce();
    expect(chip().getAttribute('aria-expanded')).toBe('false');
  });
  it('opens the Delete Bot confirmation for the DM PersonaBot', () => {
    render(dm, { deleteBotSlug: 'header-qa' });
    expect(host.querySelector('[data-deleting]')).toBeNull();
    act(() => item('delete')!.click());
    expect(host.querySelector('[data-deleting]')?.getAttribute('data-deleting')).toBe('header-qa');
  });
  it('offers no Delete Bot row without a deletable PersonaBot', () => {
    render(dm);
    expect(item('delete')).toBeNull();
  });
  it('opens Channel settings from the chip menu', () => {
    const open = vi.fn();
    render(dm, { onOpenSettings: open });
    act(() => item('settings')!.click());
    expect(open).toHaveBeenCalledOnce();
  });
  it('marks the chip and the settings row while a section needs attention', () => {
    render(dm, { onOpenSettings: vi.fn(), settingsAttention: true });
    expect(chip().getAttribute('data-attention')).toBe('true');
    expect(
      item('settings')?.querySelector('[data-channel-attention-dot]')?.getAttribute('aria-label'),
    ).toBe('channelSettings.needsAttention');
  });
  it('toggles which of the Bot actions elsewhere its DM shows, per Bot', () => {
    render(dm);
    expect(item('dm-actions')?.textContent).toBe('dmTrace.menu');
    expect(item('dm:posts')?.querySelector('[data-check]')).not.toBeNull();
    act(() => item('dm:posts')!.click());
    expect(hiddenDmActionsSnapshot('header-qa')).toEqual(['posts']);
    expect(hiddenDmActionsSnapshot('header-other')).toEqual([]);
    expect(item('dm:posts')?.querySelector('[data-check]')).toBeNull();
    expect(item('dm:memory')?.querySelector('[data-check]')).not.toBeNull();
    act(() => item('dm:posts')!.click());
    expect(hiddenDmActionsSnapshot('header-qa')).toEqual([]);
  });
  it('leaves Bot actions out of group Channels', () => {
    render({ ...dm, type: 'group', botSlug: undefined } as unknown as ChannelSummary);
    expect(item('dm-actions')).toBeNull();
    expect(item('nickname')).not.toBeNull();
  });
});
