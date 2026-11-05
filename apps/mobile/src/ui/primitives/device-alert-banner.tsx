import { Pressable, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  SlideInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import type { LocalApprovalAlert } from '../../host/device-alerts';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { alertBanners } from '../../host/alert-banners';
import { pressTint, useDesignTheme } from '../design/theme';
import { alertOverlay, motion, radius, space } from '../design/tokens';
import type { InAppAlertStyle } from '../interface-preferences';
import { useDeviceAlert } from './use-device-alert';
import { useSystemReducedMotion } from './use-system-reduced-motion';
import { useStrings } from '../strings';
import { Text } from './text';
import { DeviceAlertAvatar } from './device-alert-avatar';

export function DeviceAlertBanner({ placement = 'inline' }: { placement?: InAppAlertStyle }) {
  const alert = useDeviceAlert(placement);
  if (!alert) return null;
  return (
    <AlertCard
      key={JSON.stringify([alert.data.hostId, alert.data.itemId])}
      alert={alert}
      placement={placement}
    />
  );
}

function AlertCard({
  alert,
  placement,
}: {
  alert: LocalApprovalAlert;
  placement: InAppAlertStyle;
}) {
  const theme = useDesignTheme();
  const t = useStrings();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const keyboard = useKeyboardState((state) => (state.isVisible ? state.height : 0));
  const reduced = useSystemReducedMotion();
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const active = () => {
    const current = alertBanners.getSnapshot();
    return current?.data.hostId === alert.data.hostId && current.data.itemId === alert.data.itemId;
  };
  const dismiss = () => {
    if (active()) alertBanners.dismiss();
  };
  const open = () => {
    if (active()) alertBanners.open();
  };
  const pan = Gesture.Pan()
    .minDistance(alertOverlay.swipeStart)
    .onUpdate((event) => {
      const horizontal = Math.abs(event.translationX) >= Math.abs(event.translationY);
      x.set(horizontal ? event.translationX : 0);
      y.set(horizontal ? 0 : Math.min(0, event.translationY));
    })
    .onEnd((event, success) => {
      if (!success) return;
      const horizontal = Math.abs(event.translationX) >= Math.abs(event.translationY);
      const travel = horizontal ? Math.abs(event.translationX) : -event.translationY;
      const velocity = horizontal
        ? event.velocityX * Math.sign(event.translationX)
        : -event.velocityY;
      if (
        travel >= alertOverlay.swipeCommit ||
        (travel >= alertOverlay.swipeStart && velocity >= alertOverlay.swipeFlick)
      ) {
        scheduleOnRN(dismiss);
      }
    })
    .onFinalize(() => {
      x.set(reduced ? 0 : withSpring(0, { duration: alertOverlay.settle, dampingRatio: 0.8 }));
      y.set(reduced ? 0 : withSpring(0, { duration: alertOverlay.settle, dampingRatio: 0.8 }));
    });
  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }],
  }));
  const content = (
    <View
      accessibilityLiveRegion="polite"
      onAccessibilityEscape={dismiss}
      testID="device-alert-banner"
    >
      <Pressable
        testID="device-alert-preview"
        accessibilityRole="button"
        accessibilityLabel={`${alert.title}. ${alert.body}`}
        accessibilityHint={t.alertOpen}
        onPress={open}
        accessibilityActions={[{ name: 'dismiss', label: t.alertDismiss }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'dismiss') dismiss();
        }}
        android_ripple={{ color: pressTint(theme.color.fg) }}
        style={{ padding: space.x4, flexDirection: 'row', alignItems: 'flex-start', gap: space.x3 }}
      >
        <DeviceAlertAvatar alert={alert} />
        <View style={{ flex: 1, minWidth: 0, gap: space.x3 }}>
          <Text testID="device-alert-title" strong numberOfLines={1} ellipsizeMode="tail">
            {alert.title}
          </Text>
          <Text testID="device-alert-preview-text" numberOfLines={2} ellipsizeMode="tail">
            {alert.body}
          </Text>
        </View>
      </Pressable>
    </View>
  );
  if (placement === 'inline')
    return (
      <SafeAreaView edges={['top']} style={{ backgroundColor: theme.color.elevated }}>
        <GestureDetector gesture={pan}>
          <Animated.View style={dragStyle}>{content}</Animated.View>
        </GestureDetector>
      </SafeAreaView>
    );
  return (
    <View
      pointerEvents="box-none"
      testID="device-alert-overlay"
      style={{
        position: 'absolute',
        top: insets.top + space.x2,
        left: insets.left + space.x4,
        right: insets.right + space.x4,
      }}
    >
      <GestureDetector gesture={pan}>
        <Animated.View
          key={JSON.stringify([alert.data.hostId, alert.data.itemId])}
          {...(reduced ? {} : { entering: SlideInUp.duration(motion.drawer) })}
          style={[
            dragStyle,
            {
              backgroundColor: theme.color.elevated,
              borderRadius: radius.lg,
              overflow: 'hidden',
              maxHeight: Math.max(
                0,
                Math.min(
                  (height - insets.top - insets.bottom) * alertOverlay.maxHeightFraction,
                  height - keyboard - insets.top - insets.bottom - space.x2 * 2,
                ),
              ),
            },
          ]}
        >
          {content}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
