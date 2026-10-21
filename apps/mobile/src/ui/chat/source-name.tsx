import { View } from 'react-native';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { hostColorInk, type HostLook } from '../design/host-look';
import { HostGlyph } from '../shell/host-tile';
import { CloudIcon, ComputerIcon } from '../shell/icons';
import { t } from '../strings';
export function SourceName({
  name,
  source,
  look,
}: {
  name: string;
  source: 'computer' | 'cloud';
  look?: HostLook | undefined;
}) {
  const theme = useDesignTheme();
  const Icon = source === 'cloud' ? CloudIcon : ComputerIcon;
  const size = theme.type.meta.size * theme.fontScale;
  return (
    <View
      accessible
      accessibilityLabel={`${name}, ${source === 'cloud' ? t.cloudChannels.cloudChannel : t.computerChannel}`}
      style={{
        ...(theme.largeText ? { alignSelf: 'stretch' as const } : { flex: 1 }),
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x2,
      }}
    >
      <Text strong numberOfLines={theme.largeText ? 2 : 1} style={{ flexShrink: 1 }}>
        {name}
      </Text>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {source === 'computer' && look !== undefined ? (
          <HostGlyph
            icon={look.icon}
            size={size}
            color={
              look.color === undefined
                ? theme.color.subtle
                : hostColorInk(theme.scheme, theme.color, look.color)
            }
          />
        ) : (
          <Icon color={theme.color.subtle} size={size} />
        )}
      </View>
    </View>
  );
}
