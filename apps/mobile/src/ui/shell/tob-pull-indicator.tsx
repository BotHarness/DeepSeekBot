import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { useDesignTheme } from '../design/theme';
import { space, tobPull } from '../design/tokens';
import { TobModeIcon } from './icons';
import { tobPullProgress } from './tob-pull-model';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function TobPullIndicator({ distance }: { distance: SharedValue<number> }) {
  const theme = useDesignTheme();
  const radius = (tobPull.indicator - tobPull.stroke) / 2;
  const perimeter = 2 * Math.PI * radius;
  const progress = useAnimatedProps(() => ({
    strokeDashoffset: perimeter * (1 - tobPullProgress(distance.value)),
  }));
  const visible = useAnimatedStyle(() => ({
    opacity: tobPullProgress(distance.value),
  }));
  return (
    <Animated.View
      testID="tob-pull-indicator"
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          position: 'absolute',
          top: space.x2,
          alignSelf: 'center',
          width: tobPull.indicator,
          height: tobPull.indicator,
          alignItems: 'center',
          justifyContent: 'center',
        },
        visible,
      ]}
    >
      <Svg width={tobPull.indicator} height={tobPull.indicator} style={{ position: 'absolute' }}>
        <Circle
          cx={tobPull.indicator / 2}
          cy={tobPull.indicator / 2}
          r={radius}
          stroke={theme.color.border}
          strokeWidth={tobPull.stroke}
          fill="none"
        />
        <AnimatedCircle
          cx={tobPull.indicator / 2}
          cy={tobPull.indicator / 2}
          r={radius}
          stroke={theme.color.accent}
          strokeWidth={tobPull.stroke}
          strokeDasharray={[perimeter, perimeter]}
          rotation={-90}
          origin={`${tobPull.indicator / 2}, ${tobPull.indicator / 2}`}
          fill="none"
          animatedProps={progress}
        />
      </Svg>
      <TobModeIcon size={tobPull.glyph} color={theme.color.fg} />
    </Animated.View>
  );
}
