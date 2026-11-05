import { useEffect, useMemo, useRef } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import type { ComposerHoldProps } from './composer-hold';
import { voiceGesture } from './dictation';

export function ComposerHold({ enabled, onStart, onStop, children }: ComposerHoldProps) {
  const latest = useRef({ enabled, onStart, onStop });
  latest.current = { enabled, onStart, onStop };
  const holding = useRef(false);
  const stop = () => {
    if (!holding.current) return;
    holding.current = false;
    latest.current.onStop();
  };
  useEffect(() => stop, []);
  const gesture = useMemo(() => {
    const hold = Gesture.LongPress()
      .enabled(enabled)
      .minDuration(voiceGesture.holdMs)
      .runOnJS(true)
      .onStart(() => {
        if (!latest.current.enabled) return;
        holding.current = true;
        latest.current.onStart();
      })
      .onFinalize(stop);
    return Gesture.Exclusive(hold, Gesture.Native());
  }, [enabled]);
  return <GestureDetector gesture={gesture}>{children}</GestureDetector>;
}
