import type { ReactNode } from 'react';
import type { ColorValue } from 'react-native';

import { SystemSymbol } from './system-symbol';

const symbols = {
  delete: { ios: 'trash', android: 'delete' },
  settings: { ios: 'gearshape', android: 'settings' },
  computer: { ios: 'desktopcomputer', android: 'computer' },
  cloud: { ios: 'cloud', android: 'cloud' },
  close: { ios: 'xmark.circle', android: 'link_off' },
  person: { ios: 'person.crop.circle', android: 'account_circle' },
  remove: { ios: 'person.badge.minus', android: 'person_remove' },
  chat: { ios: 'bubble.left', android: 'chat' },
  share: { ios: 'square.and.arrow.up', android: 'share' },
  clock: { ios: 'clock', android: 'schedule' },
  photo: { ios: 'photo', android: 'photo' },
  camera: { ios: 'camera', android: 'photo_camera' },
  folder: { ios: 'folder', android: 'folder' },
  bot: { ios: 'person.crop.circle.badge.plus', android: 'person_add' },
  zip: { ios: 'doc.zipper', android: 'folder_zip' },
  marketplace: { ios: 'square.grid.2x2', android: 'apps' },
  git: { ios: 'point.3.connected.trianglepath.dotted', android: 'account_tree' },
  join: { ios: 'link', android: 'link' },
  invite: { ios: 'person.badge.plus', android: 'person_add' },
  channel: { ios: 'bubble.left.and.bubble.right', android: 'chat' },
  back: { ios: 'chevron.left', android: 'arrow_back' },
  check: { ios: 'checkmark', android: 'check' },
  pin: { ios: 'pin', android: 'push_pin' },
  unpin: { ios: 'pin.slash', android: 'keep_off' },
  mute: { ios: 'bell.slash', android: 'notifications_off' },
  unmute: { ios: 'bell', android: 'notifications_active' },
} as const;

export type MenuGlyph =
  | keyof typeof symbols
  | ((props: { color: ColorValue; size: number }) => ReactNode);

export function MenuIcon({ icon, color, size }: { icon: MenuGlyph; color: string; size: number }) {
  return typeof icon === 'function' ? (
    icon({ color, size })
  ) : (
    <SystemSymbol name={symbols[icon]} color={color} size={size} />
  );
}
