import { router } from 'expo-router';
import { Pressable } from 'react-native';
import { hostColorInk } from '@botharness/host-client/ui/design/host-look';
import { useHostLook } from '../../host/native-host-look';
import { capsuleRadius } from '../../ui/design/large-text-fallback';
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
  const glyph = clampScaledIconSize(
    theme.type.body.line,
    theme.fontScale,
    theme.type.body.line * 1.6,
  );
  const chevron = clampScaledIconSize(
    theme.type.meta.line,
    theme.fontScale,
    theme.type.meta.line * 1.6,
  );
  return (
    <Pressable
      testID="session-drawer-environment"
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={t.environmentSheet.switch}
      onPress={() => router.push('/environment')}
      android_ripple={{ color: pressTint(theme.color.fg), foreground: true }}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        flexShrink: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x2,
        paddingLeft: space.x3,
        paddingRight: space.x4,
        borderRadius: capsuleRadius(theme.fontScale),
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
      <Text strong numberOfLines={theme.largeText ? 2 : 1} style={{ flexShrink: 1 }}>
        {title}
      </Text>
      <ChevronDownIcon color={theme.color.muted} size={chevron} />
    </Pressable>
  );
}
