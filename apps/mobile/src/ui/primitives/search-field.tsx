import type { ReactNode } from 'react';
import { View } from 'react-native';
import { TextInput } from './system-text';

import { capsuleRadius } from '../design/large-text-fallback';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { ActivitySearchIcon } from '../shell/icons';
import { DrawerMaterial } from './drawer-material';

export type SearchFieldProps = {
  trailing?: ReactNode;
  testID?: string;
  maxLength?: number;
  onSubmitEditing?(text: string): void;
  autoFocus?: boolean;
  onFocus?(): void;
  onBlur?(): void;
  value: string;
  inset: number;
  floating?: boolean;
  capsule?: boolean;
  placeholder: string;
  onChangeText(text: string): void;
  onClose?(): void;
};

export function SearchField({
  trailing,
  testID,
  maxLength,
  onSubmitEditing,
  autoFocus,
  onFocus,
  onBlur,
  value,
  inset,
  floating = false,
  capsule = false,
  placeholder,
  onChangeText,
}: SearchFieldProps) {
  const theme = useDesignTheme();
  const bare = floating || capsule;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
        marginHorizontal: inset,
        marginTop: bare ? 0 : space.x5,
        marginBottom: bare ? 0 : space.x3,
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
          borderRadius: capsule
            ? capsuleRadius(theme.fontScale)
            : floating
              ? radius.round
              : radius.md,
          backgroundColor: floating && !capsule ? 'transparent' : theme.layer.raised.fill,
        }}
      >
        {floating && !capsule ? <DrawerMaterial /> : null}
        <ActivitySearchIcon
          color={theme.color.subtle}
          size={theme.type.body.size * theme.fontScale}
        />
        <TextInput
          testID={testID}
          maxLength={maxLength}
          onSubmitEditing={({ nativeEvent }) => onSubmitEditing?.(nativeEvent.text)}
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
