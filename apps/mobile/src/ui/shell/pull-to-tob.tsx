import { useRef, type ReactElement } from 'react';
import { Platform, View, type ScrollViewProps, type ViewInstance } from 'react-native';
import { Gesture, GestureDetector, State } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { spring } from '../design/motion';
import { tobPull } from '../design/tokens';
import { haptic } from '../haptics';
import { useMounted } from '../mounted';
import { useSystemReducedMotion } from '../primitives/use-system-reduced-motion';
import { PullToRefresh, type PullToRefreshScrollProps } from '../primitives/pull-to-refresh';
import { useHostDrawerOpen } from './host-drawer';
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
  children,
}: {
  enabled: boolean;
  scope: string;
  hostId: string | undefined;
  href: TobModeHref | undefined;
  refreshing: boolean;
  onRefresh(): void;
  onOpen(href: TobModeHref): void;
  children(
    scroll: PullToRefreshScrollProps & Pick<ScrollViewProps, 'onScroll' | 'alwaysBounceVertical'>,
  ): ReactElement;
}) {
  const reduced = useSystemReducedMotion();
  const drawer = useHostDrawerOpen();
  const active = enabled && !drawer && !refreshing;
  const current = useRef({ active, scope, hostId, href, onOpen, onRefresh });
  current.current = { active, scope, hostId, href, onOpen, onRefresh };
  const mounted = useRef(false);
  const mount = useMounted<ViewInstance>(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
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
  const release = (travel: number, dragScope: string) => {
    const target = current.current;
    if (!mounted.current || !target.active || target.scope !== dragScope) return;
    const outcome = tobPullOutcome({ distance: travel, href: target.href, hostId: target.hostId });
    if (outcome === 'tob' && target.href !== undefined) target.onOpen(target.href);
    else if (outcome === 'refresh') target.onRefresh();
  };
  const pullScroll = useAnimatedScrollHandler({
    onBeginDrag(event) {
      const y = event.contentOffset.y + event.contentInset.top;
      offset.value = y;
      if (android) {
        if (!tobPullCanStart(y, active)) eligible.value = false;
        return;
      }
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
        runOnJS(release)(
          Math.max(0, -(event.contentOffset.y + event.contentInset.top)),
          startedScope.value,
        );
      reset();
    },
  });
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
      eligible.value = true;
      tracking.value = true;
      startX.value = touch.absoluteX;
      startY.value = touch.absoluteY;
      notified.value = false;
      startedScope.value = scope;
    })
    .onTouchesMove((event, manager) => {
      const touch = event.allTouches[0];
      if (
        touch === undefined ||
        event.numberOfTouches !== 1 ||
        !eligible.value ||
        !active ||
        startedScope.value !== scope
      ) {
        manager.fail();
        return;
      }
      if (event.state === State.ACTIVE) return;
      const x = touch.absoluteX - startX.value;
      const y = touch.absoluteY - startY.value;
      if (Math.abs(x) > tobPull.horizontalFail || y < -tobPull.start) manager.fail();
      else if (y >= tobPull.start) manager.activate();
    })
    .onUpdate((event) => {
      if (eligible.value && active && startedScope.value === scope)
        update(event.translationY * tobPull.resistance);
    })
    .onEnd((event) => {
      if (eligible.value && active && startedScope.value === scope)
        runOnJS(release)(Math.max(0, event.translationY * tobPull.resistance), startedScope.value);
    })
    .onFinalize(reset);
  const travel = useAnimatedStyle(() => ({
    flex: 1,
    transform: [{ translateY: Math.min(distance.value, tobPull.maxTravel) }],
  }));

  if (hostId === undefined) {
    if (!enabled || drawer) return children({});
    return (
      <PullToRefresh refreshing={refreshing} onRefresh={onRefresh}>
        {(pull) => children(pull)}
      </PullToRefresh>
    );
  }
  if (!android)
    return (
      <View ref={mount} style={{ flex: 1 }} testID="pull-to-tob">
        <TobPullIndicator distance={distance} />
        {children({ onScroll: pullScroll, alwaysBounceVertical: true })}
      </View>
    );
  return (
    <GestureDetector gesture={pan}>
      <View ref={mount} style={{ flex: 1 }} testID="pull-to-tob">
        <TobPullIndicator distance={distance} />
        <Animated.View style={travel}>
          <GestureDetector gesture={native}>{children({ onScroll: pullScroll })}</GestureDetector>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
