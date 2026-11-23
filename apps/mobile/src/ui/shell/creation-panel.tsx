import { useRef, useState, type ComponentRef, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  ReduceMotion,
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spring } from '../design/motion';
import { useDesignTheme } from '../design/theme';
import { creationCard, fab, radius, space, swipeOpen } from '../design/tokens';
import { useSystemReducedMotion } from '../primitives/use-system-reduced-motion';
import { useStrings } from '../strings';
import { PlusIcon } from './icons';
import { NavigationMaterial } from './navigation-material';

type CreationLevel = 'actions' | 'sources';

export type CreationPanelControls = {
  level: CreationLevel;
  showSources(): void;
  back(): void;
  dismiss(action?: () => void): void;
  firstAction: React.RefObject<ComponentRef<typeof Pressable> | null>;
};

export function CreationPanel({
  bottom,
  onDismiss,
  children,
}: {
  bottom: number;
  onDismiss(action?: () => void): void;
  children(controls: CreationPanelControls): ReactNode;
}) {
  const theme = useDesignTheme();
  const t = useStrings();
  const insets = useSafeAreaInsets();
  const viewport = useWindowDimensions();
  const reduced = useSystemReducedMotion();
  const android = Platform.OS === 'android';
  const width = Math.min(
    fab.menuWidth * Math.max(1, theme.fontScale),
    viewport.width - insets.left - insets.right - fab.margin * 2,
  );
  const maxHeight = viewport.height - bottom - insets.top - space.x4;
  const [visible, setVisible] = useState(true);
  const [level, setLevel] = useState<CreationLevel>('actions');
  const [interactive, setInteractive] = useState(false);
  const levelChanging = useRef(false);
  const levelNeedsLayout = useRef(false);
  const levelOpacity = useSharedValue(1);
  const height = useSharedValue(0);
  const measured = useRef(0);
  const shown = useRef(false);
  const entered = useRef(false);
  const closing = useRef(false);
  const picked = useRef<(() => void) | undefined>(undefined);
  const firstAction = useRef<ComponentRef<typeof Pressable>>(null);
  const progress = useSharedValue(0);
  const shapeStyle = useAnimatedStyle(() => ({
    width: reduced ? width : interpolate(progress.value, [0, 1], [fab.size, width]),
    height: reduced ? height.value : interpolate(progress.value, [0, 1], [fab.size, height.value]),
    borderRadius: reduced
      ? radius.xl
      : interpolate(progress.value, [0, 1], [android ? fab.radius : fab.size / 2, radius.xl]),
    opacity: reduced ? progress.value : 1,
  }));
  const contentStyle = useAnimatedStyle(() => ({
    opacity:
      levelOpacity.value *
      (reduced ? progress.value : interpolate(progress.value, [0.985, 1], [0, 1], 'clamp')),
  }));
  const iconStyle = useAnimatedStyle(() => ({
    opacity: reduced ? 0 : interpolate(progress.value, [0, 0.45], [1, 0], 'clamp'),
  }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const focus = () => {
    levelChanging.current = false;
    if (closing.current) return;
    setInteractive(true);
    if (firstAction.current)
      AccessibilityInfo.sendAccessibilityEvent?.(firstAction.current, 'focus');
  };
  const finish = () => onDismiss(picked.current);
  const remove = () => {
    setVisible(false);
    if (Platform.OS !== 'ios') finish();
  };
  const animate = (next: number, done: () => void) => {
    const complete = (finished?: boolean) => {
      'worklet';
      if (finished) runOnJS(done)();
    };
    progress.value = reduced
      ? withTiming(
          next,
          { duration: creationCard.fadeDuration, reduceMotion: ReduceMotion.Never },
          complete,
        )
      : withSpring(next, { ...spring.release, overshootClamping: true }, complete);
  };
  const show = (measuredHeight: number) => {
    if (entered.current || closing.current || !shown.current || measuredHeight <= 0) return;
    entered.current = true;
    animate(1, focus);
  };
  const dismiss = (action?: () => void) => {
    if (closing.current) return;
    closing.current = true;
    picked.current = action;
    if (entered.current) animate(0, remove);
    else remove();
  };
  const switchLevel = (next: CreationLevel) => {
    if (next === level || levelChanging.current || closing.current) return;
    levelChanging.current = true;
    setInteractive(false);
    const changeContent = () => {
      if (closing.current) return;
      levelNeedsLayout.current = true;
      setLevel(next);
    };
    if (reduced) {
      levelOpacity.value = withTiming(
        0,
        { duration: creationCard.fadeDuration, reduceMotion: ReduceMotion.Never },
        (finished) => {
          if (finished) runOnJS(changeContent)();
        },
      );
    } else {
      levelOpacity.value = 0;
      changeContent();
    }
  };
  const back = () => (level === 'sources' ? switchLevel('actions') : dismiss());
  const measure = (next: number) => {
    measured.current = next;
    if (levelNeedsLayout.current) {
      levelNeedsLayout.current = false;
      const fade = () => {
        'worklet';
        levelOpacity.value = withTiming(
          1,
          { duration: creationCard.fadeDuration, reduceMotion: ReduceMotion.Never },
          (finished) => {
            if (finished) runOnJS(focus)();
          },
        );
      };
      if (reduced) {
        height.value = next;
        fade();
      } else {
        height.value = withTiming(
          next,
          { duration: creationCard.levelDuration, easing: Easing.out(Easing.cubic) },
          (finished) => {
            if (finished) fade();
          },
        );
      }
      return;
    }
    if (!levelChanging.current) height.value = next;
    show(next);
  };
  const edgeBack = Gesture.Pan()
    .enabled(Platform.OS === 'ios')
    .activeOffsetX(space.x4)
    .failOffsetY([-space.x5, space.x5])
    .onEnd((event) => {
      if (event.x - event.translationX <= swipeOpen.start && event.translationX > swipeOpen.commit)
        runOnJS(back)();
    });
  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      onShow={() => {
        shown.current = true;
        show(measured.current);
      }}
      onDismiss={finish}
      onRequestClose={back}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1 }} accessibilityViewIsModal onAccessibilityEscape={back}>
          <GestureDetector gesture={edgeBack}>
            <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]}>
              <Pressable
                testID="chats-create-scrim"
                accessibilityRole="button"
                accessibilityLabel={t.close}
                onAccessibilityEscape={back}
                onPress={() => dismiss()}
                style={[
                  StyleSheet.absoluteFill,
                  { backgroundColor: theme.scrim, minHeight: theme.touch },
                ]}
              />
            </Animated.View>
          </GestureDetector>
          <View
            testID="chats-create-card"
            pointerEvents="box-none"
            style={{ position: 'absolute', right: insets.right + fab.margin, bottom, width }}
          >
            <Animated.View
              pointerEvents="none"
              style={[
                { position: 'absolute', right: 0, bottom: 0, overflow: 'hidden' },
                android && { backgroundColor: theme.layer.raised.fill },
                shapeStyle,
              ]}
            >
              {!android ? <NavigationMaterial rounded /> : null}
            </Animated.View>
            <Animated.View
              style={contentStyle}
              pointerEvents={interactive ? 'auto' : 'none'}
              accessibilityElementsHidden={!interactive}
              importantForAccessibility={interactive ? 'auto' : 'no-hide-descendants'}
            >
              <ScrollView
                key={level}
                testID={`chats-create-${level}-list`}
                bounces={false}
                style={{ maxHeight }}
                onLayout={({ nativeEvent }) => measure(nativeEvent.layout.height)}
                contentContainerStyle={{ padding: space.x3, gap: space.x2 }}
              >
                {children({
                  dismiss,
                  firstAction,
                  level,
                  showSources: () => switchLevel('sources'),
                  back,
                })}
              </ScrollView>
            </Animated.View>
            <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: 'absolute',
                  right: 0,
                  bottom: 0,
                  width: fab.size,
                  height: fab.size,
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                iconStyle,
              ]}
            >
              <PlusIcon color={theme.color.fg} size={theme.type.title.line * theme.fontScale} />
            </Animated.View>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
