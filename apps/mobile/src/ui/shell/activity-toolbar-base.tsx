import { useImperativeHandle, useState, type ReactNode, type Ref } from 'react';
import { Stack } from 'expo-router';
import { Keyboard, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { SearchField } from '../primitives/search-field';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { ActivityFilterIcon, ActivitySearchIcon, CloseIcon } from './icons';

export type ActivityToolbarHandle = { dismissSearch(): void };

export type ActivityToolbarProps = {
  ref?: Ref<ActivityToolbarHandle>;
  search: string;
  filtered: boolean;
  onSearch(value: string): void;
  onSearchFocus(focused: boolean): void;
  onFilter(): void;
  onHeight(height: number): void;
};

export function ActivityToolbar({
  ref,
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
          <Text
            variant="title"
            strong
            accessibilityRole="header"
            numberOfLines={1}
            style={{ flex: 1 }}
          >
            {t.activity}
          </Text>
          <ActivityIconButton label={t.activityOptions} onPress={onFilter} selected={filtered}>
            <ActivityFilterIcon
              color={filtered ? theme.color.accent : theme.color.fg}
              size={theme.type.title.size}
            />
          </ActivityIconButton>
          {!searching ? (
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
        </View>
        {searching ? (
          <SearchField
            trailing={
              search ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t.activityClearSearch}
                  onPress={() => onSearch('')}
                  style={{
                    width: theme.touch,
                    minHeight: theme.touch,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CloseIcon color={theme.color.muted} size={theme.type.title.size} />
                </Pressable>
              ) : null
            }
            autoFocus
            onBlur={() => {
              setSearching(false);
              onSearchFocus(false);
            }}
            value={search}
            inset={space.x4}
            placeholder={t.activitySearch}
            onChangeText={(value) => onSearch(value.slice(0, 200))}
          />
        ) : null}
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
