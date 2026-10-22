import { useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { pressTint, useDesignTheme } from '../design/theme';
import { chatList, radius, space, swipeAction } from '../design/tokens';
import { ActivityIcon, CheckIcon, FolderIcon, MuteIcon, PinIcon } from '../shell/icons';
import { EDGE_WIDTH } from '../shell/host-drawer-model';
import type { ConversationAction, ConversationActionKey } from './conversation-actions';

const ICONS = {
  pin: PinIcon,
  unpin: PinIcon,
  read: CheckIcon,
  section: FolderIcon,
  mute: MuteIcon,
  unmute: ActivityIcon,
} as const;

export function ConversationSwipe({
  actions,
  onAction,
  children,
}: {
  actions: readonly ConversationAction[];
  onAction(key: ConversationActionKey): void;
  children: ReactNode;
}) {
  const theme = useDesignTheme();
  const swipe = useRef<SwipeableMethods>(null);
  const [open, setOpen] = useState(false);
  if (actions.length === 0) return children;
  return (
    <ReanimatedSwipeable
      ref={swipe}
      testID="conversation-swipe"
      hitSlop={Platform.OS === 'ios' ? { left: -EDGE_WIDTH } : undefined}
      friction={2}
      rightThreshold={swipeAction.size}
      overshootRight={false}
      overshootLeft={false}
      onSwipeableWillOpen={() => setOpen(true)}
      onSwipeableWillClose={() => setOpen(false)}
      renderRightActions={() => (
        <View
          accessibilityElementsHidden={!open}
          importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.x3,
            paddingHorizontal: chatList.gutter,
          }}
        >
          {actions
            .filter((action) => action.key !== 'read')
            .map((action) => {
              const Icon = ICONS[action.key];
              const primary = action.key === 'pin' || action.key === 'unpin';
              const ink = primary ? theme.color.onAccent : theme.color.fg;
              return (
                <Pressable
                  key={action.key}
                  testID={`conversation-swipe-${action.key}`}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  onPress={() => {
                    swipe.current?.close();
                    onAction(action.key);
                  }}
                  android_ripple={{ color: pressTint(ink) }}
                  style={{
                    width: swipeAction.size,
                    height: swipeAction.size,
                    borderRadius: radius.lg,
                    overflow: 'hidden',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: primary ? theme.color.accent : theme.layer.canvas.chosen,
                  }}
                >
                  <Icon color={ink} size={theme.type.title.line} focused={action.key === 'unpin'} />
                </Pressable>
              );
            })}
        </View>
      )}
    >
      {children}
    </ReanimatedSwipeable>
  );
}
