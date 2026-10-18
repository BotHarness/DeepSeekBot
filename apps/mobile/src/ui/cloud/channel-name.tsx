import { View } from 'react-native';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { CloudIcon } from '../shell/icons';
import { t } from '../strings';

export function CloudChannelName({ name }: { name: string }) {
  const theme = useDesignTheme();
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={`${name} · ${t.cloudChannels.cloudChannel}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.x2 }}
    >
      <Text variant="title" style={{ flexShrink: 1 }}>
        {name}
      </Text>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <CloudIcon color={theme.color.subtle} size={theme.type.title.size * theme.fontScale} />
      </View>
    </View>
  );
}
