import { useCallback, useLayoutEffect, type Ref } from 'react';
import type { ScrollViewInstance, ScrollViewProps } from 'react-native';
import {
  KeyboardChatScrollView,
  useKeyboardHandler,
  useReanimatedKeyboardAnimation,
} from 'react-native-keyboard-controller';
import { scheduleOnRN } from 'react-native-worklets';
import { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';

import type { ChatKeyboardCoordination } from './chat-scroll';

export interface ChatScrollShape {
  inverted: boolean;
  offset: number;
  inset: number;
}

function ChatScroll({
  keyboard,
  held,
  shape,
  extraContentPadding,
  ref,
  ...props
}: ScrollViewProps & {
  keyboard: ChatKeyboardCoordination;
  held: boolean;
  shape: ChatScrollShape;
  extraContentPadding: SharedValue<number> | undefined;
  ref?: Ref<ScrollViewInstance>;
}) {
  const { onStart, onEnd, onInsetChange } = keyboard;
  const { inverted, offset, inset } = shape;
  const extraFollow = useSharedValue(false);
  useLayoutEffect(() => {
    extraFollow.value = !held;
    return () => {
      extraFollow.value = false;
    };
  }, [held, extraFollow]);
  const report = useCallback(
    (insets: { bottom: number }) => onInsetChange({ bottom: insets.bottom + inset }),
    [onInsetChange, inset],
  );
  const finish = useCallback(
    (height: number) => {
      onInsetChange({ bottom: Math.max(0, height - offset) });
      onEnd();
    },
    [onEnd, onInsetChange, offset],
  );
  useKeyboardHandler(
    {
      onStart: () => {
        'worklet';
        scheduleOnRN(onStart);
      },
      onEnd: (event) => {
        'worklet';
        scheduleOnRN(finish, event.height);
      },
    },
    [onStart, finish],
  );
  return (
    <KeyboardChatScrollView
      {...props}
      inverted={inverted}
      offset={offset}
      {...(extraContentPadding === undefined
        ? {}
        : { extraContentPadding, extraContentPaddingFollow: extraFollow })}
      ref={ref}
      {...(inverted
        ? { automaticallyAdjustContentInsets: false, contentInsetAdjustmentBehavior: 'never' }
        : {})}
      keyboardLiftBehavior={held ? 'never' : 'whenAtEnd'}
      onContentInsetChange={report}
    />
  );
}

export function useKeyboardChatScroll(
  keyboard: ChatKeyboardCoordination,
  held: boolean,
  shape: ChatScrollShape,
  extraContentPadding?: SharedValue<number>,
) {
  const { onStart, onEnd, onInsetChange } = keyboard;
  const { inverted, offset, inset } = shape;
  return useCallback(
    (props: ScrollViewProps) => (
      <ChatScroll
        {...props}
        held={held}
        extraContentPadding={extraContentPadding}
        shape={{ inverted, offset, inset }}
        keyboard={{ onStart, onEnd, onInsetChange }}
      />
    ),
    [held, inverted, offset, inset, onStart, onEnd, onInsetChange, extraContentPadding],
  );
}

export function useKeyboardOverlayStyle(offset: number) {
  const { height } = useReanimatedKeyboardAnimation();
  return useAnimatedStyle(() => ({ bottom: Math.max(0, -height.value - offset) }));
}
