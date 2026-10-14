import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Pill: ({ children, className }: { children: ReactNode; className?: string }) =>
    createElement('span', { className }, children),
  Modal: ({ children }: { children: ReactNode }) => children,
  Tooltip: ({ children }: { children: ReactNode }) => children,
  IconChevronLeftOutlineRegular: () => null,
  IconChevronRightOutlineRegular: () => null,
  IconPinFillRegular: () => null,
  IconPinOutlineRegular: () => null,
}));
import { GroupChannelHeader } from '../src/client/group-channel-header.js';
import { GroupProfilePopover } from '../src/client/group-profile.js';
import { EMPTY_PROFILE_CARDS } from '../src/client/profile-cards.js';
import { PersonaBotFacepile, type PersonaBotFacepileItem } from '../src/client/avatar.js';
import type { ChannelSummary } from '../src/client/store.js';
import { zhTranslate } from '../src/client/locale.js';

const members: PersonaBotFacepileItem[] = [
  {
    personaBotId: 'ada',
    name: 'Ada <safe>',
    state: 'working',
    activity: { effect: 'searching', toolKind: 'search', startedAt: 1000, activeToolCount: 1 },
  },
  { personaBotId: 'bea', name: 'Bea', state: 'thinking' },
  { personaBotId: 'cy', name: 'Cy', state: 'idle' },
  { personaBotId: 'dee', name: 'Dee', state: 'idle' },
];
const channel: ChannelSummary = {
  id: 'group-test',
  type: 'group',
  name: 'Test Group',
  members: members.map((member) => member.personaBotId),
  createdAt: '2026-10-04T00:00:00Z',
  updatedAt: '2026-10-04T00:00:00Z',
};
const noop = () => undefined;
function header(group: ChannelSummary, items = members) {
  return renderToStaticMarkup(
    createElement(GroupChannelHeader, {
      channel: group,
      title: group.name,
      members: items,
      expanded: false,
      t: zhTranslate,
      onOpenActivity: noop,
      onToggleProfile: noop,
    }),
  );
}
it('gives each visible Bot an independent safe keyboard button outside the Profile name button', () => {
  const html = header(channel);
  expect(html.match(/class="bh-avatar-facepile-button"/gu)).toHaveLength(3);
  expect(html).toContain('>+1</span>');
  expect(html).toContain('aria-label="Ada &lt;safe&gt; · 正在搜索"');
  expect(html).toContain('aria-label="Cy · 空闲"');
  expect(html).toContain('data-group-channel-name=""');
  expect(html).toContain('<span class="bh-channel-island bh-group-channel-header">');
});
it('keeps the custom Group identity alongside live member avatars and an empty Group hash fallback', () => {
  expect(header({ ...channel, avatar: 'avatar.webp' })).toContain('src="avatar.webp"');
  expect(
    header({ ...channel, avatar: 'avatar.webp' }).match(/class="bh-avatar-facepile-button"/gu),
  ).toHaveLength(3);
  const empty = header({ ...channel, members: [] }, []);
  expect(empty).toContain('data-channel-mark=""');
  expect(empty).not.toContain('bh-avatar-facepile-button');
});
it('shows at most three active-first member chips and overflow in the existing Group Profile popover', () => {
  const html = renderToStaticMarkup(
    createElement(GroupProfilePopover, {
      channel,
      members,
      activity: undefined,
      cards: EMPTY_PROFILE_CARDS,
      pinned: [],
      botNames: new Map(),
      t: zhTranslate,
      onExpand: noop,
    }),
  );
  expect(html).toContain('实时活动');
  expect(html.match(/data-bot-id=/gu)).toHaveLength(3);
  expect(html).toContain('bh-group-live-activity-chips');
  expect(html).toContain('>+1</span>');
  expect(html).not.toContain('data-bot-id="dee"');
  expect(html).not.toContain('bh-composer-activity-session');
  expect(html).toContain('Ada &lt;safe&gt;');
  expect(html).toContain('正在工作');
  expect(html).toContain('正在思考');
  expect(html).toContain('空闲');
  expect(html).toContain('bh-profile-expand');
});

it('keeps active late members visible before idle ones and caps even a larger requested max', () => {
  const items: PersonaBotFacepileItem[] = [
    { personaBotId: 'idle-first', name: 'Idle first', state: 'idle' },
    { personaBotId: 'idle-second', name: 'Idle second', state: 'idle' },
    { personaBotId: 'thinking-third', name: 'Thinking third', state: 'thinking' },
    { personaBotId: 'working-fourth', name: 'Working fourth', state: 'working' },
    { personaBotId: 'working-fifth', name: 'Working fifth', state: 'working' },
  ];
  const render = () =>
    renderToStaticMarkup(createElement(PersonaBotFacepile, { items, size: 24, max: 8 }));
  const markup = render();
  expect(markup.match(/class="bh-persona-avatar/g)).toHaveLength(3);
  expect(markup).toContain('+2');
  expect(markup).not.toContain('Idle first');
  expect(markup).not.toContain('Idle second');
  expect(markup.indexOf('Thinking third')).toBeLessThan(markup.indexOf('Working fourth'));
  expect(markup.indexOf('Working fourth')).toBeLessThan(markup.indexOf('Working fifth'));
  expect(render()).toBe(markup);
  expect(items.map((item) => item.personaBotId)).toEqual([
    'idle-first',
    'idle-second',
    'thinking-third',
    'working-fourth',
    'working-fifth',
  ]);
});

it('uses the same bounded active-first preview for chips when working members follow idle ones', () => {
  const ordered = [members[2]!, members[3]!, members[0]!, members[1]!];
  const html = renderToStaticMarkup(
    createElement(GroupProfilePopover, {
      channel,
      members: ordered,
      activity: undefined,
      cards: EMPTY_PROFILE_CARDS,
      pinned: [],
      botNames: new Map(),
      t: zhTranslate,
      onExpand: noop,
    }),
  );
  expect(html.match(/data-bot-id=/gu)).toHaveLength(3);
  expect(html.indexOf('data-bot-id="ada"')).toBeLessThan(html.indexOf('data-bot-id="cy"'));
  expect(html.indexOf('data-bot-id="bea"')).toBeLessThan(html.indexOf('data-bot-id="cy"'));
  expect(html).not.toContain('data-bot-id="dee"');
  expect(html).toContain('>+1</span>');
});
