import { useCallback, type Ref } from 'react';
import type { ScrollViewInstance, ScrollViewProps } from 'react-native';
import {
  KeyboardChatScrollView,
  useKeyboardHandler,
  useReanimatedKeyboardAnimation,
} from 'react-native-keyboard-controller';
import { scheduleOnRN } from 'react-native-worklets';
import { useAnimatedStyle, useDerivedValue } from 'react-native-reanimated';

import type { ChatKeyboardCoordination } from './chat-scroll';

export interface ChatScrollShape {
  inverted: boolean;
  offset: number;
  inset: number;
  floor: number;
}

function ChatScroll({
  keyboard,
  held,
  shape,
  ref,
  ...props
}: ScrollViewProps & {
  keyboard: ChatKeyboardCoordination;
  held: boolean;
  shape: ChatScrollShape;
  ref?: Ref<ScrollViewInstance>;
}) {
  const { onStart, onEnd, onInsetChange } = keyboard;
  const { inverted, offset, inset, floor } = shape;
  const blankSpace = useDerivedValue(() => floor, [floor]);
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
      blankSpace={blankSpace}
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
) {
  const { onStart, onEnd, onInsetChange } = keyboard;
  const { inverted, offset, inset, floor } = shape;
  return useCallback(
    (props: ScrollViewProps) => (
      <ChatScroll
        {...props}
        held={held}
        shape={{ inverted, offset, inset, floor }}
        keyboard={{ onStart, onEnd, onInsetChange }}
      />
    ),
    [held, inverted, offset, inset, floor, onStart, onEnd, onInsetChange],
  );
}

export function useKeyboardOverlayStyle(offset: number, floor = 0) {
  const { height } = useReanimatedKeyboardAnimation();
  return useAnimatedStyle(() => ({ bottom: Math.max(floor, -height.value - offset) }));
}
