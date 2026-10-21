import { useImperativeHandle, useState, type Ref } from 'react';
import { Stack } from 'expo-router';
import { Keyboard, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { HeaderAction } from './header-action';
import { HeaderSearch } from './header-search';

export type ActivityToolbarHandle = { dismissSearch(): void };

export type ActivityToolbarProps = {
  ref?: Ref<ActivityToolbarHandle>;
  unavailable?: boolean;
  search: string;
  filtered: boolean;
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
  onSearch,
  onSearchFocus,
  onFilter,
  onHeight,
}: ActivityToolbarProps) {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const [searching, setSearching] = useState(false);
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
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.x2,
            paddingHorizontal: space.x4,
          }}
        >
          {!unavailable && searching ? (
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
          ) : (
            <>
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
                <HeaderAction
                  icon="filter"
                  label={t.activityOptions}
                  testID="activity-filter-button"
                  active={filtered}
                  onPress={onFilter}
                />
              ) : null}
              {!unavailable ? (
                <HeaderAction
                  icon="search"
                  label={t.activitySearch}
                  testID="activity-search-button"
                  active={search !== ''}
                  onPress={() => {
                    onSearchFocus(true);
                    setSearching(true);
                  }}
                />
              ) : null}
            </>
          )}
        </View>
      </View>
    </>
  );
}
