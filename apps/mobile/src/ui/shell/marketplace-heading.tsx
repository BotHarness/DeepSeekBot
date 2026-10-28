import { Pressable, View } from 'react-native';
import { pressTint, useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { ChevronRightIcon } from './icons';

export function MarketplaceLink({
  label,
  accessibilityLabel = label,
  testID,
  onPress,
}: {
  label: string;
  accessibilityLabel?: string;
  testID: string;
  onPress(): void;
}) {
  const theme = useDesignTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={space.x2}
      android_ripple={{ color: pressTint(theme.color.accentText), borderless: false }}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x1,
        paddingHorizontal: space.x2,
        borderRadius: radius.sm,
        backgroundColor: pressed ? theme.layer.canvas.pressed : theme.layer.canvas.fill,
      })}
    >
      <Text tone="accent" strong>
        {label}
      </Text>
      <ChevronRightIcon color={theme.color.accentText} size={theme.type.meta.line} />
    </Pressable>
  );
}

export function MarketplaceHeading({
  title,
  link,
}: {
  title: string;
  link?: { label: string; accessibilityLabel?: string; testID: string; onPress(): void };
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        columnGap: space.x3,
      }}
    >
      <Text variant="title" strong accessibilityRole="header" style={{ flexShrink: 1 }}>
        {title}
      </Text>
      {link ? <MarketplaceLink {...link} /> : null}
    </View>
  );
}
