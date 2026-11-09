import { View } from 'react-native';
import { useDesignTheme } from '../design/theme';
import { conversationType, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { hostColorInk, type HostLook } from '../design/host-look';
import { HostGlyph } from '../shell/host-tile';
import { CloudIcon, ComputerIcon } from '../shell/icons';
import { useStrings } from '../strings';
export function SourceName({
  name,
  source,
  look,
  sourceLabel,
  lines = 1,
  glyph = true,
}: {
  /** False when the row shows its environment elsewhere (All view rail) or not at all. */
  glyph?: boolean;
  sourceLabel?: string | undefined;
  lines?: number;
  name: string;
  source: 'computer' | 'cloud';
  look?: HostLook | undefined;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const Icon = source === 'cloud' ? CloudIcon : ComputerIcon;
  const size = theme.type.meta.size * theme.fontScale;
  return (
    <View
      accessible
      accessibilityLabel={`${name}${sourceLabel ? `, ${sourceLabel}` : ''}, ${source === 'cloud' ? t.cloudChannels.cloudChannel : t.computerChannel}`}
      style={{
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x2,
      }}
    >
      <Text
        dynamicTypeRamp="headline"
        numberOfLines={lines}
        ellipsizeMode="tail"
        style={[conversationType.name, { flex: 1, minWidth: 0 }]}
      >
        {name}
      </Text>
      {glyph ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ flexShrink: 0 }}
        >
          {source === 'computer' && look !== undefined ? (
            <HostGlyph
              icon={look.icon}
              size={size}
              color={hostColorInk(theme.scheme, theme.color, look.color)}
            />
          ) : (
            <Icon color={theme.color.subtle} size={size} />
          )}
        </View>
      ) : null}
    </View>
  );
}

export function SourceMark({
  source,
  look,
  ink,
}: {
  source: 'computer' | 'cloud';
  look?: HostLook | undefined;
  ink?: string | undefined;
}) {
  const theme = useDesignTheme();
  const Icon = source === 'cloud' ? CloudIcon : ComputerIcon;
  const size = theme.type.meta.size * Math.min(theme.fontScale, 1.2);
  return source === 'computer' && look !== undefined ? (
    <HostGlyph
      icon={look.icon}
      size={size}
      color={ink ?? hostColorInk(theme.scheme, theme.color, look.color)}
    />
  ) : (
    <Icon color={ink ?? theme.color.subtle} size={size} />
  );
}
