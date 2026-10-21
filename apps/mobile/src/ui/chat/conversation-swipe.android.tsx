import { useRef, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { pressTint, useDesignTheme } from '../design/theme';
import { radius, space, swipeAction } from '../design/tokens';
import { ActivityIcon, CheckIcon, MuteIcon, PinIcon } from '../shell/icons';
import type { ConversationAction, ConversationActionKey } from './conversation-actions';

const ICONS = {
  pin: PinIcon,
  unpin: PinIcon,
  read: CheckIcon,
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
  if (actions.length === 0) return children;
  return (
    <ReanimatedSwipeable
      ref={swipe}
      friction={2}
      rightThreshold={swipeAction.size}
      overshootRight={false}
      renderRightActions={() => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.x3,
            paddingHorizontal: space.x5,
          }}
        >
          {actions.map((action, index) => {
            const Icon = ICONS[action.key];
            const primary = index === actions.length - 1;
            const ink = primary ? theme.color.onAccent : theme.color.fg;
            return (
              <Pressable
                key={action.key}
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
