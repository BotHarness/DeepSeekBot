import { useRef } from 'react';
import { Keyboard, Platform, View, type ViewInstance } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { SearchField } from '../primitives/search-field';
import { useMounted } from '../mounted';
import { useStrings } from '../strings';
import { HeaderIconButton } from './header-icon-button';
import { NavigationAction } from './navigation-action';
import { holdBack } from './back-owner';

export type HeaderSearchProps = {
  value: string;
  placeholder: string;
  testID?: string;
  maxLength?: number;
  onChangeText(text: string): void;
  onSubmitEditing?(text: string): void;
  onFocusChange?(focused: boolean): void;
  onClose(): void;
};

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
  const t = useStrings();
  const theme = useDesignTheme();
  const close = () => {
    Keyboard.dismiss();
    onChangeText('');
    onClose();
  };
  const latest = useRef(close);
  latest.current = close;
  const backHandler = useMounted<ViewInstance>(() => {
    if (Platform.OS !== 'android') return;
    const back = holdBack(() => {
      latest.current();
      return true;
    });
    return () => back.remove();
  }, []);
  const android = Platform.OS === 'android';
  return (
    <>
      {android ? (
        <HeaderIconButton icon="back" label={t.closeSearch} testID="search-close" onPress={close} />
      ) : null}
      <View ref={backHandler} style={{ flex: 1 }}>
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
          trailing={
            !android ? (
              <NavigationAction close size={theme.touch} label={t.closeSearch} onPress={close} />
            ) : value !== '' ? (
              <HeaderIconButton
                icon="clear"
                label={t.activityClearSearch}
                onPress={() => onChangeText('')}
              />
            ) : null
          }
        />
      </View>
    </>
  );
}
