import { View } from 'react-native';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { CloudIcon, ComputerIcon } from '../shell/icons';
import { t } from '../strings';
export function SourceName({ name, source }: { name: string; source: 'computer' | 'cloud' }) {
  const theme = useDesignTheme();
  const Icon = source === 'cloud' ? CloudIcon : ComputerIcon;
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
        <Icon color={theme.color.subtle} size={theme.type.meta.size * theme.fontScale} />
      </View>
    </View>
  );
}
