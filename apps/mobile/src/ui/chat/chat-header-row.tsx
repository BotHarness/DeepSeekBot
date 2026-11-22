import type { ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDesignTheme } from '../design/theme';
import { glassPress, space } from '../design/tokens';
import {
  ChatHeaderActions,
  type ChatHeaderAction,
  type ChatHeaderMenu,
} from './chat-header-actions';
import { headerControlHeight } from './native-header';

export function ChatHeaderRow({
  title,
  back,
  actions = [],
  menu,
}: {
  title?: ReactNode;
  back: Omit<ChatHeaderAction, 'icon'>;
  actions?: readonly ChatHeaderAction[];
  menu?: ChatHeaderMenu | undefined;
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
      <ChatHeaderActions back={back} />
      <View style={{ flex: 1, minWidth: 0 }}>{title}</View>
      {menu !== undefined ? (
        <ChatHeaderActions menu={menu} />
      ) : actions.length > 0 ? (
        <ChatHeaderActions actions={actions} />
      ) : null}
    </View>
  );
}
