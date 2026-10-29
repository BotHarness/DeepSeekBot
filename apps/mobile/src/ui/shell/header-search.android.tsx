import { Keyboard, View } from 'react-native';

import { SearchField } from '../primitives/search-field';
import type { HeaderSearchProps } from './header-search';

export function HeaderSearch({
  value,
  placeholder,
  testID,
  maxLength,
  onChangeText,
  onSubmitEditing,
  onFocusChange,
  onClose,
}: HeaderSearchProps) {
  return (
    <View style={{ flex: 1 }}>
      <SearchField
        floating
        autoFocus
        inset={0}
        {...(testID === undefined ? {} : { testID })}
        {...(maxLength === undefined ? {} : { maxLength })}
        {...(onSubmitEditing ? { onSubmitEditing } : {})}
        value={value}
        placeholder={placeholder}
        onChangeText={onChangeText}
        onFocus={() => onFocusChange?.(true)}
        onBlur={() => onFocusChange?.(false)}
        onClose={() => {
          Keyboard.dismiss();
          onChangeText('');
          onFocusChange?.(false);
          onClose();
        }}
      />
    </View>
  );
}
