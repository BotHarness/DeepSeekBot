import { Pressable, View } from 'react-native';

import { BotAvatar } from '../bot-avatar';
import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { useLiquidGlass } from '../primitives/drawer-material';
import { SystemSymbol } from '../primitives/system-symbol';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { ComposerFieldMaterial } from './composer-chrome';
import type { SkillOption } from './skill-draft';

const ICON = 24;

export function skillOwnerName(option: SkillOption, host: string): string {
  if (option.owner.kind === 'host') return host;
  if (option.owner.kind === 'workspace') return option.owner.name;
  return option.bot?.displayName ?? option.owner.botSlug;
}

export function SkillOwnerMark({ option, size }: { option: SkillOption; size: number }) {
  const theme = useDesignTheme();
  if (option.owner.kind === 'bot' && option.bot !== undefined)
    return <BotAvatar bot={option.bot} size={size} ring={false} />;
  return (
    <SystemSymbol
      name={
        option.owner.kind === 'workspace'
          ? { ios: 'folder', android: 'folder' }
          : { ios: 'desktopcomputer', android: 'computer' }
      }
      size={size}
      color={theme.color.muted}
    />
  );
}

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
  if (options.length === 0) return null;
  return (
    <View
      testID="skill-suggestions"
      accessibilityLabel={t.skillSuggestions}
      style={{
        marginBottom: space.x2,
        paddingVertical: glass ? space.x3 : space.x1,
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
    </View>
  );
}
