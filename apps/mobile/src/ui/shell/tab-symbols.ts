import type { TabMenuGlyph } from './tab-menu-model';
import type { TabSlot } from './tab-slots';

type GlyphSlot = Exclude<TabSlot, 'pinned'>;

export const sessionSymbol = 'chevron.left.forwardslash.chevron.right';

export const tabSymbols = {
  chats: { default: 'bubble.left.and.bubble.right', selected: 'bubble.left.and.bubble.right.fill' },
  activity: { default: 'bell', selected: 'bell.fill' },
  sessions: { default: sessionSymbol, selected: sessionSymbol },
  settings: { default: 'gearshape', selected: 'gearshape.fill' },
} as const satisfies Record<GlyphSlot, { default: string; selected: string }>;

export const pinnedSymbols = { default: 'pin', selected: 'pin.fill' } as const;

export const menuSymbols = {
  bot: 'bubble.left',
  channel: 'bubble.left.and.bubble.right',
  person: 'person',
  session: sessionSymbol,
  activity: 'bell',
  new: 'plus',
} as const satisfies Record<TabMenuGlyph, string>;
