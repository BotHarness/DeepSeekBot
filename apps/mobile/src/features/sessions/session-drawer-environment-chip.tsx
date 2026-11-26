import { router } from 'expo-router';
import { Pressable } from 'react-native';
import { hostColorInk } from '@botharness/host-client/ui/design/host-look';
import { useHostLook } from '../../host/native-host-look';
import { accessibilityTextSize } from '../../ui/design/large-text-fallback';
import { clampScaledIconSize } from '../../ui/design/scaled-icon-size';
import { pressTint, useDesignTheme } from '../../ui/design/theme';
import { space } from '../../ui/design/tokens';
import { DrawerMaterial, useLiquidGlass } from '../../ui/primitives/drawer-material';
import { Text } from '../../ui/primitives/text';
import { HostGlyph } from '../../ui/shell/host-tile';
import { ChatsIcon, ChevronDownIcon } from '../../ui/shell/icons';
import { useStrings } from '../../ui/strings';

export function SessionDrawerEnvironmentChip({
  title,
  hostId,
}: {
  title: string;
  hostId: string | undefined;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
  const look = useHostLook(hostId);
  const glyph = clampScaledIconSize(theme.type.body.line, theme.fontScale, theme.touch - space.x4);
  const chevron = clampScaledIconSize(
    theme.type.meta.line,
    theme.fontScale,
    theme.type.meta.line * 1.3,
  );
  const iconOnly = accessibilityTextSize(theme.fontScale);
  return (
    <Pressable
      testID="session-drawer-environment"
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={t.environmentSheet.switch}
      onPress={() => router.push('/environment')}
      android_ripple={{ color: pressTint(theme.color.fg), foreground: true }}
      style={({ pressed }) => ({
        height: theme.touch,
        flexShrink: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x2,
        paddingLeft: space.x3,
        paddingRight: iconOnly ? space.x3 : space.x4,
        borderRadius: theme.touch / 2,
        overflow: 'hidden',
        opacity: pressed && glass ? 0.7 : 1,
        backgroundColor: glass
          ? undefined
          : pressed
            ? theme.layer.raised.pressed
            : theme.layer.raised.fill,
      })}
    >
      {glass ? <DrawerMaterial /> : null}
      {hostId === undefined ? (
        <ChatsIcon color={theme.color.accent} size={glyph} />
      ) : (
        <HostGlyph
          icon={look.icon}
          size={glyph}
          color={hostColorInk(theme.scheme, theme.color, look.color)}
        />
      )}
      {iconOnly ? null : (
        <Text
          strong
          numberOfLines={1}
          ellipsizeMode="tail"
          maxFontSizeMultiplier={(theme.touch - space.x2) / theme.type.body.line}
          style={{ flexShrink: 1 }}
        >
          {title}
        </Text>
      )}
      <ChevronDownIcon color={theme.color.muted} size={chevron} />
    </Pressable>
  );
}
