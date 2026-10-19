import { useState } from 'react';
import { Keyboard, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { SearchField } from '../primitives/search-field';
import { useFloatingTabInset } from './floating-tab-inset';
import { NavigationAction } from './navigation-action';
import { useChromeHidden, useChromeProgress } from './scroll-chrome';
import { t } from '../strings';

const GAP = space.x3;

export function bottomSearchHeight(touch: number): number {
  return touch + GAP;
}

export function BottomSearch({
  value,
  placeholder,
  onChangeText,
  onFocusChange,
}: {
  value: string;
  placeholder: string;
  onChangeText(text: string): void;
  onFocusChange(focused: boolean): void;
}) {
  const theme = useDesignTheme();
  const [focused, setFocused] = useState(false);
  const focus = (next: boolean) => {
    setFocused(next);
    onFocusChange(next);
  };
  const insets = useSafeAreaInsets();
  const reserved = useFloatingTabInset();
  const lift = reserved - space.x5 + GAP;
  const progress = useChromeProgress();
  const hidden = useChromeHidden();
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: (lift + theme.touch) * progress.value }],
    opacity: 1 - progress.value,
  }));
  return (
    <KeyboardStickyView
      offset={{ closed: 0, opened: lift - GAP }}
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: insets.left + space.x5,
        right: insets.right + space.x5,
        bottom: lift,
      }}
    >
      <Animated.View
        pointerEvents={hidden ? 'none' : 'box-none'}
        accessibilityElementsHidden={hidden}
        importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
        style={style}
      >
        <View>
          <SearchField
            floating
            inset={0}
            value={value}
            placeholder={placeholder}
            onChangeText={onChangeText}
            onFocus={() => focus(true)}
            onBlur={() => focus(false)}
            trailing={
              focused || value !== '' ? (
                <NavigationAction
                  close
                  size={theme.touch}
                  label={t.closeSearch}
                  onPress={() => {
                    onChangeText('');
                    Keyboard.dismiss();
                  }}
                />
              ) : null
            }
          />
        </View>
      </Animated.View>
    </KeyboardStickyView>
  );
}
