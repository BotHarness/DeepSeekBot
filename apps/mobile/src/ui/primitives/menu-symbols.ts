import type { MenuAction } from './action-menu-button';

export const MENU_SYMBOL = {
  settings: 'paintbrush',
  computer: 'desktopcomputer',
  close: 'xmark.circle',
  person: 'person.crop.circle',
  remove: 'person.badge.minus',
  pin: 'pin',
  mute: 'bell.slash',
  check: 'checkmark',
  folder: 'folder',
  chat: 'bubble.left',
  share: 'square.and.arrow.up',
} as const satisfies Record<MenuAction['icon'], string>;
