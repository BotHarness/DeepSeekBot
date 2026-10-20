import { useRef, type ReactNode } from 'react';
import { BackHandler, Keyboard, Platform, Pressable, View, type ViewInstance } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { radius } from '../design/tokens';
import { SearchField } from '../primitives/search-field';
import { useMounted } from '../mounted';
import { t } from '../strings';
import { ActivitySearchIcon, ChevronLeftIcon, CloseIcon } from './icons';
import { NavigationAction } from './navigation-action';

export function HeaderSearchButton({
  label,
  testID,
  onPress,
}: {
  label: string;
  testID?: string;
  onPress(): void;
}) {
  const theme = useDesignTheme();
  return (
    <HeaderSearchAction label={label} testID={testID} onPress={onPress}>
      <ActivitySearchIcon color={theme.color.fg} size={theme.type.title.size} />
    </HeaderSearchAction>
  );
}

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
        <HeaderSearchAction label={t.closeSearch} testID="search-close" onPress={close}>
          <ChevronLeftIcon color={theme.color.fg} size={theme.type.title.line} />
        </HeaderSearchAction>
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
              <HeaderSearchAction label={t.activityClearSearch} onPress={() => onChangeText('')}>
                <CloseIcon color={theme.color.muted} size={theme.type.title.size} />
              </HeaderSearchAction>
            ) : null
          }
        />
      </View>
    </>
  );
}

function HeaderSearchAction({
  label,
  testID,
  onPress,
  children,
}: {
  label: string;
  testID?: string | undefined;
  onPress(): void;
  children: ReactNode;
}) {
  const theme = useDesignTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      android_ripple={{ color: theme.layer.canvas.pressed, borderless: true }}
      style={({ pressed }) => ({
        width: theme.touch,
        height: theme.touch,
        borderRadius: radius.round,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
      })}
    >
      {children}
    </Pressable>
  );
}
