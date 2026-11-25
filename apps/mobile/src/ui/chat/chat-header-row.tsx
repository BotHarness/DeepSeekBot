import type { ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDesignTheme } from '../design/theme';
import { glassPress, space } from '../design/tokens';
import {
  ChatHeaderActions,
  type ChatHeaderAction,
  type ChatHeaderControls,
} from './chat-header-actions';
import { headerControlHeight } from './native-header';

export function ChatHeaderRow({
  title,
  back,
  leading,
  extra,
  controls,
}: {
  title?: ReactNode;
  back: Omit<ChatHeaderAction, 'icon'> | undefined;
  leading?: ReactNode;
  extra?: ReactNode;
  controls?: ChatHeaderControls | undefined;
}) {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  return (
    <View
      style={{
        width: Math.max(0, width - insets.left - insets.right - space.x5 * 2),
        height: headerControlHeight(theme),
        flexDirection: 'row',
        alignItems: 'center',
        gap: glassPress.gap,
      }}
    >
      {leading ?? (back === undefined ? null : <ChatHeaderActions kind="back" back={back} />)}
      <View style={{ flex: 1, minWidth: 0 }}>{title}</View>
      {extra}
      {controls !== undefined && (controls.kind === 'menu' || controls.actions.length > 0) ? (
        <ChatHeaderActions {...controls} />
      ) : null}
    </View>
  );
}
