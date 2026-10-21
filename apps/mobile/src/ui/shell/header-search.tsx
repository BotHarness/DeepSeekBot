import { useRef } from 'react';
import { BackHandler, Keyboard, Platform, View, type ViewInstance } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { SearchField } from '../primitives/search-field';
import { useMounted } from '../mounted';
import { t } from '../strings';
import { HeaderIconButton } from './header-icon-button';
import { ChevronLeftIcon, CloseIcon } from './icons';
import { NavigationAction } from './navigation-action';

export function HeaderSearch({
  value,
  placeholder,
  onChangeText,
  onFocusChange,
  onClose,
}: {
  value: string;
  placeholder: string;
  onChangeText(text: string): void;
  onFocusChange(focused: boolean): void;
  onClose(): void;
}) {
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
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      latest.current();
      return true;
    });
    return () => back.remove();
  }, []);
  const android = Platform.OS === 'android';
  return (
    <>
      {android ? (
        <HeaderIconButton label={t.closeSearch} testID="search-close" onPress={close}>
          <ChevronLeftIcon color={theme.color.fg} size={theme.type.title.line} />
        </HeaderIconButton>
      ) : null}
      <View ref={backHandler} style={{ flex: 1 }}>
        <SearchField
          floating
          autoFocus
          inset={0}
          value={value}
          placeholder={placeholder}
          onChangeText={onChangeText}
          onFocus={() => onFocusChange(true)}
          onBlur={() => onFocusChange(false)}
          trailing={
            !android ? (
              <NavigationAction close size={theme.touch} label={t.closeSearch} onPress={close} />
            ) : value !== '' ? (
              <HeaderIconButton label={t.activityClearSearch} onPress={() => onChangeText('')}>
                <CloseIcon color={theme.color.muted} size={theme.type.title.size} />
              </HeaderIconButton>
            ) : null
          }
        />
      </View>
    </>
  );
}
