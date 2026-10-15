import type { ComponentType, Ref } from 'react';
import { Pressable, View, type ColorValue } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { CpuIcon, FolderIcon } from '../shell/icons';
import { t } from '../strings';

function ComposerChip({
  Icon,
  label,
  accessibilityLabel,
  onPress,
}: {
  Icon: ComponentType<{ color: ColorValue; size: number }>;
  label: string;
  accessibilityLabel: string;
  onPress(): void;
}) {
  const theme = useDesignTheme();
  const height = theme.type.meta.line + space.x4;
  const slop = Math.max(0, (theme.touch - height) / 2);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={{ top: slop, bottom: slop, left: space.x1, right: space.x1 }}
      style={({ pressed }) => ({
        flexShrink: 1,
        minHeight: height,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x2,
        paddingHorizontal: space.x4,
        borderRadius: radius.round,
        backgroundColor: pressed ? theme.layer.canvas.pressed : theme.layer.canvas.selected,
      })}
    >
      <Icon color={theme.color.muted} size={theme.type.meta.size} />
      <Text variant="meta" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ComposerFooter({
  botName,
  model,
  workspace,
  onModel,
  onWorkspace,
  mountRef,
}: {
  mountRef?: Ref<View>;
  botName: string;
  model: string;
  workspace: string;
  onModel(): void;
  onWorkspace(): void;
}) {
  return (
    <View
      ref={mountRef}
      accessibilityLabel={t.composerContext}
      style={{ flexDirection: 'row', gap: space.x3, paddingHorizontal: space.x2 }}
    >
      <ComposerChip
        Icon={CpuIcon}
        label={model}
        accessibilityLabel={`${t.contextModel} · ${botName} · ${model}`}
        onPress={onModel}
      />
      <ComposerChip
        Icon={FolderIcon}
        label={workspace}
        accessibilityLabel={`${t.contextWorkspace} · ${botName} · ${workspace}`}
        onPress={onWorkspace}
      />
    </View>
  );
}
