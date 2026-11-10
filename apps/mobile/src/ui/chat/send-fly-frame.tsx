import { measureMessageView } from '../primitives/measure-message-view';
import { createContext, useCallback, useRef, useState, type ReactNode } from 'react';
import type { StyleProp, ViewInstance, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { decelerateCurve } from '../design/motion';
import { sendFly } from '../design/tokens';
import { BUBBLE_PADDING } from './bubble-shape';
import { flyOffset, textFrame, type SendFlight, type SendFlights } from './send-fly';

type BackdropStyle = ReturnType<typeof useAnimatedStyle>;

export const SendFlyBackdrop = createContext<BackdropStyle | undefined>(undefined);

export function SendFlyFrame({
  messageId,
  flight,
  flights,
  style,
  children,
}: {
  messageId: string;
  flight: SendFlight;
  flights: SendFlights;
  style: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const ref = useRef<ViewInstance>(null);
  const measured = useRef(false);
  const shown = useSharedValue(0);
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const progress = useSharedValue(0);
  const [landed, setLanded] = useState(false);
  const frame = useAnimatedStyle(() => {
    const rest = 1 - progress.get();
    return {
      opacity: shown.get(),
      transform: [{ translateX: offsetX.get() * rest }, { translateY: offsetY.get() * rest }],
    };
  });
  const backdrop = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const land = useCallback(() => {
    flights.land(messageId);
    setLanded(true);
  }, [flights, messageId]);
  const onLayout = () => {
    if (measured.current) return;
    measured.current = true;
    const view = ref.current;
    const from = flight.from;
    const skip = () => {
      progress.set(1);
      shown.set(1);
      land();
    };
    if (view === null || from === undefined) {
      skip();
      return;
    }
    measureMessageView(view, (x, y, width, height) => {
      if (width <= 0 || height <= 0) {
        skip();
        return;
      }
      const offset = flyOffset(
        from,
        textFrame({ x, y, width, height }, BUBBLE_PADDING.horizontal, BUBBLE_PADDING.vertical),
        flights.inverted,
      );
      offsetX.set(offset.x);
      offsetY.set(offset.y);
      shown.set(1);
      progress.set(
        withTiming(
          1,
          {
            duration: sendFly.duration,
            easing: Easing.bezier(...decelerateCurve),
            reduceMotion: ReduceMotion.System,
          },
          () => scheduleOnRN(land),
        ),
      );
    });
  };
  return (
    <Animated.View ref={ref} collapsable={false} onLayout={onLayout} style={[style, frame]}>
      <SendFlyBackdrop.Provider value={landed ? undefined : backdrop}>
        {children}
      </SendFlyBackdrop.Provider>
    </Animated.View>
  );
}
