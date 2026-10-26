import { useCallback, type Ref } from 'react';
import type { ScrollViewInstance, ScrollViewProps } from 'react-native';
import { KeyboardChatScrollView, useKeyboardHandler } from 'react-native-keyboard-controller';
import { scheduleOnRN } from 'react-native-worklets';

import type { ChatKeyboardCoordination } from './chat-scroll';

function ChatScroll({
  keyboard,
  held,
  ref,
  ...props
}: ScrollViewProps & {
  keyboard: ChatKeyboardCoordination;
  held: boolean;
  ref?: Ref<ScrollViewInstance>;
}) {
  const { onStart, onEnd, onInsetChange } = keyboard;
  const finish = useCallback(
    (height: number) => {
      onInsetChange({ bottom: height });
      onEnd();
    },
    [onEnd, onInsetChange],
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
      ref={ref}
      automaticallyAdjustContentInsets={false}
      contentInsetAdjustmentBehavior="never"
      keyboardLiftBehavior={held ? 'never' : 'whenAtEnd'}
      onContentInsetChange={onInsetChange}
    />
  );
}

export function useChatScrollAdapter(keyboard: ChatKeyboardCoordination, held: boolean) {
  const { onStart, onEnd, onInsetChange } = keyboard;
  return useCallback(
    (props: ScrollViewProps) => (
      <ChatScroll {...props} held={held} keyboard={{ onStart, onEnd, onInsetChange }} />
    ),
    [held, onStart, onEnd, onInsetChange],
  );
}
