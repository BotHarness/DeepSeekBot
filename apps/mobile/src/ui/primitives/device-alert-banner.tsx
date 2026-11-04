import { useSyncExternalStore } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { SlideInUp } from 'react-native-reanimated';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { alertBanners } from '../../host/alert-banners';
import { useDesignTheme } from '../design/theme';
import { alertOverlay, motion, radius, space } from '../design/tokens';
import { interfacePreferences, type InAppAlertStyle } from '../interface-preferences';
import { useSystemReducedMotion } from './use-system-reduced-motion';
import { useStrings } from '../strings';
import { Button } from './button';
import { Text } from './text';

export function DeviceAlertBanner({ placement = 'inline' }: { placement?: InAppAlertStyle }) {
  const alert = useSyncExternalStore(alertBanners.subscribe, alertBanners.getSnapshot);
  const preferences = useSyncExternalStore(
    interfacePreferences.subscribe,
    interfacePreferences.getSnapshot,
  );
  const theme = useDesignTheme();
  const t = useStrings();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const keyboard = useKeyboardState((state) => (state.isVisible ? state.height : 0));
  const reduced = useSystemReducedMotion();
  if (!alert || !preferences.inAppAlerts || preferences.inAppAlertStyle !== placement) return null;
  const content = (
    <View
      accessibilityLiveRegion="polite"
      onAccessibilityEscape={alertBanners.dismiss}
      testID="device-alert-banner"
      style={{ padding: space.x4, gap: space.x3 }}
    >
      <Text strong>{alert.title}</Text>
      <Text>{alert.body}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.x3 }}>
        <Button
          label={t.alertOpen}
          onPress={alertBanners.open}
          testID="device-alert-open"
          variant="text"
        />
        <Button
          label={t.alertDismiss}
          onPress={alertBanners.dismiss}
          testID="device-alert-dismiss"
          variant="text"
        />
      </View>
    </View>
  );
  if (placement === 'inline')
    return (
      <SafeAreaView edges={['top']} style={{ backgroundColor: theme.color.elevated }}>
        {content}
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
      <Animated.View
        key={JSON.stringify([alert.data.hostId, alert.data.itemId])}
        {...(reduced ? {} : { entering: SlideInUp.duration(motion.drawer) })}
        style={{
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
        }}
      >
        <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
          {content}
        </ScrollView>
      </Animated.View>
    </View>
  );
}
