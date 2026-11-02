import { useImperativeHandle, useState, type Ref } from 'react';
import { Stack } from 'expo-router';
import { Keyboard, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDesignTheme } from '../design/theme';
import { materialSearchHeight } from '../design/material-search';
import { space, tabHeader } from '../design/tokens';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { ActivityHeaderActions, type ActivityOptions } from './activity-header-actions';
import { HeaderSearch } from './header-search';

export type ActivityToolbarHandle = { dismissSearch(): void };

export type ActivityToolbarProps = {
  ref?: Ref<ActivityToolbarHandle>;
  unavailable?: boolean;
  search: string;
  filtered: boolean;
  options: ActivityOptions;
  onSearch(value: string): void;
  onSearchFocus(focused: boolean): void;
  onFilter(): void;
  onHeight(height: number): void;
};

export function ActivityToolbar({
  ref,
  unavailable = false,
  search,
  filtered,
  options,
  onSearch,
  onSearchFocus,
  onFilter,
  onHeight,
}: ActivityToolbarProps) {
  const t = useStrings();
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const [searching, setSearching] = useState(false);
  const searchVisible = !unavailable && searching;
  const retainActions = Platform.OS === 'ios';
  useImperativeHandle(
    ref,
    () => ({
      dismissSearch() {
        setSearching(false);
        onSearchFocus(false);
        Keyboard.dismiss();
      },
    }),
    [onSearchFocus],
  );
  return (
    <>
      <Stack.Screen options={{ headerShown: false, title: t.activity }} />
      <View
        onLayout={(event) => onHeight(event.nativeEvent.layout.height)}
        style={{
          backgroundColor: theme.color.base,
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          paddingTop: insets.top + space.x2,
          paddingBottom: space.x2,
        }}
      >
        <View
          testID="activity-header"
          style={{
            minHeight:
              Platform.OS === 'android' ? materialSearchHeight(theme.fontScale) : theme.touch,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.x2,
            paddingHorizontal: tabHeader.gutter,
          }}
        >
          {(!searchVisible || retainActions) && (
            <View
              pointerEvents={searchVisible ? 'none' : 'auto'}
              accessibilityElementsHidden={searchVisible}
              importantForAccessibility={searchVisible ? 'no-hide-descendants' : 'auto'}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.x2,
                opacity: searchVisible ? 0 : 1,
              }}
            >
              <Text
                variant="title"
                strong
                accessibilityRole="header"
                numberOfLines={1}
                style={{ flex: 1 }}
              >
                {t.activity}
              </Text>
              {!unavailable ? (
                <ActivityHeaderActions
                  filtered={filtered}
                  searching={search !== ''}
                  options={options}
                  onFilter={onFilter}
                  onSearch={() => {
                    onSearchFocus(true);
                    setSearching(true);
                  }}
                />
              ) : null}
            </View>
          )}
          {searchVisible && (
            <View
              style={
                retainActions
                  ? { position: 'absolute', left: tabHeader.gutter, right: tabHeader.gutter }
                  : { flex: 1 }
              }
            >
              <HeaderSearch
                value={search}
                placeholder={t.activitySearch}
                onChangeText={(value) => onSearch(value.slice(0, 200))}
                onFocusChange={(focused) => {
                  onSearchFocus(focused);
                  if (!focused) setSearching(false);
                }}
                onClose={() => {
                  onSearchFocus(false);
                  setSearching(false);
                }}
              />
            </View>
          )}
        </View>
      </View>
    </>
  );
}
