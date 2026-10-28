import type { ReactElement } from 'react';
import { Platform, View, type ScrollViewProps } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useComposedEventHandler,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { spring } from '../design/motion';
import { tobPull } from '../design/tokens';
import { haptic } from '../haptics';
import { useSystemReducedMotion } from '../primitives/use-system-reduced-motion';
import { PullToRefresh, type PullToRefreshScrollProps } from '../primitives/pull-to-refresh';
import { useHostDrawerOpen } from './host-drawer';
import type { useChromeScroll } from './scroll-chrome';
import type { TobModeHref } from './tob-mode-model';
import { TobPullIndicator } from './tob-pull-indicator';
import { tobPullArmed, tobPullCanStart, tobPullOutcome } from './tob-pull-model';

export function PullToTob({
  enabled,
  scope,
  hostId,
  href,
  refreshing,
  onRefresh,
  onOpen,
  onScroll,
  children,
}: {
  enabled: boolean;
  scope: string;
  hostId: string | undefined;
  href: TobModeHref | undefined;
  refreshing: boolean;
  onRefresh(): void;
  onOpen(href: TobModeHref): void;
  onScroll: ReturnType<typeof useChromeScroll>;
  children(
    scroll: PullToRefreshScrollProps & Pick<ScrollViewProps, 'onScroll' | 'alwaysBounceVertical'>,
  ): ReactElement;
}) {
  const reduced = useSystemReducedMotion();
  const drawer = useHostDrawerOpen();
  const active = enabled && !drawer && !refreshing;
  const android = Platform.OS === 'android';
  const distance = useSharedValue(0);
  const offset = useSharedValue(0);
  const tracking = useSharedValue(false);
  const eligible = useSharedValue(false);
  const notified = useSharedValue(false);
  const startedScope = useSharedValue('');
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const reset = () => {
    'worklet';
    distance.value = reduced ? 0 : withSpring(0, spring.spatial.fast);
    tracking.value = false;
    eligible.value = false;
  };
  useAnimatedReaction(
    () => ({ active, scope }),
    (next, previous) => {
      if (previous && (next.active !== previous.active || next.scope !== previous.scope)) {
        distance.value = 0;
        tracking.value = false;
        eligible.value = false;
      }
    },
  );
  const update = (next: number) => {
    'worklet';
    distance.value = Math.max(0, next);
    if (tobPullArmed(next) && !notified.value) {
      notified.value = true;
      runOnJS(haptic)('pull');
    }
  };
  const release = (travel: number) => {
    const outcome = tobPullOutcome({ distance: travel, href, hostId, enabled: active });
    if (outcome === 'tob' && href !== undefined) onOpen(href);
    else if (outcome === 'refresh') onRefresh();
  };
  const pullScroll = useAnimatedScrollHandler({
    onBeginDrag(event) {
      if (android) return;
      const y = event.contentOffset.y + event.contentInset.top;
      tracking.value = true;
      eligible.value = tobPullCanStart(y, active);
      notified.value = false;
      startedScope.value = scope;
    },
    onScroll(event) {
      offset.value = event.contentOffset.y + event.contentInset.top;
      if (!android && tracking.value && eligible.value && active && startedScope.value === scope)
        update(-offset.value);
    },
    onEndDrag(event) {
      if (android) return;
      if (tracking.value && eligible.value && active && startedScope.value === scope)
        runOnJS(release)(Math.max(0, -(event.contentOffset.y + event.contentInset.top)));
      reset();
    },
  });
  const scroll = useComposedEventHandler([onScroll, pullScroll]);
  const native = Gesture.Native();
  const pan = Gesture.Pan()
    .enabled(android && active && hostId !== undefined)
    .manualActivation(true)
    .simultaneousWithExternalGesture(native)
    .onTouchesDown((event, manager) => {
      const touch = event.allTouches[0];
      if (
        touch === undefined ||
        event.numberOfTouches !== 1 ||
        !tobPullCanStart(offset.value, active)
      ) {
        manager.fail();
        return;
      }
      startX.value = touch.absoluteX;
      startY.value = touch.absoluteY;
      notified.value = false;
      startedScope.value = scope;
    })
    .onTouchesMove((event, manager) => {
      const touch = event.allTouches[0];
      if (touch === undefined || event.numberOfTouches !== 1) {
        manager.fail();
        return;
      }
      const x = touch.absoluteX - startX.value;
      const y = touch.absoluteY - startY.value;
      if (Math.abs(x) > tobPull.horizontalFail || y < -tobPull.start) manager.fail();
      else if (y >= tobPull.start) manager.activate();
    })
    .onUpdate((event) => {
      if (active && startedScope.value === scope) update(event.translationY * tobPull.resistance);
    })
    .onEnd((event) => {
      if (active && startedScope.value === scope)
        runOnJS(release)(Math.max(0, event.translationY * tobPull.resistance));
    })
    .onFinalize(reset);
  const travel = useAnimatedStyle(() => ({
    flex: 1,
    transform: [{ translateY: Math.min(distance.value, tobPull.maxTravel) }],
  }));

  if (!enabled || drawer) return children({ onScroll });
  if (hostId === undefined)
    return (
      <PullToRefresh refreshing={refreshing} onRefresh={onRefresh}>
        {(pull) => children({ ...pull, onScroll })}
      </PullToRefresh>
    );
  if (!android)
    return (
      <View style={{ flex: 1 }} testID="pull-to-tob">
        <TobPullIndicator distance={distance} />
        {children({ onScroll: scroll, alwaysBounceVertical: true })}
      </View>
    );
  return (
    <GestureDetector gesture={pan}>
      <View style={{ flex: 1 }} testID="pull-to-tob">
        <TobPullIndicator distance={distance} />
        <Animated.View style={travel}>
          <GestureDetector gesture={native}>{children({ onScroll: scroll })}</GestureDetector>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
