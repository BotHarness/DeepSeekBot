import { useImperativeHandle, useState, type ReactNode, type Ref } from 'react';
import { Stack } from 'expo-router';
import { Keyboard, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { HeaderSearch } from './header-search';
import { ActivityFilterIcon, ActivitySearchIcon } from './icons';

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
                <ActivityIconButton
                  label={t.activityOptions}
                  onPress={onFilter}
                  selected={filtered}
                >
                  <ActivityFilterIcon
                    color={filtered ? theme.color.accent : theme.color.fg}
                    size={theme.type.title.size}
                  />
                </ActivityIconButton>
              ) : null}
              {!unavailable ? (
                <ActivityIconButton
                  label={t.activitySearch}
                  onPress={() => {
                    onSearchFocus(true);
                    setSearching(true);
                  }}
                >
                  <ActivitySearchIcon
                    color={search ? theme.color.accent : theme.color.fg}
                    size={theme.type.title.size}
                  />
                </ActivityIconButton>
              ) : null}
            </>
          )}
        </View>
      </View>
    </>
  );
}

function ActivityIconButton({
  label,
  selected = false,
  onPress,
  children,
}: {
  label: string;
  selected?: boolean;
  onPress(): void;
  children: ReactNode;
}) {
  const theme = useDesignTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      android_ripple={{ color: theme.layer.canvas.pressed, borderless: true }}
      style={({ pressed }) => ({
        width: theme.touch,
        height: theme.touch,
        borderRadius: radius.round,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? theme.layer.canvas.pressed : theme.layer.canvas.fill,
      })}
    >
      {children}
    </Pressable>
  );
}
