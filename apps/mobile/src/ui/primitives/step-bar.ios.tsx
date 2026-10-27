import { Host } from '@expo/ui';
import { Button, HStack, Image, ProgressView, Text } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  controlSize,
  disabled,
  font,
  frame,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDesignTheme } from '../design/theme';
import { space, stepBar } from '../design/tokens';
import { useStrings } from '../strings';
import { useLiquidGlass } from './drawer-material';
import { Text as BodyText } from './text';
import { stepBarAccessibilityLabel, stepBarLabel, type StepBarProps } from './step-bar';

export { stepBarLabel } from './step-bar';
export type { StepBarAction, StepBarProps } from './step-bar';

export function StepBar({ primary, back, step, note, error }: StepBarProps) {
  const t = useStrings();
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
  const insets = useSafeAreaInsets();
  const label = Math.max(theme.touch, stepBar.height.ios) - space.x5;
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
        <BodyText accessibilityRole="alert" tone="danger" selectable>
          {error}
        </BodyText>
      ) : null}
      {note ? (
        <BodyText variant="meta" tone="muted" accessibilityLiveRegion="polite">
          {note}
        </BodyText>
      ) : null}
      <Host
        matchContents={{ vertical: true }}
        colorScheme={theme.scheme}
        seedColor={theme.color.accent}
      >
        <HStack spacing={stepBar.gap}>
          {back ? (
            <Button
              testID={back.testID}
              onPress={back.onPress}
              modifiers={[
                buttonStyle(glass ? 'glass' : 'bordered'),
                buttonBorderShape('circle'),
                controlSize('large'),
                accessibilityLabel(back.label),
              ]}
            >
              <Image
                systemName="chevron.left"
                modifiers={[
                  font({ textStyle: 'body', weight: 'semibold' }),
                  frame({ width: label, height: label }),
                ]}
              />
            </Button>
          ) : null}
          <Button
            testID={primary.testID}
            onPress={primary.onPress}
            modifiers={[
              buttonStyle(glass ? 'glassProminent' : 'borderedProminent'),
              buttonBorderShape('capsule'),
              controlSize('large'),
              tint(theme.color.accent),
              disabled(Boolean(primary.disabled || primary.busy)),
              accessibilityLabel(stepBarAccessibilityLabel(t, primary.label, step)),
            ]}
          >
            <HStack
              spacing={space.x3}
              modifiers={[frame({ maxWidth: Infinity, minHeight: label })]}
            >
              {primary.busy ? <ProgressView /> : null}
              <Text modifiers={[font({ textStyle: 'body', weight: 'semibold' })]}>
                {stepBarLabel(primary.label, step)}
              </Text>
            </HStack>
          </Button>
        </HStack>
      </Host>
    </View>
  );
}
