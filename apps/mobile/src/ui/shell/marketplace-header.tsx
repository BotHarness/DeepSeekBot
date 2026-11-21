import { Stack } from 'expo-router';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { ItemMenu, type ItemMenuAction } from '../primitives/item-menu';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { HeaderIconButton } from './header-icon-button';
import { HeaderSearch, type HeaderSearchProps } from './header-search';

export type MarketplaceMenuAction = ItemMenuAction & {
  symbol: 'square.and.arrow.up' | 'photo.on.rectangle';
};

export function MarketplaceHeader({
  title,
  showNativeTitle,
  showControls = true,
  prefix,
  search,
  searching,
  onOpenSearch,
  filter,
  onBack,
  menu,
}: {
  title: string;
  showNativeTitle: boolean;
  showControls?: boolean;
  prefix: string;
  search: HeaderSearchProps;
  searching: boolean;
  onOpenSearch(): void;
  filter: { label: string; selected: boolean; onPress(): void };
  onBack(): void;
  menu?: { label: string; actions: MarketplaceMenuAction[] } | undefined;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const nativeHeader = Platform.OS === 'ios' && !searching;
  return (
    <>
      <Stack.Screen
        options={
          nativeHeader
            ? {
                title: showNativeTitle ? title : '',
                headerTitle: showNativeTitle ? title : '',
                headerShown: true,
                headerTransparent: true,
                headerStyle: {},
                headerShadowVisible: false,
                headerBackVisible: false,
                headerTintColor: theme.color.fg,
                scrollEdgeEffects: { top: 'automatic', bottom: 'hidden' },
                unstable_headerLeftItems: () => [
                  {
                    type: 'button',
                    label: t.back,
                    identifier: `${prefix}-back`,
                    icon: { type: 'sfSymbol', name: 'chevron.left' },
                    onPress: onBack,
                  },
                ],
                unstable_headerRightItems: () =>
                  showControls
                    ? [
                        {
                          type: 'button',
                          label: search.placeholder,
                          identifier: `${prefix}-search-button`,
                          icon: { type: 'sfSymbol', name: 'magnifyingglass' },
                          onPress: onOpenSearch,
                        },
                        {
                          type: 'button',
                          label: filter.label,
                          identifier: `${prefix}-filter-button`,
                          icon: { type: 'sfSymbol', name: 'line.3.horizontal.decrease' },
                          ...(showNativeTitle && filter.selected
                            ? { tintColor: theme.color.accent }
                            : {}),
                          onPress: filter.onPress,
                        },
                        ...(menu
                          ? [
                              {
                                type: 'menu' as const,
                                label: menu.label,
                                identifier: `${prefix}-more`,
                                icon: { type: 'sfSymbol' as const, name: 'ellipsis' as const },
                                menu: {
                                  items: menu.actions.map((action) => ({
                                    type: 'action' as const,
                                    label: action.label,
                                    icon: { type: 'sfSymbol' as const, name: action.symbol },
                                    onPress: action.run,
                                  })),
                                },
                              },
                            ]
                          : []),
                      ]
                    : [],
              }
            : { title, headerShown: false }
        }
      />
      {nativeHeader ? null : (
        <View
          style={{
            paddingTop: insets.top + space.x2,
            paddingHorizontal: space.x4,
            paddingBottom: space.x3,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.x2,
          }}
        >
          {searching ? (
            <HeaderSearch {...search} />
          ) : (
            <>
              <HeaderIconButton
                icon="back"
                label={t.back}
                testID={`${prefix}-back`}
                onPress={onBack}
              />
              <Text variant="title" strong accessibilityRole="header" style={{ flex: 1 }}>
                {title}
              </Text>
              {showControls ? (
                <>
                  <HeaderIconButton
                    icon="search"
                    label={search.placeholder}
                    testID={`${prefix}-search-button`}
                    onPress={onOpenSearch}
                  />
                  <HeaderIconButton
                    icon="filter"
                    label={filter.label}
                    testID={`${prefix}-filter-button`}
                    selected={filter.selected}
                    onPress={filter.onPress}
                  />
                  {menu ? (
                    <ItemMenu title={menu.label} actions={menu.actions}>
                      {(open) => (
                        <HeaderIconButton
                          icon="more"
                          label={menu.label}
                          testID={`${prefix}-more`}
                          onPress={open}
                        />
                      )}
                    </ItemMenu>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </View>
      )}
    </>
  );
}
