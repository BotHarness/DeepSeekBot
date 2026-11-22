import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { titleChipFill } from './header-chrome';
import { HeaderTitleButton, type HeaderTitleControl } from './header-title-button';
import { barLabelProps, barLabelStyle, glassHeader, headerControlHeight } from './native-header';

export function ChatTitleCapsule({
  title,
  subtitle,
  leading,
  trailing,
  leadingSize,
  ...control
}: HeaderTitleControl & {
  title: string;
  subtitle?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  leadingSize?: number;
}) {
  const theme = useDesignTheme();
  const height = headerControlHeight(theme);
  return (
    <HeaderTitleButton
      {...control}
      style={({ pressed }) => ({
        flexShrink: 1,
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
        minHeight: height,
        paddingLeft:
          leadingSize === undefined
            ? theme.touch / 2
            : ((glassHeader ? height : theme.touch) - leadingSize) / 2,
        paddingRight: theme.touch / 2,
        borderRadius: radius.round,
        ...titleChipFill(theme, pressed),
      })}
    >
      {leading}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.x2 }}>
          <Text
            {...barLabelProps}
            strong
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[barLabelStyle, { flexShrink: 1 }]}
          >
            {title}
          </Text>
        </View>
        {subtitle}
      </View>
      {trailing}
    </HeaderTitleButton>
  );
}
