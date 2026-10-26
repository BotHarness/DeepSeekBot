import { View } from 'react-native';
import { useDesignTheme } from '../design/theme';
import { chatList, space } from '../design/tokens';
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
}: {
  sourceLabel?: string | undefined;
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
      <Text strong numberOfLines={1} ellipsizeMode="tail" style={{ flexShrink: 1 }}>
        {name}
      </Text>
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
      {sourceLabel ? (
        <Text
          variant="meta"
          tone="subtle"
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{
            minWidth: 0,
            maxWidth: chatList.sourceLabelMaxWidth,
            flexShrink: chatList.sourceLabelShrink,
          }}
        >
          {sourceLabel}
        </Text>
      ) : null}
    </View>
  );
}
