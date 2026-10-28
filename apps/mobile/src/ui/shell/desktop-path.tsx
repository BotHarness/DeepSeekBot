import { View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { RowIcon } from '../primitives/row-icon';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { ChevronRightIcon } from './icons';

/** Where to click on the computer, drawn as the menu path instead of a sentence. */
export function DesktopPath({ steps }: { steps: readonly string[] }) {
  const t = useStrings();
  const theme = useDesignTheme();
  return (
    <View
      testID="desktop-path"
      accessible
      accessibilityLabel={`${t.pairChoice.onComputer}: ${steps.join(', ')}`}
      style={{ alignSelf: 'stretch', gap: space.x3 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3 }}>
        <RowIcon name="computer" color={theme.color.muted} size={theme.type.body.line} />
        <Text variant="meta" tone="muted">
          {t.pairChoice.onComputer}
        </Text>
      </View>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: space.x2,
        }}
      >
        {steps.map((step, index) => (
          <View
            key={step}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.x2,
            }}
          >
            <View
              style={{
                paddingHorizontal: space.x4,
                paddingVertical: space.x2,
                borderRadius: radius.sm,
                backgroundColor: theme.layer.well.fill,
              }}
            >
              <Text variant="meta" strong={index === steps.length - 1}>
                {step}
              </Text>
            </View>
            {index < steps.length - 1 ? (
              <ChevronRightIcon color={theme.color.muted} size={theme.type.meta.line} />
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}
