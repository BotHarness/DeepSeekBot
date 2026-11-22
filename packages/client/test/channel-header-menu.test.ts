// @vitest-environment jsdom
import { type Root } from 'react-dom/client';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
}));
vi.mock('../src/client/modal.js', () => ({ Modal: () => null }));
vi.mock('../src/client/personabot-deletion.js', () => ({
  PersonaBotDeletionView: ({ slug }: { slug: string }) =>
    createElement('div', { 'data-deleting': slug }),
}));
import { ChannelHeaderMenu } from '../src/client/human-channel-name.js';
import { menuItem, queryMenuItem, openSubmenu } from './primitive-mocks.js';
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
const item = queryMenuItem;
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
    expect(document.body.querySelector('[role=menuitem]')?.textContent).toBe('profile.label');
    act(() => item('profile.label')!.click());
    expect(profile).toHaveBeenCalledOnce();
    expect(chip().getAttribute('aria-expanded')).toBe('false');
  });
  it('opens the Delete Bot confirmation for the DM PersonaBot', () => {
    render(dm, { deleteBotSlug: 'header-qa' });
    expect(host.querySelector('[data-deleting]')).toBeNull();
    act(() => item('deletion.title')!.click());
    expect(host.querySelector('[data-deleting]')?.getAttribute('data-deleting')).toBe('header-qa');
  });
  it('offers no Delete Bot row without a deletable PersonaBot', () => {
    render(dm);
    expect(item('deletion.title')).toBeNull();
  });
  it('opens Channel settings from the chip menu', () => {
    const open = vi.fn();
    render(dm, { onOpenSettings: open });
    act(() => item('channelSettings.open')!.click());
    expect(open).toHaveBeenCalledOnce();
  });
  it('marks the chip and the settings row while a section needs attention', () => {
    render(dm, { onOpenSettings: vi.fn(), settingsAttention: true });
    expect(chip().getAttribute('data-attention')).toBe('true');
    expect(
      item(/^channelSettings.open/)
        ?.querySelector('[data-channel-attention-dot]')
        ?.getAttribute('aria-label'),
    ).toBe('channelSettings.needsAttention');
  });
  it('toggles which of the Bot actions elsewhere its DM shows, per Bot', async () => {
    render(dm);
    expect(item('dmTrace.menu')?.textContent).toBe('dmTrace.menu');
    await openSubmenu(menuItem('dmTrace.menu'));
    expect(item('dmTrace.kind.posts')?.querySelector('[data-icon="check"]')).not.toBeNull();
    act(() => item('dmTrace.kind.posts')!.click());
    expect(hiddenDmActionsSnapshot('header-qa')).toEqual(['posts']);
    expect(hiddenDmActionsSnapshot('header-other')).toEqual([]);
    expect(item('dmTrace.kind.posts')?.querySelector('[data-icon="check"]')).toBeNull();
    expect(item('dmTrace.kind.memory')?.querySelector('[data-icon="check"]')).not.toBeNull();
    act(() => item('dmTrace.kind.posts')!.click());
    expect(hiddenDmActionsSnapshot('header-qa')).toEqual([]);
  });
  it('leaves Bot actions out of group Channels', () => {
    render({ ...dm, type: 'group', botSlug: undefined } as unknown as ChannelSummary);
    expect(item('dmTrace.menu')).toBeNull();
    expect(item('humanNickname.title')).not.toBeNull();
  });
});
