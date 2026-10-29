import type { ColorValue } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { SystemSymbol } from './system-symbol';

const ROW_ICONS = {
  feedback: { ios: 'bubble.left', android: 'feedback' },
  select: { ios: 'checkmark.circle', android: 'check_circle' },
  language: { ios: 'globe', android: 'translate' },
  appearance: { ios: 'circle.lefthalf.filled', android: 'contrast' },
  system: { ios: 'iphone', android: 'smartphone' },
  light: { ios: 'sun.max', android: 'light_mode' },
  dark: { ios: 'moon', android: 'dark_mode' },
  model: { ios: 'cpu', android: 'memory' },
  computer: { ios: 'desktopcomputer', android: 'computer' },
  notifications: { ios: 'bell', android: 'notifications' },
  storage: { ios: 'internaldrive', android: 'storage' },
  browser: { ios: 'safari', android: 'open_in_browser' },
  folder: { ios: 'folder', android: 'folder' },
  access: { ios: 'lock.shield', android: 'shield_lock' },
  history: { ios: 'clock.arrow.circlepath', android: 'history' },
  rules: { ios: 'checkmark.shield', android: 'verified_user' },
  unpair: { ios: 'xmark.circle', android: 'link_off' },
  appIcon: { ios: 'app.badge', android: 'apps' },
  activityCount: { ios: 'number.circle', android: 'tag' },
  background: { ios: 'photo', android: 'wallpaper' },
  haptics: { ios: 'iphone.radiowaves.left.and.right', android: 'mobile_vibrate' },
  delivery: { ios: 'checkmark.bubble', android: 'mark_chat_read' },
  messageDisplay: { ios: 'text.bubble', android: 'chat' },
  streaming: { ios: 'ellipsis.bubble', android: 'stream' },
  complete: { ios: 'bubble.left', android: 'chat_bubble' },
  version: { ios: 'info.circle', android: 'info' },
  open: { ios: 'arrow.up.forward.app', android: 'open_in_new' },
  copy: { ios: 'doc.on.doc', android: 'content_copy' },
  testRoute: { ios: 'antenna.radiowaves.left.and.right', android: 'network_check' },
  share: { ios: 'square.and.arrow.up', android: 'share' },
  account: { ios: 'person.crop.circle', android: 'account_circle' },
  qr: { ios: 'qrcode.viewfinder', android: 'qr_code_scanner' },
  lan: { ios: 'wifi', android: 'wifi' },
  encrypted: { ios: 'lock', android: 'vpn_lock' },
  add: { ios: 'plus', android: 'add' },
} as const;

export type RowIconName = keyof typeof ROW_ICONS;

export function rowSymbol(name: RowIconName) {
  return ROW_ICONS[name];
}

export function RowIcon({
  name,
  color,
  size,
}: {
  name: RowIconName;
  color?: ColorValue;
  size?: number;
}) {
  const theme = useDesignTheme();
  return (
    <SystemSymbol
      name={ROW_ICONS[name]}
      size={size ?? theme.type.title.line}
      color={color ?? theme.color.fg}
    />
  );
}
