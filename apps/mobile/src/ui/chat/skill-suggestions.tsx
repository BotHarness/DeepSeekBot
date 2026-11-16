import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { useLiquidGlass } from '../primitives/drawer-material';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { ComposerFieldMaterial } from './composer-chrome';
import type { SkillOption } from './skill-draft';
import { SkillOwnerMark, skillOwnerName } from './skill-owner';

const ICON = 24;
const SHARE = 0.5;

export function SkillSuggestions({
  options,
  onChoose,
}: {
  options: readonly SkillOption[];
  onChoose(option: SkillOption): void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
  const corner = glass ? radius.xl : radius.lg;
  const { height } = useWindowDimensions();
  const { top } = useSafeAreaInsets();
  const keyboard = useKeyboardState((state) => (state.isVisible ? state.height : 0));
  const maxHeight = Math.max(theme.touch * 2, (height - keyboard - top) * SHARE);
  if (options.length === 0) return null;
  return (
    <View
      testID="skill-suggestions"
      accessibilityLabel={t.skillSuggestions}
      style={{
        marginBottom: space.x2,
        maxHeight,
        borderRadius: corner,
        overflow: 'hidden',
        ...(glass
          ? {}
          : {
              borderWidth: edge.hairline,
              borderColor: theme.layer.sheet.edge,
              backgroundColor: theme.layer.sheet.fill,
            }),
      }}
    >
      {glass ? <ComposerFieldMaterial cornerRadius={corner} /> : null}
      <ScrollView
        testID="skill-suggestions-list"
        keyboardShouldPersistTaps="always"
        contentContainerStyle={{ paddingVertical: glass ? space.x3 : space.x1 }}
      >
        {options.map((option) => {
          const owner = skillOwnerName(option, t.skillOwnerHost);
          return (
            <Pressable
              key={`${option.owner.kind}:${owner}:${option.name}`}
              testID={`skill-option-${option.name}`}
              accessibilityRole="button"
              accessibilityLabel={t.skillOption(option.name, owner)}
              {...(option.description === '' ? {} : { accessibilityHint: option.description })}
              onPress={() => onChoose(option)}
              style={({ pressed }) => ({
                minHeight: theme.touch,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.x3,
                paddingHorizontal: glass ? space.x5 : space.x4,
                paddingVertical: space.x2,
                backgroundColor: pressed ? theme.layer.sheet.pressed : undefined,
              })}
            >
              <SkillOwnerMark option={option} size={ICON} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.x2 }}>
                  <Text strong>/{option.name}</Text>
                  <Text variant="meta" tone="muted">
                    {owner}
                  </Text>
                </View>
                {option.description === '' ? null : (
                  <Text variant="meta" tone="muted" numberOfLines={2}>
                    {option.description}
                  </Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
