import type { BottomTabNavigationOptions } from 'expo-router/js-tabs';
import { Easing } from 'react-native';
import { decelerate, tabChrome, type PlatformOS } from '../design/tokens';

type TabTransition = Pick<
  BottomTabNavigationOptions,
  'animation' | 'transitionSpec' | 'sceneStyleInterpolator'
>;

const fadeThrough: NonNullable<TabTransition['sceneStyleInterpolator']> = ({ current }) => ({
  sceneStyle: {
    opacity: current.progress.interpolate({
      inputRange: [-1, -0.5, 0, 0.5, 1],
      outputRange: [0, 0, 1, 0, 0],
    }),
    transform: [
      {
        scale: current.progress.interpolate({
          inputRange: [-1, -0.5, 0, 0.5, 1],
          outputRange: [
            tabChrome.fadeThroughScale,
            tabChrome.fadeThroughScale,
            1,
            tabChrome.fadeThroughScale,
            tabChrome.fadeThroughScale,
          ],
        }),
      },
    ],
  },
});

export function tabTransition(os: PlatformOS, reduced: boolean): TabTransition {
  if (reduced) return { animation: 'none' };
  const easing = Easing.bezier(...decelerate[os]);
  if (os === 'android')
    return {
      animation: 'fade',
      transitionSpec: { animation: 'timing', config: { duration: tabChrome.fadeThrough, easing } },
      sceneStyleInterpolator: fadeThrough,
    };
  return {
    animation: 'fade',
    transitionSpec: { animation: 'timing', config: { duration: tabChrome.tabFade, easing } },
  };
}
