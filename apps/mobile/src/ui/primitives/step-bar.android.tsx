import {
  Button,
  FilledTonalIconButton,
  Host,
  Icon,
  LoadingIndicator,
  Row,
  Text,
} from '@expo/ui/jetpack-compose';
import {
  fillMaxWidth,
  height as fixedHeight,
  semantics,
  size,
  testID,
  weight,
} from '@expo/ui/jetpack-compose/modifiers';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDesignTheme } from '../design/theme';
import { loadingIndicator, materialIconButton, space, stepBar } from '../design/tokens';
import { useStrings } from '../strings';
import { Text as BodyText } from './text';
import { stepBarAccessibilityLabel, stepBarLabel, type StepBarProps } from './step-bar';

export { stepBarLabel } from './step-bar';
export type { StepBarAction, StepBarProps } from './step-bar';

export function StepBar({ primary, back, step, note, error }: StepBarProps) {
  const t = useStrings();
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const height = Math.max(theme.touch, stepBar.height.android);
  const spinner = loadingIndicator.control + space.x2;
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
        ignoreSafeAreaKeyboardInsets
      >
        <Row
          horizontalArrangement={{ spacedBy: stepBar.gap }}
          verticalAlignment="center"
          modifiers={[fillMaxWidth()]}
        >
          {back ? (
            <FilledTonalIconButton
              onClick={back.onPress}
              modifiers={[
                size(height, height),
                semantics({ contentDescription: back.label }),
                testID(back.testID),
              ]}
            >
              <Icon
                source={require('../../../assets/toolbar/back.png')}
                size={materialIconButton.iconSize}
              />
            </FilledTonalIconButton>
          ) : null}
          <Button
            enabled={!primary.disabled && !primary.busy}
            onClick={primary.onPress}
            modifiers={[
              weight(1),
              fixedHeight(height),
              semantics({ contentDescription: stepBarAccessibilityLabel(t, primary.label, step) }),
              testID(primary.testID),
            ]}
          >
            <Row horizontalArrangement={{ spacedBy: space.x3 }} verticalAlignment="center">
              {primary.busy ? <LoadingIndicator modifiers={[size(spinner, spinner)]} /> : null}
              <Text style={{ typography: 'labelLarge' }}>{stepBarLabel(primary.label, step)}</Text>
            </Row>
          </Button>
        </Row>
      </Host>
    </View>
  );
}
