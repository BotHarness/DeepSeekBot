import { Keyboard, View } from 'react-native';

import { SearchField } from '../primitives/search-field';
import type { HeaderSearchProps } from './header-search';

export function HeaderSearch({
  value,
  placeholder,
  onChangeText,
  onFocusChange,
  onClose,
}: HeaderSearchProps) {
  return (
    <View style={{ flex: 1 }}>
      <SearchField
        floating
        autoFocus
        inset={0}
        value={value}
        placeholder={placeholder}
        onChangeText={onChangeText}
        onFocus={() => onFocusChange(true)}
        onBlur={() => onFocusChange(false)}
        onClose={() => {
          Keyboard.dismiss();
          onChangeText('');
          onFocusChange(false);
          onClose();
        }}
      />
    </View>
  );
}
