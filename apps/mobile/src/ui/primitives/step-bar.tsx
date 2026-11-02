import { Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { buttonColors } from '../design/controls';
import { pressTint, useDesignTheme } from '../design/theme';
import { radius, space, stepBar } from '../design/tokens';
import { ChevronLeftIcon } from '../shell/icons';
import { useStrings } from '../strings';
import { LoadingIndicator } from './loading-indicator';
import { Text } from './text';

import { stepBarAccessibilityLabel, stepBarLabel, type StepBarProps } from './step-bar-contract';

export { stepBarAccessibilityLabel, stepBarLabel } from './step-bar-contract';
export type { StepBarAction, StepBarProps } from './step-bar-contract';

export function StepBar({ primary, back, step, note, error }: StepBarProps) {
  const t = useStrings();
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const height = Math.max(
    theme.touch,
    stepBar.height[Platform.OS === 'android' ? 'android' : 'ios'],
  );
  const colors = buttonColors(theme, 'primary', 'canvas');
  const locked = Boolean(primary.disabled || primary.busy);
  return (
    <View
      style={{
        gap: space.x3,
        paddingHorizontal: space.x5,
        paddingTop: space.x3,
        paddingBottom: insets.bottom + space.x3,
      }}
    >
      {error ? (
        <Text accessibilityRole="alert" tone="danger" selectable>
          {error}
        </Text>
      ) : null}
      {note ? (
        <Text variant="meta" tone="muted" accessibilityLiveRegion="polite">
          {note}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: stepBar.gap }}>
        {back ? (
          <Pressable
            testID={back.testID}
            accessibilityRole="button"
            accessibilityLabel={back.label}
            onPress={back.onPress}
            android_ripple={{ color: pressTint(theme.color.fg) }}
            style={({ pressed }) => ({
              width: height,
              height,
              borderRadius: radius.round,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
              overflow: 'hidden',
            })}
          >
            <ChevronLeftIcon size={space.x6} color={theme.color.fg} />
          </Pressable>
        ) : null}
        <Pressable
          testID={primary.testID}
          accessibilityRole="button"
          accessibilityLabel={stepBarAccessibilityLabel(t, primary.label, step)}
          accessibilityState={{ disabled: locked, busy: Boolean(primary.busy) }}
          disabled={locked}
          onPress={primary.onPress}
          android_ripple={{ color: pressTint(colors.label) }}
          style={({ pressed }) => ({
            flex: 1,
            minHeight: height,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: space.x3,
            paddingHorizontal: space.x5,
            borderRadius: radius.round,
            backgroundColor: pressed ? colors.pressed : colors.fill,
            opacity: primary.disabled ? 0.45 : 1,
            overflow: 'hidden',
          })}
        >
          {primary.busy ? <LoadingIndicator size="control" color={colors.label} /> : null}
          <Text strong style={{ color: colors.label, textAlign: 'center' }}>
            {stepBarLabel(primary.label, step)}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
