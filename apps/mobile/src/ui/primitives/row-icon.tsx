import { SymbolView } from 'expo-symbols';
import type { ColorValue } from 'react-native';

import { useDesignTheme } from '../design/theme';

const ROW_ICONS = {
  model: { ios: 'cpu', android: 'memory' },
  computer: { ios: 'desktopcomputer', android: 'computer' },
  notifications: { ios: 'bell', android: 'notifications' },
  storage: { ios: 'internaldrive', android: 'storage' },
  browser: { ios: 'safari', android: 'open_in_browser' },
  unpair: { ios: 'xmark.circle', android: 'link_off' },
  appIcon: { ios: 'app.badge', android: 'apps' },
  activityCount: { ios: 'number.circle', android: 'tag' },
  background: { ios: 'photo', android: 'wallpaper' },
  version: { ios: 'info.circle', android: 'info' },
  open: { ios: 'arrow.up.forward.app', android: 'open_in_new' },
  copy: { ios: 'doc.on.doc', android: 'content_copy' },
  share: { ios: 'square.and.arrow.up', android: 'share' },
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
    <SymbolView
      name={ROW_ICONS[name]}
      size={size ?? theme.type.title.line}
      tintColor={color ?? theme.color.fg}
      accessible={false}
      importantForAccessibility="no"
    />
  );
}
