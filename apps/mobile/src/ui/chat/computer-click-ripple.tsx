import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import type { StageZoom } from '../../host/browser-viewer';
import { videoPointerPosition } from '../../host/local-video-pointer';
import { computerClickRipple as ripple, edge, pointer, radius } from '../design/tokens';
import type { Size } from './zoom-math';

export type ComputerClickFeedback = {
  sequence: number;
  attemptId: string;
  point: { x: number; y: number };
  button: 'left' | 'right';
};

export function ComputerClickRipple({
  feedback,
  attemptId,
  enabled,
  frame,
  stage,
  preview,
}: {
  feedback: SharedValue<ComputerClickFeedback | undefined>;
  attemptId: string;
  enabled: boolean;
  frame: Size;
  stage: Size;
  preview: SharedValue<StageZoom>;
}) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(1);
  const anchor = useSharedValue({ x: 0, y: 0 });
  const button = useSharedValue<'left' | 'right'>('left');
  useAnimatedReaction(
    () => ({ click: feedback.get(), enabled }),
    (current, previous) => {
      if (!current.enabled || current.click?.attemptId !== attemptId) {
        cancelAnimation(progress);
        progress.set(1);
        return;
      }
      if (previous === null || current.click.sequence === previous.click?.sequence) return;
      anchor.set(current.click.point);
      button.set(current.click.button);
      cancelAnimation(progress);
      progress.set(0);
      progress.set(
        reduced
          ? withDelay(
              ripple.duration,
              withTiming(1, { duration: 0, reduceMotion: ReduceMotion.Never }),
              ReduceMotion.Never,
            )
          : withTiming(1, {
              duration: ripple.duration,
              easing: Easing.bezier(0.23, 1, 0.32, 1),
              reduceMotion: ReduceMotion.System,
            }),
      );
    },
  );
  const placement = useAnimatedStyle(() => {
    const at = videoPointerPosition({ point: anchor.get(), frame, stage, zoom: preview.get() });
    const phase = progress.get();
    return {
      opacity: !enabled ? 0 : reduced ? (phase < 1 ? 1 : 0) : 1 - phase,
      transform: [
        { translateX: at.x - ripple.diameter / 2 },
        { translateY: at.y - ripple.diameter / 2 },
        { scale: reduced ? 1 : ripple.startScale + phase * ripple.expansion },
      ],
    };
  });
  const color = useAnimatedStyle(() => ({ borderColor: ripple[button.get()] }));
  return (
    <Animated.View
      testID="computer-video-click-ripple"
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        { position: 'absolute', left: 0, top: 0, width: ripple.diameter, height: ripple.diameter },
        placement,
      ]}
    >
      <View
        style={{
          flex: 1,
          borderRadius: radius.round,
          borderWidth: edge.focus,
          borderColor: pointer.rim,
        }}
      >
        <Animated.View
          style={[{ flex: 1, borderRadius: radius.round, borderWidth: edge.focus }, color]}
        />
      </View>
    </Animated.View>
  );
}
