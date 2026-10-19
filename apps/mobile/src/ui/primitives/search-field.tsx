import type { ReactNode } from 'react';
import { View } from 'react-native';
import { TextInput } from './system-text';

import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { ActivitySearchIcon } from '../shell/icons';
import { DrawerMaterial } from './drawer-material';

export function SearchField({
  trailing,
  autoFocus,
  onFocus,
  onBlur,
  value,
  inset,
  floating = false,
  placeholder,
  onChangeText,
}: {
  trailing?: ReactNode;
  autoFocus?: boolean;
  onFocus?(): void;
  onBlur?(): void;
  value: string;
  inset: number;
  floating?: boolean;
  placeholder: string;
  onChangeText(text: string): void;
}) {
  const theme = useDesignTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
        marginHorizontal: inset,
        marginTop: floating ? 0 : space.x5,
        marginBottom: floating ? 0 : space.x3,
      }}
    >
      <View
        style={{
          flex: 1,
          minHeight: theme.touch,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x3,
          paddingLeft: space.x4,
          borderRadius: floating ? radius.round : radius.md,
          backgroundColor: floating ? 'transparent' : theme.layer.raised.fill,
        }}
      >
        {floating ? <DrawerMaterial /> : null}
        <ActivitySearchIcon color={theme.color.subtle} size={theme.type.body.size} />
        <TextInput
          autoFocus={autoFocus}
          onFocus={onFocus}
          onBlur={onBlur}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.color.subtle}
          accessibilityLabel={placeholder}
          accessibilityRole="search"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
          style={{
            flex: 1,
            minHeight: theme.touch,
            paddingRight: space.x3,
            color: theme.color.fg,
            fontSize: theme.type.body.size,
          }}
        />
      </View>
      {trailing}
    </View>
  );
}
